import type {
  AiOpenAICompatiblePresetId,
  AiProviderDescriptor,
  AiProviderId,
  AiProviderInstanceDescriptor,
  AiProviderInstanceId,
} from '../../../shared/types.js';
import { AI_PROVIDER_DISPLAY } from '../../../shared/types.js';

function compatiblePreset(
  presetId: AiOpenAICompatiblePresetId,
  label: string,
  defaultModel: string,
  baseUrl: string,
  requiresApiKey: boolean,
  local: boolean,
): AiProviderDescriptor {
  return {
    id: 'openai-compatible',
    label,
    shortLabel: label,
    family: 'custom-endpoint',
    presetId,
    transport: 'openai-chat-completions',
    authMode: local ? 'local-server' : requiresApiKey ? 'api-key' : 'none',
    dataResidency: local ? 'local' : presetId === 'custom' ? 'user-controlled' : 'cloud',
    defaultModel,
    baseUrl,
    capabilities: ['chat', 'streaming', 'model-discovery', ...(requiresApiKey ? ['api-key' as const] : local ? ['local' as const] : [])],
    requiresApiKey,
    local,
    modelDiscovery: true,
  };
}

export const OPENAI_COMPATIBLE_PRESETS: Record<AiOpenAICompatiblePresetId, AiProviderDescriptor> = {
  openrouter: compatiblePreset('openrouter', 'OpenRouter', 'openai/gpt-4o-mini', 'https://openrouter.ai/api/v1', true, false),
  groq: compatiblePreset('groq', 'Groq', 'llama-3.3-70b-versatile', 'https://api.groq.com/openai/v1', true, false),
  mistral: compatiblePreset('mistral', 'Mistral', 'mistral-small-latest', 'https://api.mistral.ai/v1', true, false),
  together: compatiblePreset('together', 'Together', '', 'https://api.together.xyz/v1', true, false),
  fireworks: compatiblePreset('fireworks', 'Fireworks', '', 'https://api.fireworks.ai/inference/v1', true, false),
  'lm-studio': compatiblePreset('lm-studio', 'LM Studio', '', 'http://localhost:1234/v1', false, true),
  vllm: compatiblePreset('vllm', 'vLLM', '', 'http://localhost:8000/v1', false, true),
  'llama-cpp': compatiblePreset('llama-cpp', 'llama.cpp', '', 'http://localhost:8080/v1', false, true),
  localai: compatiblePreset('localai', 'LocalAI', '', 'http://localhost:8080/v1', false, true),
  custom: compatiblePreset('custom', 'Custom endpoint', '', 'http://localhost:1234/v1', false, false),
};

const LOCAL_OPENAI_COMPATIBLE_PRESET_IDS: readonly AiOpenAICompatiblePresetId[] = [
  'lm-studio',
  'vllm',
  'llama-cpp',
  'localai',
] as const;

const CLOUD_OPENAI_COMPATIBLE_PRESET_IDS: readonly AiOpenAICompatiblePresetId[] = [
  'openrouter',
  'groq',
  'mistral',
  'together',
  'fireworks',
] as const;

export const AI_PROVIDER_DESCRIPTORS: AiProviderDescriptor[] = [
  {
    id: 'openai',
    ...AI_PROVIDER_DISPLAY.openai,
    transport: 'openai-responses',
    defaultModel: 'gpt-4.1-mini',
    capabilities: ['chat', 'streaming', 'model-discovery', 'api-key'],
    requiresApiKey: true,
    local: false,
    modelDiscovery: true,
  },
  {
    id: 'anthropic',
    ...AI_PROVIDER_DISPLAY.anthropic,
    transport: 'anthropic-messages',
    defaultModel: 'claude-sonnet-4-20250514',
    capabilities: ['chat', 'streaming', 'model-discovery', 'api-key'],
    requiresApiKey: true,
    local: false,
    modelDiscovery: true,
  },
  {
    id: 'claude-account',
    ...AI_PROVIDER_DISPLAY['claude-account'],
    transport: 'claude-account-native',
    defaultModel: 'claude-sonnet-latest',
    capabilities: ['chat', 'streaming', 'model-discovery', 'account-auth'],
    requiresApiKey: false,
    local: false,
    modelDiscovery: true,
    beta: true,
  },
  {
    id: 'codex-account',
    ...AI_PROVIDER_DISPLAY['codex-account'],
    transport: 'codex-account-app-server',
    defaultModel: 'codex-recommended',
    capabilities: ['chat', 'streaming', 'model-discovery', 'account-auth'],
    requiresApiKey: false,
    local: false,
    modelDiscovery: true,
    beta: true,
  },
  {
    id: 'ollama',
    ...AI_PROVIDER_DISPLAY.ollama,
    transport: 'ollama-chat',
    defaultModel: 'llama3.2',
    baseUrl: 'http://localhost:11434',
    capabilities: ['chat', 'streaming', 'model-discovery', 'local'],
    requiresApiKey: false,
    local: true,
    modelDiscovery: true,
  },
  ...Object.values(OPENAI_COMPATIBLE_PRESETS),
];

