import { aiProviderLabel, isAiProviderId } from '../../../shared/types.js';
import type {
  AiChatMessage,
  AiEffectiveFeatureRoute,
  AiFieldAssistMessage,
  AiFeatureId,
  AiFeatureRoute,
  AiGuardrailsConfig,
  AiModelListResult,
  AiOpenAICompatiblePresetId,
  AiPreflightResult,
  AiProviderDescriptor,
  AiProviderHealth,
  AiProviderId,
  AiPublicConfig,
  AiSuggestion,
  AiSuggestionField,
  AiUsageDetail,
  AiBudgetState,
  Idea,
} from '../../../shared/types.js';
import { v4 as uuid } from 'uuid';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { SeedbankRepository } from '../repository.js';
import { encryptSecret } from './crypto.js';
import {
  AnthropicProvider,
  ClaudeAccountProvider,
  CodexAccountProvider,
  OllamaProvider,
  OpenAICompatibleProvider,
  OpenAIProvider,
} from './providers.js';
import { AI_PROVIDER_DESCRIPTORS, openAICompatiblePreset } from './registry.js';
import type { AiConfigPatch, AiProvider, AiProviderMessage, AiStoredConfig } from './types.js';
import { AiStore } from './store.js';

const THINKING_PARTNER_PROMPT = [
  'You are a creative thinking partner.',
  'Your role is to help the user develop THEIR idea through questions, reflections, and gentle challenges.',
  'Never generate ideas unprompted. Ask before suggesting.',
  'Focus on drawing out what the user already intuitively knows.',
  'Keep responses concise and practical. Prefer one or two thoughtful questions over broad ideation.',
].join(' ');

/**
 * System prompt for isolated field-assist conversations.
 * Unlike the Thinking Partner, this mode is explicitly task-focused:
 * the user has already selected an intent, so the AI should act on it
 * directly rather than asking before suggesting.
 */
const FIELD_ASSIST_PROMPT = [
  'You are helping a user refine a specific field of their idea.',
  'Respond concisely and practically.',
  'When asked to write or rewrite text, provide a concrete answer immediately without asking for permission first.',
  'Focus only on the specified field — do not comment on or modify other parts of the idea.',
  'Keep responses brief; the user can ask follow-up questions if they want more.',
].join(' ');

const DEFAULT_CONFIG: AiStoredConfig = {
  provider: 'ollama',
  openaiModel: 'gpt-4.1-mini',
  anthropicModel: 'claude-sonnet-4-20250514',
  claudeAccountModel: 'claude-sonnet-latest',
  codexAccountModel: 'codex-recommended',
  ollamaModel: 'llama3.2',
  ollamaBaseUrl: 'http://localhost:11434',
  openaiCompatiblePreset: 'openrouter',
  openaiCompatibleModel: 'openai/gpt-4o-mini',
  openaiCompatibleBaseUrl: 'https://openrouter.ai/api/v1',
  dailyTokenBudget: 200000,
  featureRoutes: {
    'thinking-partner': { provider: 'default' },
    'field-suggestions': { provider: 'default' },
    'health-check': { provider: 'default' },
    'discover-insights': { provider: 'default' },
    default: { provider: 'default' },
  },
  guardrails: {
    featureEnabled: {
      'thinking-partner': true,
      'field-suggestions': true,
      'health-check': true,
      'discover-insights': true,
      default: true,
    },
    providerEnabled: {
      openai: true,
      anthropic: true,
      ollama: true,
      'openai-compatible': true,
      'claude-account': true,
      'codex-account': true,
    },
    allowedModels: [],
    featureDailyTokenBudgets: {},
    providerDailyTokenBudgets: {},
    modelDailyTokenBudgets: {},
    warnOnRemoteProvider: true,
    requireConfirmationForRemoteProvider: false,
  },
  claudeAccountAuthenticated: false,
};

const AI_CONFIG_KEY = 'ai.config';
const LEGACY_AI_CONFIG_KEY = 'ai:config';
const GUARDRAIL_SETTINGS_HINT = 'Review Settings -> AI & Agents -> Usage & Guardrails.';
const CONFIRMATION_TOKEN_TTL_MS = 10 * 60 * 1000;
const confirmationSecret = randomBytes(32).toString('hex');

class SimpleRateLimiter {
  private readonly hits = new Map<string, number[]>();

  check(key: string, limit = 20, windowMs = 60_000): void {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);
    if (recent.length >= limit) throw new Error('AI rate limit reached. Wait a minute before trying again.');
    recent.push(now);
    this.hits.set(key, recent);
  }
}

interface AiGuardrailCheckOptions {
  confirmationToken?: string;
  skipRateLimit?: boolean;
}

function modelFor(config: AiStoredConfig): string {
  if (config.provider === 'openai') return config.openaiModel;
  if (config.provider === 'anthropic') return config.anthropicModel;
  if (config.provider === 'claude-account') return config.claudeAccountModel;
  if (config.provider === 'codex-account') return config.codexAccountModel;
  if (config.provider === 'openai-compatible') return config.openaiCompatibleModel;
  return config.ollamaModel;
}

