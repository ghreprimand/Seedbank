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
export const DEFAULT_CLAUDE_ACCOUNT_MODEL = 'claude-sonnet-4-6';

export interface ClaudeCatalogModel {
  id: string;
  displayName: string;
  friendlyAlias?: string;   // e.g. "Sonnet (latest)"
  aliases?: string[];
  supportsThinking?: boolean;
  supportsVision?: boolean;
  supportsContextManagement?: boolean;
  supportsCompact?: boolean;
  supportsPromptCaching?: boolean;
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
  { id: DEFAULT_CLAUDE_ACCOUNT_MODEL, displayName: 'Claude Sonnet 4.6', friendlyAlias: 'Sonnet 4.6', aliases: ['sonnet-4.6', 'sonnet-latest', 'sonnet', 'claude-sonnet-latest'], supportsThinking: true, supportsVision: true, supportsContextManagement: true, supportsCompact: true, supportsPromptCaching: true, supportedReasoningEfforts: ['low', 'medium', 'high'], maxInputTokens: 1_000_000, maxOutputTokens: 64_000 },
  { id: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4', friendlyAlias: 'Sonnet 4', aliases: ['sonnet-4'], supportsThinking: true, supportsVision: true, supportedReasoningEfforts: ['low', 'medium', 'high'] },
  { id: 'claude-3-7-sonnet-20250219', displayName: 'Claude Sonnet 3.7', friendlyAlias: 'Sonnet 3.7', aliases: ['claude-3-7-sonnet-latest', '3-7-sonnet-latest'], supportsThinking: true, supportsVision: true, supportedReasoningEfforts: ['low', 'medium', 'high'] },
  { id: 'claude-haiku-4-5-20251001', displayName: 'Claude Haiku 4.5', friendlyAlias: 'Haiku 4.5', aliases: ['claude-haiku-4-5', 'haiku-4.5', 'haiku-latest', 'haiku'], supportsThinking: true, supportsVision: true, supportedReasoningEfforts: ['low', 'medium', 'high'] },
  { id: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku', friendlyAlias: 'Haiku 3.5', aliases: ['claude-3-5-haiku-latest', 'haiku-3.5'], supportsThinking: false, supportsVision: true },
  { id: 'claude-opus-4-7', displayName: 'Claude Opus 4.7', friendlyAlias: 'Opus 4.7', aliases: ['opus-4.7', 'opus-latest', 'opus', 'claude-opus-latest'], supportsThinking: true, supportsVision: true, supportedReasoningEfforts: ['low', 'medium', 'high'] },
  { id: 'claude-opus-4-1-20250805', displayName: 'Claude Opus 4.1', friendlyAlias: 'Opus 4.1', aliases: ['opus-4.1', 'opus-latest', 'opus', 'claude-opus-latest'], supportsThinking: true, supportsVision: true, supportedReasoningEfforts: ['low', 'medium', 'high'] },
  { id: 'claude-opus-4-20250514', displayName: 'Claude Opus 4', friendlyAlias: 'Opus 4', aliases: ['opus-4'], supportsThinking: true, supportsVision: true, supportedReasoningEfforts: ['low', 'medium', 'high'] },
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
  if (id.includes('sonnet')) aliases.push('sonnet');
  if (id.includes('opus')) aliases.push('opus');
  if (id.includes('haiku')) aliases.push('haiku');
  return [...new Set(aliases.map((item) => item.trim()).filter(Boolean))];
}

function modelDateScore(id: string): number {
  const match = /(\d{8})(?!.*\d{8})/.exec(id);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function modelFamilyScore(id: string): number {
  const version = /-(\d+)-(\d+)(?:-\d{8})?$/.exec(id);
  if (version) {
    return Number.parseInt(version[1] ?? '0', 10) * 100 + Number.parseInt(version[2] ?? '0', 10);
  }
  if (/-4-\d{8}$/.test(id)) return 400;
  return 0;
}

function pickLatestFamilyModel(models: ClaudeCatalogModel[], family: 'sonnet' | 'opus' | 'haiku'): ClaudeCatalogModel | undefined {
  return [...models]
    .filter((model) => model.id.toLowerCase().includes(family))
    .filter((model) => !model.id.toLowerCase().endsWith('-latest'))
    .sort((a, b) => {
      const familyDiff = modelFamilyScore(b.id) - modelFamilyScore(a.id);
      if (familyDiff !== 0) return familyDiff;
      return modelDateScore(b.id) - modelDateScore(a.id);
    })[0];
}

function normalizedAlias(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

/**
 * Resolves user-facing Claude account aliases to concrete model IDs accepted by
 * the Messages API. Seedbank historically defaulted to `claude-sonnet-latest`,
 * which is not a stable public Messages API alias, so treat it as a virtual
 * convenience name and route it to the best Sonnet snapshot in the live catalog.
 */
export async function resolveClaudeAccountModel(requested: string | undefined): Promise<string> {
  const raw = requested?.trim() || DEFAULT_CLAUDE_ACCOUNT_MODEL;
  const normalized = normalizedAlias(raw);
  const catalog = await getCatalog();
  if (normalized === 'claude-sonnet-latest' || normalized === 'sonnet-latest' || normalized === 'sonnet') {
    return pickLatestFamilyModel(catalog.models, 'sonnet')?.id ?? DEFAULT_CLAUDE_ACCOUNT_MODEL;
  }
  if (normalized === 'claude-opus-latest' || normalized === 'opus-latest' || normalized === 'opus') {
    return pickLatestFamilyModel(catalog.models, 'opus')?.id ?? 'claude-opus-4-7';
  }
  if (normalized === 'claude-haiku-latest' || normalized === 'haiku-latest' || normalized === 'haiku') {
    return pickLatestFamilyModel(catalog.models, 'haiku')?.id ?? 'claude-3-5-haiku-20241022';
  }
  return catalog.models.find((model) => (
    normalizedAlias(model.id) === normalized
    || normalizedAlias(model.friendlyAlias) === normalized
    || model.aliases?.some((alias) => normalizedAlias(alias) === normalized)
  ))?.id ?? raw;
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

function detectNamedCapability(hints: unknown, names: RegExp[]): boolean | undefined {
  if (typeof hints === 'boolean') return hints;
  if (typeof hints === 'string') return names.some((pattern) => pattern.test(hints));
  if (Array.isArray(hints)) {
    return hints.some((item) => detectNamedCapability(item, names) === true);
  }
  if (hints && typeof hints === 'object') {
    const rec = hints as Record<string, unknown>;
    const entries = Object.entries(rec);
    for (const [key, value] of entries) {
      if (names.some((pattern) => pattern.test(key)) && value !== false && value !== null) return true;
      if (detectNamedCapability(value, names) === true) return true;
    }
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
        const capabilityHints = [
          m.capabilities,
          (m as Record<string, unknown>).context_management,
          (m as Record<string, unknown>).supports_context_management,
          (m as Record<string, unknown>).compact,
          (m as Record<string, unknown>).supports_compact,
          (m as Record<string, unknown>).prompt_caching,
          (m as Record<string, unknown>).cache_control,
        ];
        const supportsContextManagement = capabilityHints
          .map((item) => detectNamedCapability(item, [/context[-_ ]?management/i, /clear[-_ ]?(thinking|tool)/i]))
          .find((value): value is boolean => typeof value === 'boolean');
        const supportsCompact = capabilityHints
          .map((item) => detectNamedCapability(item, [/compact/i, /compaction/i]))
          .find((value): value is boolean => typeof value === 'boolean');
        const supportsPromptCaching = capabilityHints
          .map((item) => detectNamedCapability(item, [/prompt[-_ ]?cach/i, /cache[-_ ]?control/i]))
          .find((value): value is boolean => typeof value === 'boolean');
        return {
          id: m.id,
          displayName,
          friendlyAlias,
          aliases: [...new Set([...(Array.isArray(m.aliases) ? m.aliases.filter((item): item is string => typeof item === 'string') : []), ...deriveAliases(m.id, friendlyAlias)])],
          supportsThinking: detectThinkingCapability(m.id, m.supports_reasoning ?? m.capabilities),
          ...(supportsVision !== undefined ? { supportsVision } : {}),
          ...(supportsContextManagement !== undefined ? { supportsContextManagement } : {}),
          ...(supportsCompact !== undefined ? { supportsCompact } : {}),
          ...(supportsPromptCaching !== undefined ? { supportsPromptCaching } : {}),
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
