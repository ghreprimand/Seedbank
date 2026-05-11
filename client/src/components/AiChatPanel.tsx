import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Check, ChevronDown, Send, Settings, X } from 'lucide-react';
import type { AiChatMessage, AiConfigInput, AiProviderId, AiPublicConfig, Idea } from '@/lib/types';
import {
  getAiConfig,
  getAiConversation,
  streamAiChat,
  updateAiConfig,
} from '@/api/client';

interface AiThinkingPanelProps {
  idea: Idea;
  onApply: (changes: Partial<Idea>) => void;
}

const FIELD_ACTIONS: Array<{ label: string; field: keyof Idea }> = [
  { label: 'Apply to Notes', field: 'fullNotes' },
  { label: 'Apply to Pitch', field: 'pitch' },
  { label: 'Apply to Hook', field: 'hook' },
  { label: 'Apply to Risks', field: 'risks' },
  { label: 'Apply to Why', field: 'whyItMightWork' },
];

const ORGANIC_MODES: Array<{ label: string; prompt: string }> = [
  {
    label: 'What if?',
    prompt: 'Ask one provocative "what if" question about this idea. Wait for my answer before suggesting anything.',
  },
  {
    label: "Devil's Advocate",
    prompt: 'Constructively challenge the weakest assumption in this idea. Ask me one question that would expose whether it is true.',
  },
  {
    label: 'Scope Down',
    prompt: 'Help me find the smallest viable version of this idea. Ask one question that removes scope without removing the core.',
  },
  {
    label: 'User Story',
    prompt: 'Help me imagine one specific person using this idea. Ask one question about their situation before suggesting features.',
  },
];

function blankConfig(): AiConfigInput {
  return {
    provider: 'ollama',
    openaiModel: 'gpt-5.5',
    anthropicModel: 'claude-sonnet-4-5',
    ollamaModel: 'llama3.2',
    ollamaBaseUrl: 'http://localhost:11434',
    dailyTokenBudget: 200000,
  };
}

