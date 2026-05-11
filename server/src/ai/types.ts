import type { AiChatMessage, AiConfigInput, AiProviderId, AiPublicConfig, AiSuggestionField, Idea } from '../../../shared/types.js';

export interface AiStoredConfig extends Omit<AiPublicConfig, 'hasOpenAIKey' | 'hasAnthropicKey'> {
  openaiApiKeyEncrypted?: string;
  anthropicApiKeyEncrypted?: string;
}

export interface AiProviderMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AiProviderResult {
  text: string;
  usage: AiUsage;
}

export interface AiProvider {
  id: AiProviderId;
  complete(messages: AiProviderMessage[], config: AiStoredConfig): Promise<AiProviderResult>;
  stream(messages: AiProviderMessage[], config: AiStoredConfig, onDelta: (delta: string) => void): Promise<AiProviderResult>;
}

export interface AiChatRequest {
  ideaId: string;
  message: string;
}

export interface AiSuggestRequest {
  ideaId: string;
  field: AiSuggestionField;
  currentValue: string;
}

export interface AiConversationPayload {
  messages: AiChatMessage[];
}

export type AiConfigPatch = AiConfigInput;

export interface IdeaContext {
  idea: Idea;
  history: AiChatMessage[];
}
