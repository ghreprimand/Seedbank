import type {
  AiOpenAICompatiblePresetId,
  AiProviderDescriptor,
  AiProviderId,
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

export function providerDescriptor(provider: AiProviderId): AiProviderDescriptor | undefined {
  return AI_PROVIDER_DESCRIPTORS.find((descriptor) => descriptor.id === provider && !descriptor.presetId);
}

export function openAICompatiblePreset(preset: AiOpenAICompatiblePresetId): AiProviderDescriptor {
  return OPENAI_COMPATIBLE_PRESETS[preset] ?? OPENAI_COMPATIBLE_PRESETS.custom;
}