const AI_FEATURE_IDS: AiFeatureId[] = [
  'thinking-partner',
  'field-suggestions',
  'health-check',
  'discover-insights',
  'default',
];

const FEATURE_ROUTABLE_PROVIDERS: ReadonlySet<AiProviderId> = new Set([
  'openai',
  'anthropic',
  'claude-account',
  'ollama',
  'openai-compatible',
]);

function isFeatureRoutableProvider(provider: AiProviderId): boolean {
  return FEATURE_ROUTABLE_PROVIDERS.has(provider);
}

function defaultFeatureRoutes(): Record<AiFeatureId, AiFeatureRoute> {
  return {
    'thinking-partner': { provider: 'default' },
    'field-suggestions': { provider: 'default' },
    'health-check': { provider: 'default' },
    'discover-insights': { provider: 'default' },
    default: { provider: 'default' },
  };
}

function sanitizeFeatureRoute(value: unknown): AiFeatureRoute | undefined {
  const route = value as { provider?: unknown; model?: unknown } | undefined;
  if (!route) return undefined;
  if (route.provider === 'default') return { provider: 'default' };
  if (!isProvider(route.provider)) return undefined;
  if (!isFeatureRoutableProvider(route.provider)) return { provider: 'default' };
  return {
    provider: route.provider,
    ...(typeof route.model === 'string' && route.model.trim() ? { model: route.model.trim() } : {}),
  };
}

function sanitizeFeatureRoutes(input: unknown, current?: Record<AiFeatureId, AiFeatureRoute>): Record<AiFeatureId, AiFeatureRoute> {
  const source = input as Partial<Record<AiFeatureId, AiFeatureRoute>> | undefined;
  const next = defaultFeatureRoutes();
  const currentRoutes: Partial<Record<AiFeatureId, AiFeatureRoute>> = current ?? {};
  for (const feature of AI_FEATURE_IDS) {
    const route = sanitizeFeatureRoute(currentRoutes[feature]);
    if (route) next[feature] = route;
  }
  if (!source || typeof source !== 'object') return next;
  for (const feature of AI_FEATURE_IDS) {
    const route = sanitizeFeatureRoute(source[feature]);
    if (route) next[feature] = route;
  }
  return next;
}

function defaultGuardrails(): AiGuardrailsConfig {
  return {
    featureEnabled: {
      'thinking-partner': true,
      'field-suggestions': true,
      'health-check': true,
      'discover-insights': true,
      default: true,
    },
    providerEnabled: {
      openai: true,
      anthropic: true,
      ollama: true,
      'openai-compatible': true,
      'claude-account': true,
      'codex-account': true,
    },
    allowedModels: [],
    featureDailyTokenBudgets: {},
    providerDailyTokenBudgets: {},
    modelDailyTokenBudgets: {},
    warnOnRemoteProvider: true,
    requireConfirmationForRemoteProvider: false,
  };
}

function sanitizeBudgetMap<K extends string>(
  value: unknown,
  allowedKeys?: readonly K[],
): Partial<Record<K, number>> {
  if (!value || typeof value !== 'object') return {};
  const allowed = allowedKeys ? new Set<string>(allowedKeys) : null;
  const result: Partial<Record<K, number>> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (allowed && !allowed.has(key)) continue;
    const budget = Math.max(0, Math.floor(Number(raw)));
    if (Number.isFinite(budget)) result[key as K] = budget;
  }
  return result;
}

function sanitizeBooleanMap<K extends string>(
  value: unknown,
  defaults: Partial<Record<K, boolean>>,
  allowedKeys: readonly K[],
): Partial<Record<K, boolean>> {
  const result: Partial<Record<K, boolean>> = { ...defaults };
  if (!value || typeof value !== 'object') return result;
  for (const key of allowedKeys) {
    const raw = (value as Partial<Record<K, unknown>>)[key];
    if (typeof raw === 'boolean') result[key] = raw;
  }
  return result;
}

function sanitizeGuardrails(input: unknown, current?: AiGuardrailsConfig): AiGuardrailsConfig {
  const defaults = current ?? defaultGuardrails();
  const source = input && typeof input === 'object' ? input as Partial<AiGuardrailsConfig> : {};
  const allowedModels = Array.isArray(source.allowedModels)
    ? [...new Set(source.allowedModels.filter((model): model is string => typeof model === 'string').map((model) => model.trim()).filter(Boolean))]
    : defaults.allowedModels;

  return {
    featureEnabled: sanitizeBooleanMap(source.featureEnabled, defaults.featureEnabled, AI_FEATURE_IDS),
    providerEnabled: sanitizeBooleanMap(
      source.providerEnabled,
      defaults.providerEnabled,
      ['openai', 'anthropic', 'ollama', 'openai-compatible', 'claude-account', 'codex-account'] as const,
    ),
    allowedModels,
    featureDailyTokenBudgets: {
      ...defaults.featureDailyTokenBudgets,
      ...sanitizeBudgetMap(source.featureDailyTokenBudgets, AI_FEATURE_IDS),
    },
    providerDailyTokenBudgets: {
      ...defaults.providerDailyTokenBudgets,
      ...sanitizeBudgetMap(
        source.providerDailyTokenBudgets,
        ['openai', 'anthropic', 'ollama', 'openai-compatible', 'claude-account', 'codex-account'] as const,
      ),
    },
    modelDailyTokenBudgets: {
      ...defaults.modelDailyTokenBudgets,
      ...sanitizeBudgetMap<string>(source.modelDailyTokenBudgets),
    } as Record<string, number>,
    warnOnRemoteProvider: typeof source.warnOnRemoteProvider === 'boolean'
      ? source.warnOnRemoteProvider
      : defaults.warnOnRemoteProvider,
    requireConfirmationForRemoteProvider: typeof source.requireConfirmationForRemoteProvider === 'boolean'
      ? source.requireConfirmationForRemoteProvider
      : defaults.requireConfirmationForRemoteProvider,
  };
}

