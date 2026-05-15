/**
 * AI Slice 3 — Guided AI Assistance Modal
 *
 * Multi-step flow:
 *   1. Intent selection (improve / fresh / explain / question / playbook)
 *   2. Loading — shows which provider/model is running; cancel returns to intent
 *   3. Review — side-by-side current vs suggested, rationale, apply/reject/refine
 *   4. Refine — freeform follow-up instruction, re-runs one-shot
 *   5. Conversation — isolated field-assist chat (NOT persisted to Thinking Partner)
 *   6. Error — with retry
 *
 * C-1 fix: runOneShot builds a custom prompt from intent/playbook/refinement and
 *          passes it to the server via suggestIdeaField({ prompt }).
 * C-2 fix: ConversationView uses streamFieldAssistChat (POST /api/ai/field-chat),
 *          which is isolated from the idea's Thinking Partner history.
 * S-1 fix: ConversationView auto-send is in useEffect, not a render-phase side effect.
 * S-2 fix: Loading state has a Cancel button using a generation counter to discard
 *          stale results from in-flight requests.
 * S-3 fix: "Apply to field" only appears on the latest assistant message.
 * U-3 fix: Dead `playbook` entry removed from INTENT_CONFIG.
 * U-4 fix: Close button is co-located with the view title via ModalHeader.
 */
import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import {
  aiProviderLabel,
  type AiChatMessage,
  type AiFeatureId,
  type AiPreflightResult,
  type AiProviderInstanceId,
  type AiPublicConfig,
  type AiReasoningEffort,
  type AiSuggestionField,
} from '@/lib/types';
import { preflightAiRequest, suggestIdeaField, streamFieldAssistChat } from '@/api/client';
import { useAiSettings } from '@/stores/settings';
import {
  BUILTIN_PLAYBOOKS,
  INTENT_CONFIG,
  buildAssistPrompt,
  playbooksForField,
  type AiAssistContext,
  type AiAssistIntent,
} from '@/lib/aiAssist';

// ── Guardrail error helpers ───────────────────────────────────────────────────

/**
 * Returns true if the error message string looks like a server guardrail 403/429.
 * The server prefix is "Guardrails: " for both denied and budget errors.
 */
function isGuardrailError(msg: string): boolean {
  return msg.startsWith('Guardrails:') ||
    msg.includes('disabled by guardrails') ||
    msg.includes('budget') ||
    msg.includes('rate limit');
}

/**
 * Returns true when the 403 indicates an expired or missing confirmation token —
 * distinct from budget/feature-disabled guardrails. In this case the right
 * response is to re-fire preflight and show the confirmation banner again,
 * not to send the user to Settings.
 */
function isConfirmationRequiredError(msg: string): boolean {
  return msg.includes('requires preflight confirmation') ||
    msg.includes('confirmation token') ||
    msg.includes('confirmationToken');
}

/**
 * A small inline link that navigates to Settings → AI & Agents.
 * Rendered below guardrail errors so the user knows where to go.
 */
