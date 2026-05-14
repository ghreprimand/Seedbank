/**
 * UI-local types for the AI & Agents settings page.
 *
 * These are view-layer types that never appear in shared/ or the API contract.
 */
import type { AiMethodCapability } from '@/lib/types';

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

export interface ServiceMethodOption {
  id: string;
  label: string;
  capability: 'chat' | 'agent' | 'chat+agent';
  availability?: AiMethodCapability['availability'];
  availabilityReason?: string;
}
