/**
 * Claude account PKCE OAuth bootstrap + refresh.
 *
 * Adapted from Archon's claude-native/oauth.ts. Uses the same Anthropic
 * OAuth endpoints and PKCE flow. The CLIENT_ID is the public PKCE client
 * identifier — it is NOT a secret (PKCE flows do not treat client_id as
 * confidential).
 *
 * Flow overview:
 *   1. Server starts bootstrap → returns authorizationUrl for the browser.
 *   2. User opens URL, grants consent on claude.ai.
 *   3. Callback arrives at localhost:<port>/callback with code + state.
 *      OR user pastes the redirect URL for manual-paste fallback.
 *   4. Server exchanges code for tokens via PKCE, saves to auth file.
 *   5. Refresh runs automatically when token nears expiry.
 */

import { createServer, type Server } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { loadTokens, saveTokens, type ClaudeAccountTokens } from './auth.js';

// Public PKCE client_id (base64-encoded for minor scrape protection;
// this is NOT a secret).
const CLIENT_ID_B64 = 'OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl';
const CLIENT_ID = Buffer.from(CLIENT_ID_B64, 'base64').toString('utf8');

const AUTHORIZE_URL = 'https://claude.ai/oauth/authorize';
const TOKEN_URL = 'https://platform.claude.com/v1/oauth/token';
const CALLBACK_HOST = '127.0.0.1';
const CALLBACK_PORT = 53693; // Seedbank uses 53693 to avoid colliding with Archon's 53692
const CALLBACK_PATH = '/callback';
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`;
const SCOPES = [
  'org:create_api_key',
  'user:profile',
  'user:inference',
].join(' ');

const REFRESH_LEAD_MS = 30_000;

interface PendingFlow {
  state: string;
  codeVerifier: string;
  server: Server | null;
  resolveCode: (params: { code: string; state: string }) => void;
  rejectCode: (err: Error) => void;
  startedAt: number;
}

let pendingFlow: PendingFlow | null = null;

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function genVerifier(): string {
  return base64UrlEncode(randomBytes(32));
}

function challengeOf(verifier: string): string {
  return base64UrlEncode(createHash('sha256').update(verifier).digest());
}

export interface BootstrapResult {
  authorizationUrl: string;
  state: string;
  manualFallback: boolean;
  manualReason?: string;
}

/**
 * Begin a PKCE OAuth bootstrap. Returns the authorization URL.
 * Tries to spawn a local callback server; falls back to manual-paste
 * on bind failure.
 */
export async function startBootstrap(): Promise<BootstrapResult> {
  if (pendingFlow) {
    cancelPendingFlow();
  }
  const codeVerifier = genVerifier();
  const codeChallenge = challengeOf(codeVerifier);
  const state = codeVerifier; // state === verifier per Anthropic's PKCE spec

  let server: Server | null = null;
  let manualReason: string | undefined;
  try {
    server = await new Promise<Server>((resolve, reject) => {
      const s = createServer((req, res) => {
        const url = req.url || '';
        if (!url.startsWith(CALLBACK_PATH)) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('not found');
          return;
        }
        try {
          const u = new URL(url, `http://${CALLBACK_HOST}:${CALLBACK_PORT}`);
          const code = u.searchParams.get('code') || '';
          const recvState = u.searchParams.get('state') || '';
          const error = u.searchParams.get('error');
          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end(`OAuth error: ${error}`);
            if (pendingFlow) pendingFlow.rejectCode(new Error(`OAuth: ${error}`));
            return;
          }
          if (!code || !recvState) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('missing code/state');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<!doctype html><meta charset="utf-8"><title>Seedbank — Claude login</title>