function applyModelOverride(config: AiStoredConfig, provider: AiProviderId, model: string): AiStoredConfig {
  if (!model.trim()) return config;
  if (provider === 'openai') return { ...config, openaiModel: model.trim() };
  if (provider === 'anthropic') return { ...config, anthropicModel: model.trim() };
  if (provider === 'claude-account') return { ...config, claudeAccountModel: model.trim() };
  if (provider === 'codex-account') return { ...config, codexAccountModel: model.trim() };
  if (provider === 'openai-compatible') return { ...config, openaiCompatibleModel: model.trim() };
  return { ...config, ollamaModel: model.trim() };
}

function resolveFeatureConfig(config: AiStoredConfig, feature: AiFeatureId): AiStoredConfig {
  const routes = sanitizeFeatureRoutes(config.featureRoutes);
  const route = routes[feature] ?? routes.default;
  if (route.provider === 'default') return config;
  return applyModelOverride({ ...config, provider: route.provider }, route.provider, route.model ?? '');
}

function effectiveFeatureRoutes(config: AiStoredConfig): Record<AiFeatureId, AiEffectiveFeatureRoute> {
  const routes = sanitizeFeatureRoutes(config.featureRoutes);
  return AI_FEATURE_IDS.reduce<Record<AiFeatureId, AiEffectiveFeatureRoute>>((acc, feature) => {
    const resolved = resolveFeatureConfig(config, feature);
    acc[feature] = {
      provider: resolved.provider,
      model: modelFor(resolved),
      inherited: routes[feature]?.provider === 'default',
    };
    return acc;
  }, {} as Record<AiFeatureId, AiEffectiveFeatureRoute>);
}

function migrateKnownStaleModelDefaults(config: AiStoredConfig): AiStoredConfig {
  return {
    ...config,
    openaiModel: config.openaiModel === 'gpt-5.5' ? DEFAULT_CONFIG.openaiModel : config.openaiModel,
    anthropicModel: config.anthropicModel === 'claude-sonnet-4-5' || config.anthropicModel === 'claude-opus-4-5'
      ? DEFAULT_CONFIG.anthropicModel
      : config.anthropicModel,
  };
}

// Cached Claude account auth status — refreshed by async calls.
// Defaults to false; updated when config is loaded or auth endpoints run.
let claudeAccountAuthenticatedCache = false;

export function setCachedClaudeAccountAuth(authenticated: boolean): void {
  claudeAccountAuthenticatedCache = authenticated;
}

function publicConfig(config: AiStoredConfig): AiPublicConfig {
  const routes = sanitizeFeatureRoutes(config.featureRoutes);
  return {
    provider: config.provider,
    openaiModel: config.openaiModel,
    anthropicModel: config.anthropicModel,
    claudeAccountModel: config.claudeAccountModel,
    codexAccountModel: config.codexAccountModel,
    ollamaModel: config.ollamaModel,
    ollamaBaseUrl: config.ollamaBaseUrl,
    openaiCompatiblePreset: config.openaiCompatiblePreset,
    openaiCompatibleModel: config.openaiCompatibleModel,
    openaiCompatibleBaseUrl: config.openaiCompatibleBaseUrl,
    dailyTokenBudget: config.dailyTokenBudget,
    featureRoutes: routes,
    effectiveFeatureRoutes: effectiveFeatureRoutes({ ...config, featureRoutes: routes }),
    guardrails: sanitizeGuardrails(config.guardrails),
    hasOpenAIKey: Boolean(config.openaiApiKeyEncrypted),
    hasAnthropicKey: Boolean(config.anthropicApiKeyEncrypted),
    hasOpenAICompatibleKey: Boolean(config.openaiCompatibleApiKeyEncrypted),
    claudeAccountAuthenticated: claudeAccountAuthenticatedCache,
  };
}

