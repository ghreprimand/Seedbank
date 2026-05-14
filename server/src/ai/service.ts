import { aiProviderLabel, isAiProviderId } from '../../../shared/types.js';
import type {
  AiProviderDiagnosticCode,
  AiChatMessage,
  AiClaudeServiceMethod,
  AiCodexOpenAIServiceMethod,
  AiLocalModelServiceMethod,
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
  AiProviderFamily,
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
  AiReasoningEffort,
  AiTextVerbosity,
} from '../../../shared/types.js';
import { v4 as uuid } from 'uuid';
import type { SeedbankRepository } from '../repository.js';
import { encryptSecret } from './crypto.js';
import {
  AnthropicProvider,
  AiProviderError,
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
} from './registry.js';
import type { AiConfigPatch, AiProvider, AiProviderMessage, AiProviderResult, AiStoredConfig } from './types.js';
import { codexAccountRuntimeAvailability } from './codex-account/session.js';
import { claudeAccountRuntimeAvailability } from './claude-account/auth.js';
import { AiStore, type AiExecutionMetadata } from './store.js';
import {
  featureForMode,
  fieldAssistConversationMessages,
  messagesForChat,
  parseSuggestion,
  promptForFieldAssist,
  promptForMode,
  promptForSuggestion,
} from './prompts.js';
import {
  createConfirmationToken,
  GUARDRAIL_SETTINGS_HINT,
  guardrailError,
  SimpleRateLimiter,
  validConfirmationToken,
} from './guardrails.js';
import {
  recordProviderFailure as recordProviderFailureEvent,
  usageDetail,
  usageSummary,
} from './usage.js';

function isClaudeServiceMethod(value: unknown): value is AiClaudeServiceMethod {
  return value === 'anthropic-api-key' || value === 'claude-account-native';
}

function isCodexOpenAIServiceMethod(value: unknown): value is AiCodexOpenAIServiceMethod {
  return value === 'openai-api-key' || value === 'codex-account-app-server';
}

function isLocalModelServiceMethod(value: unknown): value is AiLocalModelServiceMethod {
  return (
    value === 'ollama' ||
    value === 'lm-studio' ||
    value === 'vllm' ||
    value === 'llama-cpp' ||
    value === 'localai' ||
    value === 'custom-local'
  );
}

function safeProviderInstanceId(value: unknown): value is AiProviderInstanceId {
  return typeof value === 'string'
    && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/.test(value);
}

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
  claudeServiceMethod: 'anthropic-api-key',
  codexOpenAIServiceMethod: 'openai-api-key',
  localModelServiceMethod: 'ollama',
  openaiModel: 'gpt-4.1-mini',
  anthropicModel: 'claude-sonnet-4-20250514',
  claudeAccountModel: 'claude-sonnet-latest',
  claudeAccountCompact: true,
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
    providerInstanceEnabled: {
      'claude-api': true,
      'claude-account': true,
      'openai-api': true,
      'codex-account': true,
      ollama: true,
      'local-openai-compatible': true,
      'cloud-openai-compatible': true,
    },
    allowedModels: [],
    featureDailyTokenBudgets: {},
    providerDailyTokenBudgets: {},
    providerFamilyDailyTokenBudgets: {},
    providerInstanceDailyTokenBudgets: {},
    modelDailyTokenBudgets: {},
    warnOnRemoteProvider: true,
    requireConfirmationForRemoteProvider: false,
  },
  claudeAccountAuthenticated: false,
  codexAccountAuthenticated: false,
};

const AI_CONFIG_KEY = 'ai.config';
const LEGACY_AI_CONFIG_KEY = 'ai:config';

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
  return safeProviderInstanceId(value);
}

function providerInstanceToProvider(instanceId: AiProviderInstanceId): AiProviderId {
  return AI_PROVIDER_INSTANCE_DESCRIPTORS[instanceId]?.provider ?? 'openai-compatible';
}

const FEATURE_ROUTABLE_PROVIDERS: ReadonlySet<AiProviderId> = new Set([
  'openai',
  'anthropic',
  'claude-account',
  'codex-account',
  'ollama',
  'openai-compatible',
]);

type AiRequestRouteOverride = Pick<
  AiFeatureRoute,
  'providerInstanceId' | 'model' | 'effort' | 'verbosity'
>;

function isFeatureRoutableProvider(provider: AiProviderId): boolean {
  return FEATURE_ROUTABLE_PROVIDERS.has(provider);
}

function sanitizeReasoningEffort(value: unknown): AiReasoningEffort | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'minimal' || normalized === 'low' || normalized === 'medium' || normalized === 'high') {
    return normalized;
  }
  return undefined;
}

function sanitizeTextVerbosity(value: unknown): AiTextVerbosity | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') return normalized;
  return undefined;
}

function openAIModelSupportsReasoningEffort(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return normalized.startsWith('gpt-5') || /^o[1-9](?:[-_.]|$)/.test(normalized);
}

