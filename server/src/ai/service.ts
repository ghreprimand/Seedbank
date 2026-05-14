import { extractSuggestion } from "./utils/suggestion-parser.js";
import { aiProviderLabel, isAiProviderId } from '../../../shared/types.js';
import type {
  AiProviderDiagnosticCode,
  AiChatMessage,
  AiEffectiveFeatureRoute,
  AiFieldAssistMessage,
  AiFeatureId,
  AiFeatureRoute,
  AiGuardrailsConfig,
  AiModelInfo,
  AiModelListResult,
  AiOpenAICompatiblePresetId,
  AiPreflightResult,
  AiProviderDescriptor,
  AiProviderInstanceDiagnostic,
  AiProviderInstanceRegistryEntry,
  AiProviderHealth,
  AiProviderId,
  AiProviderInstanceConfig,
  AiProviderInstanceId,
  AiProviderInstanceAvailability,
  AiPublicConfig,
  AiMethodCapability,
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
import {
  AI_PROVIDER_DESCRIPTORS,
  AI_PROVIDER_INSTANCE_DESCRIPTORS,
  AI_PROVIDER_INSTANCE_REGISTRY,
  localOpenAICompatiblePreset,
  openAICompatiblePreset,
  providerInstanceDescriptor,
} from './registry.js';
import type { AiConfigPatch, AiProvider, AiProviderMessage, AiStoredConfig } from './types.js';
import { codexAccountEnabledByEnv } from './codex-account/session.js';
import { claudeAccountEnabledByEnv, claudeAccountRuntimeAvailability } from './claude-account/auth.js';
import { AiStore, type AiExecutionMetadata } from './store.js';

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
  defaultProviderInstanceId: 'ollama',
  providerInstances: {
    'claude-api': {
      id: 'claude-api',
      provider: 'anthropic',
      label: AI_PROVIDER_INSTANCE_DESCRIPTORS['claude-api'].label,
      family: AI_PROVIDER_INSTANCE_DESCRIPTORS['claude-api'].family,
      connectionMode: AI_PROVIDER_INSTANCE_DESCRIPTORS['claude-api'].connectionMode,
      dataResidency: AI_PROVIDER_INSTANCE_DESCRIPTORS['claude-api'].dataResidency,
      capabilities: AI_PROVIDER_INSTANCE_DESCRIPTORS['claude-api'].capabilities,
      featureRoutable: true,
      modelDiscovery: true,
      configuredModel: 'claude-sonnet-4-20250514',
      discoveredModels: [],
      available: 'auth-required',
      requiresApiKey: true,
      hasApiKey: false,
      local: false,
    },
    'claude-account': {
      id: 'claude-account',
      provider: 'claude-account',
      label: AI_PROVIDER_INSTANCE_DESCRIPTORS['claude-account'].label,
      family: AI_PROVIDER_INSTANCE_DESCRIPTORS['claude-account'].family,
      connectionMode: AI_PROVIDER_INSTANCE_DESCRIPTORS['claude-account'].connectionMode,
      dataResidency: AI_PROVIDER_INSTANCE_DESCRIPTORS['claude-account'].dataResidency,
      capabilities: AI_PROVIDER_INSTANCE_DESCRIPTORS['claude-account'].capabilities,
      featureRoutable: true,
      modelDiscovery: true,
      configuredModel: 'claude-sonnet-latest',
      discoveredModels: [],
      available: 'unavailable',
      requiresApiKey: false,
      hasApiKey: false,
      local: false,
      authenticated: false,
    },
    'openai-api': {
      id: 'openai-api',
      provider: 'openai',
      label: AI_PROVIDER_INSTANCE_DESCRIPTORS['openai-api'].label,
      family: AI_PROVIDER_INSTANCE_DESCRIPTORS['openai-api'].family,
      connectionMode: AI_PROVIDER_INSTANCE_DESCRIPTORS['openai-api'].connectionMode,
      dataResidency: AI_PROVIDER_INSTANCE_DESCRIPTORS['openai-api'].dataResidency,
      capabilities: AI_PROVIDER_INSTANCE_DESCRIPTORS['openai-api'].capabilities,
      featureRoutable: true,
      modelDiscovery: true,
      configuredModel: 'gpt-4.1-mini',
      discoveredModels: [],
      available: 'auth-required',
      requiresApiKey: true,
      hasApiKey: false,
      local: false,
    },
    'codex-account': {
      id: 'codex-account',
      provider: 'codex-account',
      label: AI_PROVIDER_INSTANCE_DESCRIPTORS['codex-account'].label,
      family: AI_PROVIDER_INSTANCE_DESCRIPTORS['codex-account'].family,
      connectionMode: AI_PROVIDER_INSTANCE_DESCRIPTORS['codex-account'].connectionMode,
      dataResidency: AI_PROVIDER_INSTANCE_DESCRIPTORS['codex-account'].dataResidency,
      capabilities: AI_PROVIDER_INSTANCE_DESCRIPTORS['codex-account'].capabilities,
      featureRoutable: true,
      modelDiscovery: true,
      configuredModel: 'codex-recommended',
      discoveredModels: [],
      available: 'unavailable',
      requiresApiKey: false,
      hasApiKey: false,
      local: false,
      authenticated: false,
    },
    ollama: {
      id: 'ollama',
      provider: 'ollama',
      label: AI_PROVIDER_INSTANCE_DESCRIPTORS.ollama.label,
      family: AI_PROVIDER_INSTANCE_DESCRIPTORS.ollama.family,
      connectionMode: AI_PROVIDER_INSTANCE_DESCRIPTORS.ollama.connectionMode,
      dataResidency: AI_PROVIDER_INSTANCE_DESCRIPTORS.ollama.dataResidency,
      capabilities: AI_PROVIDER_INSTANCE_DESCRIPTORS.ollama.capabilities,
      featureRoutable: true,
      modelDiscovery: true,
      configuredModel: 'llama3.2',
      discoveredModels: [],
      available: 'available',
      requiresApiKey: false,
      hasApiKey: false,
      local: true,
      baseUrl: 'http://localhost:11434',
    },
    'local-openai-compatible': {
      id: 'local-openai-compatible',
      provider: 'openai-compatible',
      label: AI_PROVIDER_INSTANCE_DESCRIPTORS['local-openai-compatible'].label,
      family: AI_PROVIDER_INSTANCE_DESCRIPTORS['local-openai-compatible'].family,
      connectionMode: AI_PROVIDER_INSTANCE_DESCRIPTORS['local-openai-compatible'].connectionMode,
      dataResidency: AI_PROVIDER_INSTANCE_DESCRIPTORS['local-openai-compatible'].dataResidency,
      capabilities: AI_PROVIDER_INSTANCE_DESCRIPTORS['local-openai-compatible'].capabilities,
      featureRoutable: true,
      modelDiscovery: true,
      configuredModel: '',
      discoveredModels: [],
      available: 'available',
      requiresApiKey: false,
      hasApiKey: false,
      local: true,
      baseUrl: 'http://localhost:1234/v1',
      presetId: 'lm-studio',
    },
    'cloud-openai-compatible': {
      id: 'cloud-openai-compatible',
      provider: 'openai-compatible',
      label: AI_PROVIDER_INSTANCE_DESCRIPTORS['cloud-openai-compatible'].label,
      family: AI_PROVIDER_INSTANCE_DESCRIPTORS['cloud-openai-compatible'].family,
      connectionMode: AI_PROVIDER_INSTANCE_DESCRIPTORS['cloud-openai-compatible'].connectionMode,
      dataResidency: AI_PROVIDER_INSTANCE_DESCRIPTORS['cloud-openai-compatible'].dataResidency,
      capabilities: AI_PROVIDER_INSTANCE_DESCRIPTORS['cloud-openai-compatible'].capabilities,
      featureRoutable: true,
      modelDiscovery: true,
      configuredModel: 'openai/gpt-4o-mini',
      discoveredModels: [],
      available: 'auth-required',
      requiresApiKey: true,
      hasApiKey: false,
      local: false,
      baseUrl: 'https://openrouter.ai/api/v1',
      presetId: 'openrouter',
    },
  },
  provider: 'ollama',
  openaiModel: 'gpt-4.1-mini',
  anthropicModel: 'claude-sonnet-4-20250514',
  claudeAccountModel: 'claude-sonnet-latest',
  codexAccountModel: 'codex-recommended',
  ollamaModel: 'llama3.2',
  ollamaBaseUrl: 'http://localhost:11434',
  localOpenaiCompatiblePreset: 'lm-studio',
  localOpenaiCompatibleModel: '',
  localOpenaiCompatibleBaseUrl: 'http://localhost:1234/v1',
  cloudOpenaiCompatiblePreset: 'openrouter',
  cloudOpenaiCompatibleModel: 'openai/gpt-4o-mini',
  cloudOpenaiCompatibleBaseUrl: 'https://openrouter.ai/api/v1',
  openaiCompatiblePreset: 'openrouter',
  openaiCompatibleModel: 'openai/gpt-4o-mini',
  openaiCompatibleBaseUrl: 'https://openrouter.ai/api/v1',
  dailyTokenBudget: 200000,
  featureRoutes: {
    'thinking-partner': { provider: 'default', providerInstanceId: 'ollama' },
    'field-suggestions': { provider: 'default', providerInstanceId: 'ollama' },
    'health-check': { provider: 'default', providerInstanceId: 'ollama' },
    'discover-insights': { provider: 'default', providerInstanceId: 'ollama' },
    default: { provider: 'default', providerInstanceId: 'ollama' },
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
  codexAccountAuthenticated: false,
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

const AI_PROVIDER_INSTANCE_IDS: AiProviderInstanceId[] = [
  'claude-api',
  'claude-account',
  'openai-api',
  'codex-account',
  'ollama',
  'local-openai-compatible',
  'cloud-openai-compatible',
];

function isProviderInstanceId(value: unknown): value is AiProviderInstanceId {
  return typeof value === 'string' && AI_PROVIDER_INSTANCE_IDS.includes(value as AiProviderInstanceId);
}

function providerInstanceToProvider(instanceId: AiProviderInstanceId): AiProviderId {
  return providerInstanceDescriptor(instanceId).provider;
}

const FEATURE_ROUTABLE_PROVIDERS: ReadonlySet<AiProviderId> = new Set([
  'openai',
  'anthropic',
  'claude-account',
  'codex-account',
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
  const route = value as { provider?: unknown; providerInstanceId?: unknown; model?: unknown } | undefined;
  if (!route) return undefined;
  if (route.provider === 'default') {
    return { provider: 'default' };
  }
  if (isProviderInstanceId(route.providerInstanceId)) {
    const provider = providerInstanceToProvider(route.providerInstanceId);
    return {
      provider,
      providerInstanceId: route.providerInstanceId,
      ...(typeof route.model === 'string' && route.model.trim() ? { model: route.model.trim() } : {}),
    };
  }
  if (!isProvider(route.provider)) return undefined;
  if (!isFeatureRoutableProvider(route.provider)) return { provider: 'default' };
  const providerInstanceId = route.provider === 'anthropic'
    ? 'claude-api'
    : route.provider === 'openai'
      ? 'openai-api'
      : route.provider === 'claude-account'
        ? 'claude-account'
        : route.provider === 'codex-account'
          ? 'codex-account'
          : route.provider === 'ollama'
            ? 'ollama'
            : 'cloud-openai-compatible';
  return {
    provider: route.provider,
    providerInstanceId,
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

function sanitizeDiscoveredModels(input: unknown): AiModelInfo[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const item = row as { id?: unknown; name?: unknown; displayName?: unknown; capabilities?: unknown };
      if (typeof item.id !== 'string' || !item.id.trim()) return null;
      const normalized: AiModelInfo = { id: item.id.trim() };
      if (typeof item.name === 'string' && item.name.trim()) normalized.name = item.name.trim();
      if (typeof item.displayName === 'string' && item.displayName.trim()) normalized.displayName = item.displayName.trim();
      if (item.capabilities && typeof item.capabilities === 'object') {
        const caps = item.capabilities as { tools?: unknown; vision?: unknown; thinking?: unknown; contextWindow?: unknown };
        normalized.capabilities = {
          tools: caps.tools === true,
          vision: caps.vision === true,
          thinking: caps.thinking === true,
          ...(typeof caps.contextWindow === 'number' && Number.isFinite(caps.contextWindow) && caps.contextWindow > 0
            ? { contextWindow: Math.floor(caps.contextWindow) }
            : {}),
        };
      }
      return normalized;
    })
    .filter((value): value is AiModelInfo => Boolean(value));
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

function normalizeDefaultProviderInstance(value: unknown): AiProviderInstanceId {
  return isProviderInstanceId(value) ? value : DEFAULT_CONFIG.defaultProviderInstanceId;
}

function applyProviderInstance(config: AiStoredConfig, providerInstanceId: AiProviderInstanceId): AiStoredConfig {
  if (providerInstanceId === 'claude-api') {
    return { ...config, provider: 'anthropic', anthropicModel: config.providerInstances['claude-api'].configuredModel || config.anthropicModel };
  }
  if (providerInstanceId === 'claude-account') {
    return { ...config, provider: 'claude-account', claudeAccountModel: config.providerInstances['claude-account'].configuredModel || config.claudeAccountModel };
  }
  if (providerInstanceId === 'openai-api') {
    return { ...config, provider: 'openai', openaiModel: config.providerInstances['openai-api'].configuredModel || config.openaiModel };
  }
  if (providerInstanceId === 'codex-account') {
    return { ...config, provider: 'codex-account', codexAccountModel: config.providerInstances['codex-account'].configuredModel || config.codexAccountModel };
  }
  if (providerInstanceId === 'ollama') {
    return {
      ...config,
      provider: 'ollama',
      ollamaModel: config.providerInstances.ollama.configuredModel || config.ollamaModel,
      ollamaBaseUrl: config.providerInstances.ollama.baseUrl || config.ollamaBaseUrl,
    };
  }
  if (providerInstanceId === 'local-openai-compatible') {
    return {
      ...config,
      provider: 'openai-compatible',
      openaiCompatiblePreset: config.localOpenaiCompatiblePreset,
      openaiCompatibleModel: config.localOpenaiCompatibleModel,
      openaiCompatibleBaseUrl: config.localOpenaiCompatibleBaseUrl,
    };
  }
  return {
    ...config,
    provider: 'openai-compatible',
    openaiCompatiblePreset: config.cloudOpenaiCompatiblePreset,
    openaiCompatibleModel: config.cloudOpenaiCompatibleModel,
    openaiCompatibleBaseUrl: config.cloudOpenaiCompatibleBaseUrl,
  };
}

function resolveFeatureConfig(config: AiStoredConfig, feature: AiFeatureId): AiStoredConfig {
  const routes = sanitizeFeatureRoutes(config.featureRoutes);
  const route = routes[feature] ?? routes.default;
  const defaultInstanceId = normalizeDefaultProviderInstance(config.defaultProviderInstanceId);
  if (route.provider === 'default') {
    return applyProviderInstance(config, defaultInstanceId);
  }
  if (route.providerInstanceId) {
    return applyModelOverride(applyProviderInstance(config, route.providerInstanceId), providerInstanceToProvider(route.providerInstanceId), route.model ?? '');
  }
  return applyModelOverride({ ...config, provider: route.provider }, route.provider, route.model ?? '');
}

interface FeatureRouteValidationIssue {
  feature: AiFeatureId;
  providerInstanceId: AiProviderInstanceId;
  code: AiProviderDiagnosticCode;
  message: string;
  statusCode: number;
}

function routeProviderInstanceId(config: AiStoredConfig, feature: AiFeatureId): AiProviderInstanceId {
  const routes = sanitizeFeatureRoutes(config.featureRoutes);
  const route = routes[feature] ?? routes.default;
  const defaultInstanceId = normalizeDefaultProviderInstance(config.defaultProviderInstanceId);
  return route.provider === 'default'
    ? defaultInstanceId
    : (route.providerInstanceId ?? defaultInstanceId);
}

function routeValidationIssues(config: AiStoredConfig, feature: AiFeatureId): FeatureRouteValidationIssue[] {
  const providerInstanceId = routeProviderInstanceId(config, feature);
  const instance = config.providerInstances[providerInstanceId];
  const issues: FeatureRouteValidationIssue[] = [];
  const label = instance?.label ?? providerInstanceId;

  if (!instance) {
    issues.push({
      feature,
      providerInstanceId,
      code: 'runtime_unavailable',
      message: `Feature route "${feature}" references unknown provider instance "${providerInstanceId}".`,
      statusCode: 503,
    });
    return issues;
  }

  if (instance.baseUrl && !isValidAbsoluteUrl(instance.baseUrl)) {
    issues.push({
      feature,
      providerInstanceId,
      code: 'invalid_url',
      message: `Feature route "${feature}" uses ${label} with invalid base URL "${instance.baseUrl}".`,
      statusCode: 400,
    });
  }

  if (instance.available === 'unavailable') {
    issues.push({
      feature,
      providerInstanceId,
      code: 'runtime_unavailable',
      message: `Feature route "${feature}" uses ${label}, but runtime is unavailable${instance.availabilityReason ? `: ${instance.availabilityReason}` : '.'}`,
      statusCode: 503,
    });
  } else if (instance.available === 'auth-required') {
    issues.push({
      feature,
      providerInstanceId,
      code: instance.requiresApiKey && !instance.hasApiKey ? 'missing_key' : 'auth_required',
      message: instance.requiresApiKey && !instance.hasApiKey
        ? `Feature route "${feature}" uses ${label}, but API key is not configured.`
        : `Feature route "${feature}" uses ${label}, but account login/authentication is required.`,
      statusCode: 400,
    });
  }

  const resolved = resolveFeatureConfig(config, feature);
  const model = modelFor(resolved).trim();
  if (!model) {
    issues.push({
      feature,
      providerInstanceId,
      code: 'model_missing',
      message: `Feature route "${feature}" uses ${label}, but no model is configured.`,
      statusCode: 400,
    });
  }

  return issues;
}

function saveTimeValidationFeatures(next: AiStoredConfig, input: AiConfigPatch): Set<AiFeatureId> {
  const features = new Set<AiFeatureId>();
  const source = input.featureRoutes;
  if (source && typeof source === 'object') {
    for (const feature of AI_FEATURE_IDS) {
      const raw = (source as Partial<Record<AiFeatureId, unknown>>)[feature];
      if (!raw || typeof raw !== 'object') continue;
      const route = raw as { provider?: unknown; providerInstanceId?: unknown };
      if (isProviderInstanceId(route.providerInstanceId) || route.provider === 'default') {
        features.add(feature);
      }
    }
  }
  if (isProviderInstanceId(input.defaultProviderInstanceId)) {
    const routes = sanitizeFeatureRoutes(next.featureRoutes);
    for (const feature of AI_FEATURE_IDS) {
      const route = routes[feature] ?? routes.default;
      if (route.provider === 'default') features.add(feature);
    }
  }
  return features;
}

function effectiveFeatureRoutes(config: AiStoredConfig): Record<AiFeatureId, AiEffectiveFeatureRoute> {
  const routes = sanitizeFeatureRoutes(config.featureRoutes);
  const defaultInstanceId = normalizeDefaultProviderInstance(config.defaultProviderInstanceId);
  return AI_FEATURE_IDS.reduce<Record<AiFeatureId, AiEffectiveFeatureRoute>>((acc, feature) => {
    const resolved = resolveFeatureConfig(config, feature);
    const route = routes[feature];
    const providerInstanceId = route?.provider === 'default'
      ? defaultInstanceId
      : (route?.providerInstanceId ?? defaultInstanceId);
    acc[feature] = {
      provider: resolved.provider,
      providerInstanceId,
      model: modelFor(resolved),
      inherited: route?.provider === 'default',
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

function toAvailability(available: boolean, reason?: string): { available: AiProviderInstanceAvailability; availabilityReason?: string } {
  return available
    ? { available: 'available' }
    : { available: 'unavailable', ...(reason ? { availabilityReason: reason } : {}) };
}

function isValidAbsoluteUrl(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value.trim());
    return Boolean(url.protocol && url.host);
  } catch {
    return false;
  }
}

function isLocalOpenAICompatibleConfig(preset: AiOpenAICompatiblePresetId, baseUrl: string): boolean {
  return localOpenAICompatiblePreset(preset) || isLikelyLocalUrl(baseUrl);
}

function materializeProviderInstances(config: AiStoredConfig): Record<AiProviderInstanceId, AiProviderInstanceConfig> {
  const claudeGate = claudeAccountRuntimeAvailability();
  const codexGate = codexAccountEnabledByEnv();
  const cloudKeyPresent = Boolean(config.cloudOpenaiCompatibleApiKeyEncrypted ?? config.openaiCompatibleApiKeyEncrypted);
  const localKeyPresent = Boolean(config.localOpenaiCompatibleApiKeyEncrypted);

  const current = config.providerInstances ?? DEFAULT_CONFIG.providerInstances;

  return {
    'claude-api': {
      ...current['claude-api'],
      ...AI_PROVIDER_INSTANCE_DESCRIPTORS['claude-api'],
      configuredModel: config.anthropicModel,
      available: config.anthropicApiKeyEncrypted ? 'available' : 'auth-required',
      availabilityReason: config.anthropicApiKeyEncrypted ? undefined : 'Anthropic API key is not configured.',
      requiresApiKey: true,
      hasApiKey: Boolean(config.anthropicApiKeyEncrypted),
      local: false,
    },
    'claude-account': {
      ...current['claude-account'],
      ...AI_PROVIDER_INSTANCE_DESCRIPTORS['claude-account'],
      configuredModel: config.claudeAccountModel,
      ...toAvailability(claudeGate.available, claudeGate.reason),
      authenticated: claudeAccountAuthenticatedCache,
      requiresApiKey: false,
      hasApiKey: false,
      local: false,
    },
    'openai-api': {
      ...current['openai-api'],
      ...AI_PROVIDER_INSTANCE_DESCRIPTORS['openai-api'],
      configuredModel: config.openaiModel,
      available: config.openaiApiKeyEncrypted ? 'available' : 'auth-required',
      availabilityReason: config.openaiApiKeyEncrypted ? undefined : 'OpenAI API key is not configured.',
      requiresApiKey: true,
      hasApiKey: Boolean(config.openaiApiKeyEncrypted),
      local: false,
    },
    'codex-account': {
      ...current['codex-account'],
      ...AI_PROVIDER_INSTANCE_DESCRIPTORS['codex-account'],
      configuredModel: config.codexAccountModel,
      ...toAvailability(codexGate, codexGate ? undefined : 'Codex account app-server is disabled in this build. Set SEEDBANK_ENABLE_CODEX_ACCOUNT=1 to opt in.'),
      authenticated: codexAccountAuthenticatedCache,
      requiresApiKey: false,
      hasApiKey: false,
      local: false,
    },
    ollama: {
      ...current.ollama,
      ...AI_PROVIDER_INSTANCE_DESCRIPTORS.ollama,
      configuredModel: config.ollamaModel,
      baseUrl: config.ollamaBaseUrl,
      available: 'available',
      availabilityReason: undefined,
      requiresApiKey: false,
      hasApiKey: false,
      local: true,
    },
    'local-openai-compatible': {
      ...current['local-openai-compatible'],
      ...AI_PROVIDER_INSTANCE_DESCRIPTORS['local-openai-compatible'],
      configuredModel: config.localOpenaiCompatibleModel,
      presetId: config.localOpenaiCompatiblePreset,
      baseUrl: config.localOpenaiCompatibleBaseUrl,
      available: 'available',
      availabilityReason: undefined,
      requiresApiKey: false,
      hasApiKey: localKeyPresent,
      local: true,
    },
    'cloud-openai-compatible': {
      ...current['cloud-openai-compatible'],
      ...AI_PROVIDER_INSTANCE_DESCRIPTORS['cloud-openai-compatible'],
      configuredModel: config.cloudOpenaiCompatibleModel,
      presetId: config.cloudOpenaiCompatiblePreset,
      baseUrl: config.cloudOpenaiCompatibleBaseUrl,
      available: cloudKeyPresent ? 'available' : 'auth-required',
      availabilityReason: cloudKeyPresent ? undefined : 'Cloud OpenAI-compatible API key is not configured.',
      requiresApiKey: true,
      hasApiKey: cloudKeyPresent,
      local: false,
    },
  };
}

function diagnosticsForInstanceConfig(instance: AiProviderInstanceConfig): AiProviderInstanceDiagnostic[] {
  const diagnostics: AiProviderInstanceDiagnostic[] = [
    {
      instanceId: instance.id,
      provider: instance.provider,
      code: 'content_residency',
      message: `Content residency: ${instance.dataResidency}.`,
      severity: 'info',
      dataResidency: instance.dataResidency,
    },
  ];

  if (instance.baseUrl && !isValidAbsoluteUrl(instance.baseUrl)) {
    diagnostics.push({
      instanceId: instance.id,
      provider: instance.provider,
      code: 'invalid_url',
      message: `Invalid base URL for ${instance.label}.`,
      severity: 'error',
      detail: instance.baseUrl,
      dataResidency: instance.dataResidency,
    });
  }

  if (instance.available === 'auth-required') {
    diagnostics.push({
      instanceId: instance.id,
      provider: instance.provider,
      code: instance.requiresApiKey && !instance.hasApiKey ? 'missing_key' : 'auth_required',
      message: instance.requiresApiKey && !instance.hasApiKey
        ? `${instance.label} requires an API key.`
        : `${instance.label} requires account login/authentication.`,
      severity: 'error',
      ...(instance.availabilityReason ? { detail: instance.availabilityReason } : {}),
      dataResidency: instance.dataResidency,
    });
  } else if (instance.available === 'unavailable') {
    diagnostics.push({
      instanceId: instance.id,
      provider: instance.provider,
      code: 'runtime_unavailable',
      message: `${instance.label} runtime is unavailable.`,
      severity: 'error',
      ...(instance.availabilityReason ? { detail: instance.availabilityReason } : {}),
      dataResidency: instance.dataResidency,
    });
  }

  return diagnostics;
}

function healthDiagnostics(
  health: AiProviderHealth,
  instance: AiProviderInstanceConfig,
): AiProviderInstanceDiagnostic[] {
  if (health.ok) return [];
  const mappedCode = health.code === 'bad_url'
    ? 'invalid_url'
    : health.code === 'unreachable'
      ? 'unreachable_endpoint'
      : health.code === 'model_missing'
        ? 'model_missing'
        : health.code === 'not_configured'
          ? (instance.requiresApiKey ? 'missing_key' : 'auth_required')
          : null;
  if (!mappedCode) return [];
  return [{
    instanceId: instance.id,
    provider: instance.provider,
    code: mappedCode,
    message: health.message,
    severity: 'error',
    ...(health.status !== undefined ? { detail: `HTTP ${health.status}` } : {}),
    dataResidency: instance.dataResidency,
  }];
}

function dedupeDiagnostics(diagnostics: AiProviderInstanceDiagnostic[]): AiProviderInstanceDiagnostic[] {
  const seen = new Set<string>();
  const result: AiProviderInstanceDiagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const key = [
      diagnostic.instanceId,
      diagnostic.code,
      diagnostic.message,
      diagnostic.detail ?? '',
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(diagnostic);
  }
  return result;
}

function defaultProviderInstanceForLegacy(config: AiStoredConfig): AiProviderInstanceId {
  if (isProviderInstanceId(config.defaultProviderInstanceId)) return config.defaultProviderInstanceId;
  if (config.provider === 'anthropic') return 'claude-api';
  if (config.provider === 'claude-account') return 'claude-account';
  if (config.provider === 'openai') return 'openai-api';
  if (config.provider === 'codex-account') return 'codex-account';
  if (config.provider === 'ollama') return 'ollama';
  if (config.provider === 'openai-compatible') {
    return isLocalOpenAICompatibleConfig(config.openaiCompatiblePreset, config.openaiCompatibleBaseUrl)
      ? 'local-openai-compatible'
      : 'cloud-openai-compatible';
  }
  return 'ollama';
}

// Cached Claude account auth status — refreshed by async calls.
// Defaults to false; updated when config is loaded or auth endpoints run.
let claudeAccountAuthenticatedCache = false;
let codexAccountAuthenticatedCache = false;

export function setCachedClaudeAccountAuth(authenticated: boolean): void {
  claudeAccountAuthenticatedCache = authenticated;
}

export function setCachedCodexAccountAuth(authenticated: boolean): void {
  codexAccountAuthenticatedCache = authenticated;
}

function publicConfig(config: AiStoredConfig): AiPublicConfig {
  const routes = sanitizeFeatureRoutes(config.featureRoutes);
  const providerInstances = materializeProviderInstances(config);
  const defaultProviderInstanceId = defaultProviderInstanceForLegacy(config);
  const hasLocalOpenAICompatibleKey = Boolean(config.localOpenaiCompatibleApiKeyEncrypted);
  const hasCloudOpenAICompatibleKey = Boolean(config.cloudOpenaiCompatibleApiKeyEncrypted ?? config.openaiCompatibleApiKeyEncrypted);
  return {
    defaultProviderInstanceId,
    providerInstances,
    provider: config.provider,
    openaiModel: config.openaiModel,
    anthropicModel: config.anthropicModel,
    claudeAccountModel: config.claudeAccountModel,
    codexAccountModel: config.codexAccountModel,
    ollamaModel: config.ollamaModel,
    ollamaBaseUrl: config.ollamaBaseUrl,
    localOpenaiCompatiblePreset: config.localOpenaiCompatiblePreset,
    localOpenaiCompatibleModel: config.localOpenaiCompatibleModel,
    localOpenaiCompatibleBaseUrl: config.localOpenaiCompatibleBaseUrl,
    cloudOpenaiCompatiblePreset: config.cloudOpenaiCompatiblePreset,
    cloudOpenaiCompatibleModel: config.cloudOpenaiCompatibleModel,
    cloudOpenaiCompatibleBaseUrl: config.cloudOpenaiCompatibleBaseUrl,
    openaiCompatiblePreset: config.openaiCompatiblePreset,
    openaiCompatibleModel: config.openaiCompatibleModel,
    openaiCompatibleBaseUrl: config.openaiCompatibleBaseUrl,
    dailyTokenBudget: config.dailyTokenBudget,
    featureRoutes: routes,
    effectiveFeatureRoutes: effectiveFeatureRoutes({ ...config, featureRoutes: routes }),
    guardrails: sanitizeGuardrails(config.guardrails),
    hasOpenAIKey: Boolean(config.openaiApiKeyEncrypted),
    hasAnthropicKey: Boolean(config.anthropicApiKeyEncrypted),
    hasLocalOpenAICompatibleKey,
    hasCloudOpenAICompatibleKey,
    hasOpenAICompatibleKey: hasLocalOpenAICompatibleKey || hasCloudOpenAICompatibleKey,
    claudeAccountAvailable: claudeAccountEnabledByEnv(),
    claudeAccountAuthenticated: claudeAccountAuthenticatedCache,
    codexAccountAvailable: codexAccountEnabledByEnv(),
    codexAccountAuthenticated: codexAccountAuthenticatedCache,
  };
}

function apiKeyAvailability(connected: boolean, label: string): Pick<AiMethodCapability, 'availability' | 'availabilityReason'> {
  return connected
    ? { availability: 'available' }
    : { availability: 'auth-required', availabilityReason: `${label} key is not configured.` };
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
  const { suggestion, rationale } = extractSuggestion(text);
  return {
    field,
    suggestion,
    rationale,
  };
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

function normalizeEndpointIdentity(value: string | undefined): string {
  const raw = value?.trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().toLowerCase().replace(/\/$/, '');
  } catch {
    return raw.toLowerCase();
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

function metadataForConfig(config: AiStoredConfig, resolvedModelId?: string): AiExecutionMetadata {
  const descriptor = descriptorForConfig(config);
  const requestedModel = modelFor(config);
  const contentLeavesDevice = !providerIsLocal(config);
  return {
    providerFamily: descriptor?.family,
    transport: descriptor?.transport,
    requestedModel,
    resolvedModelId,
    contentLeavesDevice,
  };
}

function preflightResolvedModelId(config: AiStoredConfig, requestedModel: string): string | undefined {
  if (config.provider === 'codex-account' && (requestedModel === 'codex-recommended' || requestedModel === 'codex-fast')) {
    return undefined;
  }
  if (config.provider === 'claude-account' && /^claude-.+-latest$/.test(requestedModel)) {
    return undefined;
  }
  return requestedModel;
}

async function resolveExecutionModel(config: AiStoredConfig): Promise<string> {
  const requested = modelFor(config);
  if (config.provider === 'codex-account') {
    try {
      const { codexAccountSession } = await import('./codex-account/session.js');
      return await codexAccountSession.resolveModel(requested);
    } catch {
      return requested;
    }
  }
  if (config.provider === 'claude-account') {
    try {
      const { getCatalog } = await import('./claude-account/catalog.js');
      const catalog = await getCatalog();
      return catalog.models.find((model) => model.id === requested || model.friendlyAlias === requested)?.id ?? requested;
    } catch {
      return requested;
    }
  }
  return requested;
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
    const merged = {
      ...DEFAULT_CONFIG,
      ...(current ?? legacy ?? {}),
      featureRoutes: sanitizeFeatureRoutes((current ?? legacy)?.featureRoutes),
      guardrails: sanitizeGuardrails((current ?? legacy)?.guardrails),
    };

    const localPreset = isOpenAICompatiblePreset(merged.localOpenaiCompatiblePreset)
      ? merged.localOpenaiCompatiblePreset
      : DEFAULT_CONFIG.localOpenaiCompatiblePreset;
    const cloudPreset = isOpenAICompatiblePreset(merged.cloudOpenaiCompatiblePreset)
      ? merged.cloudOpenaiCompatiblePreset
      : DEFAULT_CONFIG.cloudOpenaiCompatiblePreset;
    const legacyPreset = isOpenAICompatiblePreset(merged.openaiCompatiblePreset)
      ? merged.openaiCompatiblePreset
      : DEFAULT_CONFIG.openaiCompatiblePreset;
    const legacyBaseUrl = merged.openaiCompatibleBaseUrl || DEFAULT_CONFIG.openaiCompatibleBaseUrl;
    const legacyModel = merged.openaiCompatibleModel || DEFAULT_CONFIG.openaiCompatibleModel;
    const localLegacy = isLocalOpenAICompatibleConfig(legacyPreset, legacyBaseUrl);

    const normalized = migrateKnownStaleModelDefaults({
      ...merged,
      defaultProviderInstanceId: defaultProviderInstanceForLegacy(merged as AiStoredConfig),
      localOpenaiCompatiblePreset: localPreset,
      cloudOpenaiCompatiblePreset: cloudPreset,
      localOpenaiCompatibleBaseUrl: merged.localOpenaiCompatibleBaseUrl
        || (localLegacy ? legacyBaseUrl : DEFAULT_CONFIG.localOpenaiCompatibleBaseUrl),
      cloudOpenaiCompatibleBaseUrl: merged.cloudOpenaiCompatibleBaseUrl
        || (localLegacy ? DEFAULT_CONFIG.cloudOpenaiCompatibleBaseUrl : legacyBaseUrl),
      localOpenaiCompatibleModel: merged.localOpenaiCompatibleModel
        || (localLegacy ? legacyModel : DEFAULT_CONFIG.localOpenaiCompatibleModel),
      cloudOpenaiCompatibleModel: merged.cloudOpenaiCompatibleModel
        || (localLegacy ? DEFAULT_CONFIG.cloudOpenaiCompatibleModel : legacyModel),
      providerInstances: merged.providerInstances ?? DEFAULT_CONFIG.providerInstances,
    });
    return {
      ...normalized,
      providerInstances: materializeProviderInstances(normalized),
    };
  }

  getPublicConfig(): AiPublicConfig {
    return publicConfig(this.getConfig());
  }

  getProviderDescriptors(): AiProviderDescriptor[] {
    return AI_PROVIDER_DESCRIPTORS;
  }

  getProviderInstanceRegistry(): Record<AiProviderInstanceId, AiProviderInstanceRegistryEntry> {
    return AI_PROVIDER_INSTANCE_REGISTRY;
  }

  getProviderInstanceDiagnostics(input: AiConfigPatch = {}): AiProviderInstanceDiagnostic[] {
    const config = this.mergeConfig(input);
    return AI_PROVIDER_INSTANCE_IDS.flatMap((instanceId) => {
      const instance = config.providerInstances[instanceId];
      return instance ? diagnosticsForInstanceConfig(instance) : [];
    });
  }

  getMethodCapabilities(): AiMethodCapability[] {
    const config = this.getPublicConfig();
    const presets = ([
      'openrouter',
      'groq',
      'mistral',
      'together',
      'fireworks',
      'lm-studio',
      'vllm',
      'llama-cpp',
      'localai',
      'custom',
    ] as const).map((presetId) => {
      const preset = openAICompatiblePreset(presetId);
      const local = preset.local;
      const availability = preset.requiresApiKey
        ? (config.hasCloudOpenAICompatibleKey
          ? { availability: 'available' as const }
          : { availability: 'auth-required' as const, availabilityReason: `${preset.label} key is not configured.` })
        : { availability: 'available' as const };
      return {
        id: `openai-compatible:${presetId}`,
        label: preset.label,
        serviceFamily: local ? 'local-inference' : 'external-router',
        connectionMethod: local ? 'local-server' : 'openai-compatible',
        channel: 'chat-model',
        featureRoutable: true,
        providerId: 'openai-compatible',
        presetId,
        local,
        ...availability,
      } satisfies AiMethodCapability;
    });

    const codexAvailability = !config.codexAccountAvailable
      ? {
          availability: 'auth-required' as const,
          availabilityReason: 'Codex account login requires SEEDBANK_ENABLE_CODEX_ACCOUNT=1 on the server. Enable it, then sign in.',
        }
      : config.codexAccountAuthenticated
        ? { availability: 'available' as const }
        : { availability: 'auth-required' as const, availabilityReason: 'Sign in with Codex account to enable this method.' };

    return [
      {
        id: 'anthropic-api-key',
        label: 'API key',
        serviceFamily: 'claude',
        connectionMethod: 'api-key',
        channel: 'chat-model',
        featureRoutable: true,
        providerId: 'anthropic',
        ...apiKeyAvailability(config.hasAnthropicKey, 'Anthropic API'),
      },
      {
        id: 'claude-account-native',
        label: 'Account login',
        serviceFamily: 'claude',
        connectionMethod: 'account',
        channel: 'chat-model',
        featureRoutable: true,
        providerId: 'claude-account',
        beta: true,
        ...(() => {
          const gate = claudeAccountRuntimeAvailability();
          if (!gate.available) {
            return { availability: 'auth-required' as const, availabilityReason: gate.reason };
          }
          return config.claudeAccountAuthenticated
            ? { availability: 'available' as const }
            : { availability: 'auth-required' as const, availabilityReason: 'Sign in with Claude account to enable this method.' };
        })(),
      },
      {
        id: 'openai-api-key',
        label: 'API key',
        serviceFamily: 'codex-openai',
        connectionMethod: 'api-key',
        channel: 'chat-model',
        featureRoutable: true,
        providerId: 'openai',
        ...apiKeyAvailability(config.hasOpenAIKey, 'OpenAI API'),
      },
      {
        id: 'codex-account-app-server',
        label: 'Account login',
        serviceFamily: 'codex-openai',
        connectionMethod: 'account',
        channel: 'chat-model',
        featureRoutable: true,
        providerId: 'codex-account',
        beta: true,
        ...codexAvailability,
      },
      {
        id: 'ollama-local',
        label: 'Ollama / local models',
        serviceFamily: 'local-inference',
        connectionMethod: 'local-server',
        channel: 'chat-model',
        featureRoutable: true,
        providerId: 'ollama',
        local: true,
        availability: 'available',
      },
      ...presets,
    ];
  }

  private mergeConfig(input: AiConfigPatch, current = this.getConfig()): AiStoredConfig {
    const requestedProviderInstanceId = isProviderInstanceId(input.providerInstanceId)
      ? input.providerInstanceId
      : undefined;
    const requestedDefaultInstanceId = isProviderInstanceId(input.defaultProviderInstanceId)
      ? input.defaultProviderInstanceId
      : current.defaultProviderInstanceId;
    const provider = isProvider(input.provider)
      ? input.provider
      : requestedProviderInstanceId
        ? providerInstanceToProvider(requestedProviderInstanceId)
      : input.defaultProviderInstanceId
        ? providerInstanceToProvider(requestedDefaultInstanceId)
        : current.provider;
    const budget = input.dailyTokenBudget === undefined
      ? current.dailyTokenBudget
      : Math.max(0, Math.floor(Number(input.dailyTokenBudget)));

    const nextLocalPreset = isOpenAICompatiblePreset(input.localOpenaiCompatiblePreset)
      ? input.localOpenaiCompatiblePreset
      : current.localOpenaiCompatiblePreset;
    const nextCloudPreset = isOpenAICompatiblePreset(input.cloudOpenaiCompatiblePreset)
      ? input.cloudOpenaiCompatiblePreset
      : current.cloudOpenaiCompatiblePreset;
    const legacyPreset = isOpenAICompatiblePreset(input.openaiCompatiblePreset)
      ? input.openaiCompatiblePreset
      : undefined;
    const legacyBaseUrl = input.openaiCompatibleBaseUrl?.trim();
    const legacyModel = input.openaiCompatibleModel?.trim();
    const legacyTargetsLocal = legacyPreset
      ? localOpenAICompatiblePreset(legacyPreset)
      : legacyBaseUrl
        ? isLikelyLocalUrl(legacyBaseUrl)
        : false;

    const nextLocalBaseUrl = input.localOpenaiCompatibleBaseUrl?.trim()
      || (legacyTargetsLocal ? legacyBaseUrl : undefined)
      || current.localOpenaiCompatibleBaseUrl;
    const nextCloudBaseUrl = input.cloudOpenaiCompatibleBaseUrl?.trim()
      || (!legacyTargetsLocal ? legacyBaseUrl : undefined)
      || current.cloudOpenaiCompatibleBaseUrl;
    const nextLocalModel = input.localOpenaiCompatibleModel?.trim()
      || (legacyTargetsLocal ? legacyModel : undefined)
      || current.localOpenaiCompatibleModel;
    const nextCloudModel = input.cloudOpenaiCompatibleModel?.trim()
      || (!legacyTargetsLocal ? legacyModel : undefined)
      || current.cloudOpenaiCompatibleModel;
    const currentCloudIdentity = `${current.cloudOpenaiCompatiblePreset}|${normalizeEndpointIdentity(current.cloudOpenaiCompatibleBaseUrl)}`;
    const nextCloudIdentity = `${nextCloudPreset}|${normalizeEndpointIdentity(nextCloudBaseUrl)}`;
    const cloudIdentityChanged = currentCloudIdentity !== nextCloudIdentity;
    const nextLocalKey = input.localOpenaiCompatibleApiKey?.trim()
      ? encryptSecret(input.localOpenaiCompatibleApiKey.trim())
      : legacyTargetsLocal && input.openaiCompatibleApiKey?.trim()
        ? encryptSecret(input.openaiCompatibleApiKey.trim())
        : current.localOpenaiCompatibleApiKeyEncrypted;
    const explicitCloudKey = input.cloudOpenaiCompatibleApiKey?.trim()
      || (!legacyTargetsLocal ? input.openaiCompatibleApiKey?.trim() : undefined);
    const nextCloudKey = explicitCloudKey
      ? encryptSecret(explicitCloudKey)
      : cloudIdentityChanged
        ? undefined
        : current.cloudOpenaiCompatibleApiKeyEncrypted ?? current.openaiCompatibleApiKeyEncrypted;

    const nextDefaultInstanceId = requestedDefaultInstanceId;
    const legacyOpenAICompatiblePreset = nextDefaultInstanceId === 'local-openai-compatible'
      ? nextLocalPreset
      : nextDefaultInstanceId === 'cloud-openai-compatible'
        ? nextCloudPreset
        : current.openaiCompatiblePreset;
    const legacyOpenAICompatibleModel = nextDefaultInstanceId === 'local-openai-compatible'
      ? nextLocalModel
      : nextDefaultInstanceId === 'cloud-openai-compatible'
        ? nextCloudModel
        : current.openaiCompatibleModel;
    const legacyOpenAICompatibleBaseUrl = nextDefaultInstanceId === 'local-openai-compatible'
      ? nextLocalBaseUrl
      : nextDefaultInstanceId === 'cloud-openai-compatible'
        ? nextCloudBaseUrl
        : current.openaiCompatibleBaseUrl;

    const next: AiStoredConfig = {
      ...current,
      defaultProviderInstanceId: nextDefaultInstanceId,
      provider,
      openaiModel: input.openaiModel?.trim() || current.openaiModel,
      anthropicModel: input.anthropicModel?.trim() || current.anthropicModel,
      claudeAccountModel: input.claudeAccountModel?.trim() || current.claudeAccountModel,
      codexAccountModel: input.codexAccountModel?.trim() || current.codexAccountModel,
      ollamaModel: input.ollamaModel?.trim() || current.ollamaModel,
      ollamaBaseUrl: input.ollamaBaseUrl?.trim() || current.ollamaBaseUrl,
      localOpenaiCompatiblePreset: nextLocalPreset,
      localOpenaiCompatibleModel: nextLocalModel,
      localOpenaiCompatibleBaseUrl: nextLocalBaseUrl,
      cloudOpenaiCompatiblePreset: nextCloudPreset,
      cloudOpenaiCompatibleModel: nextCloudModel,
      cloudOpenaiCompatibleBaseUrl: nextCloudBaseUrl,
      openaiCompatiblePreset: legacyOpenAICompatiblePreset,
      openaiCompatibleModel: legacyOpenAICompatibleModel,
      openaiCompatibleBaseUrl: legacyOpenAICompatibleBaseUrl,
      featureRoutes: sanitizeFeatureRoutes(input.featureRoutes, current.featureRoutes),
      guardrails: sanitizeGuardrails(input.guardrails, current.guardrails),
      dailyTokenBudget: Number.isFinite(budget) ? budget : current.dailyTokenBudget,
      openaiApiKeyEncrypted: input.openaiApiKey?.trim() ? encryptSecret(input.openaiApiKey.trim()) : current.openaiApiKeyEncrypted,
      anthropicApiKeyEncrypted: input.anthropicApiKey?.trim() ? encryptSecret(input.anthropicApiKey.trim()) : current.anthropicApiKeyEncrypted,
      localOpenaiCompatibleApiKeyEncrypted: nextLocalKey,
      cloudOpenaiCompatibleApiKeyEncrypted: nextCloudKey,
      openaiCompatibleApiKeyEncrypted: nextCloudKey,
    };
    if (input.providerInstances && typeof input.providerInstances === 'object') {
      const nextInstances = { ...next.providerInstances };
      for (const instanceId of AI_PROVIDER_INSTANCE_IDS) {
        const patch = input.providerInstances[instanceId];
        if (!patch || typeof patch !== 'object') continue;
        const currentInstance = nextInstances[instanceId] ?? materializeProviderInstances(next)[instanceId];
        nextInstances[instanceId] = {
          ...currentInstance,
          ...(typeof patch.configuredModel === 'string' ? { configuredModel: patch.configuredModel.trim() } : {}),
          ...(typeof patch.baseUrl === 'string' ? { baseUrl: patch.baseUrl.trim() } : {}),
          ...(isOpenAICompatiblePreset(patch.presetId) ? { presetId: patch.presetId } : {}),
          ...(patch.discoveredModels !== undefined ? { discoveredModels: sanitizeDiscoveredModels(patch.discoveredModels) } : {}),
        };
      }
      next.providerInstances = nextInstances;
    }
    const withProviderInstance = requestedProviderInstanceId
      ? applyProviderInstance(next, requestedProviderInstanceId)
      : next;
    return {
      ...withProviderInstance,
      providerInstances: materializeProviderInstances(withProviderInstance),
    };
  }

  configure(input: AiConfigPatch): AiPublicConfig {
    const current = this.getConfig();
    const next = this.mergeConfig(input, current);
    for (const feature of saveTimeValidationFeatures(next, input)) {
      const issues = routeValidationIssues(next, feature);
      if (issues.length > 0) {
        const first = issues[0];
        throw Object.assign(new Error(first.message), { statusCode: first.statusCode });
      }
    }
    this.repository.setSetting(AI_CONFIG_KEY, next);
    return publicConfig(next);
  }

  async testProvider(input: AiConfigPatch = {}): Promise<AiProviderHealth> {
    const config = this.mergeConfig(input);
    const providerInstanceId = config.defaultProviderInstanceId;
    const instance = config.providerInstances[providerInstanceId];
    const health = await this.provider(config).health(config);
    const metadata = metadataForConfig(config, health.model ?? modelFor(config));
    const diagnostics = instance
      ? dedupeDiagnostics([
          ...diagnosticsForInstanceConfig(instance),
          ...healthDiagnostics(health, instance),
        ])
      : [];
    return {
      ...health,
      providerInstanceId,
      providerFamily: metadata.providerFamily,
      transport: metadata.transport,
      requestedModel: metadata.requestedModel,
      resolvedModelId: metadata.resolvedModelId,
      contentLeavesDevice: metadata.contentLeavesDevice,
      diagnostics,
    };
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
    const rawConfig = this.getConfig();
    const config = resolveFeatureConfig(rawConfig, feature);
    const routeIssues = routeValidationIssues(rawConfig, feature);
    const guardrails = sanitizeGuardrails(config.guardrails);
    const model = modelFor(config);
    const metadata = metadataForConfig(config, preflightResolvedModelId(config, model));
    const local = providerIsLocal(config);
    const providerLabel = providerLabelForConfig(config);
    const blockers: string[] = [];
    const warnings: string[] = [];

    if (guardrails.featureEnabled[feature] === false) blockers.push(`${feature} is disabled by AI guardrails.`);
    if (guardrails.providerEnabled[config.provider] === false) blockers.push(`${providerLabel} is disabled by AI guardrails.`);
    if (guardrails.allowedModels.length > 0 && !guardrails.allowedModels.includes(model)) {
      blockers.push(`${model} is not in the AI model allowlist.`);
    }
    for (const issue of routeIssues) blockers.push(issue.message);

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
      providerFamily: metadata.providerFamily,
      transport: metadata.transport,
      requestedModel: metadata.requestedModel,
      ...(metadata.resolvedModelId ? { resolvedModelId: metadata.resolvedModelId } : {}),
      local,
      contentLeavesDevice: metadata.contentLeavesDevice,
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
    const metadata = metadataForConfig(config, model);
    const providerLabel = providerLabelForConfig(config);
    const routeIssues = routeValidationIssues(config, feature);
    const deny = (message: string, statusCode: number) => {
      this.store.recordAuditEvent('guardrail_denied', feature, config.provider, model, message, metadata);
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
    if (routeIssues.length > 0) {
      const first = routeIssues[0];
      deny(first.message, first.statusCode);
    }
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
    const model = modelFor(config);
    this.store.recordAuditEvent('provider_error', feature, config.provider, model, message, metadataForConfig(config, model));
  }

  private async recordUsage(
    config: AiStoredConfig,
    route: string,
    result: { usage: { inputTokens: number; outputTokens: number; totalTokens: number }; resolvedModelId?: string },
  ): Promise<string> {
    const requestedModel = modelFor(config);
    const resolvedModelId = result.resolvedModelId ?? await resolveExecutionModel(config);
    const metadata = metadataForConfig(config, resolvedModelId);
    this.store.recordUsage(config.provider, requestedModel, route, result.usage, metadata);
    return resolvedModelId;
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
      const resolvedModelId = await this.recordUsage(config, 'thinking-partner', result);
      const assistantMessage = this.store.addMessage(ideaId, 'assistant', result.text, config.provider, resolvedModelId);
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
      await this.recordUsage(config, 'field-suggestions', result);
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
      await this.recordUsage(config, 'field-suggestions', result);
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
      const resolvedModelId = await this.recordUsage(config, 'field-suggestions:conversation', result);
      return {
        id: uuid(),
        ideaId: input.ideaId,
        role: 'assistant',
        content: result.text,
        createdAt: new Date(),
        provider: config.provider,
        model: resolvedModelId,
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
      await this.recordUsage(config, feature, result);
      return result.text;
    } catch (error) {
      this.recordProviderFailure(feature, config, error);
      throw error;
    }
  }
}