export const AI_PROVIDER_INSTANCE_DESCRIPTORS: Record<AiProviderInstanceId, AiProviderInstanceDescriptor> = {
  'claude-api': {
    id: 'claude-api',
    provider: 'anthropic',
    label: 'Claude API',
    family: 'api',
    connectionMode: 'api-key',
    dataResidency: 'cloud',
    capabilities: ['chat', 'streaming', 'model-discovery', 'api-key'],
    featureRoutable: true,
    modelDiscovery: true,
    requiresApiKey: true,
    local: false,
    defaultModel: 'claude-sonnet-4-20250514',
  },
  'claude-account': {
    id: 'claude-account',
    provider: 'claude-account',
    label: 'Claude account',
    family: 'account',
    connectionMode: 'account-login',
    dataResidency: 'cloud',
    capabilities: ['chat', 'streaming', 'model-discovery', 'account-auth'],
    featureRoutable: true,
    modelDiscovery: true,
    requiresApiKey: false,
    local: false,
    defaultModel: 'claude-sonnet-latest',
  },
  'openai-api': {
    id: 'openai-api',
    provider: 'openai',
    label: 'OpenAI API',
    family: 'api',
    connectionMode: 'api-key',
    dataResidency: 'cloud',
    capabilities: ['chat', 'streaming', 'model-discovery', 'api-key'],
    featureRoutable: true,
    modelDiscovery: true,
    requiresApiKey: true,
    local: false,
    defaultModel: 'gpt-4.1-mini',
  },
  'codex-account': {
    id: 'codex-account',
    provider: 'codex-account',
    label: 'Codex account',
    family: 'account',
    connectionMode: 'account-login',
    dataResidency: 'cloud',
    capabilities: ['chat', 'streaming', 'model-discovery', 'account-auth'],
    featureRoutable: true,
    modelDiscovery: true,
    requiresApiKey: false,
    local: false,
    defaultModel: 'codex-recommended',
  },
  ollama: {
    id: 'ollama',
    provider: 'ollama',
    label: 'Ollama',
    family: 'local',
    connectionMode: 'local-server',
    dataResidency: 'local',
    capabilities: ['chat', 'streaming', 'model-discovery', 'local'],
    featureRoutable: true,
    modelDiscovery: true,
    requiresApiKey: false,
    local: true,
    defaultModel: 'llama3.2',
    baseUrl: 'http://localhost:11434',
  },
  'local-openai-compatible': {
    id: 'local-openai-compatible',
    provider: 'openai-compatible',
    label: 'Local OpenAI-compatible',
    family: 'custom-endpoint',
    connectionMode: 'openai-compatible-local',
    dataResidency: 'local',
    capabilities: ['chat', 'streaming', 'model-discovery', 'local'],
    featureRoutable: true,
    modelDiscovery: true,
    requiresApiKey: false,
    local: true,
    defaultModel: '',
    baseUrl: OPENAI_COMPATIBLE_PRESETS['lm-studio'].baseUrl,
    presetId: 'lm-studio',
  },
  'cloud-openai-compatible': {
    id: 'cloud-openai-compatible',
    provider: 'openai-compatible',
    label: 'Cloud OpenAI-compatible',
    family: 'custom-endpoint',
    connectionMode: 'openai-compatible-cloud',
    dataResidency: 'cloud',
    capabilities: ['chat', 'streaming', 'model-discovery', 'api-key'],
    featureRoutable: true,
    modelDiscovery: true,
    requiresApiKey: true,
    local: false,
    defaultModel: OPENAI_COMPATIBLE_PRESETS.openrouter.defaultModel,
    baseUrl: OPENAI_COMPATIBLE_PRESETS.openrouter.baseUrl,
    presetId: 'openrouter',
  },
};

export function providerDescriptor(provider: AiProviderId): AiProviderDescriptor | undefined {
  return AI_PROVIDER_DESCRIPTORS.find((descriptor) => descriptor.id === provider && !descriptor.presetId);
}

export function openAICompatiblePreset(preset: AiOpenAICompatiblePresetId): AiProviderDescriptor {
  return OPENAI_COMPATIBLE_PRESETS[preset] ?? OPENAI_COMPATIBLE_PRESETS.custom;
}

export function providerInstanceDescriptor(instanceId: AiProviderInstanceId): AiProviderInstanceDescriptor {
  return AI_PROVIDER_INSTANCE_DESCRIPTORS[instanceId];
}

export function localOpenAICompatiblePreset(preset: AiOpenAICompatiblePresetId): boolean {
  return LOCAL_OPENAI_COMPATIBLE_PRESET_IDS.includes(preset);
}

export function cloudOpenAICompatiblePreset(preset: AiOpenAICompatiblePresetId): boolean {
  return CLOUD_OPENAI_COMPATIBLE_PRESET_IDS.includes(preset);
}