<style>body{font-family:system-ui,sans-serif;background:#f5f5f0;color:#333;padding:2rem;max-width:480px;margin:auto}</style>
<h1>✅ Claude account linked</h1>
<p>You can close this tab and return to Seedbank.</p>`);
          if (pendingFlow) pendingFlow.resolveCode({ code, state: recvState });
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end(`callback error: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
      s.once('error', (err) => reject(err));
      s.listen(CALLBACK_PORT, CALLBACK_HOST, () => resolve(s));
    });
  } catch (err) {
    server = null;
    const msg = err instanceof Error ? err.message : String(err);
    manualReason = msg.includes('EADDRINUSE')
      ? `Port ${CALLBACK_PORT} is in use — use manual paste instead.`
      : `Local callback unavailable (${msg}) — use manual paste instead.`;
  }

  pendingFlow = {
    state,
    codeVerifier,
    server,
    startedAt: Date.now(),
    resolveCode: () => {},
    rejectCode: () => {},
  };

  const codePromise = new Promise<{ code: string; state: string }>((resolve, reject) => {
    if (!pendingFlow) { reject(new Error('flow lost')); return; }
    pendingFlow.resolveCode = resolve;
    pendingFlow.rejectCode = reject;
  });

  // Background: exchange code when callback arrives
  void codePromise.then(async ({ code, state: recvState }) => {
    if (recvState !== state) return;
    try {
      const tokens = await exchangeCode(code, codeVerifier);
      await saveTokens(tokens);
    } catch (err) {
      console.error('[claude-account] OAuth code exchange failed:', err);
    } finally {
      cancelPendingFlow();
    }
  }).catch(() => {
    cancelPendingFlow();
  });

  const params = new URLSearchParams({
    code: 'true',
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });

  return {
    authorizationUrl: `${AUTHORIZE_URL}?${params.toString()}`,
    state,
    manualFallback: !server,
    manualReason,
  };
}

/**
 * Manual-paste path. User pastes the callback URL that was redirected
 * to localhost but couldn't be received.
 */
export async function completeBootstrap(rawUrl: string): Promise<{ ok: true }> {
  if (!pendingFlow) throw new Error('No pending OAuth flow — start one first.');
  const u = new URL(rawUrl);
  const code = u.searchParams.get('code') || '';
  const recvState = u.searchParams.get('state') || '';
  if (!code) throw new Error('No `code` parameter found in the URL.');
  if (recvState !== pendingFlow.state) throw new Error('OAuth state mismatch.');
  const tokens = await exchangeCode(code, pendingFlow.codeVerifier);
  await saveTokens(tokens);
  cancelPendingFlow();
  return { ok: true };
}

function cancelPendingFlow(): void {
  if (!pendingFlow) return;
  const { server } = pendingFlow;
  pendingFlow = null;
  if (server) {
    try { server.close(); } catch { /* already closing */ }
  }
}

async function exchangeCode(code: string, codeVerifier: string): Promise<ClaudeAccountTokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      state: codeVerifier,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Token exchange failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  const data = await res.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type?: string;
    scope?: string;
  };
  const now = Date.now();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: now + (data.expires_in * 1000),
    tokenType: data.token_type ?? 'Bearer',
    scope: data.scope ?? SCOPES,
    obtainedAt: now,
  };
}

/**
 * Refresh tokens ahead of expiry.
 */
export async function refreshTokens(current: ClaudeAccountTokens): Promise<ClaudeAccountTokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: current.refreshToken,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Token refresh failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  const data = await res.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type?: string;
    scope?: string;
  };
  const now = Date.now();
  const next: ClaudeAccountTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? current.refreshToken,
    expiresAt: now + (data.expires_in * 1000),
    tokenType: data.token_type ?? current.tokenType,
    scope: data.scope ?? current.scope,
    obtainedAt: now,
  };
  await saveTokens(next);
  return next;
}

/**
 * Load tokens, refresh if near expiry, return live set.
 * Returns null if not authenticated.
 */
export async function ensureLiveTokens(): Promise<ClaudeAccountTokens | null> {
  const tokens = await loadTokens();
  if (!tokens) return null;
  if (tokens.expiresAt > Date.now() + REFRESH_LEAD_MS) return tokens;
  try {
    return await refreshTokens(tokens);
  } catch {
    // Refresh failed — return null so callers treat as unauthenticated
    return null;
  }
}

export function isBootstrapPending(): boolean {
  return pendingFlow !== null;
}
