import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Bot, ChevronDown, ExternalLink, Send, Settings, Shield, X } from 'lucide-react';
import { aiProviderLabel, type AiChatMessage, type AiFeatureId, type AiPreflightResult, type Idea } from '@/lib/types';
import { getAiConversation, preflightAiRequest, streamAiChat } from '@/api/client';
import { useAiSettings } from '@/stores/settings';

function isGuardrailError(msg: string): boolean {
  return msg.startsWith('Guardrails:') ||
    msg.includes('disabled by guardrails') ||
    msg.includes('budget') ||
    msg.includes('rate limit');
}

/**
 * Distinct from isGuardrailError — this is a 403 that means the confirmation
 * token has expired or is missing. The right response is to re-preflight and
 * re-show the confirmation banner, not send the user to Settings.
 */
function isConfirmationRequiredError(msg: string): boolean {
  return msg.includes('requires preflight confirmation') ||
    msg.includes('confirmation token') ||
    msg.includes('confirmationToken');
}

function GuardrailSettingsLink() {
  return (
    <Link
      to="/settings/ai"
      className="inline-flex items-center gap-1 text-[11px] font-medium text-sage-700
                 hover:text-sage-900 underline underline-offset-2"
    >
      <Settings className="w-3 h-3" />
      Settings → AI &amp; Agents → Usage &amp; Guardrails
      <ExternalLink className="w-2.5 h-2.5" />
    </Link>
  );
}

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

export default function AiThinkingPanel({ idea, onApply }: AiThinkingPanelProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const localMessageCounter = useRef(0);

  /**
   * Preflight for Thinking Partner — fired when the panel opens.
   * Stores the confirmationToken so streamAiChat can include it,
   * and surfaces a one-time inline banner when requiresConfirmation=true.
   */
  const [preflight, setPreflight] = useState<AiPreflightResult | null>(null);
  const [preflightToken, setPreflightToken] = useState<string | undefined>();
  const [showConfirmBanner, setShowConfirmBanner] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  // Read provider config from the settings store (A2 — single source of truth).
  const aiConfig = useAiSettings();

  const providerStatus = (() => {
    if (aiConfig.provider === 'openai') return aiConfig.hasOpenAIKey ? aiConfig.openaiModel : 'OpenAI API key needed';
    if (aiConfig.provider === 'anthropic') return aiConfig.hasAnthropicKey ? aiConfig.anthropicModel : 'Anthropic API key needed';
    if (aiConfig.provider === 'openai-compatible') return aiConfig.openaiCompatibleModel || `${aiProviderLabel('openai-compatible')} model needed`;
    return aiConfig.ollamaModel;
  })();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getAiConversation(idea.id)
      .then((msgs) => { if (!cancelled) setMessages(msgs); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [open, idea.id]);

  // Fire preflight when panel opens to get the confirmation token and surface warnings.
  // The token expires after 10 min; for long sessions the server's 403 will re-prompt.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    preflightAiRequest({ feature: 'thinking-partner' as AiFeatureId })
      .then((pf) => {
        if (cancelled) return;
        setPreflight(pf);
        setPreflightToken(pf.confirmationToken);
        // If requiresConfirmation, the banner will ask the user to confirm before first send.
        if (pf.requiresConfirmation || pf.warnings.length > 0) {
          setShowConfirmBanner(true);
        }
      })
      .catch(() => { /* preflight unavailable — proceed without gating */ });
    return () => { cancelled = true; };
  }, [open, idea.id]);

  const doSubmit = async (content: string, token?: string) => {
    setBusy(true);
    setError(null);
    setStreamingText('');
    const msgId = `local-${idea.id}-${++localMessageCounter.current}`;
    const optimistic: AiChatMessage = {
      id: msgId,
      ideaId: idea.id,
      role: 'user',
      content,
      createdAt: new Date(),
    };
    setMessages((current) => [...current, optimistic]);
    try {
      const assistant = await streamAiChat(
        idea.id,
        content,
        (delta) => { setStreamingText((current) => current + delta); },
        { aiConfirmationToken: token },
      );
      setMessages((current) => [...current, assistant]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      if (isConfirmationRequiredError(msg)) {
        // Token expired or missing — remove the optimistic message, re-fire
        // preflight, and re-show the confirmation banner with the message queued.
        setMessages((current) => current.filter((m) => m.id !== msgId));
        setPendingMessage(content);
        // Re-fire preflight to get a fresh token.
        try {
          const pf = await preflightAiRequest({ feature: 'thinking-partner' as AiFeatureId });
          setPreflight(pf);
          setPreflightToken(pf.confirmationToken);
        } catch { /* preflight unavailable — show error below */ }
        setShowConfirmBanner(true);
      } else {
        setError(msg);
      }
    } finally {
      setStreamingText('');
      setBusy(false);
    }
  };

  const submit = (override?: string) => {
    const content = (override ?? input).trim();
    if (!content || busy) return;
    setInput('');

    // If a confirmation banner is showing and the user hasn't acknowledged it,
    // hold the message until they click "Got it / Proceed".
    if (showConfirmBanner && preflight?.requiresConfirmation) {
      setPendingMessage(content);
      return;
    }

    void doSubmit(content, preflightToken);
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
          {/* Link to full AI settings instead of inline popover */}
          <div className="flex justify-end">
            <Link
              to="/settings/ai-agents"
              className="inline-flex items-center gap-1 text-xs text-ink-400 hover:text-sage-700 transition-colors"
            >
              <Settings className="w-3 h-3" /> AI settings
            </Link>
          </div>

          {/* Preflight confirmation banner */}
          {showConfirmBanner && preflight && (
            <div className="rounded-card border border-amber-200 bg-amber-50 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="flex-1 space-y-1">
                  {preflight.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-800 leading-relaxed">{w}</p>
                  ))}
                  {preflight.requiresConfirmation && (
                    <p className="text-xs text-amber-800 leading-relaxed">
                      Your guardrail settings require confirmation before sending idea content to{' '}
                      <span className="font-medium">{aiProviderLabel(preflight.provider, 'short')}</span> ({preflight.model}).
                    </p>
                  )}
                  {preflight.contentLeavesMachine && (
                    <p className="text-xs text-amber-700">
                      Idea content will be sent off-device.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowConfirmBanner(false);
                    if (pendingMessage) {
                      const msg = pendingMessage;
                      setPendingMessage(null);
                      void doSubmit(msg, preflightToken);
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700
                             text-white rounded-card transition-colors"
                >
                  {preflight.requiresConfirmation ? 'Got it — proceed' : 'Dismiss'}
                </button>
                <GuardrailSettingsLink />
              </div>
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
            <div className="flex items-start justify-between gap-2 px-3 py-2.5 bg-red-50
                            border border-red-100 rounded-card text-xs text-red-700">
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {isGuardrailError(error) && (
                    <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                  )}
                  <span className="leading-relaxed">{error}</span>
                </div>
                {isGuardrailError(error) && (
                  <div className="pt-1 border-t border-red-100">
                    <p className="text-red-600 mb-1">To adjust limits or re-enable features:</p>
                    <GuardrailSettingsLink />
                  </div>
                )}
              </div>
              <button type="button" onClick={() => setError(null)} className="shrink-0 mt-0.5">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder="Ask a reflective question…"
              className="min-w-0 flex-1 px-3 py-2 text-sm bg-paper-warm border border-ink-100 rounded-card outline-none focus:ring-2 focus:ring-sage-400"
            />
            <button
              type="button"
              onClick={() => void submit()}
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
