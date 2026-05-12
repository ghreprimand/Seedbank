/**
 * Settings → AI & Agents
 *
 * A1  Provider cards — OpenAI, Anthropic, Ollama
 * A2  Default-provider radio (built into cards)
 * A3  Token budget + usage readout
 * A4  Linked-agent cards — Claude Code, Codex CLI
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HelpButton } from '@/help/HelpPopover';
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Radio,
  RotateCcw,
  Terminal,
  Unlink,
  Zap,
} from 'lucide-react';
import type { AgentProvider, AiProviderId } from '@/lib/types';
import {
  useAiSettings,
  useAgentsSettings,
  useSettingsStore,
  useSettingsOffline,
} from '@/stores/settings';
import {
  getAiUsage,
  linkAgent,
  unlinkAgent,
  type AiUsageSummary,
} from '@/api/client';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ── Provider card ─────────────────────────────────────────────────────────────

interface ProviderCardProps {
  label: string;
  icon: string;
  isDefault: boolean;
  status: 'connected' | 'key-needed' | 'unreachable' | 'local';
  modelLabel: string;
  onSetDefault: () => void;
  children?: React.ReactNode; // expandable detail row
}

function StatusPill({ status }: { status: ProviderCardProps['status'] }) {
  const cfg: Record<ProviderCardProps['status'], { label: string; classes: string }> = {
    connected:  { label: 'connected',   classes: 'bg-sage-50 text-sage-700 border-sage-200' },
    'key-needed': { label: 'key needed', classes: 'bg-amber-50 text-amber-700 border-amber-200' },
    unreachable: { label: 'unreachable', classes: 'bg-red-50 text-red-600 border-red-200' },
    local:       { label: 'local',       classes: 'bg-sage-50 text-sage-700 border-sage-200' },
  };
  const { label, classes } = cfg[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-badge border text-[10px] font-mono font-semibold uppercase tracking-wide ${classes}`}>
      {label}
    </span>
  );
}

function ProviderCard({
  label, icon, isDefault, status, modelLabel, onSetDefault, children,
}: ProviderCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-card border transition-colors ${isDefault ? 'border-sage-300 bg-paper' : 'border-ink-100 bg-paper'}`}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-ink-800">{label}</span>
            <StatusPill status={status} />
            {isDefault && (
              <span className="text-[10px] font-mono text-sage-600 uppercase tracking-wide">default</span>
            )}
          </div>
          <div className="text-xs text-ink-400 font-mono mt-0.5 truncate">{modelLabel}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isDefault && (
            <button
              type="button"
              onClick={onSetDefault}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-badge
                         border border-ink-200 text-ink-600 hover:border-sage-300 hover:text-sage-700
                         hover:bg-sage-50 transition-colors"
            >
              <Radio className="w-3 h-3" />
              Set default
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label} details`}
            className="p-1 rounded text-ink-400 hover:text-ink-700 hover:bg-ink-50 transition-colors"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Expandable detail row */}
      {expanded && (
        <div className="border-t border-ink-100 px-4 py-3 bg-paper-warm">
          {children}
        </div>
      )}
    </div>
  );
}

// ── OpenAI detail form ────────────────────────────────────────────────────────

interface OpenAIDetailProps {
  model: string;
  hasKey: boolean;
  onSave: (model: string, key?: string) => Promise<void>;
}

function OpenAIDetail({ model, hasKey, onSave }: OpenAIDetailProps) {
  const [m, setM] = useState(model);
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await onSave(m, key || undefined);
      setKey('');
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-xs text-ink-500">
        Model
        <input
          value={m}
          onChange={(e) => setM(e.target.value)}
          className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800"
        />
      </label>
      <label className="block text-xs text-ink-500">
        API key
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={hasKey ? '(stored — enter new value to update)' : 'sk-…'}
          className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800 placeholder:text-ink-300"
        />
      </label>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold
                   bg-sage-600 hover:bg-sage-700 disabled:bg-ink-300 text-white rounded-card transition-colors"
      >
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : saved ? <Check className="w-3 h-3" /> : null}
        {saved ? 'Saved' : 'Save'}
      </button>
      {saveError && <p className="text-[11px] text-red-600 font-mono">{saveError}</p>}
    </div>
  );
}