function ideaContext(idea: Idea): string {
  return [
    'Current idea context:',
    JSON.stringify({
      title: idea.title,
      pitch: idea.pitch,
      category: idea.category,
      stage: idea.stage,
      tags: idea.tags,
      moodLabels: idea.moodLabels,
      fullNotes: idea.fullNotes,
      hook: idea.hook,
      whyItMightWork: idea.whyItMightWork,
      risks: idea.risks,
      techStack: idea.techStack,
      jamScore: idea.jamScore,
      excitementScore: idea.excitementScore,
      graduatedTo: idea.graduatedTo,
    }, null, 2),
  ].join('\n');
}

function messagesForChat(idea: Idea, history: AiChatMessage[], nextUserMessage: string): AiProviderMessage[] {
  return [
    { role: 'system', content: THINKING_PARTNER_PROMPT },
    { role: 'system', content: ideaContext(idea) },
    ...history.slice(-20).map((message) => ({ role: message.role, content: message.content })),
    { role: 'user', content: nextUserMessage },
  ];
}

const FIELD_SUGGESTION_PROMPTS: Record<AiSuggestionField, string> = {
  pitch: 'Help sharpen this pitch into a clearer one-line version.',
  risks: 'Identify concrete risks, blind spots, or blockers the user may be missing.',
  techStack: 'Suggest technologies that fit the idea and explain the fit briefly.',
  hook: 'Help find a concise demo hook for this idea.',
  whyItMightWork: 'Strengthen the argument for why this idea might work.',
};

function promptForSuggestion(idea: Idea, field: AiSuggestionField, currentValue: string): AiProviderMessage[] {
  return [
    {
      role: 'system',
      content: [
        THINKING_PARTNER_PROMPT,
        'For this request, return only JSON with keys "suggestion" and "rationale".',
        'The suggestion must revise or extend the target field, not replace the user as the source of creativity.',
      ].join(' '),
    },
    { role: 'system', content: ideaContext(idea) },
    {
      role: 'user',
      content: [
        FIELD_SUGGESTION_PROMPTS[field],
        '',
        `Target field: ${field}`,
        `Current value: ${currentValue || '(empty)'}`,
      ].join('\n'),
    },
  ];
}

function promptForFieldAssist(
  idea: Idea,
  field: AiSuggestionField,
  currentValue: string,
  customPrompt?: string,
  omitCurrentValue = false,
): AiProviderMessage[] {
  const currentValueLines = omitCurrentValue
    ? []
    : [
        '',
        `Current value: ${currentValue || '(empty)'}`,
      ];
  return [
    {
      role: 'system',
      content: [
        FIELD_ASSIST_PROMPT,
        'For this field-assist request, return only JSON with keys "suggestion" and "rationale".',
        'The suggestion must revise or extend the target field, not replace the user as the source of creativity.',
      ].join(' '),
    },
    { role: 'system', content: ideaContext(idea) },
    {
      role: 'user',
      content: [
        customPrompt?.trim() || FIELD_SUGGESTION_PROMPTS[field],
        '',
        `Target field: ${field}`,
        ...currentValueLines,
      ].join('\n'),
    },
  ];
}

function fieldAssistConversationMessages(
  idea: Idea,
  field: AiSuggestionField,
  currentValue: string,
  history: AiFieldAssistMessage[] | undefined,
  nextUserMessage: string,
): AiProviderMessage[] {
  const safeHistory = (history ?? [])
    .filter((message) => (message.role === 'user' || message.role === 'assistant') && message.content.trim())
    .slice(-20)
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }));

  return [
    {
      role: 'system',
      content: [
        FIELD_ASSIST_PROMPT,
        'You are assisting with one specific Seedbank idea field in a modal-local conversation.',
        'Do not use or update the persistent Thinking Partner conversation.',
        'Keep replies focused on the target field. If you draft field text, make it easy to apply.',
      ].join(' '),
    },
    { role: 'system', content: ideaContext(idea) },
    {
      role: 'system',
      content: [
        `Target field: ${field}`,
        `Current value: ${currentValue || '(empty)'}`,
      ].join('\n'),
    },
    ...safeHistory,
    { role: 'user', content: nextUserMessage },
  ];
}

function promptForMode(mode: string, context: unknown, prompt?: string): AiProviderMessage[] {
  return [
    {
      role: 'system',
      content: [
        THINKING_PARTNER_PROMPT,
        'Answer this Seedbank assistance request directly and concisely.',
        'Do not modify user data. Return plain text only.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Mode: ${mode}`,
        prompt ? `Prompt: ${prompt}` : '',
        'Context:',
        JSON.stringify(context ?? {}, null, 2),
      ].filter(Boolean).join('\n'),
    },
  ];
}

function featureForMode(mode: string): AiFeatureId {
  if (mode === 'health-check') return 'health-check';
  if (mode === 'pattern-insights' || mode === 'smart-cross-pollinate') return 'discover-insights';
  return 'default';
}

function parseSuggestion(field: AiSuggestionField, text: string): AiSuggestion {
  try {
    const parsed = JSON.parse(text) as { suggestion?: string; rationale?: string };
    return {
      field,
      suggestion: parsed.suggestion ?? text,
      rationale: parsed.rationale ?? '',
    };
  } catch {
    return {
      field,
      suggestion: text,
      rationale: '',
    };
  }
}

