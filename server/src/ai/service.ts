import type { AiChatMessage, AiPublicConfig, AiSuggestion, AiSuggestionField, Idea } from '../../../shared/types.js';
import type { SeedbankRepository } from '../repository.js';
import { encryptSecret } from './crypto.js';
import { AnthropicProvider, OllamaProvider, OpenAIProvider } from './providers.js';
import type { AiConfigPatch, AiProvider, AiProviderMessage, AiStoredConfig } from './types.js';
import { AiStore } from './store.js';

const THINKING_PARTNER_PROMPT = [
  'You are a creative thinking partner.',
  'Your role is to help the user develop THEIR idea through questions, reflections, and gentle challenges.',
  'Never generate ideas unprompted. Ask before suggesting.',
  'Focus on drawing out what the user already intuitively knows.',
  'Keep responses concise and practical. Prefer one or two thoughtful questions over broad ideation.',
].join(' ');

const DEFAULT_CONFIG: AiStoredConfig = {
  provider: 'ollama',
  openaiModel: 'gpt-5.5',
  anthropicModel: 'claude-sonnet-4-5',
  ollamaModel: 'llama3.2',
  ollamaBaseUrl: 'http://localhost:11434',
  dailyTokenBudget: 200000,
};

const AI_CONFIG_KEY = 'ai.config';
const LEGACY_AI_CONFIG_KEY = 'ai:config';

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

function modelFor(config: AiStoredConfig): string {
  if (config.provider === 'openai') return config.openaiModel;
  if (config.provider === 'anthropic') return config.anthropicModel;
  return config.ollamaModel;
}

function publicConfig(config: AiStoredConfig): AiPublicConfig {
  return {
    provider: config.provider,
    openaiModel: config.openaiModel,
    anthropicModel: config.anthropicModel,
    ollamaModel: config.ollamaModel,
    ollamaBaseUrl: config.ollamaBaseUrl,
    dailyTokenBudget: config.dailyTokenBudget,
    hasOpenAIKey: Boolean(config.openaiApiKeyEncrypted),
    hasAnthropicKey: Boolean(config.anthropicApiKeyEncrypted),
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

function promptForSuggestion(idea: Idea, field: AiSuggestionField, currentValue: string): AiProviderMessage[] {
  const fieldPrompts: Record<AiSuggestionField, string> = {
    pitch: 'Help sharpen this pitch into a clearer one-line version.',
    risks: 'Identify concrete risks, blind spots, or blockers the user may be missing.',
    techStack: 'Suggest technologies that fit the idea and explain the fit briefly.',
    hook: 'Help find a concise demo hook for this idea.',
    whyItMightWork: 'Strengthen the argument for why this idea might work.',
  };

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
        fieldPrompts[field],
        '',
        `Target field: ${field}`,
        `Current value: ${currentValue || '(empty)'}`,
      ].join('\n'),
    },
  ];
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

export class AiService {
  private readonly providers = new Map<string, AiProvider>([
    ['openai', new OpenAIProvider()],
    ['anthropic', new AnthropicProvider()],
    ['ollama', new OllamaProvider()],
  ]);
  private readonly rateLimiter = new SimpleRateLimiter();

  constructor(
    private readonly repository: SeedbankRepository,
    private readonly store: AiStore,
  ) {}

  getConfig(): AiStoredConfig {
    const current = this.repository.getSetting<Partial<AiStoredConfig>>(AI_CONFIG_KEY);
    const legacy = this.repository.getSetting<Partial<AiStoredConfig>>(LEGACY_AI_CONFIG_KEY);
    return {
      ...DEFAULT_CONFIG,
      ...(current ?? legacy ?? {}),
    };
  }

  getPublicConfig(): AiPublicConfig {
    return publicConfig(this.getConfig());
  }

  configure(input: AiConfigPatch): AiPublicConfig {
    const current = this.getConfig();
    const next: AiStoredConfig = {
      ...current,
      provider: input.provider ?? current.provider,
      openaiModel: input.openaiModel?.trim() || current.openaiModel,
      anthropicModel: input.anthropicModel?.trim() || current.anthropicModel,
      ollamaModel: input.ollamaModel?.trim() || current.ollamaModel,
      ollamaBaseUrl: input.ollamaBaseUrl?.trim() || current.ollamaBaseUrl,
      dailyTokenBudget: Number(input.dailyTokenBudget) || current.dailyTokenBudget,
      openaiApiKeyEncrypted: input.openaiApiKey?.trim() ? encryptSecret(input.openaiApiKey.trim()) : current.openaiApiKeyEncrypted,
      anthropicApiKeyEncrypted: input.anthropicApiKey?.trim() ? encryptSecret(input.anthropicApiKey.trim()) : current.anthropicApiKeyEncrypted,
    };
    this.repository.setSetting(AI_CONFIG_KEY, next);
    return publicConfig(next);
  }

  getConversation(ideaId: string): AiChatMessage[] {
    return this.store.getMessages(ideaId);
  }

  private provider(config: AiStoredConfig): AiProvider {
    const provider = this.providers.get(config.provider);
    if (!provider) throw new Error(`Unknown AI provider: ${config.provider}`);
    return provider;
  }

  private checkBudget(config: AiStoredConfig, key: string): void {
    this.rateLimiter.check(key);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const used = this.store.tokensSince(since);
    if (used >= config.dailyTokenBudget) throw new Error('Daily AI token budget reached.');
  }

  async streamChat(ideaId: string, userMessage: string, key: string, onDelta: (delta: string) => void): Promise<AiChatMessage> {
    const idea = this.repository.getIdea(ideaId);
    if (!idea) throw new Error('Idea not found.');
    const config = this.getConfig();
    this.checkBudget(config, key);

    const history = this.store.getMessages(ideaId);
    this.store.addMessage(ideaId, 'user', userMessage);
    const result = await this.provider(config).stream(messagesForChat(idea, history, userMessage), config, onDelta);
    const assistantMessage = this.store.addMessage(ideaId, 'assistant', result.text, config.provider, modelFor(config));
    this.store.recordUsage(config.provider, modelFor(config), 'chat', result.usage);
    return assistantMessage;
  }

  async suggest(ideaId: string, field: AiSuggestionField, currentValue: string, key: string): Promise<AiSuggestion> {
    const idea = this.repository.getIdea(ideaId);
    if (!idea) throw new Error('Idea not found.');
    const config = this.getConfig();
    this.checkBudget(config, key);

    const result = await this.provider(config).complete(promptForSuggestion(idea, field, currentValue), config);
    this.store.recordUsage(config.provider, modelFor(config), 'suggest', result.usage);
    return parseSuggestion(field, result.text);
  }
}
