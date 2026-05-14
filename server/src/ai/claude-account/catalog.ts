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
  aliases?: string[];
  supportsThinking?: boolean;
  supportsVision?: boolean;
  supportedReasoningEfforts?: Array<'low' | 'medium' | 'high'>;
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
  { id: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4', friendlyAlias: 'Sonnet 4', aliases: ['sonnet-4'], supportsThinking: true, supportsVision: true, supportedReasoningEfforts: ['low', 'medium', 'high'] },
  { id: 'claude-sonnet-latest', displayName: 'Claude Sonnet (latest)', friendlyAlias: 'Sonnet (latest)', aliases: ['sonnet-latest', 'sonnet'], supportsThinking: true, supportsVision: true, supportedReasoningEfforts: ['low', 'medium', 'high'] },
  { id: 'claude-haiku-3-5-20241022', displayName: 'Claude 3.5 Haiku', friendlyAlias: 'Haiku 3.5', aliases: ['haiku-3.5'], supportsThinking: false, supportsVision: true },
  { id: 'claude-haiku-latest', displayName: 'Claude Haiku (latest)', friendlyAlias: 'Haiku (latest)', aliases: ['haiku-latest', 'haiku'], supportsThinking: false, supportsVision: true },
  { id: 'claude-opus-4-20250514', displayName: 'Claude Opus 4', friendlyAlias: 'Opus 4', aliases: ['opus-4'], supportsThinking: true, supportsVision: true, supportedReasoningEfforts: ['low', 'medium', 'high'] },
  { id: 'claude-opus-latest', displayName: 'Claude Opus (latest)', friendlyAlias: 'Opus (latest)', aliases: ['opus-latest', 'opus'], supportsThinking: true, supportsVision: true, supportedReasoningEfforts: ['low', 'medium', 'high'] },
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

function deriveAliases(id: string, friendlyAlias?: string): string[] {
  const aliases: string[] = [];
  if (friendlyAlias) aliases.push(friendlyAlias.toLowerCase().replace(/[()]/g, '').replace(/\s+/g, '-'));
  if (id.startsWith('claude-')) aliases.push(id.replace(/^claude-/, ''));
  if (id.includes('sonnet-latest')) aliases.push('sonnet-latest', 'sonnet');
  if (id.includes('opus-latest')) aliases.push('opus-latest', 'opus');
  if (id.includes('haiku-latest')) aliases.push('haiku-latest', 'haiku');
  return [...new Set(aliases.map((item) => item.trim()).filter(Boolean))];
}

function normalizeEfforts(value: unknown): Array<'low' | 'medium' | 'high'> | undefined {
  if (!Array.isArray(value)) return undefined;
  const efforts = value
    .map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
    .filter((item): item is 'low' | 'medium' | 'high' => item === 'low' || item === 'medium' || item === 'high');
  return efforts.length ? [...new Set(efforts)] : undefined;
}

function detectThinkingCapability(id: string, hints: unknown): boolean {
  if (typeof hints === 'boolean') return hints;
  if (Array.isArray(hints)) {
    if (hints.some((item) => typeof item === 'string' && /reason|thinking/i.test(item))) return true;
  } else if (hints && typeof hints === 'object') {
    const rec = hints as Record<string, unknown>;
    if (typeof rec.reasoning === 'boolean') return rec.reasoning;
    if (typeof rec.thinking === 'boolean') return rec.thinking;
  }
  return /sonnet|opus/i.test(id);
}

function detectVisionCapability(hints: unknown): boolean | undefined {
  if (typeof hints === 'boolean') return hints;
  if (Array.isArray(hints)) {
    return hints.some((item) => typeof item === 'string' && /vision|image/i.test(item));
  }
  if (hints && typeof hints === 'object') {
    const rec = hints as Record<string, unknown>;
    if (typeof rec.vision === 'boolean') return rec.vision;
    if (typeof rec.image === 'boolean') return rec.image;
  }
  return undefined;
}

let cache: ClaudeCatalogSnapshot | null = null;

export function resetCatalogCacheForTests(): void {
  cache = null;
}

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
        aliases?: unknown;
        capabilities?: unknown;
        input_modalities?: unknown;
        output_modalities?: unknown;
        supported_reasoning_efforts?: unknown;
        reasoning_efforts?: unknown;
        supports_reasoning?: unknown;
        supports_vision?: unknown;
        max_input_tokens?: number;
        max_tokens?: number;
        created_at?: string;
      }>;
    };
    const raw = Array.isArray(body.data) ? body.data : [];
    const models: ClaudeCatalogModel[] = raw.map((m) => ({
      ...(() => {
        const displayName = m.display_name ?? m.id;
        const friendlyAlias = deriveFriendlyAlias(m.id, displayName);
        const supportedReasoningEfforts = normalizeEfforts(m.supported_reasoning_efforts ?? m.reasoning_efforts);
        const modalityHints = [m.capabilities, m.input_modalities, m.output_modalities, m.supports_vision];
        const supportsVision = modalityHints
          .map((item) => detectVisionCapability(item))
          .find((value): value is boolean => typeof value === 'boolean');
        return {
          id: m.id,
          displayName,
          friendlyAlias,
          aliases: [...new Set([...(Array.isArray(m.aliases) ? m.aliases.filter((item): item is string => typeof item === 'string') : []), ...deriveAliases(m.id, friendlyAlias)])],
          supportsThinking: detectThinkingCapability(m.id, m.supports_reasoning ?? m.capabilities),
          ...(supportsVision !== undefined ? { supportsVision } : {}),
          ...(supportedReasoningEfforts ? { supportedReasoningEfforts } : {}),
          maxInputTokens: m.max_input_tokens,
          maxOutputTokens: m.max_tokens,
          createdAt: m.created_at,
        } satisfies ClaudeCatalogModel;
      })(),
    }));
    return { fetchedAt: Date.now(), models, fresh: true };
  } finally {
    clearTimeout(timer);
  }
}
