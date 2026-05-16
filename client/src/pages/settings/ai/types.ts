/**
 * UI-local types for the AI & Agents settings page.
 *
 * These are view-layer types that never appear in shared/ or the API contract.
 */

export type ProviderCardStatus = 'connected' | 'key-needed' | 'unreachable' | 'local' | 'not-tested';

export type OpenAICompatibleMode = 'local' | 'cloud';

export type LocalServerType =
  | 'ollama'
  | 'lm-studio'
  | 'vllm'
  | 'llama-cpp'
  | 'localai'
  | 'custom-local';

export type DataResidency = 'local' | 'cloud' | 'mixed';