function isProvider(value: unknown): value is AiProviderId {
  return isAiProviderId(value);
}

function isOpenAICompatiblePreset(value: unknown): value is AiOpenAICompatiblePresetId {
  return value === 'openrouter'
    || value === 'groq'
    || value === 'mistral'
    || value === 'together'
    || value === 'fireworks'
    || value === 'lm-studio'
    || value === 'vllm'
    || value === 'llama-cpp'
    || value === 'localai'
    || value === 'custom';
}

function normalizedUrlIdentity(value: string | undefined): string {
  if (!value?.trim()) return '';
  try {
    const url = new URL(value.trim());
    url.hash = '';
    url.search = '';
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, '') || '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return value.trim().replace(/\/+$/, '');
  }
}

function isLikelyLocalUrl(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const hostname = new URL(value.trim()).hostname.toLowerCase();
    return hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '::1'
      || hostname.endsWith('.local');
  } catch {
    return false;
  }
}

function descriptorForConfig(config: AiStoredConfig): AiProviderDescriptor | undefined {
  if (config.provider === 'openai-compatible') return openAICompatiblePreset(config.openaiCompatiblePreset);
  return AI_PROVIDER_DESCRIPTORS.find((descriptor) => descriptor.id === config.provider && !descriptor.presetId);
}

function providerLabelForConfig(config: AiStoredConfig): string {
  if (config.provider === 'openai-compatible') return openAICompatiblePreset(config.openaiCompatiblePreset).label;
  return aiProviderLabel(config.provider);
}

function providerIsLocal(config: AiStoredConfig): boolean {
  const descriptor = descriptorForConfig(config);
  if (descriptor?.dataResidency === 'local' || descriptor?.local) return true;
  if (config.provider === 'ollama') return true;
  if (config.provider === 'openai-compatible') return isLikelyLocalUrl(config.openaiCompatibleBaseUrl);
  return false;
}

function guardrailError(message: string, statusCode: number): Error {
  return Object.assign(new Error(message), { statusCode });
}

function confirmationPayload(feature: AiFeatureId, provider: AiProviderId, model: string): string {
  return JSON.stringify({
    feature,
    provider,
    model,
    exp: Date.now() + CONFIRMATION_TOKEN_TTL_MS,
  });
}

function signConfirmationPayload(payload: string): string {
  return createHmac('sha256', confirmationSecret).update(payload).digest('base64url');
}

function createConfirmationToken(feature: AiFeatureId, provider: AiProviderId, model: string): string {
  const payload = Buffer.from(confirmationPayload(feature, provider, model)).toString('base64url');
  return `${payload}.${signConfirmationPayload(payload)}`;
}

function validConfirmationToken(token: string | undefined, feature: AiFeatureId, provider: AiProviderId, model: string): boolean {
  if (!token) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = signConfirmationPayload(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return false;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      feature?: unknown;
      provider?: unknown;
      model?: unknown;
      exp?: unknown;
    };
    return parsed.feature === feature
      && parsed.provider === provider
      && parsed.model === model
      && typeof parsed.exp === 'number'
      && parsed.exp >= Date.now();
  } catch {
    return false;
  }
}

export class AiService {
  private readonly providers = new Map<string, AiProvider>([
    ['openai', new OpenAIProvider()],
    ['anthropic', new AnthropicProvider()],
    ['claude-account', new ClaudeAccountProvider()],
    ['codex-account', new CodexAccountProvider()],
    ['ollama', new OllamaProvider()],
    ['openai-compatible', new OpenAICompatibleProvider()],
  ]);
  private readonly rateLimiter = new SimpleRateLimiter();

  constructor(
    private readonly repository: SeedbankRepository,
    private readonly store: AiStore,
  ) {}

  getConfig(): AiStoredConfig {
    const current = this.repository.getSetting<Partial<AiStoredConfig>>(AI_CONFIG_KEY);
    const legacy = this.repository.getSetting<Partial<AiStoredConfig>>(LEGACY_AI_CONFIG_KEY);
    return migrateKnownStaleModelDefaults({
      ...DEFAULT_CONFIG,
      ...(current ?? legacy ?? {}),
      featureRoutes: sanitizeFeatureRoutes((current ?? legacy)?.featureRoutes),
      guardrails: sanitizeGuardrails((current ?? legacy)?.guardrails),
    });
  }

  getPublicConfig(): AiPublicConfig {
    return publicConfig(this.getConfig());
  }

  getProviderDescriptors(): AiProviderDescriptor[] {
    return AI_PROVIDER_DESCRIPTORS;
  }