// ── Anthropic detail form ─────────────────────────────────────────────────────

interface AnthropicDetailProps {
  model: string;
  hasKey: boolean;
  onSave: (model: string, key?: string) => Promise<void>;
}

function AnthropicDetail({ model, hasKey, onSave }: AnthropicDetailProps) {
  const [m, setM] = useState(model);
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await onSave(m, key || undefined);
      setKey('');
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-xs text-ink-500">
        Model
        <input
          value={m}
          onChange={(e) => setM(e.target.value)}
          className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800"
        />
      </label>
      <label className="block text-xs text-ink-500">
        API key
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={hasKey ? '(stored — enter new value to update)' : 'sk-ant-…'}
          className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800 placeholder:text-ink-300"
        />
      </label>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold
                   bg-sage-600 hover:bg-sage-700 disabled:bg-ink-300 text-white rounded-card transition-colors"
      >
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : saved ? <Check className="w-3 h-3" /> : null}
        {saved ? 'Saved' : 'Save'}
      </button>
      {saveError && <p className="text-[11px] text-red-600 font-mono">{saveError}</p>}
    </div>
  );
}

// ── Ollama detail form ────────────────────────────────────────────────────────

interface OllamaDetailProps {
  model: string;
  baseUrl: string;
  onSave: (model: string, baseUrl: string) => Promise<void>;
}

function OllamaDetail({ model, baseUrl, onSave }: OllamaDetailProps) {
  const [m, setM] = useState(model);
  const [url, setUrl] = useState(baseUrl);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await onSave(m, url);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-xs text-ink-500">
        Model
        <input
          value={m}
          onChange={(e) => setM(e.target.value)}
          className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800"
        />
      </label>
      <label className="block text-xs text-ink-500">
        Base URL
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800"
        />
      </label>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold
                   bg-sage-600 hover:bg-sage-700 disabled:bg-ink-300 text-white rounded-card transition-colors"
      >
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : saved ? <Check className="w-3 h-3" /> : null}
        {saved ? 'Saved' : 'Save'}
      </button>
      {saveError && <p className="text-[11px] text-red-600 font-mono">{saveError}</p>}
    </div>
  );
}

// ── Linked agent card ─────────────────────────────────────────────────────────

interface AgentCardProps {
  provider: AgentProvider;
  label: string;
  description: string;
  docsUrl: string;
  isLinked: boolean;
  version?: string;
  onLink: (cliPath: string) => Promise<void>;
  onDetect: () => Promise<void>;
  onUnlink: () => Promise<void>;
}