export default function AiThinkingPanel({ idea, onApply }: AiThinkingPanelProps) {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<AiPublicConfig | null>(null);
  const [configDraft, setConfigDraft] = useState<AiConfigInput>(blankConfig);
  const [configSaved, setConfigSaved] = useState(false);
  const localMessageCounter = useRef(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([getAiConfig(), getAiConversation(idea.id)])
      .then(([nextConfig, nextMessages]) => {
        if (cancelled) return;
        setConfig(nextConfig);
        setConfigDraft({
          provider: nextConfig.provider,
          openaiModel: nextConfig.openaiModel,
          anthropicModel: nextConfig.anthropicModel,
          ollamaModel: nextConfig.ollamaModel,
          ollamaBaseUrl: nextConfig.ollamaBaseUrl,
          dailyTokenBudget: nextConfig.dailyTokenBudget,
        });
        setMessages(nextMessages);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [open, idea.id]);

  const providerStatus = useMemo(() => {
    if (!config) return '';
    if (config.provider === 'openai') return config.hasOpenAIKey ? config.openaiModel : 'OpenAI key needed';
    if (config.provider === 'anthropic') return config.hasAnthropicKey ? config.anthropicModel : 'Anthropic key needed';
    return config.ollamaModel;
  }, [config]);

  const submit = async (override?: string) => {
    const content = (override ?? input).trim();
    if (!content || busy) return;
    setInput('');
    setBusy(true);
    setError(null);
    setStreamingText('');
    localMessageCounter.current += 1;
    const optimistic: AiChatMessage = {
      id: `local-${idea.id}-${localMessageCounter.current}`,
      ideaId: idea.id,
      role: 'user',
      content,
      createdAt: new Date(),
    };
    setMessages((current) => [...current, optimistic]);
    try {
      const assistant = await streamAiChat(idea.id, content, (delta) => {
        setStreamingText((current) => current + delta);
      });
      setMessages((current) => [...current, assistant]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStreamingText('');
      setBusy(false);
    }
  };

  const saveConfig = async () => {
    setConfigSaved(false);
    const next = await updateAiConfig(configDraft);
    setConfig(next);
    setConfigDraft({
      provider: next.provider,
      openaiModel: next.openaiModel,
      anthropicModel: next.anthropicModel,
      ollamaModel: next.ollamaModel,
      ollamaBaseUrl: next.ollamaBaseUrl,
      dailyTokenBudget: next.dailyTokenBudget,
    });
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 1500);
  };

  const applyMessage = (field: keyof Idea, content: string) => {
    if (typeof idea[field] !== 'string') return;
    onApply({ [field]: content } as Partial<Idea>);
  };

  return (
    <div className="border border-ink-100 rounded-card bg-paper shadow-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-sage-50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-sage-600" />
          <span>
            <span className="block text-sm font-semibold text-ink-800">Thinking partner</span>
            <span className="block text-xs text-ink-400">{providerStatus || 'AI assistance'}</span>
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 text-ink-300 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-ink-100 p-4 space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setSettingsOpen((value) => !value)}
              className="inline-flex items-center gap-1 text-xs text-ink-400 hover:text-sage-700"
            >
              <Settings className="w-3 h-3" /> Settings
            </button>
          </div>

          {settingsOpen && (
            <div className="bg-paper-warm border border-ink-100 rounded-card p-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-xs text-ink-500">
                  Provider
                  <select
                    value={configDraft.provider}
                    onChange={(event) => setConfigDraft((draft) => ({ ...draft, provider: event.target.value as AiProviderId }))}
                    className="mt-1 w-full px-2 py-2 bg-paper border border-ink-100 rounded-card text-sm"
                  >
                    <option value="ollama">Ollama</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                  </select>
                </label>
                <label className="text-xs text-ink-500">
                  Daily token budget
                  <input
                    type="number"
                    value={configDraft.dailyTokenBudget ?? 200000}
                    onChange={(event) => setConfigDraft((draft) => ({ ...draft, dailyTokenBudget: Number(event.target.value) }))}
                    className="mt-1 w-full px-2 py-2 bg-paper border border-ink-100 rounded-card text-sm"
                  />
                </label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="text-xs text-ink-500">
                  OpenAI model
                  <input
                    value={configDraft.openaiModel ?? ''}
                    onChange={(event) => setConfigDraft((draft) => ({ ...draft, openaiModel: event.target.value }))}
                    className="mt-1 w-full px-2 py-2 bg-paper border border-ink-100 rounded-card text-sm"
                  />
                </label>
                <label className="text-xs text-ink-500">
                  Anthropic model
                  <input
                    value={configDraft.anthropicModel ?? ''}
                    onChange={(event) => setConfigDraft((draft) => ({ ...draft, anthropicModel: event.target.value }))}
                    className="mt-1 w-full px-2 py-2 bg-paper border border-ink-100 rounded-card text-sm"
                  />
                </label>
                <label className="text-xs text-ink-500">
                  Ollama model
                  <input
                    value={configDraft.ollamaModel ?? ''}
                    onChange={(event) => setConfigDraft((draft) => ({ ...draft, ollamaModel: event.target.value }))}
                    className="mt-1 w-full px-2 py-2 bg-paper border border-ink-100 rounded-card text-sm"
                  />
                </label>
              </div>
              <label className="block text-xs text-ink-500">
                Ollama base URL
                <input
                  value={configDraft.ollamaBaseUrl ?? ''}
                  onChange={(event) => setConfigDraft((draft) => ({ ...draft, ollamaBaseUrl: event.target.value }))}
                  className="mt-1 w-full px-2 py-2 bg-paper border border-ink-100 rounded-card text-sm"
                />
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-xs text-ink-500">
                  OpenAI API key
                  <input
                    type="password"
                    placeholder={config?.hasOpenAIKey ? 'Stored' : 'sk-...'}
                    onChange={(event) => setConfigDraft((draft) => ({ ...draft, openaiApiKey: event.target.value }))}
                    className="mt-1 w-full px-2 py-2 bg-paper border border-ink-100 rounded-card text-sm"
                  />
                </label>
                <label className="text-xs text-ink-500">
                  Anthropic API key
                  <input
                    type="password"
                    placeholder={config?.hasAnthropicKey ? 'Stored' : 'sk-ant-...'}
                    onChange={(event) => setConfigDraft((draft) => ({ ...draft, anthropicApiKey: event.target.value }))}
                    className="mt-1 w-full px-2 py-2 bg-paper border border-ink-100 rounded-card text-sm"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={saveConfig}
                className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold bg-sage-600 hover:bg-sage-700 text-white rounded-card"
              >
                {configSaved ? <Check className="w-3 h-3" /> : <Settings className="w-3 h-3" />}
                {configSaved ? 'Saved' : 'Save AI settings'}
              </button>
            </div>
          )}

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {messages.length === 0 && !streamingText && (
              <p className="text-sm text-ink-400 italic">Ask a question about this idea.</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {ORGANIC_MODES.map((mode) => (
                <button
                  key={mode.label}
                  type="button"
                  onClick={() => submit(mode.prompt)}
                  disabled={busy}
                  className="px-2.5 py-1 text-[11px] font-medium rounded-badge border bg-paper-warm border-ink-100 text-ink-500 hover:bg-sage-50 hover:text-sage-700 hover:border-sage-100 transition-colors disabled:opacity-50"
                >
                  {mode.label}
                </button>
              ))}
            </div>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`rounded-card px-3 py-2 text-sm whitespace-pre-wrap ${
                  message.role === 'user' ? 'bg-paper-warm text-ink-700' : 'bg-sage-50 text-ink-800'
                }`}
              >
                {message.content}
                {message.role === 'assistant' && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {FIELD_ACTIONS.map((action) => (
                      <button
                        key={action.label}
                        type="button"
                        onClick={() => applyMessage(action.field, message.content)}
                        className="px-1.5 py-0.5 text-[10px] font-mono text-sage-700 bg-paper border border-sage-100 rounded-badge hover:border-sage-300"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {streamingText && (
              <div className="rounded-card px-3 py-2 text-sm whitespace-pre-wrap bg-sage-50 text-ink-800">
                {streamingText}
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-start justify-between gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-card text-xs text-red-700">
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)}><X className="w-3 h-3" /></button>
            </div>
          )}

          <div className="flex gap-2">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder="Ask a reflective question…"
              className="min-w-0 flex-1 px-3 py-2 text-sm bg-paper-warm border border-ink-100 rounded-card outline-none focus:ring-2 focus:ring-sage-400"
            />
            <button
              type="button"
              onClick={() => submit()}
              disabled={busy || !input.trim()}
              className="inline-flex items-center justify-center w-10 h-10 bg-sage-600 hover:bg-sage-700 disabled:bg-ink-200 text-white rounded-card"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