  private mergeConfig(input: AiConfigPatch, current = this.getConfig()): AiStoredConfig {
    const preset = isOpenAICompatiblePreset(input.openaiCompatiblePreset)
      ? input.openaiCompatiblePreset
      : current.openaiCompatiblePreset;
    const presetDescriptor = openAICompatiblePreset(preset);
    const presetChanged = preset !== current.openaiCompatiblePreset;
    const provider = isProvider(input.provider) ? input.provider : current.provider;
    const budget = input.dailyTokenBudget === undefined
      ? current.dailyTokenBudget
      : Math.max(0, Math.floor(Number(input.dailyTokenBudget)));

    const nextCompatibleBaseUrl = input.openaiCompatibleBaseUrl?.trim()
      || (presetChanged ? presetDescriptor.baseUrl : current.openaiCompatibleBaseUrl)
      || presetDescriptor.baseUrl
      || '';
    const compatibleBaseChanged = normalizedUrlIdentity(nextCompatibleBaseUrl) !== normalizedUrlIdentity(current.openaiCompatibleBaseUrl);
    const compatibleIdentityChanged = presetChanged || compatibleBaseChanged;
    const nextCompatibleKey = input.openaiCompatibleApiKey?.trim()
      ? encryptSecret(input.openaiCompatibleApiKey.trim())
      : compatibleIdentityChanged
        ? undefined
        : current.openaiCompatibleApiKeyEncrypted;

    return {
      ...current,
      provider,
      openaiModel: input.openaiModel?.trim() || current.openaiModel,
      anthropicModel: input.anthropicModel?.trim() || current.anthropicModel,
      claudeAccountModel: input.claudeAccountModel?.trim() || current.claudeAccountModel,
      codexAccountModel: input.codexAccountModel?.trim() || current.codexAccountModel,
      ollamaModel: input.ollamaModel?.trim() || current.ollamaModel,
      ollamaBaseUrl: input.ollamaBaseUrl?.trim() || current.ollamaBaseUrl,
      openaiCompatiblePreset: preset,
      openaiCompatibleModel: input.openaiCompatibleModel?.trim()
        || (presetChanged ? presetDescriptor.defaultModel : current.openaiCompatibleModel)
        || presetDescriptor.defaultModel,
      openaiCompatibleBaseUrl: nextCompatibleBaseUrl,
      featureRoutes: sanitizeFeatureRoutes(input.featureRoutes, current.featureRoutes),
      guardrails: sanitizeGuardrails(input.guardrails, current.guardrails),
      dailyTokenBudget: Number.isFinite(budget) ? budget : current.dailyTokenBudget,
      openaiApiKeyEncrypted: input.openaiApiKey?.trim() ? encryptSecret(input.openaiApiKey.trim()) : current.openaiApiKeyEncrypted,
      anthropicApiKeyEncrypted: input.anthropicApiKey?.trim() ? encryptSecret(input.anthropicApiKey.trim()) : current.anthropicApiKeyEncrypted,
      openaiCompatibleApiKeyEncrypted: nextCompatibleKey,
    };
  }

  configure(input: AiConfigPatch): AiPublicConfig {
    const current = this.getConfig();
    const next = this.mergeConfig(input, current);
    this.repository.setSetting(AI_CONFIG_KEY, next);
    return publicConfig(next);
  }

  async testProvider(input: AiConfigPatch = {}): Promise<AiProviderHealth> {
    const config = this.mergeConfig(input);
    return this.provider(config).health(config);
  }

  async listModels(input: AiConfigPatch = {}): Promise<AiModelListResult> {
    const config = this.mergeConfig(input);
    return this.provider(config).listModels(config);
  }

  getConversation(ideaId: string): AiChatMessage[] {
    return this.store.getMessages(ideaId);
  }

  getUsageSummary(): { last24h: number; last7d: number } {
    const now = Date.now();
    const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    return {
      last24h: this.store.tokensSince(since24h),
      last7d: this.store.tokensSince(since7d),
    };
  }

  getUsageDetail(): AiUsageDetail {
    const now = Date.now();
    const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    return {
      windows: {
        last24h: this.store.tokensSince(since24h),
        last7d: this.store.tokensSince(since7d),
      },
      byRoute24h: this.store.routeUsageBuckets(since24h),
      byFeature: this.store.usageBuckets(since7d, 'feature'),
      byProvider: this.store.usageBuckets(since7d, 'provider'),
      byModel: this.store.usageBuckets(since7d, 'model'),
      recentAuditEvents: this.store.recentAuditEvents(),
    };
  }

  private provider(config: AiStoredConfig): AiProvider {
    const provider = this.providers.get(config.provider);
    if (!provider) throw new Error(`Unknown AI provider: ${config.provider}`);
    return provider;
  }