function AgentCard({
  provider, label, description, docsUrl,
  isLinked, version,
  onLink, onDetect, onUnlink,
}: AgentCardProps) {
  const [cliPath, setCliPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);

  const handleLink = async () => {
    if (!cliPath.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onLink(cliPath.trim());
      setCliPath('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDetect = async () => {
    setDetecting(true);
    setError(null);
    try {
      await onDetect();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDetecting(false);
    }
  };

  const handleUnlink = async () => {
    setBusy(true);
    setError(null);
    try {
      await onUnlink();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rounded-card border p-4 space-y-3 ${isLinked ? 'border-sage-300 bg-paper' : 'border-ink-100 bg-paper'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-ink-400" />
            <span className="text-sm font-semibold text-ink-800">{label}</span>
            {isLinked && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-badge border
                               bg-sage-50 text-sage-700 border-sage-200 text-[10px] font-mono font-semibold uppercase">
                <Check className="w-2.5 h-2.5" /> linked
              </span>
            )}
          </div>
          <p className="text-xs text-ink-400 mt-0.5">{description}</p>
          {version && (
            <p className="text-[10px] font-mono text-ink-400 mt-1">version {version}</p>
          )}
        </div>
        <a
          href={docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-ink-400 hover:text-sage-700 transition-colors"
          title="Documentation"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {isLinked ? (
        <button
          type="button"
          onClick={handleUnlink}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                     border border-ink-200 text-ink-600 hover:border-red-200 hover:text-red-600
                     hover:bg-red-50 rounded-card transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />}
          Unlink
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={cliPath}
              onChange={(e) => setCliPath(e.target.value)}
              placeholder={`Path to ${provider === 'claude' ? 'claude' : 'codex'} binary (or leave blank to detect)`}
              className="flex-1 min-w-0 px-2 py-1.5 text-xs bg-paper-warm border border-ink-100
                         rounded-card text-ink-800 placeholder:text-ink-300 outline-none
                         focus:ring-2 focus:ring-sage-400 focus:border-sage-300"
            />
            <button
              type="button"
              onClick={handleDetect}
              disabled={detecting || busy}
              title="Detect on PATH"
              className="px-2.5 py-1.5 text-xs border border-ink-200 text-ink-500
                         hover:border-sage-300 hover:text-sage-700 hover:bg-sage-50
                         rounded-card transition-colors disabled:opacity-50"
            >
              {detecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
            </button>
            <button
              type="button"
              onClick={handleLink}
              disabled={busy || detecting}
              className="px-3 py-1.5 text-xs font-semibold bg-sage-600 hover:bg-sage-700
                         disabled:bg-ink-300 text-white rounded-card transition-colors"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Link'}
            </button>
          </div>
          {error && (
            <p className="text-[11px] text-red-600 font-mono">{error}</p>
          )}
          <p className="text-[11px] text-ink-400">
            The binary path is stored server-side only — no credentials enter the browser.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Token budget + usage (A3) ─────────────────────────────────────────────────

interface BudgetSectionProps {
  budget: number;
  onSave: (budget: number) => Promise<void>;
}

function BudgetSection({ budget, onSave }: BudgetSectionProps) {
  // null = not yet touched by user; display will fall back to `budget` prop
  const [localDraft, setLocalDraft] = useState<number | null>(null);
  const draft = localDraft ?? budget;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [usage, setUsage] = useState<AiUsageSummary | null>(null);

  useEffect(() => {
    void getAiUsage()
      .then(setUsage)
      .catch(() => { /* offline — show nothing */ });
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await onSave(draft);
      setLocalDraft(null); // let parent prop take over again
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <h3 className="text-xs font-mono uppercase tracking-wider text-ink-500">Token Budget</h3>
        <HelpButton
          helpId="token-budget"
          title="Daily Token Budget"
          summary="Caps how many AI tokens Seedbank uses per day across the Thinking Partner, field suggestions, and health checks. Set to 0 to disable the limit. Usage resets at midnight."
          manualSection="settings-ai"
          alwaysShow
        />
      </div>
      <div className="flex items-end gap-3 flex-wrap">
        <label className="block text-xs text-ink-500">
          Daily token limit
          <input
            type="number"
            min={1000}
            step={10000}
            value={draft}
            onChange={(e) => setLocalDraft(Number(e.target.value))}
            className="mt-1 w-36 px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800"
          />
        </label>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="mb-0.5 flex items-center gap-1 px-3 py-1.5 text-xs font-semibold
                     bg-sage-600 hover:bg-sage-700 disabled:bg-ink-300 text-white rounded-card transition-colors"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : saved ? <Check className="w-3 h-3" /> : null}
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>
      {saveError && <p className="text-[11px] text-red-600 font-mono">{saveError}</p>}
      {usage !== null && (
        <div className="font-mono text-[11px] text-ink-400 space-y-0.5">
          <div>
            <span className="text-ink-600">{fmtTokens(usage.last24h)}</span> tokens used · last 24 h
            {budget > 0 && (
              <span className="ml-1">
                ({Math.min(100, Math.round(usage.last24h / budget * 100))}% of budget)
              </span>
            )}
          </div>
          <div>
            <span className="text-ink-600">{fmtTokens(usage.last7d)}</span> tokens used · last 7 d
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function AiAgentsTab() {
  const ai = useAiSettings();
  const agents = useAgentsSettings();
  const offline = useSettingsOffline();
  const patch = useSettingsStore((s) => s.patch);

  // Determine provider connection status
  const openaiStatus: ProviderCardProps['status'] = ai.hasOpenAIKey ? 'connected' : 'key-needed';
  const anthropicStatus: ProviderCardProps['status'] = ai.hasAnthropicKey ? 'connected' : 'key-needed';
  // Ollama is local — always show "local" (actual reachability is tested server-side)
  const ollamaStatus: ProviderCardProps['status'] = 'local';

  const setDefaultProvider = async (provider: AiProviderId) => {
    await patch('ai', { provider });
  };

  const saveOpenAI = async (model: string, key?: string) => {
    await patch('ai', { openaiModel: model, ...(key ? { openaiApiKey: key } : {}) });
  };

  const saveAnthropic = async (model: string, key?: string) => {
    await patch('ai', { anthropicModel: model, ...(key ? { anthropicApiKey: key } : {}) });
  };

  const saveOllama = async (model: string, baseUrl: string) => {
    await patch('ai', { ollamaModel: model, ollamaBaseUrl: baseUrl });
  };

  const saveBudget = async (budget: number) => {
    await patch('ai', { dailyTokenBudget: budget });
  };

  // ── Agent link/unlink ────────────────────────────────────────────────────────
  const refresh = useSettingsStore((s) => s.refresh);

  const handleLink = async (provider: AgentProvider, cliPath: string) => {
    const result = await linkAgent({ provider, cliPath });
    if (!result.linked) throw new Error(`Could not validate ${provider} CLI at that path.`);
    await refresh();
  };

  const handleDetect = async (provider: AgentProvider) => {
    const result = await linkAgent({ provider, detect: true });
    if (!result.linked) throw new Error(`${provider} CLI not found on PATH.`);
    await refresh();
  };

  const handleUnlink = async (provider: AgentProvider) => {
    await unlinkAgent(provider);
    await refresh();
  };

  const anyLinked = agents.claudeLinked || agents.codexLinked;

  return (
    <div className="space-y-8">
      {offline && (
        <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-card text-xs text-amber-800">
          Offline — AI settings shown from local cache. Changes will sync when the server reconnects.
        </div>
      )}

      {/* ── A1 + A2: Provider cards ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-mono uppercase tracking-wider text-ink-500">
            Thinking Partner · Providers
          </h3>
          <Link
            to="/settings/ai-agents"
            className="text-[11px] text-ink-400 hover:text-sage-700 transition-colors"
          >
            {/* placeholder — actual link target is this page */}
          </Link>
        </div>
        <p className="text-xs text-ink-400">
          Select a default provider. The Thinking Partner on each idea uses this choice.
          Expand a card to update model names or API keys.
        </p>

        <div className="space-y-2">
          {/* OpenAI */}
          <ProviderCard
            label="OpenAI"
            icon="🤖"
            isDefault={ai.provider === 'openai'}
            status={openaiStatus}
            modelLabel={ai.openaiModel}
            onSetDefault={() => void setDefaultProvider('openai')}
          >
            <OpenAIDetail
              model={ai.openaiModel}
              hasKey={ai.hasOpenAIKey}
              onSave={saveOpenAI}
            />
          </ProviderCard>

          {/* Anthropic */}
          <ProviderCard
            label="Anthropic"
            icon="🧠"
            isDefault={ai.provider === 'anthropic'}
            status={anthropicStatus}
            modelLabel={ai.anthropicModel}
            onSetDefault={() => void setDefaultProvider('anthropic')}
          >
            <AnthropicDetail
              model={ai.anthropicModel}
              hasKey={ai.hasAnthropicKey}
              onSave={saveAnthropic}
            />
          </ProviderCard>

          {/* Ollama */}
          <ProviderCard
            label="Ollama"
            icon="🦙"
            isDefault={ai.provider === 'ollama'}
            status={ollamaStatus}
            modelLabel={`${ai.ollamaModel} · ${ai.ollamaBaseUrl}`}
            onSetDefault={() => void setDefaultProvider('ollama')}
          >
            <OllamaDetail
              model={ai.ollamaModel}
              baseUrl={ai.ollamaBaseUrl}
              onSave={saveOllama}
            />
          </ProviderCard>
        </div>
      </section>

      {/* ── A3: Token budget + usage ────────────────────────────────────────── */}
      <section className="p-4 bg-paper-warm border border-ink-100 rounded-card">
        <BudgetSection budget={ai.dailyTokenBudget} onSave={saveBudget} />
      </section>

      {/* ── A4: Linked agents ───────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-1.5">
          <h3 className="text-xs font-mono uppercase tracking-wider text-ink-500">
            Linked Agents
          </h3>
          <HelpButton
            helpId="linked-agents"
            title="Linked CLI Agents"
            summary="Link Claude Code or Codex CLI by binary path. Seedbank spawns the agent in a sandboxed scratch workspace when you click 'Develop with agent' on an idea."
            details="Credentials stay in your OS keychain or CLI tool. Seedbank stores only the binary path and a linked flag."
            manualSection="agents"
            alwaysShow
          />
        </div>
        <p className="text-xs text-ink-400">
          Link a local CLI agent so Seedbank can spawn it to develop an idea or continue work
          on a graduated project. The CLI path is stored server-side only.
        </p>

        {!anyLinked && (
          <div className="flex items-start gap-3 p-4 bg-paper-warm border border-ink-100 rounded-card">
            <Bot className="w-5 h-5 text-ink-300 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-ink-600">No agents linked yet</p>
              <p className="text-xs text-ink-400 mt-0.5">
                Link Claude Code or the Codex CLI below to unlock the{' '}
                <span className="font-mono">Develop with agent</span> button on each idea.
              </p>
            </div>
          </div>
        )}

        <AgentCard
          provider="claude"
          label="Claude Code"
          description="Anthropic's Claude Code CLI — spawned in a scratch workspace seeded with your idea fields."
          docsUrl="https://docs.anthropic.com/en/docs/claude-code"
          isLinked={agents.claudeLinked}
          version={agents.claudeVersion}
          onLink={(path) => handleLink('claude', path)}
          onDetect={() => handleDetect('claude')}
          onUnlink={() => handleUnlink('claude')}
        />

        <AgentCard
          provider="codex"
          label="Codex CLI"
          description="OpenAI's Codex CLI — spawned in a scratch workspace seeded with your idea fields."
          docsUrl="https://github.com/openai/codex"
          isLinked={agents.codexLinked}
          version={agents.codexVersion}
          onLink={(path) => handleLink('codex', path)}
          onDetect={() => handleDetect('codex')}
          onUnlink={() => handleUnlink('codex')}
        />

        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-400">
          <Zap className="w-3 h-3" />
          <span>
            Agent runs are sandboxed to a temporary workspace. Proposed file changes require
            your explicit approval before being saved as idea attachments.
          </span>
        </div>
      </section>

      {/* Link to agent docs */}
      <div className="flex items-center gap-1 text-[11px] text-ink-400">
        <ChevronRight className="w-3 h-3" />
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-sage-700 transition-colors"
        >
          Read the Agents guide
        </a>
        <ExternalLink className="w-3 h-3" />
      </div>
    </div>
  );
}
