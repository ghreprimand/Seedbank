/**
 * Claude account model catalog — live from Anthropic's /v1/models
 * using the OAuth subscription scope.
 *
 * Caches in-memory with 1-hour TTL. Falls back to a bundled set of
 * known models when offline or unauthenticated.
 */

import { ClaudeAccountNoAuthError, ensureLiveTokens } from './oauth.js';

const REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const CLAUDE_ACCOUNT_BETA_HEADER = 'claude-code-20250219,oauth-2025-04-20';
const CLAUDE_ACCOUNT_USER_AGENT = 'claude-cli/2.1.75';

export interface ClaudeCatalogModel {
  id: string;
  displayName: string;
  friendlyAlias?: string;   // e.g. "Sonnet (latest)"
  maxInputTokens?: number;
  maxOutputTokens?: number;
  createdAt?: string;
}

export interface ClaudeCatalogSnapshot {
  fetchedAt: number;
  models: ClaudeCatalogModel[];
  fresh: boolean;
}

// Known models for offline/unauthenticated fallback.
const BUNDLED_MODELS: ClaudeCatalogModel[] = [
  { id: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4', friendlyAlias: 'Sonnet 4' },
  { id: 'claude-sonnet-latest', displayName: 'Claude Sonnet (latest)', friendlyAlias: 'Sonnet (latest)' },
  { id: 'claude-haiku-3-5-20241022', displayName: 'Claude 3.5 Haiku', friendlyAlias: 'Haiku 3.5' },
  { id: 'claude-haiku-latest', displayName: 'Claude Haiku (latest)', friendlyAlias: 'Haiku (latest)' },
  { id: 'claude-opus-4-20250514', displayName: 'Claude Opus 4', friendlyAlias: 'Opus 4' },
  { id: 'claude-opus-latest', displayName: 'Claude Opus (latest)', friendlyAlias: 'Opus (latest)' },
];

// Friendly alias derivation from model ID patterns
function deriveFriendlyAlias(id: string, displayName: string): string | undefined {
  // Use display name if it's informative
  if (displayName && !displayName.startsWith('model_')) return displayName;

  // Derive from id patterns
  if (id.includes('opus') && id.includes('latest')) return 'Opus (latest)';
  if (id.includes('sonnet') && id.includes('latest')) return 'Sonnet (latest)';
  if (id.includes('haiku') && id.includes('latest')) return 'Haiku (latest)';
  if (id.includes('opus')) return `Opus (${id.replace(/^claude-/, '').replace(/-\d+$/, '')})`;
  if (id.includes('sonnet')) return `Sonnet (${id.replace(/^claude-/, '').replace(/-\d+$/, '')})`;
  if (id.includes('haiku')) return `Haiku (${id.replace(/^claude-/, '').replace(/-\d+$/, '')})`;
  return undefined;
}

let cache: ClaudeCatalogSnapshot | null = null;

/**
 * Fetch the model catalog. Returns cached when fresh; refreshes in background.
 */
export async function getCatalog(force = false): Promise<ClaudeCatalogSnapshot> {
  const now = Date.now();
  if (!force && cache && now - cache.fetchedAt < REFRESH_INTERVAL_MS) return cache;
  try {
    const fresh = await fetchCatalog();
    cache = fresh;
    return fresh;
  } catch (err) {
    if (cache) {
      return { ...cache, fresh: false };
    }
    if (err instanceof ClaudeAccountNoAuthError) {
      // No cache + not authenticated: return bundled fallback.
      return { fetchedAt: now, models: BUNDLED_MODELS, fresh: false };
    }
    throw err;
  }
}

/**
 * Bundled fallback models for use when not authenticated.
 */
export function getBundledModels(): ClaudeCatalogModel[] {
  return BUNDLED_MODELS;
}

async function fetchCatalog(): Promise<ClaudeCatalogSnapshot> {
  const tokens = await ensureLiveTokens();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch('https://api.anthropic.com/v1/models?limit=1000', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${tokens.accessToken}`,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': CLAUDE_ACCOUNT_BETA_HEADER,
        'user-agent': CLAUDE_ACCOUNT_USER_AGENT,
        'x-app': 'cli',
      },
      signal: controller.signal,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`/v1/models ${resp.status}: ${text.slice(0, 200)}`);
    }
    const body = await resp.json() as {
      data?: Array<{
        id: string;
        display_name?: string;
        max_input_tokens?: number;
        max_tokens?: number;
        created_at?: string;
      }>;
    };
    const raw = Array.isArray(body.data) ? body.data : [];
    const models: ClaudeCatalogModel[] = raw.map((m) => ({
      id: m.id,
      displayName: m.display_name ?? m.id,
      friendlyAlias: deriveFriendlyAlias(m.id, m.display_name ?? ''),
      maxInputTokens: m.max_input_tokens,
      maxOutputTokens: m.max_tokens,
      createdAt: m.created_at,
    }));
    return { fetchedAt: Date.now(), models, fresh: true };
  } finally {
    clearTimeout(timer);
  }
}