  private budgetStates(config: AiStoredConfig, feature: AiFeatureId): AiBudgetState[] {
    const guardrails = sanitizeGuardrails(config.guardrails);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const model = modelFor(config);
    const budgetValues: AiBudgetState[] = [
      {
        scope: 'global',
        id: 'dailyTokenBudget',
        limit: config.dailyTokenBudget,
        used: this.store.tokensSince(since),
        remaining: config.dailyTokenBudget > 0 ? Math.max(0, config.dailyTokenBudget - this.store.tokensSince(since)) : null,
        window: 'day',
        enabled: config.dailyTokenBudget > 0,
      },
      {
        scope: 'feature',
        id: feature,
        limit: guardrails.featureDailyTokenBudgets[feature] ?? 0,
        used: this.store.tokensSince(since, { routePrefix: feature }),
        remaining: null,
        window: 'day',
        enabled: (guardrails.featureDailyTokenBudgets[feature] ?? 0) > 0,
      },
      {
        scope: 'provider',
        id: config.provider,
        limit: guardrails.providerDailyTokenBudgets[config.provider] ?? 0,
        used: this.store.tokensSince(since, { provider: config.provider }),
        remaining: null,
        window: 'day',
        enabled: (guardrails.providerDailyTokenBudgets[config.provider] ?? 0) > 0,
      },
      {
        scope: 'model',
        id: model,
        limit: guardrails.modelDailyTokenBudgets[model] ?? 0,
        used: this.store.tokensSince(since, { model }),
        remaining: null,
        window: 'day',
        enabled: (guardrails.modelDailyTokenBudgets[model] ?? 0) > 0,
      },
    ];

    return budgetValues.map((state) => ({
      ...state,
      remaining: state.enabled ? Math.max(0, state.limit - state.used) : null,
    }));
  }

  preflight(feature: AiFeatureId): AiPreflightResult {
    const config = resolveFeatureConfig(this.getConfig(), feature);
    const guardrails = sanitizeGuardrails(config.guardrails);
    const model = modelFor(config);
    const local = providerIsLocal(config);
    const providerLabel = providerLabelForConfig(config);
    const blockers: string[] = [];
    const warnings: string[] = [];

    if (guardrails.featureEnabled[feature] === false) blockers.push(`${feature} is disabled by AI guardrails.`);
    if (guardrails.providerEnabled[config.provider] === false) blockers.push(`${providerLabel} is disabled by AI guardrails.`);
    if (guardrails.allowedModels.length > 0 && !guardrails.allowedModels.includes(model)) {
      blockers.push(`${model} is not in the AI model allowlist.`);
    }

    for (const budget of this.budgetStates(config, feature)) {
      if (budget.enabled && budget.used >= budget.limit) blockers.push(`${budget.scope} budget ${budget.id} reached (${budget.used}/${budget.limit} tokens today).`);
      else if (budget.enabled && budget.remaining !== null && budget.remaining <= Math.max(1000, Math.ceil(budget.limit * 0.1))) {
        warnings.push(`${budget.scope} budget ${budget.id} is nearly exhausted (${budget.remaining} tokens left today).`);
      }
    }
    if (!local && guardrails.warnOnRemoteProvider) warnings.push(`This route uses ${providerLabel}, so idea content may leave this machine.`);

    return {
      feature,
      provider: config.provider,
      model,
      local,
      contentLeavesMachine: !local,
      allowed: blockers.length === 0,
      requiresConfirmation: !local && guardrails.requireConfirmationForRemoteProvider,
      warnings,
      blockers,
      budgets: this.budgetStates(config, feature),
      ...(!local && guardrails.requireConfirmationForRemoteProvider && blockers.length === 0
        ? { confirmationToken: createConfirmationToken(feature, config.provider, model) }
        : {}),
    };
  }

  private checkGuardrails(config: AiStoredConfig, feature: AiFeatureId, key: string, options: AiGuardrailCheckOptions = {}): void {
    const guardrails = sanitizeGuardrails(config.guardrails);
    const model = modelFor(config);
    const providerLabel = providerLabelForConfig(config);
    const deny = (message: string, statusCode: number) => {
      this.store.recordAuditEvent('guardrail_denied', feature, config.provider, model, message);
      throw guardrailError(message, statusCode);
    };
    if (!options.skipRateLimit) {
      try {
        this.rateLimiter.check(key);
      } catch {
        deny(`AI rate limit reached. Wait a minute before trying again. ${GUARDRAIL_SETTINGS_HINT}`, 429);
      }
    }

    if (guardrails.featureEnabled[feature] === false) deny(`AI feature "${feature}" is disabled by guardrails. ${GUARDRAIL_SETTINGS_HINT}`, 403);
    if (guardrails.providerEnabled[config.provider] === false) deny(`AI provider "${providerLabel}" is disabled by guardrails. ${GUARDRAIL_SETTINGS_HINT}`, 403);
    if (guardrails.allowedModels.length > 0 && !guardrails.allowedModels.includes(model)) {
      deny(`AI model "${model}" is not allowed by guardrails. ${GUARDRAIL_SETTINGS_HINT}`, 403);
    }
    if (!providerIsLocal(config) && guardrails.requireConfirmationForRemoteProvider && !validConfirmationToken(options.confirmationToken, feature, config.provider, model)) {
      deny(`Remote AI provider "${providerLabel}" requires preflight confirmation before sending idea content. ${GUARDRAIL_SETTINGS_HINT}`, 403);
    }

    for (const budget of this.budgetStates(config, feature)) {
      if (budget.enabled && budget.used >= budget.limit) {
        deny(`AI ${budget.scope} budget "${budget.id}" reached (${budget.used}/${budget.limit} tokens today). ${GUARDRAIL_SETTINGS_HINT}`, 429);
      }
    }
  }

  private recordProviderFailure(feature: AiFeatureId, config: AiStoredConfig, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.store.recordAuditEvent('provider_error', feature, config.provider, modelFor(config), message);
  }