function GuardrailSettingsLink() {
  return (
    <a
      href="/settings/ai"
      className="inline-flex items-center gap-1 text-[11px] font-medium text-sage-700
                 hover:text-sage-900 underline underline-offset-2"
    >
      <Settings className="w-3 h-3" />
      Settings → AI &amp; Agents → Usage &amp; Guardrails
      <ExternalLink className="w-2.5 h-2.5" />
    </a>
  );
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface AiAssistModalProps {
  context: AiAssistContext;
  onApply: (value: string) => void;
  onClose: () => void;
  featureKey?: string;
}

type ModalView =
  | 'intent-select'
  | 'preflight-confirm'
  | 'loading'
  | 'review'
  | 'refine'
  | 'conversation'
  | 'error';

// ── Provider badge ────────────────────────────────────────────────────────────

interface AiAssistRouteSelection {
  providerInstanceId: AiProviderInstanceId;
  model: string;
  effort?: AiReasoningEffort;
}

function providerName(provider: string): string {
  const names: Record<string, string> = {
    openai: aiProviderLabel('openai', 'short'),
    anthropic: aiProviderLabel('anthropic', 'short'),
    ollama: aiProviderLabel('ollama', 'short'),
    'openai-compatible': aiProviderLabel('openai-compatible', 'short'),
  };
  return names[provider] ?? provider;
}

function featureRoute(ai: AiPublicConfig, featureKey?: string) {
  const featureId = (featureKey ?? 'field-suggestions') as keyof typeof ai.effectiveFeatureRoutes;
  return (
    ai.effectiveFeatureRoutes[featureId] ??
    ai.effectiveFeatureRoutes['field-suggestions'] ??
    ai.effectiveFeatureRoutes.default
  );
}

function defaultRouteSelection(ai: AiPublicConfig, featureKey?: string): AiAssistRouteSelection {
  const effective = featureRoute(ai, featureKey);
  return {
    providerInstanceId: effective?.providerInstanceId ?? ai.defaultProviderInstanceId,
    model: effective?.model ?? ai.providerInstances[ai.defaultProviderInstanceId]?.configuredModel ?? '',
    ...(effective?.effort ? { effort: effective.effort } : {}),
  };
}

function instanceModelIds(instance: AiPublicConfig['providerInstances'][string]): string[] {
  const discovered = instance.enabledModelIds?.length
    ? instance.discoveredModels.filter((model) => instance.enabledModelIds?.includes(model.id))
    : instance.discoveredModels;
  const ids = discovered.map((model) => model.id);
  const configured = instance.configuredModel?.trim();
  if (configured && !ids.includes(configured)) ids.unshift(configured);
  return ids;
}

function configuredRouteOptions(ai: AiPublicConfig): AiAssistRouteSelection[] {
  return Object.values(ai.providerInstances)
    .filter((instance) =>
      instance.featureRoutable &&
      instance.available === 'available' &&
      ai.guardrails.providerEnabled[instance.provider] !== false &&
      ai.guardrails.providerInstanceEnabled[instance.id] !== false)
    .flatMap((instance) => {
      const models = instanceModelIds(instance);
      const effort = instance.id === 'codex-account'
        ? ai.codexReasoningEffort
        : instance.id === 'openai-api'
          ? ai.openaiReasoningEffort
          : undefined;
      return models.map((model) => ({
        providerInstanceId: instance.id,
        model,
        ...(effort ? { effort } : {}),
      }));
    });
}

function sameRouteSelection(a: AiAssistRouteSelection, b: AiAssistRouteSelection) {
  return a.providerInstanceId === b.providerInstanceId &&
    a.model === b.model &&
    a.effort === b.effort;
}

function ProviderRoutePicker({
  featureKey,
  selection,
  onChange,
}: {
  featureKey?: string;
  selection: AiAssistRouteSelection;
  onChange: (selection: AiAssistRouteSelection) => void;
}) {
  const ai = useAiSettings();
  const [open, setOpen] = useState(false);
  const effective = featureRoute(ai, featureKey);
  const options = configuredRouteOptions(ai);
  const instance = ai.providerInstances[selection.providerInstanceId];

  const parts = [
    instance?.label ?? (effective ? providerName(effective.provider) : selection.providerInstanceId),
    selection.model || undefined,
    selection.effort ? `effort:${selection.effort}` : undefined,
  ].filter(Boolean);
  const display = parts.join(' · ');
  const currentValue = `${selection.providerInstanceId}\n${selection.model}\n${selection.effort ?? ''}`;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex max-w-[22rem] items-center gap-1 px-1.5 py-0.5 rounded-badge text-[10px]
                   font-mono text-ink-500 bg-paper-warm border border-ink-100 hover:border-sage-300
                   hover:text-sage-700 transition-colors"
        title={
          effective?.inherited
            ? 'Using the global default. Click to choose a configured provider/model for this request.'
            : 'Using the configured feature route. Click to choose another configured provider/model for this request.'
        }
      >
        <Bot className="w-2.5 h-2.5 shrink-0" />
        <span className="truncate">{display}</span>
        <ChevronDown className="w-2.5 h-2.5 shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-card border border-ink-100 bg-paper p-2 shadow-modal">
            <label className="block text-[10px] font-mono uppercase tracking-wider text-ink-400">
              Provider / model for this run
              <select
                value={currentValue}
                onChange={(event) => {
                  const next = options.find((option) =>
                    `${option.providerInstanceId}\n${option.model}\n${option.effort ?? ''}` === event.target.value,
                  );
                  if (next) {
                    onChange(next);
                    setOpen(false);
                  }
                }}
                className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-xs text-ink-800"
              >
                {!options.some((option) => sameRouteSelection(option, selection)) && (
                  <option value={currentValue}>{display}</option>
                )}
                {options.map((option) => {
                  const optionInstance = ai.providerInstances[option.providerInstanceId];
                  const optionLabel = [
                    optionInstance?.label ?? option.providerInstanceId,
                    option.model,
                    option.effort ? `effort:${option.effort}` : undefined,
                  ].filter(Boolean).join(' · ');
                  return (
                    <option
                      key={`${option.providerInstanceId}:${option.model}:${option.effort ?? ''}`}
                      value={`${option.providerInstanceId}\n${option.model}\n${option.effort ?? ''}`}
                    >
                      {optionLabel}
                    </option>
                  );
                })}
              </select>
            </label>
            <p className="mt-1.5 text-[10px] leading-relaxed text-ink-400">
              This only changes the current Ask AI run. Permanent defaults live in Settings.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ── Shared modal header (U-4 fix: close button co-located with title) ─────────

interface ModalHeaderProps {
  title: string;
  subtitle?: string;
  featureKey?: string;
  routeSelection: AiAssistRouteSelection;
  onRouteChange: (selection: AiAssistRouteSelection) => void;
  onClose: () => void;
}

function ModalHeader({ title, subtitle, featureKey, routeSelection, onRouteChange, onClose }: ModalHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex-1 min-w-0">
        <h2 className="text-base font-serif font-semibold text-ink-900">{title}</h2>
        {subtitle && (
          <p className="text-xs text-ink-400 mt-0.5">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {featureKey !== undefined && (
          <ProviderRoutePicker
            featureKey={featureKey}
            selection={routeSelection}
            onChange={onRouteChange}
          />
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close AI assistance"
          className="p-1.5 text-ink-300 hover:text-ink-600 rounded-card hover:bg-ink-50
                     transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Intent selector ───────────────────────────────────────────────────────────

interface IntentSelectorProps {
  context: AiAssistContext;
  featureKey?: string;
  routeSelection: AiAssistRouteSelection;
  onRouteChange: (selection: AiAssistRouteSelection) => void;
  onSelect: (intent: AiAssistIntent, playbookId?: string) => void;
  onClose: () => void;
}

function IntentSelector({ context, featureKey, routeSelection, onRouteChange, onSelect, onClose }: IntentSelectorProps) {
  const availablePlaybooks = playbooksForField(context.field);
  const [showPlaybooks, setShowPlaybooks] = useState(false);

  // U-3 fix: 'playbook' removed from here (it is selected via the playbooks panel,
  // not as a top-level intent chip — the INTENT_CONFIG['playbook'] entry was dead).
  const mainIntents: AiAssistIntent[] = ['improve', 'fresh', 'explain', 'question'];

  return (
    <div className="space-y-4">
      <ModalHeader
        title={`AI Assistance · ${context.fieldLabel}`}
        subtitle="What would you like help with?"
        featureKey={featureKey}
        routeSelection={routeSelection}
        onRouteChange={onRouteChange}
        onClose={onClose}
      />

      {/* Current value preview */}
      {context.currentValue.trim() && (
        <div className="px-3 py-2 bg-paper-warm border border-ink-100 rounded-card">
          <div className="text-[10px] font-mono uppercase text-ink-400 mb-1">Current</div>
          <p className="text-sm text-ink-600 line-clamp-3 whitespace-pre-wrap leading-relaxed">
            {context.currentValue}
          </p>
        </div>
      )}

      {/* Intent buttons */}
      <div className="space-y-1.5">
        {mainIntents.map((intent) => {
          const cfg = INTENT_CONFIG[intent];
          return (
            <button
              key={intent}
              type="button"
              onClick={() => onSelect(intent)}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-card
                         border border-ink-100 hover:border-sage-300 hover:bg-sage-50
                         transition-all duration-150 group"
            >
              <span className="text-base leading-none">{cfg.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink-700 group-hover:text-sage-800">
                  {cfg.label}
                </div>
                <div className="text-xs text-ink-400">{cfg.description}</div>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-ink-300 group-hover:text-sage-500 shrink-0" />
            </button>
          );
        })}
      </div>

      {/* Playbooks */}
      {availablePlaybooks.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowPlaybooks((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-ink-400
                       hover:text-sage-700 transition-colors"
          >
            <span className="text-sm">📋</span>
            Playbooks
            <ChevronRight
              className={`w-3 h-3 transition-transform ${showPlaybooks ? 'rotate-90' : ''}`}
            />
          </button>

          {showPlaybooks && (
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {availablePlaybooks.map((pb) => (
                <button
                  key={pb.id}
                  type="button"
                  onClick={() => onSelect('playbook', pb.id)}
                  className="px-2.5 py-2 text-left rounded-card border border-ink-100
                             hover:border-sage-300 hover:bg-sage-50 transition-all"
                >
                  <div className="text-xs font-medium text-ink-700">{pb.label}</div>
                  <div className="text-[10px] text-ink-400 mt-0.5 line-clamp-2 leading-relaxed">
                    {pb.description}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Review view ───────────────────────────────────────────────────────────────

interface ReviewViewProps {
  context: AiAssistContext;
  suggestion: string;
  rationale: string;
  featureKey?: string;
  routeSelection: AiAssistRouteSelection;
  onRouteChange: (selection: AiAssistRouteSelection) => void;
  onApply: () => void;
  onReject: () => void;
  onRefine: () => void;
  onClose: () => void;
}

function ReviewView({
  context,
  suggestion,
  rationale,
  featureKey,
  routeSelection,
  onRouteChange,
  onApply,
  onReject,
  onRefine,
  onClose,
}: ReviewViewProps) {
  return (
    <div className="space-y-4">
      <ModalHeader
        title={`Review suggestion · ${context.fieldLabel}`}
        subtitle="Review before applying."
        featureKey={featureKey}
        routeSelection={routeSelection}
        onRouteChange={onRouteChange}
        onClose={onClose}
      />

      {/* Side-by-side diff */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] font-mono uppercase text-ink-400 mb-1 tracking-wider">
            Current
          </div>
          <div
            className="min-h-24 whitespace-pre-wrap text-sm text-ink-500 bg-paper-warm
                       border border-ink-100 rounded-card p-3 leading-relaxed"
          >
            {context.currentValue.trim() || (
              <span className="italic text-ink-300">Empty</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase text-sage-600 mb-1 tracking-wider">
            Suggested
          </div>
          <div
            className="min-h-24 whitespace-pre-wrap text-sm text-ink-800 bg-sage-50
                       border border-sage-200 rounded-card p-3 leading-relaxed"
          >
            {suggestion}
          </div>
        </div>
      </div>

      {rationale && (
        <p className="text-xs text-ink-400 leading-relaxed italic">{rationale}</p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onApply}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold
                     bg-sage-600 hover:bg-sage-700 text-white rounded-card transition-colors"
        >
          <Check className="w-3.5 h-3.5" /> Apply
        </button>
        <button
          type="button"
          onClick={onRefine}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium
                     border border-ink-200 text-ink-600 hover:border-sage-300 hover:text-sage-700
                     hover:bg-sage-50 rounded-card transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refine…
        </button>
        <button
          type="button"
          onClick={onReject}
          className="px-3 py-2 text-sm text-ink-400 hover:text-ink-600 hover:bg-ink-50
                     rounded-card transition-colors"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

// ── Refine view ───────────────────────────────────────────────────────────────

interface RefineViewProps {
  context: AiAssistContext;
  featureKey?: string;
  routeSelection: AiAssistRouteSelection;
  onRouteChange: (selection: AiAssistRouteSelection) => void;
  onSubmit: (instruction: string) => void;
  onBack: () => void;
  onClose: () => void;
}

function RefineView({ context, featureKey, routeSelection, onRouteChange, onSubmit, onBack, onClose }: RefineViewProps) {
  const [instruction, setInstruction] = useState('');

  return (
    <div className="space-y-4">
      <ModalHeader
        title={`Refine · ${context.fieldLabel}`}
        subtitle="Add an instruction to guide the next attempt."
        featureKey={featureKey}
        routeSelection={routeSelection}
        onRouteChange={onRouteChange}
        onClose={onClose}
      />

      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="e.g. Make it shorter. Focus on the technical audience. Avoid jargon."
        rows={3}
        autoFocus
        className="w-full px-3 py-2 text-sm bg-paper-warm border border-ink-100 rounded-card
                   outline-none focus:ring-2 focus:ring-sage-400 focus:border-sage-300
                   transition-all text-ink-800 placeholder:text-ink-300 resize-none"
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => { if (instruction.trim()) onSubmit(instruction.trim()); }}
          disabled={!instruction.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold
                     bg-sage-600 hover:bg-sage-700 disabled:bg-ink-200 text-white rounded-card
                     transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" /> Re-run with instruction
        </button>
        <button
          type="button"
          onClick={onBack}
          className="px-3 py-2 text-sm text-ink-400 hover:text-ink-600 hover:bg-ink-50
                     rounded-card transition-colors"
        >
          Back
        </button>
      </div>
    </div>
  );
}

// ── Conversation view ─────────────────────────────────────────────────────────

interface ConversationViewProps {
  context: AiAssistContext;
  featureKey?: string;
  routeSelection: AiAssistRouteSelection;
  onRouteChange: (selection: AiAssistRouteSelection) => void;
  initialPrompt?: string;
  /** Token from preflight — passed to streamFieldAssistChat to satisfy server confirmation check. */
  confirmationToken?: string;
  /**
   * Called when streamFieldAssistChat returns a token-expired/confirmation-required 403.
   * The parent re-fires preflight and re-shows the preflight-confirm view with `queuedMessage`
   * stored so the user's message is retried after they confirm again.
   */
  onConfirmationExpired?: (queuedMessage: string) => void;
  onApplyToField: (value: string) => void;
  onClose: () => void;
}

/**
 * C-2 fix: uses streamFieldAssistChat (POST /api/ai/field-chat) which is
 * isolated from the idea's Thinking Partner history and uses the
 * `field-suggestions` feature route.
 *
 * S-1 fix: auto-send in useEffect.
 * S-3 fix: "Apply to field" only on the latest assistant message.
 */
function ConversationView({
  context,
  featureKey,
  routeSelection,
  onRouteChange,
  initialPrompt,
  confirmationToken,
  onConfirmationExpired,
  onApplyToField,
  onClose,
}: ConversationViewProps) {
  const [localMessages, setLocalMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const localCounter = useRef(0);
  const lastAutoSentPrompt = useRef<string | null>(null);

  const submit = async (override?: string) => {
    const content = (override ?? input).trim();
    if (!content || busy) return;
    setInput('');
    setBusy(true);
    setError(null);
    setStreamingText('');
    localCounter.current += 1;
    const userMsgId = `field-assist-user-${localCounter.current}`;
    const userMsg: AiChatMessage = {
      id: userMsgId,
      ideaId: context.idea.id,
      role: 'user',
      content,
      createdAt: new Date(),
    };
    setLocalMessages((prev) => [...prev, userMsg]);
    try {
      // Build the history to send (exclude the optimistic user message we just added)
      const history = localMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
      const assistant = await streamFieldAssistChat(
        {
          ideaId: context.idea.id,
          field: context.field as AiSuggestionField,
          currentValue: context.currentValue,
          history,
          message: content,
          aiConfirmationToken: confirmationToken,
          providerInstanceId: routeSelection.providerInstanceId,
          model: routeSelection.model,
          effort: routeSelection.effort,
        },
        (delta) => setStreamingText((prev) => prev + delta),
      );
      setLocalMessages((prev) => [...prev, assistant]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Token expired / confirmation required again — hand off to parent rather
      // than showing a raw error. Parent will re-preflight and re-show the gate.
      if (isConfirmationRequiredError(msg) && onConfirmationExpired) {
        // Remove the optimistic user message so it doesn't appear twice when retried.
        setLocalMessages((prev) => prev.filter((m) => m.id !== userMsgId));
        onConfirmationExpired(content);
        return;
      }
      setError(msg);
    } finally {
      setStreamingText('');
      setBusy(false);
    }
  };

  // S-1 fix: auto-send in useEffect to avoid render-phase side effects.
  useEffect(() => {
    if (!initialPrompt) return;
    if (initialPrompt === lastAutoSentPrompt.current) return;
    lastAutoSentPrompt.current = initialPrompt;
    void submit(initialPrompt);
    // submit is intentionally omitted to avoid retriggering on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  // S-3 fix: find the index of the last assistant message for "Apply to field".
  const lastAssistantIdx = localMessages.reduce(
    (acc, msg, idx) => (msg.role === 'assistant' ? idx : acc),
    -1,
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [localMessages, streamingText]);

  return (
    <div className="space-y-4">
      <ModalHeader
        title={`Ask AI · ${context.fieldLabel}`}
        subtitle="Chatting in context of this idea. Not saved to Thinking Partner."
        featureKey={featureKey}
        routeSelection={routeSelection}
        onRouteChange={onRouteChange}
        onClose={onClose}
      />

      {/* Message thread */}
      <div ref={scrollRef} className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {localMessages.length === 0 && !streamingText && !busy && (
          <p className="text-sm text-ink-400 italic">Ask a question about this field…</p>
        )}
        {localMessages.map((msg, idx) => (
          <div
            key={msg.id}
            className={`rounded-card px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
              msg.role === 'user'
                ? 'bg-paper-warm text-ink-700'
                : 'bg-sage-50 text-ink-800'
            }`}
          >
            {msg.content}
            {/* S-3 fix: Apply button only on latest assistant message */}
            {msg.role === 'assistant' && idx === lastAssistantIdx && (
              <button
                type="button"
                onClick={() => onApplyToField(msg.content)}
                className="mt-2 flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono
                           text-sage-700 bg-paper border border-sage-100 rounded-badge
                           hover:border-sage-300 transition-colors"
              >
                <Check className="w-2.5 h-2.5" /> Apply to {context.fieldLabel}
              </button>
            )}
          </div>
        ))}
        {streamingText && (
          <div className="rounded-card px-3 py-2 text-sm whitespace-pre-wrap bg-sage-50 text-ink-800 leading-relaxed">
            {streamingText}
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start justify-between gap-2 px-3 py-2 bg-red-50 border
                        border-red-100 rounded-card text-xs text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="Ask about this field…"
          className="min-w-0 flex-1 px-3 py-2 text-sm bg-paper-warm border border-ink-100
                     rounded-card outline-none focus:ring-2 focus:ring-sage-400 transition-all"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !input.trim()}
          className="inline-flex items-center justify-center w-9 h-9 bg-sage-600
                     hover:bg-sage-700 disabled:bg-ink-200 text-white rounded-card transition-colors"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function AiAssistModal({
  context,
  onApply,
  onClose,
  featureKey,
}: AiAssistModalProps) {
  const ai = useAiSettings();
  const [routeSelection, setRouteSelection] = useState<AiAssistRouteSelection>(() =>
    defaultRouteSelection(ai, featureKey),
  );
  const [view, setView] = useState<ModalView>('intent-select');
  const [selectedIntent, setSelectedIntent] = useState<AiAssistIntent | null>(null);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string | undefined>();
  const [refinement, setRefinement] = useState<string | undefined>();
  const [suggestion, setSuggestion] = useState('');
  const [rationale, setRationale] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [conversationPrompt, setConversationPrompt] = useState<string | undefined>();
  /** Preflight result for the pending one-shot run (used by preflight-confirm view). */
  const [pendingPreflight, setPendingPreflight] = useState<AiPreflightResult | null>(null);
  /**
   * Token for conversation mode — fetched by preflight before opening the
   * conversation view so streamFieldAssistChat gets it on first send.
   */
  const [conversationToken, setConversationToken] = useState<string | undefined>();
  /**
   * When the conversation view detects a token-expired 403, it calls
   * onConfirmationExpired(msg). We store that message here so the parent can
   * re-fire preflight, show the gate again, and retry the queued message after
   * the user confirms. Reset to undefined once the retried message is consumed.
   */
  const [queuedConversationMessage, setQueuedConversationMessage] = useState<string | undefined>();

  /**
   * S-2 fix: generation counter lets the Cancel button invalidate in-flight
   * requests without needing an AbortController (suggestions are fast).
   */
  const requestGenRef = useRef(0);

  const routeOptions = configuredRouteOptions(ai);
  const activeRouteSelection = routeOptions.some((option) => sameRouteSelection(option, routeSelection))
    ? routeSelection
    : defaultRouteSelection(ai, featureKey);

  const routeRequest = {
    providerInstanceId: activeRouteSelection.providerInstanceId,
    model: activeRouteSelection.model,
    effort: activeRouteSelection.effort,
  };

  /**
   * Execute the actual one-shot AI call (called after preflight is satisfied).
   * confirmationToken is the short-lived token returned by the preflight endpoint
   * when requiresConfirmation=true. The server rejects the call with 403 if the
   * token is missing when confirmation is required.
   */
  const executeOneShot = async (
    intent: AiAssistIntent,
    playbookId?: string,
    refinementText?: string,
    confirmationToken?: string,
  ) => {
    requestGenRef.current += 1;
    const gen = requestGenRef.current;
    setView('loading');
    try {
      const customPrompt = buildAssistPrompt({
        context,
        intent,
        playbookId,
        refinement: refinementText,
        featureKey,
      });
      const oneShotIntent = intent === 'question' ? undefined : intent;
      const result = await suggestIdeaField(
        context.idea.id,
        context.field as AiSuggestionField,
        context.currentValue,
        {
          prompt: customPrompt,
          ...(oneShotIntent ? { intent: oneShotIntent } : {}),
          omitCurrentValue: intent === 'fresh',
          aiConfirmationToken: confirmationToken,
          ...routeRequest,
        },
      );
      if (requestGenRef.current !== gen) return;
      setSuggestion(result.suggestion);
      setRationale(result.rationale);
      setView('review');
    } catch (err) {
      if (requestGenRef.current !== gen) return;
      setError(err instanceof Error ? err.message : String(err));
      setView('error');
    }
  };

  /**
   * C-1 fix: build a real prompt from intent/playbook/refinement and pass it
   * to the server as `options.prompt` so intent context is honoured.
   *
   * Preflight gate: if the server reports warnings or requires confirmation
   * (based on warnOnRemoteProvider / requireConfirmationForRemoteProvider),
   * we pause at preflight-confirm view before running. This makes those
   * settings actually do something visible before each cloud request.
   */
  const runOneShot = async (
    intent: AiAssistIntent,
    playbookId?: string,
    refinementText?: string,
  ) => {
    // Fire preflight to discover warnings and confirmation requirement.
    // If preflight fails (server offline, endpoint missing) proceed without gating.
    let pf: AiPreflightResult | null = null;
    try {
      pf = await preflightAiRequest({
        feature: (featureKey ?? 'field-suggestions') as AiFeatureId,
        ...routeRequest,
      });
    } catch {
      // preflight unavailable — proceed directly
    }

    if (pf && (pf.warnings.length > 0 || pf.requiresConfirmation)) {
      // Show preflight gate: user must acknowledge warnings or confirm cloud request.
      setPendingPreflight(pf);
      setView('preflight-confirm');
      // Intent/playbook/refinement state is already set by handleIntentSelect.
      // The Proceed button will call executeOneShot with same args.
      return;
    }

    await executeOneShot(intent, playbookId, refinementText);
  };

  const handleIntentSelect = (intent: AiAssistIntent, playbookId?: string) => {
    setSelectedIntent(intent);
    setSelectedPlaybookId(playbookId);
    setRefinement(undefined);

    const cfg = INTENT_CONFIG[intent];

    if (!cfg.oneShot || intent === 'question') {
      // For 'question' intent, don't auto-send a context-setter opener that
      // produces an acknowledgment — let the user type a real question first.
      // For playbooks that use conversation mode, still auto-send the prefix.
      if (intent === 'question') {
        setConversationPrompt(undefined);
      } else {
        const pb = playbookId
          ? BUILTIN_PLAYBOOKS.find((p) => p.id === playbookId)
          : undefined;
        const opening = pb
          ? `${pb.promptPrefix}\n\nContext: ${context.fieldLabel} for "${context.idea.title || 'this idea'}".\n\nCurrent value: ${context.currentValue || '(empty)'}`
          : `Let's talk about the "${context.fieldLabel}" field for "${context.idea.title || 'this idea'}". Current value: ${context.currentValue || '(empty)'}`;
        setConversationPrompt(opening);
      }
      // Fire preflight for conversation mode — capture token for streamFieldAssistChat.
      // If preflight shows warnings/requires confirmation, show the gate first.
      void (async () => {
        let pf: AiPreflightResult | null = null;
        try {
          pf = await preflightAiRequest({
            feature: (featureKey ?? 'field-suggestions') as AiFeatureId,
            ...routeRequest,
          });
        } catch { /* proceed without gating */ }

        if (pf && (pf.warnings.length > 0 || pf.requiresConfirmation)) {
          setPendingPreflight(pf);
          setView('preflight-confirm');
          // The "Confirm & run" button in preflight-confirm will call
          // openConversation() with the token.
          return;
        }
        setConversationToken(pf?.confirmationToken);
        setView('conversation');
      })();
    } else {
      void runOneShot(intent, playbookId);
    }
  };

  const handleRefineSubmit = (instruction: string) => {
    setRefinement(instruction);
    void runOneShot(selectedIntent ?? 'improve', selectedPlaybookId, instruction);
  };

  /**
   * Called by ConversationView when streamFieldAssistChat returns a
   * token-expired/confirmation-required 403. We re-fire preflight and show
   * the gate again; the queued message will be sent to ConversationView after
   * the user confirms.
   */
  const handleConversationConfirmationExpired = (queuedMessage: string) => {
    setQueuedConversationMessage(queuedMessage);
    void (async () => {
      let pf: AiPreflightResult | null = null;
      try {
        pf = await preflightAiRequest({
          feature: (featureKey ?? 'field-suggestions') as AiFeatureId,
          ...routeRequest,
        });
      } catch { /* proceed without gating — shouldn't happen since server just issued a 403 */ }
      if (pf) {
        setPendingPreflight(pf);
        setView('preflight-confirm');
      }
      // If preflight also fails, leave ConversationView open — the error was already shown there.
    })();
  };

  /** S-2 fix: Cancel invalidates the in-flight gen and returns to intent-select. */
  const handleCancelLoading = () => {
    requestGenRef.current += 1;
    setView('intent-select');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/30
                    backdrop-blur-sm animate-fade-in" data-help="ai-assist-modal">
      <div
        className="bg-paper w-full max-w-2xl rounded-card shadow-modal border border-ink-100
                   p-5 animate-scale-in max-h-[90vh] overflow-y-auto"
      >
        {view === 'intent-select' && (
          <IntentSelector
            context={context}
            featureKey={featureKey}
            routeSelection={activeRouteSelection}
            onRouteChange={setRouteSelection}
            onSelect={handleIntentSelect}
            onClose={onClose}
          />
        )}

        {view === 'preflight-confirm' && pendingPreflight && (
          <div className="space-y-4">
            <ModalHeader
              title="Before running AI"
              subtitle={pendingPreflight.requiresConfirmation
                ? 'Confirmation required before sending idea content to a cloud provider.'
                : 'Review before proceeding.'}
              featureKey={featureKey}
              routeSelection={activeRouteSelection}
              onRouteChange={setRouteSelection}
              onClose={onClose}
            />

            {/* Warnings */}
            {pendingPreflight.warnings.length > 0 && (
              <div className="space-y-2">
                {pendingPreflight.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 px-3 py-2.5 bg-amber-50
                                          border border-amber-200 rounded-card">
                    <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-800 leading-relaxed">{w}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Provider info */}
            {(() => {
              // Prefer the provider instance label from the settings store over
              // the legacy providerName() lookup, since account-login and
              // custom-cloud providers have richer labels there.
              const featureId = (featureKey ?? 'field-suggestions') as keyof typeof ai.effectiveFeatureRoutes;
              const effective = ai.effectiveFeatureRoutes[featureId] ?? ai.effectiveFeatureRoutes['field-suggestions'] ?? ai.effectiveFeatureRoutes.default;
              const selectedInstance = ai.providerInstances[activeRouteSelection.providerInstanceId];
              const instanceLabel = selectedInstance?.label
                ?? (effective
                  ? (ai.providerInstances[effective.providerInstanceId]?.label ?? providerName(pendingPreflight.provider))
                  : providerName(pendingPreflight.provider));
              const leavesDevice = pendingPreflight.contentLeavesDevice ?? pendingPreflight.contentLeavesMachine;
              const modelLabel = pendingPreflight.resolvedModelId ?? pendingPreflight.model;
              return (
                <div className="px-3 py-2 bg-paper-warm border border-ink-100 rounded-card text-xs text-ink-600 space-y-0.5">
                  <div>
                    <span className="font-medium">Provider:</span>{' '}
                    {instanceLabel}
                    {modelLabel ? <span className="text-ink-400"> · {modelLabel}</span> : null}
                  </div>
                  {leavesDevice && (
                    <div className="text-amber-600 font-medium">
                      Idea content will be sent off this device to {instanceLabel}'s servers.
                    </div>
                  )}
                  {leavesDevice === false && (
                    <div className="text-sage-600">
                      Inference runs locally — idea content stays on this device.
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const token = pendingPreflight?.confirmationToken;
                  const intent = selectedIntent ?? 'improve';
                  const cfg = INTENT_CONFIG[intent];
                  const queued = queuedConversationMessage;
                  setPendingPreflight(null);
                  setQueuedConversationMessage(undefined);
                  if (!cfg.oneShot || intent === 'question') {
                    // Conversation mode — store new token and return to conversation.
                    // If there is a queued message (from token-expiry retry), the
                    // ConversationView will receive the fresh token and can send it.
                    setConversationToken(token);
                    // If coming back from a token-expiry retry, pass queued message
                    // via initialPrompt so ConversationView auto-sends it.
                    if (queued) setConversationPrompt(queued);
                    setView('conversation');
                  } else {
                    void executeOneShot(intent, selectedPlaybookId, refinement, token);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold
                           bg-sage-600 hover:bg-sage-700 text-white rounded-card transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                {pendingPreflight.requiresConfirmation ? 'Confirm & run' : 'Proceed'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingPreflight(null);
                  setView('intent-select');
                }}
                className="px-3 py-2 text-sm text-ink-400 hover:text-ink-600 hover:bg-ink-50
                           rounded-card transition-colors"
              >
                Cancel
              </button>
            </div>

            <p className="text-[10px] text-ink-400 leading-relaxed">
              These warnings appear because of your guardrail settings.
              To change them: <GuardrailSettingsLink />
            </p>
          </div>
        )}

        {view === 'loading' && (
          <div>
            {/* S-2 fix: loading header includes Cancel */}
            <ModalHeader
              title={`Generating · ${context.fieldLabel}`}
              featureKey={featureKey}
              routeSelection={activeRouteSelection}
              onRouteChange={setRouteSelection}
              onClose={onClose}
            />
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-sage-500" />
              <p className="text-sm text-ink-400 font-mono italic">Thinking…</p>
              <button
                type="button"
                onClick={handleCancelLoading}
                className="mt-2 px-3 py-1.5 text-xs text-ink-400 hover:text-ink-600
                           border border-ink-100 hover:border-ink-200 rounded-card transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {view === 'review' && (
          <ReviewView
            context={context}
            suggestion={suggestion}
            rationale={rationale}
            featureKey={featureKey}
            routeSelection={activeRouteSelection}
            onRouteChange={setRouteSelection}
            onApply={() => { onApply(suggestion); onClose(); }}
            onReject={() => setView('intent-select')}
            onRefine={() => setView('refine')}
            onClose={onClose}
          />
        )}

        {view === 'refine' && (
          <RefineView
            context={context}
            featureKey={featureKey}
            routeSelection={activeRouteSelection}
            onRouteChange={setRouteSelection}
            onSubmit={handleRefineSubmit}
            onBack={() => setView('review')}
            onClose={onClose}
          />
        )}

        {view === 'conversation' && (
          <ConversationView
            context={context}
            featureKey={featureKey}
            routeSelection={activeRouteSelection}
            onRouteChange={setRouteSelection}
            initialPrompt={conversationPrompt}
            confirmationToken={conversationToken}
            onConfirmationExpired={handleConversationConfirmationExpired}
            onApplyToField={(value) => { onApply(value); onClose(); }}
            onClose={onClose}
          />
        )}

        {view === 'error' && (
          <div className="space-y-4">
            <ModalHeader
              title="Something went wrong"
              featureKey={featureKey}
              routeSelection={activeRouteSelection}
              onRouteChange={setRouteSelection}
              onClose={onClose}
            />
            <div className="px-3 py-2.5 bg-red-50 border border-red-100 rounded-card text-xs
                            text-red-700 space-y-2">
              <p>{error}</p>
              {error && isGuardrailError(error) && (
                <div className="pt-1 border-t border-red-100 space-y-1">
                  <p className="text-red-600">
                    This request was blocked by a guardrail. To adjust limits or re-enable features:
                  </p>
                  <GuardrailSettingsLink />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {error && !isGuardrailError(error) && (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    void runOneShot(selectedIntent ?? 'improve', selectedPlaybookId, refinement);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium
                             border border-ink-200 text-ink-600 hover:border-sage-300
                             hover:text-sage-700 hover:bg-sage-50 rounded-card transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Retry
                </button>
              )}
              <button
                type="button"
                onClick={() => { setError(null); setView('intent-select'); }}
                className="px-3 py-2 text-sm text-ink-400 hover:text-ink-600 hover:bg-ink-50
                           rounded-card transition-colors"
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Backdrop click to close */}
      <div className="fixed inset-0 -z-10" onClick={onClose} />
    </div>
  );
}
