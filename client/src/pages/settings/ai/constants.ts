/**
 * Static constants for the AI & Agents settings page.
 */
import type {
  AiFeatureId,
  AiOpenAICompatiblePresetId,
  AiProviderId,
  AiProviderFamily,
} from '@/lib/types';
import { aiProviderLabel } from '@/lib/types';
import type { LocalServerType } from './types';

// ── OpenAI-compatible presets ─────────────────────────────────────────────────

export const OPENAI_COMPATIBLE_PRESETS: Array<{
  id: AiOpenAICompatiblePresetId;
  label: string;
  baseUrl: string;
  model: string;
  requiresKey: boolean;
}> = [
  { id: 'openrouter',  label: 'OpenRouter',     baseUrl: 'https://openrouter.ai/api/v1',           model: 'openai/gpt-4o-mini',      requiresKey: true },
  { id: 'groq',        label: 'Groq',            baseUrl: 'https://api.groq.com/openai/v1',         model: 'llama-3.3-70b-versatile', requiresKey: true },
  { id: 'mistral',     label: 'Mistral',         baseUrl: 'https://api.mistral.ai/v1',              model: 'mistral-small-latest',    requiresKey: true },
  { id: 'together',    label: 'Together',        baseUrl: 'https://api.together.xyz/v1',            model: '',                        requiresKey: true },
  { id: 'fireworks',   label: 'Fireworks',       baseUrl: 'https://api.fireworks.ai/inference/v1', model: '',                        requiresKey: true },
  { id: 'lm-studio',   label: 'LM Studio',       baseUrl: 'http://localhost:1234/v1',               model: '',                        requiresKey: false },
  { id: 'vllm',        label: 'vLLM',            baseUrl: 'http://localhost:8000/v1',               model: '',                        requiresKey: false },
  { id: 'llama-cpp',   label: 'llama.cpp',       baseUrl: 'http://localhost:8080/v1',               model: '',                        requiresKey: false },
  { id: 'localai',     label: 'LocalAI',         baseUrl: 'http://localhost:8080/v1',               model: '',                        requiresKey: false },
  { id: 'custom',      label: 'Custom endpoint', baseUrl: 'http://localhost:1234/v1',               model: '',                        requiresKey: false },
];

export const LOCAL_METHOD_PRESETS = new Set<AiOpenAICompatiblePresetId>([
  'lm-studio', 'vllm', 'llama-cpp', 'localai', 'custom',
]);

export const LOCAL_COMPATIBLE_DEFAULT_PRESET: AiOpenAICompatiblePresetId = 'lm-studio';
export const CLOUD_COMPATIBLE_DEFAULT_PRESET: AiOpenAICompatiblePresetId = 'openrouter';
export const CLOUD_CUSTOM_BASE_URL = 'https://api.example.com/v1';

// ── Local Models unified dropdown ─────────────────────────────────────────────

export const LOCAL_SERVER_OPTIONS: Array<{
  id: LocalServerType;
  label: string;
  presetId?: AiOpenAICompatiblePresetId;
  defaultUrl: string;
}> = [
  { id: 'ollama',        label: 'Ollama',       defaultUrl: 'http://localhost:11434' },
  { id: 'lm-studio',    label: 'LM Studio',    presetId: 'lm-studio', defaultUrl: 'http://localhost:1234/v1' },
  { id: 'vllm',         label: 'vLLM',         presetId: 'vllm',      defaultUrl: 'http://localhost:8000/v1' },
  { id: 'llama-cpp',    label: 'llama.cpp',    presetId: 'llama-cpp', defaultUrl: 'http://localhost:8080/v1' },
  { id: 'localai',      label: 'LocalAI',      presetId: 'localai',   defaultUrl: 'http://localhost:8080/v1' },
  { id: 'custom-local', label: 'Custom local', presetId: 'custom',    defaultUrl: 'http://localhost:1234/v1' },
];