  assertFeatureAllowed(feature: AiFeatureId, key: string, confirmationToken?: string): void {
    const config = resolveFeatureConfig(this.getConfig(), feature);
    this.checkGuardrails(config, feature, key, { confirmationToken });
  }

  async streamChat(
    ideaId: string,
    userMessage: string,
    key: string,
    onDelta: (delta: string) => void,
    confirmationToken?: string,
  ): Promise<AiChatMessage> {
    const idea = this.repository.getIdea(ideaId);
    if (!idea) throw new Error('Idea not found.');
    const config = resolveFeatureConfig(this.getConfig(), 'thinking-partner');
    this.checkGuardrails(config, 'thinking-partner', key, { confirmationToken, skipRateLimit: true });

    const history = this.store.getMessages(ideaId);
    this.store.addMessage(ideaId, 'user', userMessage);
    try {
      const result = await this.provider(config).stream(messagesForChat(idea, history, userMessage), config, onDelta);
      const assistantMessage = this.store.addMessage(ideaId, 'assistant', result.text, config.provider, modelFor(config));
      this.store.recordUsage(config.provider, modelFor(config), 'thinking-partner', result.usage);
      return assistantMessage;
    } catch (error) {
      this.recordProviderFailure('thinking-partner', config, error);
      throw error;
    }
  }

  async suggest(ideaId: string, field: AiSuggestionField, currentValue: string, key: string, confirmationToken?: string): Promise<AiSuggestion> {
    const idea = this.repository.getIdea(ideaId);
    if (!idea) throw new Error('Idea not found.');
    const config = resolveFeatureConfig(this.getConfig(), 'field-suggestions');
    this.checkGuardrails(config, 'field-suggestions', key, { confirmationToken });

    try {
      const result = await this.provider(config).complete(promptForSuggestion(idea, field, currentValue), config);
      this.store.recordUsage(config.provider, modelFor(config), 'field-suggestions', result.usage);
      return parseSuggestion(field, result.text);
    } catch (error) {
      this.recordProviderFailure('field-suggestions', config, error);
      throw error;
    }
  }

  async suggestField(
    ideaId: string,
    field: AiSuggestionField,
    currentValue: string,
    key: string,
    customPrompt?: string,
    omitCurrentValue = false,
    confirmationToken?: string,
  ): Promise<AiSuggestion> {
    const idea = this.repository.getIdea(ideaId);
    if (!idea) throw new Error('Idea not found.');
    const config = resolveFeatureConfig(this.getConfig(), 'field-suggestions');
    this.checkGuardrails(config, 'field-suggestions', key, { confirmationToken });

    try {
      const result = await this.provider(config).complete(
        promptForFieldAssist(idea, field, currentValue, customPrompt, omitCurrentValue),
        config,
      );
      this.store.recordUsage(config.provider, modelFor(config), 'field-suggestions', result.usage);
      return parseSuggestion(field, result.text);
    } catch (error) {
      this.recordProviderFailure('field-suggestions', config, error);
      throw error;
    }
  }

  async streamFieldAssist(
    input: {
      ideaId: string;
      field: AiSuggestionField;
      currentValue?: string;
      message: string;
      history?: AiFieldAssistMessage[];
    },
    key: string,
    onDelta: (delta: string) => void,
    confirmationToken?: string,
  ): Promise<AiChatMessage> {
    const idea = this.repository.getIdea(input.ideaId);
    if (!idea) throw new Error('Idea not found.');
    const message = input.message.trim();
    if (!message) throw new Error('message is required.');
    const config = resolveFeatureConfig(this.getConfig(), 'field-suggestions');
    this.checkGuardrails(config, 'field-suggestions', key, { confirmationToken, skipRateLimit: true });

    try {
      const result = await this.provider(config).stream(
        fieldAssistConversationMessages(
          idea,
          input.field,
          input.currentValue ?? '',
          input.history,
          message,
        ),
        config,
        onDelta,
      );
      this.store.recordUsage(config.provider, modelFor(config), 'field-suggestions:conversation', result.usage);
      return {
        id: uuid(),
        ideaId: input.ideaId,
        role: 'assistant',
        content: result.text,
        createdAt: new Date(),
        provider: config.provider,
        model: modelFor(config),
      };
    } catch (error) {
      this.recordProviderFailure('field-suggestions', config, error);
      throw error;
    }
  }

  async assistMode(
    mode: string,
    context: unknown,
    prompt: string | undefined,
    key: string,
    confirmationToken?: string,
  ): Promise<string> {
    const feature = featureForMode(mode);
    const config = resolveFeatureConfig(this.getConfig(), feature);
    this.checkGuardrails(config, feature, key, { confirmationToken });

    try {
      const result = await this.provider(config).complete(promptForMode(mode, context, prompt), config);
      this.store.recordUsage(config.provider, modelFor(config), feature, result.usage);
      return result.text;
    } catch (error) {
      this.recordProviderFailure(feature, config, error);
      throw error;
    }
  }
}
