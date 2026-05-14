/**
 * Claude account OAuth token store.
 *
 * Tokens live in `~/.seedbank/claude-auth.json`, NOT in the SQLite
 * config/settings so they are never exported, backed up, or sent to the
 * browser. File is mode 0600, parent dir created as needed.
 *
 * Shape mirrors the sibling Archon implementation but uses the Seedbank
 * data dir.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from '../../db.js';

export interface ClaudeAccountTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;       // epoch ms
  tokenType: string;
  scope: string;
  obtainedAt: number;      // epoch ms
}

interface AuthFileShape {
  claude?: {
    account?: ClaudeAccountTokens;
  };
}

const AUTH_PATH = join(dataDir, 'claude-auth.json');
let authLock: Promise<void> = Promise.resolve();

async function readRaw(): Promise<AuthFileShape> {
  try {
    const buf = await fs.readFile(AUTH_PATH, 'utf8');
    if (!buf.trim()) return {};
    const parsed = JSON.parse(buf) as AuthFileShape;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
}

async function writeRaw(data: AuthFileShape): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  const tmp = `${AUTH_PATH}.tmp-${process.pid}-${Date.now()}`;
  const body = JSON.stringify(data, null, 2);
  await fs.writeFile(tmp, body, { encoding: 'utf8', mode: 0o600 });
  await fs.rename(tmp, AUTH_PATH);
  try { await fs.chmod(AUTH_PATH, 0o600); } catch { /* best-effort */ }
}

export async function withAuthLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = authLock;
  let release!: () => void;
  authLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

export async function loadTokens(): Promise<ClaudeAccountTokens | null> {
  const data = await readRaw();
  return data.claude?.account ?? null;
}

export async function saveTokens(next: ClaudeAccountTokens): Promise<void> {
  await withAuthLock(async () => {
    const data = await readRaw();
    const merged: AuthFileShape = {
      ...data,
      claude: { ...(data.claude ?? {}), account: next },
    };
    await writeRaw(merged);
  });
}

export async function clearTokens(): Promise<void> {
  await withAuthLock(async () => {
    const data = await readRaw();
    if (data.claude?.account) {
      delete data.claude.account;
      if (Object.keys(data.claude).length === 0) delete data.claude;
    }
    await writeRaw(data);
  });
}

export async function readTokensUnlocked(): Promise<ClaudeAccountTokens | null> {
  const data = await readRaw();
  return data.claude?.account ?? null;
}

export async function writeTokensUnlocked(next: ClaudeAccountTokens): Promise<void> {
  const data = await readRaw();
  const merged: AuthFileShape = {
    ...data,
    claude: { ...(data.claude ?? {}), account: next },
  };
  await writeRaw(merged);
}

// ── Runtime availability gate ─────────────────────────────────────────────────

export interface ClaudeAccountRuntimeAvailability {
  available: boolean;
  reason?: string;
}

/**
 * Returns true when the operator has explicitly opted in via
 * `SEEDBANK_ENABLE_CLAUDE_ACCOUNT=1` (or `true`/`yes`/`on`).
 *
 * Claude account native OAuth is experimental in the current RC build.
 * The gate prevents the capability from appearing as a routeable choice
 * for average users who have not opted in.
 */
export function claudeAccountEnabledByEnv(): boolean {
  const raw = process.env.SEEDBANK_ENABLE_CLAUDE_ACCOUNT?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export function claudeAccountRuntimeAvailability(): ClaudeAccountRuntimeAvailability {
  if (!claudeAccountEnabledByEnv()) {
    return {
      available: false,
      reason:
        'Claude account native OAuth is unavailable in this release candidate build. ' +
        'Set SEEDBANK_ENABLE_CLAUDE_ACCOUNT=1 to opt in to the experimental OAuth path.',
    };
  }
  return { available: true };
}
