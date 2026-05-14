import type {
  AiChatMessage,
  AiConfigInput,
  AiModelListResult,
  AiProviderHealth,
  AiProviderId,
  AiPublicConfig,
  AiSuggestionField,
  Idea,
} from '../../../shared/types.js';

export interface AiStoredConfig extends Omit<
  AiPublicConfig,
  | 'hasOpenAIKey'
  | 'hasAnthropicKey'
  | 'hasLocalOpenAICompatibleKey'
  | 'hasCloudOpenAICompatibleKey'
  | 'hasOpenAICompatibleKey'
  | 'effectiveFeatureRoutes'
  | 'claudeAccountAvailable'
  | 'codexAccountAvailable'
> {
  openaiApiKeyEncrypted?: string;
  anthropicApiKeyEncrypted?: string;
  localOpenaiCompatibleApiKeyEncrypted?: string;
  cloudOpenaiCompatibleApiKeyEncrypted?: string;
  openaiReasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  openaiTextVerbosity?: 'low' | 'medium' | 'high';
  codexReasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  /**
   * Legacy shared key for pre-instance openai-compatible configuration.
   * Maintained for migration/backward compatibility.
   */
  openaiCompatibleApiKeyEncrypted?: string;
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
  resolvedModelId?: string;
}

export interface AiProvider {
  id: AiProviderId;
  complete(messages: AiProviderMessage[], config: AiStoredConfig): Promise<AiProviderResult>;
  stream(messages: AiProviderMessage[], config: AiStoredConfig, onDelta: (delta: string) => void): Promise<AiProviderResult>;
  health(config: AiStoredConfig): Promise<AiProviderHealth>;
  listModels(config: AiStoredConfig): Promise<AiModelListResult>;
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