// ── Preset grouping sets ──────────────────────────────────────────────────────

/** Used for the dropdown optgroup filter only — 'custom' belongs in local because
 *  its default URL is localhost and it requires no key. */
export const LOCAL_OPTGROUP_PRESETS = new Set(['lm-studio', 'vllm', 'llama-cpp', 'localai', 'custom']);

/** Used for data-residency logic only — 'custom' excluded because users can
 *  point it at any URL; we cannot claim local residency without knowing the host. */
export const LOCAL_RESIDENCY_PRESETS = new Set(['lm-studio', 'vllm', 'llama-cpp', 'localai']);

export const CLOUD_COMPATIBLE_PRESETS = new Set([
  'openrouter', 'groq', 'mistral', 'together', 'fireworks',
]);

// ── Feature routing rows ──────────────────────────────────────────────────────

export const AI_FEATURE_ROWS: Array<{
  id: AiFeatureId;
  label: string;
  detail: string;
  secondary?: boolean;
}> = [
  { id: 'thinking-partner',  label: 'Thinking Partner',  detail: 'Idea chat' },
  { id: 'field-suggestions', label: 'Field suggestions', detail: 'Ask AI on idea fields' },
  { id: 'health-check',      label: 'Health Check',      detail: 'AI summary on idea readiness' },
  { id: 'discover-insights', label: 'Discover insights', detail: 'Pattern analysis and cross-pollination' },
  { id: 'landscape-analysis', label: 'Landscape analysis', detail: 'Idea viability and market landscape assessment' },
  { id: 'project-drafting',  label: 'Project drafting',  detail: 'Reviewable project files from an idea' },
  // 'default' only applies to unnamed/future AI features — does NOT cascade to known features.
  {
    id: 'default',
    label: 'Other features (fallback)',
    detail: 'Applies only to unnamed or future AI features — does not affect the features above',
    secondary: true,
  },
];

// ── Guardrails label maps ─────────────────────────────────────────────────────

export const FEATURE_LABELS: Record<AiFeatureId, string> = {
  'thinking-partner':  'Thinking Partner',
  'field-suggestions': 'Field suggestions',
  'health-check':      'Health Check',
  'discover-insights': 'Discover insights',
  'landscape-analysis': 'Landscape analysis',
  'project-drafting':  'Project drafting',
  'default':           'Other / default',
};

export const PROVIDER_LABELS: Record<AiProviderId, string> = {
  openai:              aiProviderLabel('openai'),
  anthropic:           aiProviderLabel('anthropic'),
  ollama:              aiProviderLabel('ollama'),
  'openai-compatible': aiProviderLabel('openai-compatible'),
  'claude-account':    aiProviderLabel('claude-account'),
  'codex-account':     aiProviderLabel('codex-account'),
};

export const REMOTE_PROVIDERS: AiProviderId[] = [
  'openai',
  'anthropic',
  'claude-account',
  'codex-account',
];

export const FEATURE_IDS: AiFeatureId[] = [
  'thinking-partner',
  'field-suggestions',
  'health-check',
  'discover-insights',
  'landscape-analysis',
  'project-drafting',
];

export const PROVIDER_IDS: AiProviderId[] = [
  'openai',
  'anthropic',
  'claude-account',
  'codex-account',
  'ollama',
  'openai-compatible',
];

export const PROVIDER_FAMILY_IDS: AiProviderFamily[] = [
  'api',
  'account',
  'custom-endpoint',
  'local',
];

// ── Usage audit route labels ──────────────────────────────────────────────────

export const ROUTE_LABELS: Record<string, string> = {
  'thinking-partner':               'Thinking Partner',
  'field-suggestions':              'Field suggestions',
  'field-suggestions:conversation': 'Field suggestions (chat)',
  'health-check':                   'Health Check',
  'discover-insights':              'Discover insights',
  'landscape-analysis':             'Landscape analysis',
  'project-drafting':               'Project drafting',
};