function openAIModelSupportsTextVerbosity(model: string): boolean {
  return model.trim().toLowerCase().startsWith('gpt-5');
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
  const route = value as { provider?: unknown; providerInstanceId?: unknown; model?: unknown; effort?: unknown; verbosity?: unknown } | undefined;
  if (!route) return undefined;
  const effort = sanitizeReasoningEffort(route.effort);
  const verbosity = sanitizeTextVerbosity(route.verbosity);
  if (route.provider === 'default') {
    return { provider: 'default' };
  }
  if (isProviderInstanceId(route.providerInstanceId)) {
    const provider = isProvider(route.provider)
      ? route.provider
      : providerInstanceToProvider(route.providerInstanceId);
    return {
      provider,
      providerInstanceId: route.providerInstanceId,
      ...(typeof route.model === 'string' && route.model.trim() ? { model: route.model.trim() } : {}),
      ...(effort ? { effort } : {}),
      ...(verbosity ? { verbosity } : {}),
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
    ...(effort ? { effort } : {}),
    ...(verbosity ? { verbosity } : {}),
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
    providerInstanceEnabled: {
      'claude-api': true,
      'claude-account': true,
      'openai-api': true,
      'codex-account': true,
      ollama: true,
      'local-openai-compatible': true,
      'cloud-openai-compatible': true,
    },
    allowedModels: [],
    featureDailyTokenBudgets: {},
    providerDailyTokenBudgets: {},
    providerFamilyDailyTokenBudgets: {},
    providerInstanceDailyTokenBudgets: {},
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
  allowedKeys?: readonly K[],
): Partial<Record<K, boolean>> {
  const result: Partial<Record<K, boolean>> = { ...defaults };
  if (!value || typeof value !== 'object') return result;
  if (!allowedKeys) {
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (typeof raw === 'boolean' && safeProviderInstanceId(key)) result[key as K] = raw;
    }
    return result;
  }
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
    providerInstanceEnabled: sanitizeBooleanMap(
      source.providerInstanceEnabled,
      defaults.providerInstanceEnabled,
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
    providerFamilyDailyTokenBudgets: {
      ...defaults.providerFamilyDailyTokenBudgets,
      ...sanitizeBudgetMap(
        source.providerFamilyDailyTokenBudgets,
        ['api', 'local', 'custom-endpoint', 'account'] as const,
      ),
    },
    providerInstanceDailyTokenBudgets: {
      ...defaults.providerInstanceDailyTokenBudgets,
      ...sanitizeBudgetMap(source.providerInstanceDailyTokenBudgets),
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

function applyRouteControls(config: AiStoredConfig, route: AiFeatureRoute): AiStoredConfig {
  if (config.provider === 'openai') {
    const model = modelFor(config);
    return {
      ...config,
      openaiReasoningEffort: route.effort && openAIModelSupportsReasoningEffort(model) ? route.effort : undefined,
      openaiTextVerbosity: route.verbosity && openAIModelSupportsTextVerbosity(model) ? route.verbosity : undefined,
    };
  }
  if (config.provider === 'codex-account') {
    return {
      ...config,
      codexReasoningEffort: route.effort,
    };
  }
  return config;
}

function normalizeDefaultProviderInstance(value: unknown): AiProviderInstanceId {
  return isProviderInstanceId(value) ? value : DEFAULT_CONFIG.defaultProviderInstanceId;
}

function applyProviderInstance(config: AiStoredConfig, providerInstanceId: AiProviderInstanceId): AiStoredConfig {
  const dynamicInstance = config.providerInstances[providerInstanceId];
  if (dynamicInstance && !AI_PROVIDER_INSTANCE_IDS.includes(providerInstanceId)) {
    if (dynamicInstance.provider === 'ollama') {
      return {
        ...config,
        defaultProviderInstanceId: providerInstanceId,
        provider: 'ollama',
        ollamaModel: dynamicInstance.configuredModel || config.ollamaModel,
        ollamaBaseUrl: dynamicInstance.baseUrl || config.ollamaBaseUrl,
      };
    }
    if (dynamicInstance.provider === 'openai-compatible') {
      return {
        ...config,
        defaultProviderInstanceId: providerInstanceId,
        provider: 'openai-compatible',
        openaiCompatiblePreset: dynamicInstance.presetId ?? 'custom',
        openaiCompatibleModel: dynamicInstance.configuredModel || config.openaiCompatibleModel,
        openaiCompatibleBaseUrl: dynamicInstance.baseUrl || config.openaiCompatibleBaseUrl,
        openaiCompatibleApiKeyEncrypted: config.providerInstanceApiKeyEncrypted?.[providerInstanceId]
          ?? (dynamicInstance.local
            ? config.localOpenaiCompatibleApiKeyEncrypted
            : config.cloudOpenaiCompatibleApiKeyEncrypted ?? config.openaiCompatibleApiKeyEncrypted),
      };
    }
  }
  if (providerInstanceId === 'claude-api') {
    return { ...config, defaultProviderInstanceId: providerInstanceId, provider: 'anthropic', anthropicModel: config.providerInstances['claude-api'].configuredModel || config.anthropicModel };
  }
  if (providerInstanceId === 'claude-account') {
    return { ...config, defaultProviderInstanceId: providerInstanceId, provider: 'claude-account', claudeAccountModel: config.providerInstances['claude-account'].configuredModel || config.claudeAccountModel };
  }
  if (providerInstanceId === 'openai-api') {
    return { ...config, defaultProviderInstanceId: providerInstanceId, provider: 'openai', openaiModel: config.providerInstances['openai-api'].configuredModel || config.openaiModel };
  }
  if (providerInstanceId === 'codex-account') {
    return { ...config, defaultProviderInstanceId: providerInstanceId, provider: 'codex-account', codexAccountModel: config.providerInstances['codex-account'].configuredModel || config.codexAccountModel };
  }
  if (providerInstanceId === 'ollama') {
    return {
      ...config,
      defaultProviderInstanceId: providerInstanceId,
      provider: 'ollama',
      ollamaModel: config.providerInstances.ollama.configuredModel || config.ollamaModel,
      ollamaBaseUrl: config.providerInstances.ollama.baseUrl || config.ollamaBaseUrl,
    };
  }
  if (providerInstanceId === 'local-openai-compatible') {
    return {
      ...config,
      defaultProviderInstanceId: providerInstanceId,
      provider: 'openai-compatible',
      openaiCompatiblePreset: config.localOpenaiCompatiblePreset,
      openaiCompatibleModel: config.localOpenaiCompatibleModel,
      openaiCompatibleBaseUrl: config.localOpenaiCompatibleBaseUrl,
    };
  }
  return {
    ...config,
    defaultProviderInstanceId: providerInstanceId,
    provider: 'openai-compatible',
    openaiCompatiblePreset: config.cloudOpenaiCompatiblePreset,
    openaiCompatibleModel: config.cloudOpenaiCompatibleModel,
    openaiCompatibleBaseUrl: config.cloudOpenaiCompatibleBaseUrl,
  };
}

function resolveFeatureConfig(
  config: AiStoredConfig,
  feature: AiFeatureId,
  override: AiRequestRouteOverride = {},
): AiStoredConfig {
  if (override.providerInstanceId) {
    const providerInstanceId = override.providerInstanceId;
    const provider = config.providerInstances[providerInstanceId]?.provider
      ?? providerInstanceToProvider(providerInstanceId);
    const featureRoutes = {
      ...config.featureRoutes,
      [feature]: {
        provider,
        providerInstanceId,
        ...(override.model?.trim() ? { model: override.model.trim() } : {}),
        ...(override.effort ? { effort: override.effort } : {}),
        ...(override.verbosity ? { verbosity: override.verbosity } : {}),
      },
    };
    return resolveFeatureConfig({ ...config, featureRoutes }, feature);
  }
  const routes = sanitizeFeatureRoutes(config.featureRoutes);
  const route = routes[feature] ?? routes.default;
  const defaultInstanceId = normalizeDefaultProviderInstance(config.defaultProviderInstanceId);
  if (route.provider === 'default') {
    return applyRouteControls(
      applyModelOverride(
        applyProviderInstance(config, defaultInstanceId),
        providerInstanceToProvider(defaultInstanceId),
        override.model ?? '',
      ),
      { provider: providerInstanceToProvider(defaultInstanceId), providerInstanceId: defaultInstanceId, ...override },
    );
  }
  if (route.providerInstanceId) {
    return applyRouteControls(
      applyModelOverride(
        applyProviderInstance(config, route.providerInstanceId),
        providerInstanceToProvider(route.providerInstanceId),
        override.model ?? route.model ?? '',
      ),
      { ...route, ...override },
    );
  }
  return applyRouteControls(
    applyModelOverride({ ...config, provider: route.provider }, route.provider, override.model ?? route.model ?? ''),
    { ...route, ...override },
  );
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
      ...(resolved.openaiReasoningEffort ?? resolved.codexReasoningEffort ? { effort: resolved.openaiReasoningEffort ?? resolved.codexReasoningEffort } : {}),
      ...(resolved.openaiTextVerbosity ? { verbosity: resolved.openaiTextVerbosity } : {}),
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

function instanceApiKeyPresent(config: AiStoredConfig, instanceId: AiProviderInstanceId): boolean {
  if (instanceId === 'claude-api') return Boolean(config.anthropicApiKeyEncrypted);
  if (instanceId === 'openai-api') return Boolean(config.openaiApiKeyEncrypted);
  if (instanceId === 'local-openai-compatible') return Boolean(config.localOpenaiCompatibleApiKeyEncrypted);
  if (instanceId === 'cloud-openai-compatible') {
    return Boolean(config.cloudOpenaiCompatibleApiKeyEncrypted ?? config.openaiCompatibleApiKeyEncrypted);
  }
  return Boolean(config.providerInstanceApiKeyEncrypted?.[instanceId]);
}

function normalizeDynamicProviderInstance(
  raw: AiProviderInstanceConfig,
  config: AiStoredConfig,
): AiProviderInstanceConfig {
  const provider = isProvider(raw.provider) ? raw.provider : 'openai-compatible';
  const presetId = isOpenAICompatiblePreset(raw.presetId) ? raw.presetId : 'custom';
  const preset = openAICompatiblePreset(presetId);
  const baseUrl = raw.baseUrl?.trim() || preset.baseUrl || '';
  const local = provider === 'ollama'
    ? true
    : typeof raw.local === 'boolean'
      ? raw.local
      : preset.local || isLikelyLocalUrl(baseUrl);
  const family: AiProviderFamily = provider === 'ollama'
    ? 'local'
    : raw.family === 'custom-endpoint' || raw.family === 'api' || raw.family === 'account' || raw.family === 'local'
      ? raw.family
      : 'custom-endpoint';
  const connectionMode = provider === 'ollama'
    ? 'local-server'
    : local
      ? 'openai-compatible-local'
      : 'openai-compatible-cloud';
  const dataResidency = local ? 'local' : presetId === 'custom' ? 'user-controlled' : 'cloud';
  const requiresApiKey = provider === 'openai-compatible'
    ? (!local && preset.requiresApiKey) || raw.requiresApiKey === true
    : raw.requiresApiKey === true;
  const hasApiKey = instanceApiKeyPresent(config, raw.id);
  const availability: AiProviderInstanceAvailability = requiresApiKey && !hasApiKey
    ? 'auth-required'
    : 'available';

  return {
    id: raw.id,
    provider,
    label: raw.label?.trim() || preset.label || raw.id,
    family,
    connectionMode,
    dataResidency,
    capabilities: raw.capabilities?.length
      ? raw.capabilities
      : ['chat', 'streaming', 'model-discovery', ...(requiresApiKey ? ['api-key' as const] : local ? ['local' as const] : [])],
    featureRoutable: raw.featureRoutable !== false,
    modelDiscovery: raw.modelDiscovery !== false,
    configuredModel: raw.configuredModel?.trim() || preset.defaultModel || '',
    discoveredModels: sanitizeDiscoveredModels(raw.discoveredModels),
    ...(raw.enabledModelIds?.length
      ? { enabledModelIds: [...new Set(raw.enabledModelIds.map((model) => model.trim()).filter(Boolean))] }
      : {}),
    ...(raw.lastProbeStatus ? { lastProbeStatus: raw.lastProbeStatus } : {}),
    ...(raw.lastProbedAt ? { lastProbedAt: raw.lastProbedAt } : {}),
    available: availability,
    availabilityReason: availability === 'auth-required' ? `${raw.label || preset.label || raw.id} API key is not configured.` : undefined,
    requiresApiKey,
    hasApiKey,
    local,
    ...(baseUrl ? { baseUrl } : {}),
    ...(provider === 'openai-compatible' ? { presetId } : {}),
  };
}

function materializeProviderInstances(config: AiStoredConfig): Record<AiProviderInstanceId, AiProviderInstanceConfig> {
  const claudeGate = claudeAccountRuntimeAvailability();
  const codexGate = codexAccountRuntimeAvailability();
  const cloudKeyPresent = Boolean(config.cloudOpenaiCompatibleApiKeyEncrypted ?? config.openaiCompatibleApiKeyEncrypted);
  const localKeyPresent = Boolean(config.localOpenaiCompatibleApiKeyEncrypted);

  const current = config.providerInstances ?? DEFAULT_CONFIG.providerInstances;

  const builtins: Record<AiProviderInstanceId, AiProviderInstanceConfig> = {
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
      ...(
        claudeGate.available
          ? {
              available: claudeAccountAuthenticatedCache ? 'available' as const : 'auth-required' as const,
              availabilityReason: claudeAccountAuthenticatedCache ? undefined : 'Sign in with Claude account to enable this method.',
            }
          : toAvailability(false, claudeGate.reason)
      ),
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
      ...(
        codexGate.available
          ? {
              available: codexAccountAuthenticatedCache ? 'available' as const : 'auth-required' as const,
              availabilityReason: codexAccountAuthenticatedCache ? undefined : 'Sign in with Codex account to enable this method.',
            }
          : toAvailability(false, codexGate.reason)
      ),
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

  const dynamicInstances = Object.fromEntries(
    Object.values(current)
      .filter((instance) => instance && !AI_PROVIDER_INSTANCE_IDS.includes(instance.id))
      .map((instance) => [instance.id, normalizeDynamicProviderInstance(instance, config)]),
  );

  return {
    ...builtins,
    ...dynamicInstances,
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
    claudeServiceMethod: config.claudeServiceMethod,
    codexOpenAIServiceMethod: config.codexOpenAIServiceMethod,
    localModelServiceMethod: config.localModelServiceMethod,
    openaiModel: config.openaiModel,
    anthropicModel: config.anthropicModel,
    claudeAccountModel: config.claudeAccountModel,
    claudeAccountCompact: config.claudeAccountCompact !== false,
    codexAccountModel: config.codexAccountModel,
    ...(config.openaiReasoningEffort ? { openaiReasoningEffort: config.openaiReasoningEffort } : {}),
    ...(config.openaiTextVerbosity ? { openaiTextVerbosity: config.openaiTextVerbosity } : {}),
    ...(config.codexReasoningEffort ? { codexReasoningEffort: config.codexReasoningEffort } : {}),
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
    claudeAccountAvailable: claudeAccountRuntimeAvailability().available,
    claudeAccountAuthenticated: claudeAccountAuthenticatedCache,
    codexAccountAvailable: codexAccountRuntimeAvailability().available,
    codexAccountAuthenticated: codexAccountAuthenticatedCache,
  };
}

function apiKeyAvailability(connected: boolean, label: string): Pick<AiMethodCapability, 'availability' | 'availabilityReason'> {
  return connected
    ? { availability: 'available' }
    : { availability: 'auth-required', availabilityReason: `${label} key is not configured.` };
}

function shouldRetryWithoutStructuredSuggestion(error: unknown): boolean {
  if (error instanceof AiProviderError) {
    return error.provider === 'openai' && error.status === 400;
  }
  return false;
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
    providerInstanceId: normalizeDefaultProviderInstance(config.defaultProviderInstanceId),
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
      claudeServiceMethod: isClaudeServiceMethod(merged.claudeServiceMethod)
        ? merged.claudeServiceMethod
        : merged.provider === 'claude-account'
          ? 'claude-account-native'
          : DEFAULT_CONFIG.claudeServiceMethod,
      codexOpenAIServiceMethod: isCodexOpenAIServiceMethod(merged.codexOpenAIServiceMethod)
        ? merged.codexOpenAIServiceMethod
        : merged.provider === 'codex-account'
          ? 'codex-account-app-server'
          : DEFAULT_CONFIG.codexOpenAIServiceMethod,
      localModelServiceMethod: isLocalModelServiceMethod(merged.localModelServiceMethod)
        ? merged.localModelServiceMethod
        : merged.defaultProviderInstanceId === 'local-openai-compatible'
          ? (
              merged.localOpenaiCompatiblePreset === 'lm-studio' ? 'lm-studio'
              : merged.localOpenaiCompatiblePreset === 'vllm' ? 'vllm'
              : merged.localOpenaiCompatiblePreset === 'llama-cpp' ? 'llama-cpp'
              : merged.localOpenaiCompatiblePreset === 'localai' ? 'localai'
              : merged.localOpenaiCompatiblePreset === 'custom' ? 'custom-local'
              : DEFAULT_CONFIG.localModelServiceMethod
            )
          : DEFAULT_CONFIG.localModelServiceMethod,
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
    return Object.keys(config.providerInstances).flatMap((instanceId) => {
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

    const codexAvailability = config.codexAccountAuthenticated
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
        ...(config.claudeAccountAuthenticated
          ? { availability: 'available' as const }
          : { availability: 'auth-required' as const, availabilityReason: 'Sign in with Claude account to enable this method.' }),
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
    const hasOpenaiEffortPatch = Object.prototype.hasOwnProperty.call(input, 'openaiReasoningEffort');
    const hasOpenaiVerbosityPatch = Object.prototype.hasOwnProperty.call(input, 'openaiTextVerbosity');
    const hasCodexEffortPatch = Object.prototype.hasOwnProperty.call(input, 'codexReasoningEffort');
    const nextOpenaiEffort = hasOpenaiEffortPatch
      ? sanitizeReasoningEffort(input.openaiReasoningEffort)
      : current.openaiReasoningEffort;
    const nextOpenaiVerbosity = hasOpenaiVerbosityPatch
      ? sanitizeTextVerbosity(input.openaiTextVerbosity)
      : current.openaiTextVerbosity;
    const nextCodexEffort = hasCodexEffortPatch
      ? sanitizeReasoningEffort(input.codexReasoningEffort)
      : current.codexReasoningEffort;

    const next: AiStoredConfig = {
      ...current,
      defaultProviderInstanceId: nextDefaultInstanceId,
      provider,
      claudeServiceMethod: isClaudeServiceMethod(input.claudeServiceMethod)
        ? input.claudeServiceMethod
        : current.claudeServiceMethod,
      codexOpenAIServiceMethod: isCodexOpenAIServiceMethod(input.codexOpenAIServiceMethod)
        ? input.codexOpenAIServiceMethod
        : current.codexOpenAIServiceMethod,
      localModelServiceMethod: isLocalModelServiceMethod(input.localModelServiceMethod)
        ? input.localModelServiceMethod
        : current.localModelServiceMethod,
      openaiModel: input.openaiModel?.trim() || current.openaiModel,
      anthropicModel: input.anthropicModel?.trim() || current.anthropicModel,
      claudeAccountModel: input.claudeAccountModel?.trim() || current.claudeAccountModel,
      claudeAccountCompact: typeof input.claudeAccountCompact === 'boolean'
        ? input.claudeAccountCompact
        : current.claudeAccountCompact !== false,
      codexAccountModel: input.codexAccountModel?.trim() || current.codexAccountModel,
      ...(nextOpenaiEffort ? { openaiReasoningEffort: nextOpenaiEffort } : { openaiReasoningEffort: undefined }),
      ...(nextOpenaiVerbosity ? { openaiTextVerbosity: nextOpenaiVerbosity } : { openaiTextVerbosity: undefined }),
      ...(nextCodexEffort ? { codexReasoningEffort: nextCodexEffort } : { codexReasoningEffort: undefined }),
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
      providerInstanceApiKeyEncrypted: { ...(current.providerInstanceApiKeyEncrypted ?? {}) },
    };
    if (input.providerInstances && typeof input.providerInstances === 'object') {
      const nextInstances = { ...next.providerInstances };
      for (const [instanceId, patch] of Object.entries(input.providerInstances)) {
        if (!safeProviderInstanceId(instanceId)) continue;
        if (!patch || typeof patch !== 'object') continue;
        const currentInstance = nextInstances[instanceId] ?? materializeProviderInstances(next)[instanceId];
        const presetId = isOpenAICompatiblePreset(patch.presetId)
          ? patch.presetId
          : currentInstance?.presetId ?? 'custom';
        const preset = openAICompatiblePreset(presetId);
        const provider = isProvider(patch.provider) ? patch.provider : currentInstance?.provider ?? 'openai-compatible';
        const local = typeof patch.local === 'boolean'
          ? patch.local
          : currentInstance?.local ?? preset.local ?? false;
        nextInstances[instanceId] = {
          ...(currentInstance ?? {
            id: instanceId,
            provider,
            label: preset.label,
            family: provider === 'ollama' ? 'local' : 'custom-endpoint',
            connectionMode: provider === 'ollama' ? 'local-server' : local ? 'openai-compatible-local' : 'openai-compatible-cloud',
            dataResidency: local ? 'local' : presetId === 'custom' ? 'user-controlled' : 'cloud',
            capabilities: ['chat', 'streaming', 'model-discovery', ...(local ? ['local' as const] : ['api-key' as const])],
            featureRoutable: true,
            modelDiscovery: true,
            configuredModel: preset.defaultModel,
            discoveredModels: [],
            available: 'available',
            requiresApiKey: !local && preset.requiresApiKey,
            hasApiKey: false,
            local,
            baseUrl: preset.baseUrl,
            presetId,
          }),
          ...(isProvider(patch.provider) ? { provider: patch.provider } : {}),
          ...(typeof patch.label === 'string' && patch.label.trim() ? { label: patch.label.trim() } : {}),
          ...(typeof patch.featureRoutable === 'boolean' ? { featureRoutable: patch.featureRoutable } : {}),
          ...(typeof patch.modelDiscovery === 'boolean' ? { modelDiscovery: patch.modelDiscovery } : {}),
          ...(typeof patch.local === 'boolean' ? { local: patch.local } : {}),
          ...(typeof patch.requiresApiKey === 'boolean' ? { requiresApiKey: patch.requiresApiKey } : {}),
          ...(typeof patch.configuredModel === 'string' ? { configuredModel: patch.configuredModel.trim() } : {}),
          ...(typeof patch.baseUrl === 'string' ? { baseUrl: patch.baseUrl.trim() } : {}),
          ...(isOpenAICompatiblePreset(patch.presetId) ? { presetId: patch.presetId } : {}),
          ...(patch.discoveredModels !== undefined ? { discoveredModels: sanitizeDiscoveredModels(patch.discoveredModels) } : {}),
          ...(Array.isArray(patch.enabledModelIds)
            ? { enabledModelIds: [...new Set(patch.enabledModelIds.map((model) => model.trim()).filter(Boolean))] }
            : {}),
          ...(patch.lastProbeStatus === 'connected' ||
            patch.lastProbeStatus === 'key-needed' ||
            patch.lastProbeStatus === 'unreachable' ||
            patch.lastProbeStatus === 'not-tested'
            ? { lastProbeStatus: patch.lastProbeStatus }
            : {}),
          ...(typeof patch.lastProbedAt === 'string' ? { lastProbedAt: patch.lastProbedAt } : {}),
        };
      }
      next.providerInstances = nextInstances;
    }
    if (Array.isArray(input.removedProviderInstanceIds)) {
      const nextInstances = { ...next.providerInstances };
      const encrypted = { ...(next.providerInstanceApiKeyEncrypted ?? {}) };
      for (const instanceId of input.removedProviderInstanceIds) {
        if (!safeProviderInstanceId(instanceId)) continue;
        if (AI_PROVIDER_INSTANCE_IDS.includes(instanceId)) continue;
        delete nextInstances[instanceId];
        delete encrypted[instanceId];
      }
      next.providerInstances = nextInstances;
      next.providerInstanceApiKeyEncrypted = encrypted;
      if (!next.providerInstances[next.defaultProviderInstanceId]) {
        next.defaultProviderInstanceId = DEFAULT_CONFIG.defaultProviderInstanceId;
        next.provider = DEFAULT_CONFIG.provider;
      }
    }
    if (input.providerInstanceApiKeys && typeof input.providerInstanceApiKeys === 'object') {
      const encrypted = { ...(next.providerInstanceApiKeyEncrypted ?? {}) };
      for (const [instanceId, key] of Object.entries(input.providerInstanceApiKeys)) {
        if (!safeProviderInstanceId(instanceId) || typeof key !== 'string') continue;
        const trimmed = key.trim();
        if (trimmed) encrypted[instanceId] = encryptSecret(trimmed);
      }
      next.providerInstanceApiKeyEncrypted = encrypted;
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

    // Fire-and-forget model discovery for any instances whose API key was just provided
    const keyToInstance: Array<[string | undefined, AiProviderInstanceId]> = [
      [input.anthropicApiKey?.trim(), 'claude-api'],
      [input.openaiApiKey?.trim(), 'openai-api'],
      [input.cloudOpenaiCompatibleApiKey?.trim() || input.openaiCompatibleApiKey?.trim(), 'cloud-openai-compatible'],
      [input.localOpenaiCompatibleApiKey?.trim(), 'local-openai-compatible'],
    ];
    for (const [key, instanceId] of keyToInstance) {
      if (key) void this.refreshDiscoveredModels(instanceId);
    }
    if (input.providerInstanceApiKeys && typeof input.providerInstanceApiKeys === 'object') {
      for (const [instanceId, key] of Object.entries(input.providerInstanceApiKeys)) {
        if (safeProviderInstanceId(instanceId) && typeof key === 'string' && key.trim()) {
          void this.refreshDiscoveredModels(instanceId);
        }
      }
    }

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

  /**
   * Discover available models for a provider instance and persist them to config.
   * Called after auth events and on a background timer. Never throws.
   */
  async refreshDiscoveredModels(instanceId: AiProviderInstanceId): Promise<void> {
    try {
      const config = this.getConfig();
      const instance = config.providerInstances[instanceId];
      if (!instance) return;
      // Skip instances that can't possibly list models right now
      if (instance.available === 'unavailable') return;
      if (instance.requiresApiKey && !instance.hasApiKey) return;
      if (instance.connectionMode === 'account-login' && !instance.authenticated) return;

      // Build a config targeting this provider instance
      const targetConfig = applyProviderInstance(config, instanceId);
      const provider = this.providers.get(targetConfig.provider);
      if (!provider) return;

      const result = await provider.listModels(targetConfig);
      if (!result.ok) return;

      // Save discovered models — use direct merge+save to avoid feature route validation
      const current = this.getConfig();
      const next = this.mergeConfig(
        { providerInstances: { [instanceId]: { discoveredModels: result.models } } } as AiConfigPatch,
        current,
      );
      this.repository.setSetting(AI_CONFIG_KEY, next);
    } catch (error) {
      // Log but never throw — this runs in background/fire-and-forget contexts
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[AI] Model discovery failed for ${instanceId}: ${message}`);
    }
  }

  /**
   * Refresh discovered models for all connected provider instances.
   * Runs on init and periodically. Never throws.
   */
  async refreshAllDiscoveredModels(): Promise<void> {
    const config = this.getConfig();
    const refreshable = Object.keys(config.providerInstances).filter((id) => {
      const instance = config.providerInstances[id];
      if (!instance) return false;
      if (instance.available === 'unavailable') return false;
      if (instance.requiresApiKey && !instance.hasApiKey) return false;
      if (instance.connectionMode === 'account-login' && !instance.authenticated) return false;
      return true;
    });
    // Run sequentially to avoid hammering multiple APIs simultaneously
    for (const id of refreshable) {
      await this.refreshDiscoveredModels(id);
    }
  }

  getConversation(ideaId: string): AiChatMessage[] {
    return this.store.getMessages(ideaId);
  }

  getUsageSummary(): { last24h: number; last7d: number } {
    return usageSummary(this.store);
  }

  getUsageDetail(): AiUsageDetail {
    return usageDetail(this.store);
  }

  private provider(config: AiStoredConfig): AiProvider {
    const provider = this.providers.get(config.provider);
    if (!provider) throw new Error(`Unknown AI provider: ${config.provider}`);
    return provider;
  }

  private async completeFieldSuggestion(
    config: AiStoredConfig,
    messages: AiProviderMessage[],
  ): Promise<AiProviderResult> {
    const provider = this.provider(config);
    try {
      return await provider.complete(messages, config, { responseFormat: { kind: 'field_suggestion_v1' } });
    } catch (error) {
      if (shouldRetryWithoutStructuredSuggestion(error)) {
        return await provider.complete(messages, config);
      }
      throw error;
    }
  }

  private budgetStates(config: AiStoredConfig, feature: AiFeatureId): AiBudgetState[] {
    const guardrails = sanitizeGuardrails(config.guardrails);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const model = modelFor(config);
    const providerFamily: AiProviderFamily | undefined = metadataForConfig(config).providerFamily;
    const providerInstanceId = normalizeDefaultProviderInstance(config.defaultProviderInstanceId);
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
        scope: 'provider-family',
        id: providerFamily ?? 'unknown',
        limit: providerFamily ? (guardrails.providerFamilyDailyTokenBudgets[providerFamily] ?? 0) : 0,
        used: providerFamily ? this.store.tokensSince(since, { providerFamily }) : 0,
        remaining: null,
        window: 'day',
        enabled: providerFamily ? ((guardrails.providerFamilyDailyTokenBudgets[providerFamily] ?? 0) > 0) : false,
      },
      {
        scope: 'provider-instance',
        id: providerInstanceId,
        limit: guardrails.providerInstanceDailyTokenBudgets[providerInstanceId] ?? 0,
        used: this.store.tokensSince(since, { providerInstanceId }),
        remaining: null,
        window: 'day',
        enabled: (guardrails.providerInstanceDailyTokenBudgets[providerInstanceId] ?? 0) > 0,
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

  preflight(feature: AiFeatureId, override: AiRequestRouteOverride = {}): AiPreflightResult {
    const rawConfig = this.getConfig();
    const config = resolveFeatureConfig(rawConfig, feature, override);
    const routeIssues = routeValidationIssues(config, feature);
    const guardrails = sanitizeGuardrails(config.guardrails);
    const model = modelFor(config);
    const metadata = metadataForConfig(config, preflightResolvedModelId(config, model));
    const providerInstanceId = normalizeDefaultProviderInstance(config.defaultProviderInstanceId);
    const providerInstanceLabel = config.providerInstances[providerInstanceId]?.label ?? providerInstanceId;
    const local = providerIsLocal(config);
    const providerLabel = providerLabelForConfig(config);
    const blockers: string[] = [];
    const warnings: string[] = [];

    if (guardrails.featureEnabled[feature] === false) blockers.push(`${feature} is disabled by AI guardrails.`);
    if (guardrails.providerEnabled[config.provider] === false) blockers.push(`${providerLabel} is disabled by AI guardrails.`);
    if (guardrails.providerInstanceEnabled[providerInstanceId] === false) blockers.push(`${providerInstanceLabel} is disabled by AI guardrails.`);
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
    const providerInstanceId = normalizeDefaultProviderInstance(config.defaultProviderInstanceId);
    const providerInstanceLabel = config.providerInstances[providerInstanceId]?.label ?? providerInstanceId;
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
    if (guardrails.providerInstanceEnabled[providerInstanceId] === false) {
      deny(`AI provider instance "${providerInstanceLabel}" is disabled by guardrails. ${GUARDRAIL_SETTINGS_HINT}`, 403);
    }
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
    const model = modelFor(config);
    recordProviderFailureEvent({
      store: this.store,
      feature,
      provider: config.provider,
      model,
      error,
      metadata: metadataForConfig(config, model),
    });
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

  assertFeatureAllowed(
    feature: AiFeatureId,
    key: string,
    confirmationToken?: string,
    override: AiRequestRouteOverride = {},
  ): void {
    const config = resolveFeatureConfig(this.getConfig(), feature, override);
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
      const result = await this.completeFieldSuggestion(config, promptForSuggestion(idea, field, currentValue));
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
    override: AiRequestRouteOverride = {},
  ): Promise<AiSuggestion> {
    const idea = this.repository.getIdea(ideaId);
    if (!idea) throw new Error('Idea not found.');
    const config = resolveFeatureConfig(this.getConfig(), 'field-suggestions', override);
    this.checkGuardrails(config, 'field-suggestions', key, { confirmationToken });

    try {
      const result = await this.completeFieldSuggestion(
        config,
        promptForFieldAssist(idea, field, currentValue, customPrompt, omitCurrentValue),
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
      providerInstanceId?: AiProviderInstanceId;
      model?: string;
      effort?: AiReasoningEffort;
      verbosity?: AiTextVerbosity;
    },
    key: string,
    onDelta: (delta: string) => void,
    confirmationToken?: string,
  ): Promise<AiChatMessage> {
    const idea = this.repository.getIdea(input.ideaId);
    if (!idea) throw new Error('Idea not found.');
    const message = input.message.trim();
    if (!message) throw new Error('message is required.');
    const config = resolveFeatureConfig(this.getConfig(), 'field-suggestions', {
      providerInstanceId: input.providerInstanceId,
      model: input.model,
      effort: input.effort,
      verbosity: input.verbosity,
    });
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
