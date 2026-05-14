/**
 * Settings → AI & Agents
 *
 * A1  Service-first method areas — Claude, Codex/OpenAI, local inference, cloud routers
 * A2  Default-provider routing controls (chat/model-capable methods only)
 * A3  Feature Defaults + Usage & Guardrails
 */
import { useEffect, useState } from 'react';
import { HelpButton } from '@/help/HelpPopover';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Info,
  Loader2,
  Lock,
  Radio,
  Shield,
} from 'lucide-react';
import { aiProviderLabel, isAiProviderId } from '@/lib/types';
import type {
  AiAuditEvent,
  AiConfigInput,
  AiFeatureId,
  AiFeatureRoute,
  AiGuardrailsConfig,
  AiMethodCapability,
  AiModelListResult,
  AiModelInfo,
  AiOllamaDiagnostics,
  AiOllamaModelResidency,
  AiOpenAICompatiblePresetId,
  AiPreflightResult,
  AiProviderId,
  AiProviderHealth,
  AiProviderInstanceId,
  AiPublicConfig,
  AiReasoningEffort,
  AiTextVerbosity,
  AiUsageBucket,
} from '@/lib/types';
import {
  useAiSettings,
  useSettingsStore,
  useSettingsOffline,
} from '@/stores/settings';
import {
  getAiUsage,
  getAiUsageDetail,
  preflightAiRequest,
  getAiMethodCapabilities,
  listAiModels,
  testAiProvider,
  getClaudeAccountStatus,
  startClaudeAccountLogin,
  completeClaudeAccountLogin,
  logoutClaudeAccount,
  getCodexAccountStatus,
  startCodexAccountLogin,
  logoutCodexAccount,
  type AiUsageDetail,
  type AiUsageSummary,
  type ClaudeAccountLoginResult,
  type CodexAccountLoginResult,
} from '@/api/client';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

const OPENAI_COMPATIBLE_PRESETS: Array<{
  id: AiOpenAICompatiblePresetId;
  label: string;
  baseUrl: string;
  model: string;
  requiresKey: boolean;
}> = [
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini', requiresKey: true },
  { id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', requiresKey: true },
  { id: 'mistral', label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest', requiresKey: true },
  { id: 'together', label: 'Together', baseUrl: 'https://api.together.xyz/v1', model: '', requiresKey: true },
  { id: 'fireworks', label: 'Fireworks', baseUrl: 'https://api.fireworks.ai/inference/v1', model: '', requiresKey: true },
  { id: 'lm-studio', label: 'LM Studio', baseUrl: 'http://localhost:1234/v1', model: '', requiresKey: false },
  { id: 'vllm', label: 'vLLM', baseUrl: 'http://localhost:8000/v1', model: '', requiresKey: false },
  { id: 'llama-cpp', label: 'llama.cpp', baseUrl: 'http://localhost:8080/v1', model: '', requiresKey: false },
  { id: 'localai', label: 'LocalAI', baseUrl: 'http://localhost:8080/v1', model: '', requiresKey: false },
  { id: 'custom', label: 'Custom endpoint', baseUrl: 'http://localhost:1234/v1', model: '', requiresKey: false },
];

function presetFor(id: AiOpenAICompatiblePresetId) {
  return OPENAI_COMPATIBLE_PRESETS.find((preset) => preset.id === id) ?? OPENAI_COMPATIBLE_PRESETS[0];
}

const LOCAL_METHOD_PRESETS = new Set<AiOpenAICompatiblePresetId>(['lm-studio', 'vllm', 'llama-cpp', 'localai', 'custom']);
type OpenAICompatibleMode = 'local' | 'cloud';

const LOCAL_COMPATIBLE_DEFAULT_PRESET: AiOpenAICompatiblePresetId = 'lm-studio';
const CLOUD_COMPATIBLE_DEFAULT_PRESET: AiOpenAICompatiblePresetId = 'openrouter';
const CLOUD_CUSTOM_BASE_URL = 'https://api.example.com/v1';

// ── Local Models unified dropdown ─────────────────────────────────────────────

/** Maps the Local Models server-type dropdown to an Ollama or OpenAI-compatible preset. */
type LocalServerType = 'ollama' | 'lm-studio' | 'vllm' | 'llama-cpp' | 'localai' | 'custom-local';

const LOCAL_SERVER_OPTIONS: Array<{
  id: LocalServerType;
  label: string;
  presetId?: AiOpenAICompatiblePresetId;
  defaultUrl: string;
}> = [
  { id: 'ollama',        label: 'Ollama',        defaultUrl: 'http://localhost:11434' },
  { id: 'lm-studio',    label: 'LM Studio',     presetId: 'lm-studio',  defaultUrl: 'http://localhost:1234/v1' },
  { id: 'vllm',         label: 'vLLM',          presetId: 'vllm',       defaultUrl: 'http://localhost:8000/v1' },
  { id: 'llama-cpp',    label: 'llama.cpp',     presetId: 'llama-cpp',  defaultUrl: 'http://localhost:8080/v1' },
  { id: 'localai',      label: 'LocalAI',       presetId: 'localai',    defaultUrl: 'http://localhost:8080/v1' },
  { id: 'custom-local', label: 'Custom local',  presetId: 'custom',     defaultUrl: 'http://localhost:1234/v1' },
];

function describeOllamaResidency(residency: AiOllamaModelResidency | undefined): string {
  if (!residency) return 'unknown';
  if (residency === 'resident') return 'resident';
  if (residency === 'idle') return 'loaded with unload timer';
  return 'not loaded';
}

function summarizeOllamaCapabilities(diag: AiOllamaDiagnostics | null): string | null {
  const caps = diag?.modelCapabilities;
  if (!caps) return null;
  const bits = [
    `tools: ${caps.tools ? 'yes' : 'no'}`,
    `vision: ${caps.vision ? 'yes' : 'no'}`,
    `thinking: ${caps.thinking ? 'yes' : 'no'}`,
  ];
  if (typeof caps.contextWindow === 'number') bits.push(`context: ${caps.contextWindow}`);
  return bits.join(' · ');
}

interface ProviderProbeProps {
  buildConfig: () => AiConfigInput;
  onPickModel?: (model: string) => void;
  onModelsListed?: (models: AiModelInfo[]) => void;
  onStatusChange?: (status: ProviderCardStatus) => void;
  testLabel?: string;
  listLabel?: string;
}

function ProviderProbe({
  buildConfig,
  onPickModel,
  onModelsListed,
  onStatusChange,
  testLabel = 'Test',
  listLabel = 'List models',
}: ProviderProbeProps) {
  const [busy, setBusy] = useState<'test' | 'models' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [models, setModels] = useState<AiModelInfo[]>([]);
  const [ollama, setOllama] = useState<AiOllamaDiagnostics | null>(null);
  const capabilitySummary = summarizeOllamaCapabilities(ollama);

  const applyDiagnostics = (result: AiProviderHealth | AiModelListResult) => {
    setOllama(result.provider === 'ollama' ? result.ollama ?? null : null);
  };

  const test = async () => {
    setBusy('test');
    setMessage(null);
    setOllama(null);
    try {
      const result = await testAiProvider(buildConfig());
      applyDiagnostics(result);
      setMessage(result.ok ? `${result.message}${result.normalizedBaseUrl ? ` · ${result.normalizedBaseUrl}` : ''}` : result.message);
      onStatusChange?.(result.ok ? 'connected' : result.code === 'not_configured' ? 'key-needed' : 'unreachable');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const list = async () => {
    setBusy('models');
    setMessage(null);
    setOllama(null);
    try {
      const result = await listAiModels(buildConfig());
      applyDiagnostics(result);
      setModels(result.models);
      onModelsListed?.(result.models);
      setMessage(result.ok ? `${result.models.length} models found${result.normalizedBaseUrl ? ` · ${result.normalizedBaseUrl}` : ''}` : result.message ?? 'Model discovery failed.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={test}
          disabled={busy !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-ink-200 text-ink-600 hover:border-sage-300 hover:text-sage-700 hover:bg-sage-50 rounded-card transition-colors disabled:opacity-50"
        >
          {busy === 'test' ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          {testLabel}
        </button>
        <button
          type="button"
          onClick={list}
          disabled={busy !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-ink-200 text-ink-600 hover:border-sage-300 hover:text-sage-700 hover:bg-sage-50 rounded-card transition-colors disabled:opacity-50"
        >
          {busy === 'models' ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          {listLabel}
        </button>
        {models.length > 0 && onPickModel && (
          <select
            onChange={(event) => onPickModel(event.target.value)}
            defaultValue=""
            className="min-w-0 max-w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-xs text-ink-700"
          >
            <option value="" disabled>Choose discovered model</option>
            {models.slice(0, 80).map((model) => {
              const label = model.displayName ?? model.name ?? model.id;
              const showId = label !== model.id;
              return (
                <option key={model.id} value={model.id}>{showId ? `${label} — ${model.id}` : label}</option>
              );
            })}
          </select>
        )}
      </div>
      {message && <p className="text-[11px] text-ink-500 font-mono break-words">{message}</p>}
      {ollama && (
        <div className="text-[11px] text-ink-500 font-mono space-y-1">
          {ollama.endpoint && <p>Endpoint: {ollama.endpoint}</p>}
          {ollama.live && (
            <p>
              Daemon: {ollama.live.up ? 'up' : 'down'}
              {ollama.live.version ? ` · v${ollama.live.version}` : ''}
              {ollama.live.loadedModel ? ` · loaded: ${ollama.live.loadedModel}` : ''}
              {ollama.live.selectedModelResidency ? ` · selected: ${describeOllamaResidency(ollama.live.selectedModelResidency)}` : ''}
            </p>
          )}
          {capabilitySummary && <p>Capabilities: {capabilitySummary}</p>}
          {ollama.capabilityWarning && <p className="text-amber-700">{ollama.capabilityWarning}</p>}
          {ollama.responseDetail && <p className="text-amber-700">Detail: {ollama.responseDetail}</p>}
        </div>
      )}
    </div>
  );
}

// ── Provider card ─────────────────────────────────────────────────────────────

interface ProviderCardProps {
  label: string;
  icon: string;
  isDefault: boolean;
  status: ProviderCardStatus;
  modelLabel: string;
  onSetDefault: () => void;
  /** When false, the "Set default" button is hidden (e.g. provider not yet available). Default true. */
  canSetDefault?: boolean;
  actions?: React.ReactNode;
  children?: React.ReactNode; // expandable detail row
}

type ProviderCardStatus = 'connected' | 'key-needed' | 'unreachable' | 'local' | 'not-tested' | 'upcoming';

function StatusPill({ status }: { status: ProviderCardProps['status'] }) {
  const cfg: Record<ProviderCardProps['status'], { label: string; classes: string }> = {
    connected:  { label: 'connected',   classes: 'bg-sage-50 text-sage-700 border-sage-200' },
    'key-needed': { label: 'key needed', classes: 'bg-amber-50 text-amber-700 border-amber-200' },
    unreachable: { label: 'unreachable', classes: 'bg-red-50 text-red-600 border-red-200' },
    local:       { label: 'local',       classes: 'bg-sage-50 text-sage-700 border-sage-200' },
    'not-tested': { label: 'not tested', classes: 'bg-ink-50 text-ink-500 border-ink-200' },
    upcoming:     { label: 'coming soon', classes: 'bg-violet-50 text-violet-600 border-violet-200' },
  };
  const { label, classes } = cfg[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-badge border text-[10px] font-mono font-semibold uppercase tracking-wide ${classes}`}>
      {label}
    </span>
  );
}

function ProviderCard({
  label, icon, isDefault, status, modelLabel, onSetDefault, canSetDefault = true, actions, children,
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
          {!isDefault && canSetDefault === true && (
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

      {actions && (
        <div className="border-t border-ink-100 px-4 py-3 bg-paper">
          {actions}
        </div>
      )}

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
      <ProviderProbe
        buildConfig={() => ({ provider: 'openai', openaiModel: m, ...(key ? { openaiApiKey: key } : {}) })}
        onPickModel={setM}
        testLabel="Test draft"
        listLabel="List draft models"
      />
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
          placeholder="List models, then choose one"
          className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800"
        />
      </label>
      {!m.trim() && (
        <p className="text-[11px] text-ink-400">
          This endpoint needs a model ID before chat requests can run. Use List models when the service is available.
        </p>
      )}
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
      <ProviderProbe
        buildConfig={() => ({ provider: 'anthropic', anthropicModel: m, ...(key ? { anthropicApiKey: key } : {}) })}
        onPickModel={setM}
        testLabel="Test draft"
        listLabel="List draft models"
      />
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
      <p className="text-[11px] text-ink-500 leading-relaxed">
        Ollama prompts and responses stay on the configured Ollama host. This can be your local machine,
        or another host on your LAN/server if you set a remote base URL.
      </p>
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
      <ProviderProbe
        buildConfig={() => ({ provider: 'ollama', ollamaModel: m, ollamaBaseUrl: url })}
        onPickModel={setM}
        testLabel="Run draft smoke test"
        listLabel="List draft models"
      />
      {saveError && <p className="text-[11px] text-red-600 font-mono">{saveError}</p>}
    </div>
  );
}

// ── OpenRouter / custom endpoint detail form ─────────────────────────────────

interface OpenAICompatibleDetailProps {
  preset: AiOpenAICompatiblePresetId;
  model: string;
  baseUrl: string;
  hasKey: boolean;
  mode: OpenAICompatibleMode;
  allowedPresets?: AiOpenAICompatiblePresetId[];
  guidance?: string;
  sharedConfigNotice?: string;
  onSave: (preset: AiOpenAICompatiblePresetId, model: string, baseUrl: string, key?: string) => Promise<void>;
}

function openAICompatibleDefaults(presetId: AiOpenAICompatiblePresetId, mode: OpenAICompatibleMode) {
  const presetConfig = presetFor(presetId);
  if (presetId === 'custom' && mode === 'cloud') {
    return { ...presetConfig, baseUrl: CLOUD_CUSTOM_BASE_URL, requiresKey: true };
  }
  return presetConfig;
}

function openAICompatiblePresetMatchesMode(
  presetId: AiOpenAICompatiblePresetId,
  endpointUrl: string,
  mode: OpenAICompatibleMode,
): boolean {
  const urlIsLocal = isLikelyLocalUrl(endpointUrl);
  if (mode === 'local') {
    return LOCAL_METHOD_PRESETS.has(presetId) && urlIsLocal;
  }
  if (presetId === 'custom') {
    return endpointUrl.trim().length > 0 && !urlIsLocal;
  }
  return CLOUD_COMPATIBLE_PRESETS.has(presetId);
}

function isUnsafeCloudEndpoint(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true;
  if (isLikelyLocalUrl(trimmed)) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol !== 'https:';
  } catch {
    return true;
  }
}

function preferredOpenAICompatiblePreset(
  presetList: Array<{ id: AiOpenAICompatiblePresetId }>,
  mode: OpenAICompatibleMode,
): AiOpenAICompatiblePresetId {
  const preferred = mode === 'local' ? LOCAL_COMPATIBLE_DEFAULT_PRESET : CLOUD_COMPATIBLE_DEFAULT_PRESET;
  if (presetList.some((item) => item.id === preferred)) return preferred;
  return presetList.find((item) => item.id !== 'custom')?.id ?? presetList[0]?.id ?? preferred;
}

interface OpenAICompatibleDraftState {
  signature: string;
  selectedPreset: AiOpenAICompatiblePresetId;
  model: string;
  url: string;
  key: string;
}

function OpenAICompatibleDetail({ preset, model, baseUrl, hasKey, mode, allowedPresets, guidance, sharedConfigNotice, onSave }: OpenAICompatibleDetailProps) {
  const presetList = (allowedPresets && allowedPresets.length > 0)
    ? OPENAI_COMPATIBLE_PRESETS.filter((item) => allowedPresets.includes(item.id))
    : OPENAI_COMPATIBLE_PRESETS;
  const currentPresetFitsCard = presetList.some((item) => item.id === preset)
    && openAICompatiblePresetMatchesMode(preset, baseUrl, mode);
  const draftPreset = currentPresetFitsCard ? preset : preferredOpenAICompatiblePreset(presetList, mode);
  const draftDefaults = openAICompatibleDefaults(draftPreset, mode);
  const draftUrl = currentPresetFitsCard ? baseUrl : draftDefaults.baseUrl;
  const draftModel = currentPresetFitsCard ? model : draftDefaults.model;
  const draftSignature = `${mode}|${draftPreset}|${draftModel}|${draftUrl}`;
  const [draft, setDraft] = useState<OpenAICompatibleDraftState>(() => ({
    signature: draftSignature,
    selectedPreset: draftPreset,
    model: draftModel,
    url: draftUrl,
    key: '',
  }));
  const currentDraft = draft.signature === draftSignature
    ? draft
    : {
        signature: draftSignature,
        selectedPreset: draftPreset,
        model: draftModel,
        url: draftUrl,
        key: '',
      };
  const selectedPreset = currentDraft.selectedPreset;
  const m = currentDraft.model;
  const url = currentDraft.url;
  const key = currentDraft.key;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const selected = openAICompatibleDefaults(selectedPreset, mode);
  const intro = mode === 'local'
    ? 'Use this for local OpenAI-compatible servers such as LM Studio, vLLM, llama.cpp, or LocalAI. Configure a localhost or local-network URL when you want inference handled by your own server.'
    : 'Use this for hosted OpenAI-compatible APIs such as OpenRouter, Groq, Mistral, Together, Fireworks, or a custom HTTPS endpoint. Requests are sent to that external service and usually require an API key.';
  const urlLabel = mode === 'local' ? 'Local server URL' : 'Cloud endpoint URL';
  const keyPlaceholder = hasKey
    ? '(stored - enter new value to update)'
    : selected.requiresKey
      ? 'required for this endpoint'
      : mode === 'local'
        ? 'optional for most local servers'
        : 'usually required for cloud endpoints';
  const cloudCustomUnsafe = mode === 'cloud' && selectedPreset === 'custom' && isUnsafeCloudEndpoint(url);
  const saveDisabled = saving || cloudCustomUnsafe;

  const updateDraft = (patch: Partial<Omit<OpenAICompatibleDraftState, 'signature'>>) => {
    setDraft({ ...currentDraft, ...patch });
  };

  const changePreset = (next: AiOpenAICompatiblePresetId) => {
    const presetConfig = openAICompatibleDefaults(next, mode);
    updateDraft({ selectedPreset: next, url: presetConfig.baseUrl, model: presetConfig.model });
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await onSave(selectedPreset, m, url, key || undefined);
      updateDraft({ key: '' });
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
      <p className="text-[11px] text-ink-500 leading-relaxed">
        {intro}
      </p>
      {mode === 'cloud' && (
        <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          Cloud endpoint selected: idea content leaves this machine and is sent to the configured provider.
        </div>
      )}
      {guidance && (
        <p className="text-[11px] text-ink-500 leading-relaxed">{guidance}</p>
      )}
      {sharedConfigNotice && (
        <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          {sharedConfigNotice}
        </div>
      )}
      <label className="block text-xs text-ink-500">
        Preset
        <select
          value={selectedPreset}
          onChange={(event) => changePreset(event.target.value as AiOpenAICompatiblePresetId)}
          className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800"
        >
          {allowedPresets ? (
            presetList.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))
          ) : (
            <>
              <optgroup label="Local servers (stays on this machine)">
                {OPENAI_COMPATIBLE_PRESETS.filter((p) => LOCAL_OPTGROUP_PRESETS.has(p.id)).map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </optgroup>
              <optgroup label="Cloud / external services">
                {OPENAI_COMPATIBLE_PRESETS.filter((p) => CLOUD_COMPATIBLE_PRESETS.has(p.id)).map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </optgroup>
            </>
          )}
        </select>
      </label>
      <label className="block text-xs text-ink-500">
        {urlLabel}
        <input
          value={url}
          onChange={(e) => updateDraft({ url: e.target.value })}
          className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800"
        />
      </label>
      {cloudCustomUnsafe && (
        <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
          Custom cloud endpoints must use a remote HTTPS URL (not localhost or local-network addresses).
        </div>
      )}
      <label className="block text-xs text-ink-500">
        Model
        <input
          value={m}
          onChange={(e) => updateDraft({ model: e.target.value })}
          placeholder="List models, then choose one"
          className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800"
        />
      </label>
      {!m.trim() && (
        <p className="text-[11px] text-ink-400">
          This endpoint needs a model ID before chat requests can run. Use List draft models when the service is available.
        </p>
      )}
      <label className="block text-xs text-ink-500">
        API key
        <input
          type="password"
          value={key}
          onChange={(e) => updateDraft({ key: e.target.value })}
          placeholder={keyPlaceholder}
          className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800 placeholder:text-ink-300"
        />
      </label>
      <button
        type="button"
        onClick={save}
        disabled={saveDisabled}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-sage-600 hover:bg-sage-700 disabled:bg-ink-300 text-white rounded-card transition-colors"
      >
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : saved ? <Check className="w-3 h-3" /> : null}
        {saved ? 'Saved' : 'Save'}
      </button>
      <ProviderProbe
        buildConfig={() => ({
          provider: 'openai-compatible',
          openaiCompatiblePreset: selectedPreset,
          openaiCompatibleModel: m,
          openaiCompatibleBaseUrl: url,
          ...(key ? { openaiCompatibleApiKey: key } : {}),
        })}
        onPickModel={(nextModel) => updateDraft({ model: nextModel })}
        testLabel="Test draft"
        listLabel="List draft models"
      />
      {saveError && <p className="text-[11px] text-red-600 font-mono">{saveError}</p>}
    </div>
  );
}

interface ServiceMethodOption {
  id: string;
  label: string;
  capability: 'chat' | 'agent' | 'chat+agent';
  availability?: AiMethodCapability['availability'];
  availabilityReason?: string;
}

function methodCapabilityLabel(capability: ServiceMethodOption['capability']): string {
  if (capability === 'chat') return 'chat/model routing';
  if (capability === 'agent') return 'file-producing agent';
  return 'chat + file agent';
}

function optionFromMethodCapability(method: AiMethodCapability): ServiceMethodOption {
  const capability: ServiceMethodOption['capability'] = method.channel === 'file-agent'
    ? 'agent'
    : 'chat';
  return {
    id: method.id,
    label: method.label,
    capability,
    availability: method.availability,
    availabilityReason: method.availabilityReason,
  };
}

function ServiceMethodSwitch({
  title,
  value,
  onChange,
  options,
}: {
  title: string;
  value: string;
  onChange: (next: string) => void;
  options: ServiceMethodOption[];
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-mono uppercase tracking-wider text-ink-500">{title}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = value === option.id;
          const disabled = option.availability === 'unavailable';
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              disabled={disabled}
              className={`px-2.5 py-1.5 rounded-card border text-[11px] transition-colors ${
                active
                  ? 'border-sage-300 bg-sage-50 text-sage-800'
                  : 'border-ink-200 bg-paper text-ink-600 hover:border-sage-300 hover:text-sage-700'
              } ${disabled ? 'opacity-60 cursor-not-allowed hover:border-ink-200 hover:text-ink-600' : ''}`}
            >
              <span className="font-medium">{option.label}</span>
              <span className="ml-2 font-mono text-[10px] text-ink-400">{methodCapabilityLabel(option.capability)}</span>
              {option.availability === 'auth-required' && <span className="ml-2 font-mono text-[10px] text-amber-600">auth required</span>}
              {option.availability === 'unavailable' && <span className="ml-2 font-mono text-[10px] text-red-600">unavailable</span>}
            </button>
          );
        })}
      </div>
      {options.find((option) => option.id === value)?.availabilityReason && (
        <p className="text-[11px] text-ink-500">
          {options.find((option) => option.id === value)?.availabilityReason}
        </p>
      )}
    </div>
  );
}

// ── Privacy notice ────────────────────────────────────────────────────────────

// Used for the dropdown optgroup filter only — 'custom' belongs in the local group
// because its default URL is localhost and it requires no key.
const LOCAL_OPTGROUP_PRESETS = new Set(['lm-studio', 'vllm', 'llama-cpp', 'localai', 'custom']);
const CLOUD_COMPATIBLE_PRESETS = new Set(['openrouter', 'groq', 'mistral', 'together', 'fireworks']);

// Used for data-residency logic only — 'custom' is excluded because users can point it
// at any URL; we cannot claim local residency without knowing the actual configured host.
const LOCAL_RESIDENCY_PRESETS = new Set(['lm-studio', 'vllm', 'llama-cpp', 'localai']);

type DataResidency = 'local' | 'cloud' | 'mixed';

function isLikelyLocalUrl(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const hostname = new URL(value.trim()).hostname.toLowerCase();
    return hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '::1'
      || hostname.endsWith('.local');
  } catch {
    return false;
  }
}

/**
 * Infers which local server type was last configured so the dropdown
 * initialises to a sensible value on first render.
 */
function initialLocalServerType(ai: AiPublicConfig): LocalServerType {
  // Use the split local field; fall back to the legacy combined field for older configs.
  const preset = ai.localOpenaiCompatiblePreset ?? ai.openaiCompatiblePreset;
  const url    = ai.localOpenaiCompatibleBaseUrl ?? ai.openaiCompatibleBaseUrl;
  if (preset === 'lm-studio'  && isLikelyLocalUrl(url)) return 'lm-studio';
  if (preset === 'vllm'       && isLikelyLocalUrl(url)) return 'vllm';
  if (preset === 'llama-cpp'  && isLikelyLocalUrl(url)) return 'llama-cpp';
  if (preset === 'localai'    && isLikelyLocalUrl(url)) return 'localai';
  if (preset === 'custom'     && isLikelyLocalUrl(url)) return 'custom-local';
  return 'ollama';
}

function dataResidency(ai: AiPublicConfig): DataResidency {
  if (ai.provider === 'ollama') return 'local';
  if (ai.provider === 'openai-compatible') {
    // For residency, check the default provider instance to pick the right split config.
    const isLocalInstance = ai.defaultProviderInstanceId === 'local-openai-compatible';
    const preset = (isLocalInstance ? ai.localOpenaiCompatiblePreset : ai.cloudOpenaiCompatiblePreset) as string;
    const url    = isLocalInstance ? ai.localOpenaiCompatibleBaseUrl : ai.cloudOpenaiCompatibleBaseUrl;
    if (preset === 'custom') return 'mixed';
    if (isLikelyLocalUrl(url)) return 'local';
    if (CLOUD_COMPATIBLE_PRESETS.has(preset)) return 'cloud';
    if (LOCAL_RESIDENCY_PRESETS.has(preset)) return 'cloud';
    return 'mixed'; // unknown endpoint — URL is user-configured
  }
  return 'cloud';
}

function cloudProviderLabel(ai: AiPublicConfig): string {
  if (ai.provider === 'openai') return aiProviderLabel('openai');
  if (ai.provider === 'anthropic') return aiProviderLabel('anthropic');
  if (ai.provider === 'claude-account') return aiProviderLabel('claude-account');
  if (ai.provider === 'codex-account') return aiProviderLabel('codex-account');
  if (ai.provider === 'openai-compatible') {
    const isLocal = ai.defaultProviderInstanceId === 'local-openai-compatible';
    const preset = presetFor(isLocal ? ai.localOpenaiCompatiblePreset : ai.cloudOpenaiCompatiblePreset);
    return preset.label;
  }
  return 'the AI provider';
}

/**
 * Derive data residency for the PrivacyNotice.
 *
 * Priority order:
 *  1. Preflight result — authoritative because the backend resolves the full
 *     feature config including feature overrides.
 *  2. Provider-instance registry — `dataResidency` field set by the backend
 *     for the default instance; avoids hard-coding provider logic in the UI.
 *  3. Legacy fallback — preset/URL heuristics for the openai-compatible split.
 */
function deriveResidency(
  ai: AiPublicConfig,
  preflight: AiPreflightResult | null | undefined,
): DataResidency {
  // 1. Preflight is authoritative.
  if (preflight != null) {
    if (preflight.local) return 'local';
    const leavesDevice = preflight.contentLeavesDevice ?? preflight.contentLeavesMachine;
    if (leavesDevice) return 'cloud';
    return 'mixed';
  }

  // 2. Use provider-instance registry when available.
  const defaultInstance = ai.providerInstances[ai.defaultProviderInstanceId];
  if (defaultInstance) {
    if (defaultInstance.dataResidency === 'local') return 'local';
    if (defaultInstance.dataResidency === 'cloud') return 'cloud';
    // 'user-controlled' falls through to legacy heuristic.
  }

  // 3. Legacy heuristic (openai-compatible split).
  return dataResidency(ai);
}

/**
 * Return a human-readable label for the default provider instance, used in
 * PrivacyNotice copy. Falls back to `cloudProviderLabel()` which uses the
 * legacy provider/preset fields.
 */
function defaultInstanceLabel(ai: AiPublicConfig): string {
  const instance = ai.providerInstances[ai.defaultProviderInstanceId];
  if (instance?.label) return instance.label;
  return cloudProviderLabel(ai);
}

/**
 * True when the default provider uses account login (OAuth/app-server) rather
 * than a direct API key. Account providers send content to cloud servers and
 * need distinct copy to avoid implying a direct key relationship.
 */
function isAccountLoginProvider(ai: AiPublicConfig): boolean {
  const instance = ai.providerInstances[ai.defaultProviderInstanceId];
  if (instance) return instance.family === 'account';
  return ai.provider === 'claude-account' || ai.provider === 'codex-account';
}

function PrivacyNotice({ ai, preflight }: { ai: AiPublicConfig; preflight?: AiPreflightResult | null }) {
  const residency = deriveResidency(ai, preflight);
  const providerLabel = defaultInstanceLabel(ai);
  const isAccount = isAccountLoginProvider(ai);

  // For local-instance openai-compatible with 'custom' preset, we cannot claim
  // local residency even if the current URL looks local — user can change it.
  const isLocalInstance = ai.defaultProviderInstanceId === 'local-openai-compatible';
  const activePreset = isLocalInstance ? ai.localOpenaiCompatiblePreset : ai.cloudOpenaiCompatiblePreset;
  const isUserControlledCustom = ai.provider === 'openai-compatible' && activePreset === 'custom';

  const effectiveResidency: DataResidency = isUserControlledCustom ? 'mixed' : residency;

  if (effectiveResidency === 'local') {
    const localLabel = ai.provider === 'ollama' ? 'Ollama' : providerLabel;
    return (
      <div className="flex items-start gap-2.5 px-3 py-2.5 bg-sage-50 border border-sage-200 rounded-card">
        <Lock className="w-4 h-4 text-sage-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-sage-800">Current default provider runs locally</p>
          <p className="text-xs text-sage-700 mt-0.5 leading-relaxed">
            The global default (<span className="font-semibold">{localLabel}</span>) sends idea
            content only to the configured local host. Individual Feature Defaults may route to
            different providers. To keep every AI feature local, set local providers for each
            Feature Default or enable{' '}
            <span className="font-medium">Local-only mode</span> in Advanced guardrails.
          </p>
        </div>
      </div>
    );
  }

  if (effectiveResidency === 'cloud') {
    const serverDescription = isAccount
      ? `${providerLabel}'s servers via your account login`
      : `${providerLabel}'s servers`;
    return (
      <div className="flex items-start gap-2.5 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-card">
        <Shield className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-amber-800">
            Idea content is sent to <span className="font-semibold">{providerLabel}</span>
          </p>
          <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
            When AI features run, field content from your ideas is sent to{' '}
            <span className="font-semibold">{serverDescription}</span> for processing.
            To keep all inference local, switch to Ollama or a local custom endpoint (LM Studio, vLLM, llama.cpp).
          </p>
        </div>
      </div>
    );
  }

  // mixed (custom endpoint — location is user-configured)
  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5 bg-ink-50 border border-ink-200 rounded-card">
      <Shield className="w-4 h-4 text-ink-400 mt-0.5 shrink-0" />
      <div>
        <p className="text-sm font-medium text-ink-700">Custom endpoint — data residency is user-configured</p>
        <p className="text-xs text-ink-500 mt-0.5 leading-relaxed">
          Whether idea content stays on-machine or leaves depends on the configured endpoint URL.
          Local presets (LM Studio, vLLM, llama.cpp, LocalAI) keep inference on this machine;
          cloud presets (OpenRouter, Groq, Mistral, Together, Fireworks) send content to external servers.
          Check the Custom endpoint card to confirm your preset and base URL.
        </p>
      </div>
    </div>
  );
}

// ── Usage audit section ───────────────────────────────────────────────────────

const ROUTE_LABELS: Record<string, string> = {
  'thinking-partner': 'Thinking Partner',
  'field-suggestions': 'Field suggestions',
  'field-suggestions:conversation': 'Field suggestions (chat)',
  'health-check': 'Health Check',
  'discover-insights': 'Discover insights',
};

function routeLabel(route: string): string {
  if (isAiProviderId(route)) return aiProviderLabel(route);
  return ROUTE_LABELS[route] ?? route;
}

function transportLabel(transport: string): string {
  switch (transport) {
    case 'openai-responses':
      return 'OpenAI Responses';
    case 'anthropic-messages':
      return 'Anthropic Messages';
    case 'ollama-chat':
      return 'Ollama chat';
    case 'openai-chat-completions':
      return 'OpenAI-compatible chat';
    case 'claude-account-native':
      return 'Claude account';
    case 'codex-account-app-server':
      return 'Codex account';
    default:
      return transport;
  }
}

function providerFamilyLabel(family: string): string {
  switch (family) {
    case 'api':
      return 'API key';
    case 'local':
      return 'Local';
    case 'custom-endpoint':
      return 'Custom endpoint';
    case 'account':
      return 'Account';
    default:
      return family;
  }
}

interface ExecutionMetadataDisplay {
  providerFamily?: string;
  transport?: string;
  requestedModel?: string;
  resolvedModelId?: string;
  contentLeavesDevice?: boolean;
}

function executionMetadataLabel(row: ExecutionMetadataDisplay): string | null {
  const parts: string[] = [];
  if (row.providerFamily) parts.push(providerFamilyLabel(row.providerFamily));
  if (row.transport) parts.push(transportLabel(row.transport));
  if (typeof row.contentLeavesDevice === 'boolean') {
    parts.push(row.contentLeavesDevice ? 'leaves this device' : 'stays on this device');
  }
  if (row.resolvedModelId && row.resolvedModelId !== row.requestedModel) {
    parts.push(`resolved: ${row.resolvedModelId}`);
  }
  return parts.length ? parts.join(' · ') : null;
}

interface UsageAuditSectionProps {
  detail: AiUsageDetail | null;
  basicUsage: AiUsageSummary | null;
}

type UsageTab = 'feature' | 'provider' | 'model' | 'events';

function UsageBucketTable({ rows }: { rows: AiUsageBucket[] }) {
  if (!rows.length) return <p className="text-[11px] text-ink-400 italic">No activity in this window.</p>;
  return (
    <div className="border border-ink-100 rounded-card overflow-hidden">
      <table className="w-full text-[11px]">
        <thead className="bg-paper-warm">
          <tr>
            <th className="text-left px-3 py-1.5 font-mono font-semibold text-ink-500 uppercase tracking-wide">Name</th>
            <th className="text-right px-3 py-1.5 font-mono font-semibold text-ink-500 uppercase tracking-wide">Reqs</th>
            <th className="text-right px-3 py-1.5 font-mono font-semibold text-ink-500 uppercase tracking-wide">Tokens</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-50">
          {rows.map((row, i) => {
            const metadata = executionMetadataLabel(row);
            return (
              <tr key={i} className="hover:bg-paper-warm transition-colors">
                <td className="px-3 py-1.5 text-ink-700 font-medium">
                  <div>{routeLabel(row.feature ?? row.provider ?? row.model ?? row.key)}</div>
                  {metadata ? <div className="mt-0.5 text-[10px] font-normal text-ink-400">{metadata}</div> : null}
                </td>
                <td className="px-3 py-1.5 text-ink-500 font-mono text-right">{row.count}</td>
                <td className="px-3 py-1.5 text-ink-700 text-right font-mono">{fmtTokens(row.totalTokens)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AuditEventTable({ events }: { events: AiAuditEvent[] }) {
  if (!events.length) return <p className="text-[11px] text-ink-400 italic">No recent guardrail events.</p>;
  return (
    <div className="border border-ink-100 rounded-card overflow-hidden">
      <table className="w-full text-[11px]">
        <thead className="bg-paper-warm">
          <tr>
            <th className="text-left px-3 py-1.5 font-mono font-semibold text-ink-500 uppercase tracking-wide">Event</th>
            <th className="text-left px-3 py-1.5 font-mono font-semibold text-ink-500 uppercase tracking-wide">Feature · Provider</th>
            <th className="text-left px-3 py-1.5 font-mono font-semibold text-ink-500 uppercase tracking-wide">Message</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-50">
          {events.map((ev) => {
            const metadata = executionMetadataLabel(ev);
            const provider = isAiProviderId(ev.provider) ? aiProviderLabel(ev.provider) : ev.provider;
            return (
              <tr key={ev.id} className="hover:bg-paper-warm transition-colors">
                <td className="px-3 py-1.5 font-mono">
                  <span className={ev.type === 'guardrail_denied' ? 'text-amber-700' : 'text-red-600'}>
                    {ev.type === 'guardrail_denied' ? 'denied' : 'error'}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-ink-500">
                  <div>{routeLabel(ev.feature)} · {provider}</div>
                  {metadata ? <div className="mt-0.5 text-[10px] text-ink-400">{metadata}</div> : null}
                </td>
                <td className="px-3 py-1.5 text-ink-600 max-w-[200px] truncate" title={ev.message}>
                  {ev.message}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function UsageAuditSection({ detail, basicUsage }: UsageAuditSectionProps) {
  const [activeTab, setActiveTab] = useState<UsageTab>('feature');

  const last24h = detail ? detail.raw.windows.last24h : (basicUsage?.last24h ?? 0);
  const last7d  = detail ? detail.raw.windows.last7d  : (basicUsage?.last7d  ?? 0);
  if (!detail && !basicUsage) return null;

  const byFeature = detail?.raw.byFeature ?? [];
  const byProvider = detail?.raw.byProvider ?? [];
  const byModel = detail?.raw.byModel ?? [];
  const auditEvents = detail?.raw.recentAuditEvents ?? [];
  const hasDetail = Boolean(detail);

  type TabDef = { id: UsageTab; label: string };
  const tabs: TabDef[] = [
    { id: 'feature', label: 'By feature' },
    { id: 'provider', label: 'By provider' },
    { id: 'model', label: 'By model' },
    { id: 'events', label: `Events${auditEvents.length ? ` (${auditEvents.length})` : ''}` },
  ];

  return (
    <div className="space-y-2">
      <p className="text-xs font-mono uppercase tracking-wider text-ink-500">Usage · Last 24 h / 7 d</p>
      <div className="font-mono text-[11px] text-ink-400 space-y-0.5">
        <div><span className="text-ink-700 font-semibold">{fmtTokens(last24h)}</span> tokens · 24 h</div>
        <div><span className="text-ink-700 font-semibold">{fmtTokens(last7d)}</span> tokens · 7 d</div>
      </div>

      {hasDetail ? (
        <div className="space-y-2">
          {/* Tab bar */}
          <div className="flex gap-0 border border-ink-100 rounded-card overflow-hidden w-fit">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1 text-[11px] font-medium transition-colors
                  ${activeTab === tab.id
                    ? 'bg-sage-100 text-sage-800 border-r border-ink-100'
                    : 'bg-paper-warm text-ink-400 hover:text-ink-700 border-r border-ink-100'
                  } last:border-r-0`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {activeTab === 'feature'  && <UsageBucketTable rows={byFeature} />}
          {activeTab === 'provider' && <UsageBucketTable rows={byProvider} />}
          {activeTab === 'model'    && <UsageBucketTable rows={byModel} />}
          {activeTab === 'events'   && <AuditEventTable events={auditEvents} />}
        </div>
      ) : (
        <p className="text-[11px] text-ink-400">
          Feature-level breakdown requires the server's <code className="font-mono">GET /api/ai/usage/detail</code> endpoint.
        </p>
      )}
    </div>
  );
}

// ── Advanced guardrails section ───────────────────────────────────────────────

const FEATURE_LABELS: Record<AiFeatureId, string> = {
  'thinking-partner': 'Thinking Partner',
  'field-suggestions': 'Field suggestions',
  'health-check': 'Health Check',
  'discover-insights': 'Discover insights',
  'default': 'Other / default',
};

const PROVIDER_LABELS: Record<AiProviderId, string> = {
  openai: aiProviderLabel('openai'),
  anthropic: aiProviderLabel('anthropic'),
  ollama: aiProviderLabel('ollama'),
  'openai-compatible': aiProviderLabel('openai-compatible'),
  'claude-account': aiProviderLabel('claude-account'),
  'codex-account': aiProviderLabel('codex-account'),
};

const REMOTE_PROVIDERS: AiProviderId[] = [
  'openai',
  'anthropic',
  'claude-account',
  'codex-account',
];
const FEATURE_IDS: AiFeatureId[] = ['thinking-partner', 'field-suggestions', 'health-check', 'discover-insights'];
const PROVIDER_IDS: AiProviderId[] = [
  'openai',
  'anthropic',
  'claude-account',
  'codex-account',
  'ollama',
  'openai-compatible',
];

interface AdvancedGuardrailsSectionProps {
  guardrails: AiGuardrailsConfig;
  providerInstances: AiPublicConfig['providerInstances'];
  onSave: (patch: Partial<AiGuardrailsConfig>) => Promise<void>;
}

function AdvancedGuardrailsSection({ guardrails, providerInstances, onSave }: AdvancedGuardrailsSectionProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Local drafts
  const [featureEnabled, setFeatureEnabled] = useState<Partial<Record<AiFeatureId, boolean>>>(guardrails.featureEnabled);
  const [providerEnabled, setProviderEnabled] = useState<Partial<Record<AiProviderId, boolean>>>(guardrails.providerEnabled);
  const [providerInstanceEnabled, setProviderInstanceEnabled] = useState<Partial<Record<AiProviderInstanceId, boolean>>>(guardrails.providerInstanceEnabled);
  const [warnOnRemote, setWarnOnRemote] = useState(guardrails.warnOnRemoteProvider);
  const [requireConfirm, setRequireConfirm] = useState(guardrails.requireConfirmationForRemoteProvider);
  const [featureBudgets, setFeatureBudgets] = useState<Partial<Record<AiFeatureId, number>>>(guardrails.featureDailyTokenBudgets);
  const [providerInstanceBudgets, setProviderInstanceBudgets] = useState<Partial<Record<AiProviderInstanceId, number>>>(guardrails.providerInstanceDailyTokenBudgets);
  const [allowedModelsText, setAllowedModelsText] = useState(guardrails.allowedModels.join(', '));
  const [saveError, setSaveError] = useState<string | null>(null);

  const providerInstanceRows = Object.values(providerInstances);
  const remoteProviderInstances = providerInstanceRows.filter((instance) => !instance.local);
  const privacyModeOn = warnOnRemote && requireConfirm && remoteProviderInstances.every((instance) => providerInstanceEnabled[instance.id] === false);

  function togglePrivacyMode() {
    if (privacyModeOn) {
      // turn off: re-enable remote providers, clear warn+confirm
      setProviderEnabled(prev => {
        const next = { ...prev };
        REMOTE_PROVIDERS.forEach(p => { next[p] = true; });
        next['openai-compatible'] = true;
        return next;
      });
      setProviderInstanceEnabled(prev => {
        const next = { ...prev };
        providerInstanceRows.forEach((instance) => { next[instance.id] = true; });
        return next;
      });
      setWarnOnRemote(false);
      setRequireConfirm(false);
    } else {
      // turn on: disable remote providers, set warn+confirm
      setProviderEnabled(prev => {
        const next = { ...prev };
        REMOTE_PROVIDERS.forEach(p => { next[p] = false; });
        next['openai-compatible'] = true;
        return next;
      });
      setProviderInstanceEnabled(prev => {
        const next = { ...prev };
        providerInstanceRows.forEach((instance) => { next[instance.id] = instance.local; });
        return next;
      });
      setWarnOnRemote(true);
      setRequireConfirm(true);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    const models = allowedModelsText
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    try {
      await onSave({
        featureEnabled,
        providerEnabled,
        providerInstanceEnabled,
        warnOnRemoteProvider: warnOnRemote,
        requireConfirmationForRemoteProvider: requireConfirm,
        featureDailyTokenBudgets: featureBudgets,
        providerInstanceDailyTokenBudgets: providerInstanceBudgets,
        allowedModels: models,
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-ink-400
                   hover:text-sage-700 transition-colors"
      >
        <ChevronRight className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} />
        Advanced controls
      </button>

      {open && (
        <div className="mt-3 space-y-5">

          {/* Privacy mode quick-toggle */}
          <div className="flex items-start gap-3 p-3 bg-paper-warm border border-ink-100 rounded-card">
            <Lock className="w-4 h-4 text-sage-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-ink-700">Local-only mode</p>
                  <p className="text-[11px] text-ink-500 leading-relaxed mt-0.5">
                    Blocks cloud API/account routes while leaving Ollama and local OpenAI-compatible endpoints available.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={togglePrivacyMode}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full
                    border-2 border-transparent transition-colors
                    ${privacyModeOn ? 'bg-sage-500' : 'bg-ink-200'}`}
                  aria-checked={privacyModeOn}
                  role="switch"
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow
                    transition-transform ${privacyModeOn ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Remote-provider warning toggles */}
          <div className="space-y-2">
            <p className="text-[11px] font-mono uppercase tracking-wider text-ink-400">Cloud provider alerts</p>
            <p className="text-[10px] text-ink-400 leading-relaxed">
              These affect the AI Assistance modal (✨ buttons on idea fields).
              When a cloud provider is about to be used, the modal will pause with a warning
              or ask for confirmation before running.
            </p>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={warnOnRemote}
                onChange={e => setWarnOnRemote(e.target.checked)}
                className="w-3.5 h-3.5 accent-sage-600"
              />
              <span className="text-xs text-ink-700">Show a warning in the AI modal before sending to a cloud provider</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={requireConfirm}
                onChange={e => setRequireConfirm(e.target.checked)}
                className="w-3.5 h-3.5 accent-sage-600"
              />
              <span className="text-xs text-ink-700">Require a "Confirm & run" click in the AI modal before each cloud request</span>
            </label>
          </div>

          {/* Feature enable/disable */}
          <div className="space-y-2">
            <p className="text-[11px] font-mono uppercase tracking-wider text-ink-400">Feature enable</p>
            <div className="space-y-1.5">
              {FEATURE_IDS.map((fid) => {
                const enabled = featureEnabled[fid] !== false;
                return (
                  <label key={fid} className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={e => setFeatureEnabled(prev => ({ ...prev, [fid]: e.target.checked }))}
                      className="w-3.5 h-3.5 accent-sage-600"
                    />
                    <span className="text-xs text-ink-700">{FEATURE_LABELS[fid]}</span>
                    {!enabled && (
                      <span className="text-[10px] text-amber-600 font-medium">disabled</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Provider enable/disable */}
          <div className="space-y-2">
            <p className="text-[11px] font-mono uppercase tracking-wider text-ink-400">Provider enable</p>
            <div className="space-y-1.5">
              {PROVIDER_IDS.map((pid) => {
                const enabled = providerEnabled[pid] !== false;
                return (
                  <label key={pid} className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={e => setProviderEnabled(prev => ({ ...prev, [pid]: e.target.checked }))}
                      className="w-3.5 h-3.5 accent-sage-600"
                    />
                    <span className="text-xs text-ink-700">{PROVIDER_LABELS[pid]}</span>
                    {!enabled && (
                      <span className="text-[10px] text-amber-600 font-medium">disabled</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Provider instance enable/disable */}
          <div className="space-y-2">
            <p className="text-[11px] font-mono uppercase tracking-wider text-ink-400">Provider instance enable</p>
            <div className="space-y-1.5">
              {providerInstanceRows.map((instance) => {
                const enabled = providerInstanceEnabled[instance.id] !== false;
                return (
                  <label key={instance.id} className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={e => setProviderInstanceEnabled(prev => ({ ...prev, [instance.id]: e.target.checked }))}
                      className="w-3.5 h-3.5 accent-sage-600"
                    />
                    <span className="text-xs text-ink-700">{instance.label}</span>
                    <span className="text-[10px] text-ink-400">{instance.local ? 'local' : 'cloud/account'}</span>
                    {!enabled && (
                      <span className="text-[10px] text-amber-600 font-medium">disabled</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Per-feature daily token budgets */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] font-mono uppercase tracking-wider text-ink-400">Per-feature daily token caps</p>
              <span title="0 = inherits global budget"><Info className="w-3 h-3 text-ink-300" /></span>
            </div>
            <div className="space-y-2">
              {FEATURE_IDS.map((fid) => (
                <label key={fid} className="flex items-center gap-2">
                  <span className="text-[11px] text-ink-600 w-36 shrink-0">{FEATURE_LABELS[fid]}</span>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    placeholder="0 = global"
                    value={featureBudgets[fid] ?? 0}
                    onChange={e => {
                      const v = parseInt(e.target.value, 10);
                      setFeatureBudgets(prev => ({ ...prev, [fid]: isNaN(v) ? 0 : v }));
                    }}
                    className="w-28 px-2 py-1 text-[11px] font-mono border border-ink-100 rounded
                               bg-white text-ink-700 focus:outline-none focus:border-sage-400"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Per-provider-instance daily token budgets */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] font-mono uppercase tracking-wider text-ink-400">Per-provider-instance daily token caps</p>
              <span title="0 = no instance-specific cap"><Info className="w-3 h-3 text-ink-300" /></span>
            </div>
            <div className="space-y-2">
              {providerInstanceRows.map((instance) => (
                <label key={instance.id} className="flex items-center gap-2">
                  <span className="text-[11px] text-ink-600 w-44 shrink-0">{instance.label}</span>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    placeholder="0 = no cap"
                    value={providerInstanceBudgets[instance.id] ?? 0}
                    onChange={e => {
                      const v = parseInt(e.target.value, 10);
                      setProviderInstanceBudgets(prev => ({ ...prev, [instance.id]: isNaN(v) ? 0 : v }));
                    }}
                    className="w-28 px-2 py-1 text-[11px] font-mono border border-ink-100 rounded
                               bg-white text-ink-700 focus:outline-none focus:border-sage-400"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Model allowlist */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] font-mono uppercase tracking-wider text-ink-400">Model allowlist</p>
              <span title="Comma-separated. Empty = all models allowed."><Info className="w-3 h-3 text-ink-300" /></span>
            </div>
            <input
              type="text"
              value={allowedModelsText}
              onChange={e => setAllowedModelsText(e.target.value)}
              placeholder="gpt-4.1-mini, claude-3-haiku-20240307 … (empty = all)"
              className="w-full px-2 py-1.5 text-[11px] font-mono border border-ink-100 rounded
                         bg-white text-ink-700 focus:outline-none focus:border-sage-400"
            />
            <p className="text-[10px] text-ink-400">
              Comma-separated model IDs. When set, AI requests using any other model will be blocked.
            </p>
          </div>

          {/* Save */}
          {saveError && (
            <div className="flex items-center gap-1.5 text-[11px] text-red-600">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              {saveError}
            </div>
          )}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                       bg-sage-500 text-white rounded hover:bg-sage-600
                       disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            Save advanced settings
          </button>
        </div>
      )}
    </div>
  );
}

// ── Guardrails wrapper section ────────────────────────────────────────────────

interface GuardrailsSectionProps {
  ai: AiPublicConfig;
  onSaveBudget: (budget: number) => Promise<void>;
  onSaveGuardrails: (patch: Partial<AiGuardrailsConfig>) => Promise<void>;
}

function GuardrailsSection({ ai, onSaveBudget, onSaveGuardrails }: GuardrailsSectionProps) {
  const [detail, setDetail] = useState<AiUsageDetail | null>(null);
  const [basicUsage, setBasicUsage] = useState<AiUsageSummary | null>(null);
  const [preflight, setPreflight] = useState<AiPreflightResult | null>(null);

  useEffect(() => {
    // Try detail endpoint; fall back to basic totals.
    void getAiUsageDetail()
      .then(setDetail)
      .catch(() => void getAiUsage().then(setBasicUsage).catch(() => {}));
  }, []); // usage counters: mount-only is intentional

  useEffect(() => {
    // Re-run preflight whenever the global provider or its URL/preset changes so the
    // PrivacyNotice always reflects the current configuration, not a mount-time snapshot.
    void preflightAiRequest({ feature: 'default' })
      .then(setPreflight)
      .catch(() => {});
  }, [
    ai.provider,
    ai.defaultProviderInstanceId,
    ai.openaiCompatibleBaseUrl,
    ai.openaiCompatiblePreset,
    ai.localOpenaiCompatibleBaseUrl,
    ai.localOpenaiCompatiblePreset,
    ai.cloudOpenaiCompatibleBaseUrl,
    ai.cloudOpenaiCompatiblePreset,
  ]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1.5">
        <h3 className="text-xs font-mono uppercase tracking-wider text-ink-500">Usage & Guardrails</h3>
        <HelpButton
          helpId="guardrails"
          title="Usage & Guardrails"
          summary="Controls how much AI Seedbank uses and where your data goes. The token budget caps spending. The privacy notice shows whether idea content leaves this machine."
          details="Ollama and local custom endpoints (LM Studio, vLLM, llama.cpp, LocalAI) send content only to the configured local host. Cloud providers (OpenAI API, Anthropic API, OpenRouter, Groq, Mistral, and other external endpoints) send field content to their servers. Use Advanced controls to set per-feature budgets, provider/model allowlists, and local-only mode."
          manualSection="settings-ai"
          alwaysShow
        />
      </div>

      {/* Privacy / data-flow notice — enriched by preflight when available */}
      <PrivacyNotice ai={ai} preflight={preflight} />

      {/* Token budget */}
      <BudgetSection budget={ai.dailyTokenBudget} onSave={onSaveBudget} />

      {/* Usage / audit (tabs: by-feature, by-provider, events) */}
      <UsageAuditSection detail={detail} basicUsage={basicUsage} />

      {/* Live advanced guardrails controls */}
      <AdvancedGuardrailsSection
        guardrails={ai.guardrails}
        providerInstances={ai.providerInstances}
        onSave={onSaveGuardrails}
      />
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
            min={0}
            step={10000}
            value={draft}
            onChange={(e) => setLocalDraft(Number(e.target.value))}
            className="mt-1 w-36 px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800"
          />
        </label>
        <button
          type="button"
          onClick={() => setLocalDraft(0)}
          className="mb-0.5 px-3 py-1.5 text-xs font-medium border border-ink-200 text-ink-600 hover:border-sage-300 hover:text-sage-700 hover:bg-sage-50 rounded-card transition-colors"
        >
          No limit
        </button>
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
      {draft === 0 && <p className="text-[11px] text-ink-400">Daily budget enforcement is disabled. Per-minute rate limiting still applies.</p>}
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

// ── Per-feature routing ──────────────────────────────────────────────────────

const AI_FEATURE_ROWS: Array<{ id: AiFeatureId; label: string; detail: string; secondary?: boolean }> = [
  { id: 'thinking-partner',  label: 'Thinking Partner',  detail: 'Idea chat' },
  { id: 'field-suggestions', label: 'Field suggestions', detail: 'Ask AI on idea fields' },
  { id: 'health-check',      label: 'Health Check',      detail: 'AI summary on idea readiness' },
  { id: 'discover-insights', label: 'Discover insights', detail: 'Pattern analysis and cross-pollination' },
  // 'default' only applies to AI features not listed above — it does NOT cascade to or
  // override the known features. Listed last with secondary styling to avoid confusion.
  { id: 'default', label: 'Other features (fallback)', detail: 'Applies only to unnamed or future AI features — does not affect the features above', secondary: true },
];

function providerModel(ai: AiPublicConfig, provider: AiProviderId): string {
  if (provider === 'openai') return ai.openaiModel;
  if (provider === 'anthropic') return ai.anthropicModel;
  if (provider === 'claude-account') return ai.claudeAccountModel;
  if (provider === 'codex-account') return ai.codexAccountModel;
  if (provider === 'openai-compatible') {
    // Prefer whichever split slot matches the current default instance; fall back to legacy.
    const isLocal = ai.defaultProviderInstanceId === 'local-openai-compatible';
    return isLocal
      ? (ai.localOpenaiCompatibleModel || ai.openaiCompatibleModel)
      : (ai.cloudOpenaiCompatibleModel || ai.openaiCompatibleModel);
  }
  return ai.ollamaModel;
}

function openAIModelSupportsReasoningEffort(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return normalized.startsWith('gpt-5') || /^o[1-9](?:[-_.]|$)/.test(normalized);
}

function openAIModelSupportsTextVerbosity(model: string): boolean {
  return model.trim().toLowerCase().startsWith('gpt-5');
}

function routeModel(route: AiFeatureRoute, selectedInstance: AiPublicConfig['providerInstances'][AiProviderInstanceId] | null): string {
  return route.model?.trim() || selectedInstance?.configuredModel || '';
}

function providerSupportsEffort(provider: AiProviderId | 'default', providerInstanceId: AiProviderInstanceId | null, model: string): boolean {
  if (provider === 'default') return false;
  if (providerInstanceId === 'openai-api') return openAIModelSupportsReasoningEffort(model);
  return providerInstanceId === 'codex-account';
}

function providerSupportsVerbosity(providerInstanceId: AiProviderInstanceId | null, model: string): boolean {
  return providerInstanceId === 'openai-api' && openAIModelSupportsTextVerbosity(model);
}

function updateRouteControl<K extends 'effort' | 'verbosity'>(
  route: AiFeatureRoute,
  key: K,
  value: string,
): AiFeatureRoute {
  const next = { ...route } as AiFeatureRoute;
  if (key === 'effort') {
    if (value === 'minimal' || value === 'low' || value === 'medium' || value === 'high') next.effort = value as AiReasoningEffort;
    else delete next.effort;
  } else {
    if (value === 'low' || value === 'medium' || value === 'high') next.verbosity = value as AiTextVerbosity;
    else delete next.verbosity;
  }
  return next;
}

function providerLabel(provider: AiProviderId): string {
  return aiProviderLabel(provider);
}

function providerInstanceBadge(ai: AiPublicConfig, providerInstanceId: AiProviderInstanceId, model?: string): string {
  const instance = ai.providerInstances[providerInstanceId];
  if (!instance) {
    return `${providerLabel(ai.provider)} · ${model || 'choose a model'}`;
  }
  return `${instance.label} · ${model || instance.configuredModel || 'choose a model'}`;
}

interface FeatureRoutingSectionProps {
  ai: AiPublicConfig;
  providerStatuses: Partial<Record<AiProviderId, ProviderCardStatus>>;
  providerAvailability: Partial<Record<AiProviderId, { availability: AiMethodCapability['availability']; reason?: string; featureRoutable: boolean }>>;
  onSave: (routes: AiPublicConfig['featureRoutes']) => Promise<void>;
}

function FeatureRoutingSection({ ai, providerStatuses, providerAvailability, onSave }: FeatureRoutingSectionProps) {
  const [routes, setRoutes] = useState(ai.featureRoutes);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isLocalInstance = ai.defaultProviderInstanceId === 'local-openai-compatible';
  const openAICompatiblePreset = presetFor(
    isLocalInstance ? (ai.localOpenaiCompatiblePreset ?? ai.openaiCompatiblePreset)
                    : (ai.cloudOpenaiCompatiblePreset ?? ai.openaiCompatiblePreset),
  );
  const instanceRoutingOptions = Object.values(ai.providerInstances).filter((instance) => instance.featureRoutable);
  const firstInstanceForProvider = (provider: AiProviderId): AiProviderInstanceId | null => (
    instanceRoutingOptions.find((instance) => instance.provider === provider)?.id ?? null
  );
  const instanceForRoute = (route: AiFeatureRoute) => {
    if (route.provider === 'default') return null;
    const instanceId = route.providerInstanceId ?? firstInstanceForProvider(route.provider);
    return instanceId ? ai.providerInstances[instanceId] : null;
  };

  const updateRoute = (feature: AiFeatureId, route: AiFeatureRoute) => {
    setRoutes((current) => ({ ...current, [feature]: route }));
  };

  const save = async () => {
    // Synchronous gate: prevent saving routes to providers/methods marked unavailable
    // by the backend method-capability contract.
    const unavailableProviders = Object.values(routes).filter((route) => {
      if (route.provider === 'default') return false;
      const instanceId = route.providerInstanceId ?? firstInstanceForProvider(route.provider);
      if (!instanceId) return false;
      const instance = ai.providerInstances[instanceId];
      if (!instance) return false;
      return instance.available === 'unavailable';
    });
    if (unavailableProviders.length > 0) {
      const reasons = unavailableProviders
        .map((route) => instanceForRoute(route)?.availabilityReason ?? null)
        .filter(Boolean)
        .join(' ');
      setSaveError(
        `One or more features are routed to an unavailable method. Change those routes before saving.${reasons ? ` ${reasons}` : ''}`
      );
      return;
    }
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await onSave(routes);
      setRoutes(routes);
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
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-xs font-mono uppercase tracking-wider text-ink-500">Feature Defaults</h3>
            <HelpButton
              helpId="feature-defaults"
              title="Feature Defaults"
              summary="Route each AI feature to a specific provider and model, independently of the global default. 'Use global default' means a feature follows whatever provider you set as default."
              details="The Effective readout below each row shows exactly which provider and model will run — accounting for inheritance. Useful when you want a fast/cheap model for field suggestions but a smarter one for Thinking Partner."
              manualSection="settings-ai"
              alwaysShow
            />
          </div>
          <p className="text-xs text-ink-400 mt-1">
            Route each AI feature to the global provider or a specific chat/model-capable provider. Account login and API key methods are both eligible; file-producing agent methods are excluded from chat routing.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-sage-600 hover:bg-sage-700 disabled:bg-ink-300 text-white rounded-card transition-colors"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : saved ? <Check className="w-3 h-3" /> : null}
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>

      <div className="divide-y divide-ink-100 border border-ink-100 rounded-card bg-paper overflow-hidden">
        {AI_FEATURE_ROWS.map((feature) => {
          const route = routes[feature.id] ?? { provider: 'default' as const };
          const effective = ai.effectiveFeatureRoutes[feature.id];
          const selectedInstanceId = route.provider === 'default'
            ? null
            : (route.providerInstanceId ?? firstInstanceForProvider(route.provider));
          const selectedInstance = selectedInstanceId ? ai.providerInstances[selectedInstanceId] : null;
          const selectedProvider = route.provider === 'default' ? 'default' : route.provider;
          const selectedUnavailableReason =
            selectedProvider === 'default'
              ? null
              : selectedInstance?.availabilityReason
                ? selectedInstance.availabilityReason
              : selectedProvider === 'openai' && !ai.hasOpenAIKey
                ? 'OpenAI API key missing in the OpenAI API card.'
              : selectedProvider === 'anthropic' && !ai.hasAnthropicKey
                ? 'Anthropic API key missing in the Anthropic API card.'
                : selectedProvider === 'openai-compatible'
                  && openAICompatiblePreset.requiresKey
                  && !(ai.hasCloudOpenAICompatibleKey || ai.hasLocalOpenAICompatibleKey || ai.hasOpenAICompatibleKey)
                    ? 'This endpoint preset needs an API key — add it in the External / Cloud card.'
                    : providerAvailability[selectedProvider] && providerAvailability[selectedProvider]?.availability !== 'available'
                      ? (providerAvailability[selectedProvider]?.reason ?? 'Selected method is not available right now.')
                      : selectedProvider === 'ollama' && providerStatuses.ollama === 'unreachable'
                          ? 'Ollama host is unreachable. Check the Ollama base URL and daemon.'
                          : null;
          const providerHint =
            selectedProvider === 'default'
              ? 'Uses whichever provider is set as global default above.'
                : selectedUnavailableReason
                ? `Unavailable right now: ${selectedUnavailableReason}`
                : selectedProvider === 'claude-account'
                  ? (ai.claudeAccountAvailable
                    ? (ai.claudeAccountAuthenticated
                      ? 'Subscription login path (not API-key billing).'
                      : 'Claude account requires sign-in before routing features here.')
                    : 'Claude account login is not available in the current server configuration. Use the Anthropic API provider for Claude models.')
                  : selectedProvider === 'codex-account'
                    ? 'Codex account subscription transport — separate from OpenAI API billing. See the Codex account card for setup.'
                    : selectedProvider === 'openai-compatible'
                      ? 'Custom endpoint — accepts manual model IDs. Verify whether your preset is a local server or cloud service.'
                      : 'Provider is ready for this feature route.';
          const modelHint =
            selectedProvider === 'default'
              ? `Effective: ${providerInstanceBadge(ai, effective.providerInstanceId, effective.model)}`
              : selectedProvider === 'claude-account'
                ? 'Try aliases like claude-sonnet-latest. List models shows alias + resolved ID.'
              : selectedProvider === 'codex-account'
                  ? 'Use codex-recommended/codex-fast or a resolved catalog ID from List models.'
                  : selectedProvider === 'openai-compatible'
                    ? 'Enter a model ID manually (e.g. from OpenRouter, Groq, or your local server catalog).'
                    : selectedInstance
                      ? `Configured: ${selectedInstance.configuredModel || 'choose a model'}`
                      : `Effective: ${providerLabel(effective.provider)} · ${effective.model || 'choose a model'}`;
          return (
            <div
              key={feature.id}
              className={`grid gap-3 p-3 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-start ${
                feature.secondary ? 'opacity-60' : ''
              }`}
            >
              <div className="min-w-0">
                <p className={`text-sm text-ink-800 ${feature.secondary ? 'font-normal italic' : 'font-semibold'}`}>
                  {feature.label}
                </p>
                <p className="text-xs text-ink-400">{feature.detail}</p>
              </div>
              <label className="block text-xs text-ink-500">
                Provider
                <select
                  value={selectedProvider === 'default' ? 'default' : (selectedInstanceId ?? '')}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === 'default') {
                      updateRoute(feature.id, { provider: 'default' });
                      return;
                    }
                    const instance = ai.providerInstances[value as AiProviderInstanceId];
                    if (!instance) return;
                    updateRoute(feature.id, {
                      provider: instance.provider,
                      providerInstanceId: instance.id,
                      model: route.model,
                      effort: route.effort,
                      verbosity: route.verbosity,
                    });
                  }}
                  className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800"
                >
                  <option value="default">Use global default</option>
                  {instanceRoutingOptions.map((instance) => (
                    <option key={instance.id} value={instance.id}>
                      {instance.label}
                      {instance.available === 'auth-required' ? ' — auth required' : ''}
                      {instance.available === 'unavailable' ? ' — unavailable' : ''}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[11px] text-ink-400">
                  {providerHint}
                </span>
              </label>
              <label className="block text-xs text-ink-500">
                Model
                <input
                  value={route.provider === 'default' ? '' : route.model ?? ''}
                  disabled={route.provider === 'default'}
                  onChange={(event) => updateRoute(feature.id, { ...route, model: event.target.value })}
                  placeholder={route.provider === 'default'
                    ? providerModel(ai, ai.provider)
                    : (selectedInstance?.configuredModel || providerModel(ai, route.provider))}
                  className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800 disabled:bg-ink-50 disabled:text-ink-400"
                />
                <span className="mt-1 block text-[11px] text-ink-400">
                  {modelHint}
                </span>
              </label>
              {(() => {
                const model = routeModel(route, selectedInstance);
                const supportsEffort = providerSupportsEffort(route.provider, selectedInstanceId, model);
                const supportsVerbosity = providerSupportsVerbosity(selectedInstanceId, model);
                if (!supportsEffort && !supportsVerbosity) return <div />;
                return (
                  <div className="space-y-2 min-w-[110px]">
                    {supportsEffort && (
                      <label className="block text-xs text-ink-500">
                        Effort
                        <select
                          value={route.effort ?? ''}
                          onChange={(event) => updateRoute(feature.id, updateRouteControl(route, 'effort', event.target.value))}
                          className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800"
                        >
                          <option value="">Default</option>
                          <option value="minimal">Minimal</option>
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </label>
                    )}
                    {supportsVerbosity && (
                      <label className="block text-xs text-ink-500">
                        Verbosity
                        <select
                          value={route.verbosity ?? ''}
                          onChange={(event) => updateRoute(feature.id, updateRouteControl(route, 'verbosity', event.target.value))}
                          className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800"
                        >
                          <option value="">Default</option>
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </label>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
      {saveError && <p className="text-[11px] text-red-600 font-mono">{saveError}</p>}
    </div>
  );
}

// ── Claude Account Detail ─────────────────────────────────────────────────────

function ClaudeAccountDetail({
  model,
  compactEnabled,
  onSave,
  authenticated,
  available,
  onStatusChange,
}: {
  model: string;
  compactEnabled: boolean;
  onSave: (model: string, compactEnabled: boolean) => Promise<void>;
  authenticated: boolean;
  available: boolean;
  onStatusChange?: (status: ProviderCardProps['status']) => void;
}) {
  const [localModel, setLocalModel] = useState(model);
  const [compact, setCompact] = useState(compactEnabled);
  const [listedModels, setListedModels] = useState<AiModelInfo[]>([]);
  const [loginLoading, setLoginLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loginResult, setLoginResult] = useState<ClaudeAccountLoginResult | null>(null);
  const [manualCallbackUrl, setManualCallbackUrl] = useState('');
  const [completing, setCompleting] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [error, setError] = useState('');
  const refreshSettings = useSettingsStore((s) => s.refresh);

  useEffect(() => {
    setCompact(compactEnabled);
  }, [compactEnabled]);

  const refreshStatus = async () => {
    if (!available) {
      setExpiresAt(null);
      onStatusChange?.('upcoming');
      return;
    }
    setRefreshing(true);
    setError('');
    try {
      const status = await getClaudeAccountStatus();
      setExpiresAt(status.expiresAt ?? null);
      // 'key-needed' = gate on but user hasn't signed in; 'upcoming' = gate off.
      onStatusChange?.(status.authenticated ? 'connected' : (available ? 'key-needed' : 'upcoming'));
      await refreshSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      onStatusChange?.('unreachable');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!available) return;
    const timeout = window.setTimeout(() => void refreshStatus(), 0);
    return () => window.clearTimeout(timeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const handleStartLogin = async () => {
    if (!available) return;
    setLoginLoading(true);
    setError('');
    try {
      const result = await startClaudeAccountLogin();
      setLoginResult(result);
      window.open(result.authorizationUrl, '_blank', 'noopener');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      onStatusChange?.('unreachable');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleCompleteManual = async () => {
    if (!available) return;
    const callbackUrl = manualCallbackUrl.trim();
    if (!callbackUrl) {
      setError('Paste the full callback URL from the browser after login.');
      return;
    }
    setCompleting(true);
    setError('');
    try {
      await completeClaudeAccountLogin(callbackUrl);
      setManualCallbackUrl('');
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCompleting(false);
    }
  };

  const handleLogout = async () => {
    if (!available) return;
    setLogoutLoading(true);
    setError('');
    try {
      await logoutClaudeAccount();
      await refreshSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLogoutLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(localModel, compact);
    } finally {
      setSaving(false);
    }
  };

  const compactSupported = listedModels.some((item) => (
    item.id === localModel
    || item.name === localModel
    || item.displayName === localModel
  ) && item.capabilities?.compact === true);

  return (
    <div className="space-y-3">
      {!available ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] text-violet-700 bg-violet-50 border border-violet-200 rounded px-2 py-1.5">
            <span className="font-semibold">Unavailable</span>
            <span>— Claude account login is disabled by server configuration.</span>
          </div>
          <p className="text-[11px] text-ink-500 leading-relaxed">
            To use Claude models now, use the <span className="font-semibold text-ink-700">Anthropic API</span> method with an API key from{' '}
            <a
              href="https://console.anthropic.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-sage-700"
            >
              console.anthropic.com
            </a>.
          </p>
        </div>
      ) : !authenticated ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
            <span className="font-semibold">Sign-in required</span>
            <span>— Log in with your Claude account subscription to enable this method.</span>
          </div>
          {/* Stale/expired session messaging — expiresAt is populated by the initial refreshStatus() call */}
          {expiresAt !== null && expiresAt < now && (
            <div className="flex items-center gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              <span className="font-semibold">Session expired</span>
              <span>— Your previous Claude account session expired. Sign in again to continue.</span>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleStartLogin}
              disabled={loginLoading}
              className="px-3 py-1.5 text-[12px] font-medium bg-neutral-800 text-white rounded hover:bg-neutral-900 disabled:opacity-50"
            >
              {loginLoading ? 'Starting…' : 'Log in with Claude'}
            </button>
            <button
              type="button"
              onClick={() => void refreshStatus()}
              disabled={refreshing}
              className="px-3 py-1.5 text-[12px] font-medium border border-neutral-300 rounded hover:bg-neutral-50 disabled:opacity-50"
            >
              {refreshing ? 'Refreshing…' : 'Refresh status'}
            </button>
          </div>

          {loginResult && (
            <div className="space-y-1.5 p-2 bg-neutral-50 border border-neutral-200 rounded text-[11px]">
              <p>{loginResult.manualFallback ? 'Manual callback is required in this environment.' : 'Browser sign-in opened in a new tab.'}</p>
              {loginResult.manualReason && <p className="text-ink-500">{loginResult.manualReason}</p>}
            </div>
          )}

          <div className="space-y-2 p-2 bg-paper-warm border border-ink-100 rounded">
            <label className="block text-[11px] text-ink-600">
              Callback URL
              <input
                type="text"
                value={manualCallbackUrl}
                onChange={(event) => setManualCallbackUrl(event.target.value)}
                placeholder="Paste the full redirect URL from your browser"
                className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-xs text-ink-800"
              />
            </label>
            <button
              type="button"
              onClick={handleCompleteManual}
              disabled={completing}
              className="px-3 py-1.5 text-[12px] font-medium border border-ink-200 text-ink-700 rounded hover:bg-ink-50 disabled:opacity-50"
            >
              {completing ? 'Completing…' : 'Complete login from callback URL'}
            </button>
          </div>

          <div className="flex items-start gap-2 px-2.5 py-2 bg-paper-warm border border-ink-100 rounded text-[11px] text-ink-700">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-ink-400" />
            <div>
              <p className="font-semibold">Need Claude model access now?</p>
              <p className="mt-0.5 text-ink-600">
                Use the Anthropic API method above with an API key from{' '}
                <a
                  href="https://console.anthropic.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-sage-700"
                >
                  console.anthropic.com
                </a>.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Near-expiry reauth prompt — warn if token expires within 30 minutes */}
          {expiresAt !== null && expiresAt - now < 30 * 60_000 && expiresAt > now && (
            <div className="flex items-center gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              <span className="font-semibold">Token expiring soon</span>
              <span>— Your session expires at {new Date(expiresAt).toLocaleTimeString()}. Re-login to avoid interruption.</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-green-700 font-medium">✓ Logged in</span>
            {expiresAt && <span className="text-[11px] text-ink-500">expires {new Date(expiresAt).toLocaleString()}</span>}
            <button
              type="button"
              onClick={() => void refreshStatus()}
              disabled={refreshing}
              className="px-2 py-1 text-[11px] text-ink-500 hover:text-ink-700 underline disabled:opacity-50"
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              onClick={handleLogout}
              disabled={logoutLoading}
              className="px-2 py-1 text-[11px] text-neutral-500 hover:text-red-600 underline"
            >
              {logoutLoading ? 'Logging out…' : 'Log out'}
            </button>
          </div>

          <label className="block text-[11px] font-medium text-neutral-700">
            Model
            <input
              type="text"
              value={localModel}
              onChange={(e) => setLocalModel(e.target.value)}
              placeholder="claude-sonnet-latest"
              className="mt-0.5 block w-full rounded border border-neutral-300 px-2 py-1 text-[12px] font-mono"
            />
          </label>
          <p className="text-[10px] text-neutral-500">
            Use an alias like <code>claude-sonnet-latest</code> or a specific version like <code>claude-sonnet-4-20250514</code>.
          </p>
          {compactSupported && (
            <label className="flex items-start gap-2 rounded border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-[11px] text-neutral-700">
              <input
                type="checkbox"
                checked={compact}
                onChange={(event) => setCompact(event.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">Use Claude context compaction</span>
                <span className="block text-neutral-500">On by default for compact-capable Claude account models.</span>
              </span>
            </label>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1 text-[11px] font-medium bg-neutral-800 text-white rounded hover:bg-neutral-900 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <ProviderProbe
            buildConfig={() => ({ provider: 'claude-account', claudeAccountModel: localModel, claudeAccountCompact: compact })}
            onPickModel={setLocalModel}
            onModelsListed={setListedModels}
            onStatusChange={onStatusChange}
            testLabel="Test connection"
            listLabel="List models"
          />
        </div>
      )}

      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

// ── Codex Account Detail ──────────────────────────────────────────────────────

function CodexAccountDetail({
  model,
  onSave,
  authenticated,
  available,
  onStatusChange,
}: {
  model: string;
  onSave: (model: string) => Promise<void>;
  authenticated: boolean;
  available: boolean;
  onStatusChange?: (status: ProviderCardProps['status']) => void;
}) {
  const [localModel, setLocalModel] = useState(model);
  const [saving, setSaving] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginResult, setLoginResult] = useState<CodexAccountLoginResult | null>(null);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [account, setAccount] = useState<string | null>(null);
  const [error, setError] = useState('');
  const refreshSettings = useSettingsStore((s) => s.refresh);

  const refreshStatus = async () => {
    setError('');
    try {
      const status = await getCodexAccountStatus();
      setAccount(status.accountEmail ?? status.planType ?? null);
      onStatusChange?.(status.authenticated ? 'connected' : 'key-needed');
      await refreshSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      onStatusChange?.('unreachable');
    }
  };

  const handleLogin = async () => {
    setLoginLoading(true);
    setError('');
    try {
      const result = await startCodexAccountLogin();
      setLoginResult(result);
      if (result.loginUrl) window.open(result.loginUrl, '_blank', 'noopener');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      onStatusChange?.('unreachable');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    setLogoutLoading(true);
    setError('');
    try {
      await logoutCodexAccount();
      setLoginResult(null);
      setAccount(null);
      onStatusChange?.('key-needed');
      await refreshSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLogoutLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(localModel);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
        <span className="font-semibold">Beta</span>
        <span>— Codex account login uses a local Codex runtime installed on this machine and your ChatGPT/Codex subscription. This is a different billing surface from OpenAI API keys. This feature is in development and may not be fully operational.</span>
      </div>

      {!available && (
        <div className="text-[11px] text-ink-600 bg-ink-50 border border-ink-200 rounded px-2 py-1.5">
          Runtime unavailable: enable <code className="font-mono">SEEDBANK_ENABLE_CODEX_ACCOUNT</code> on the server to expose this method.
        </div>
      )}

      {!authenticated ? (
        <div className="space-y-2">
          <p className="text-[12px] text-neutral-600">
            Log in with Codex to use your ChatGPT/Codex account for Seedbank AI features.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleLogin}
              disabled={loginLoading}
              className="px-3 py-1.5 text-[12px] font-medium bg-neutral-800 text-white rounded hover:bg-neutral-900 disabled:opacity-50"
            >
              {loginLoading ? 'Starting...' : 'Log in with Codex'}
            </button>
            <button
              onClick={() => void refreshStatus()}
              className="px-3 py-1.5 text-[12px] font-medium border border-neutral-300 rounded hover:bg-neutral-50"
            >
              Refresh status
            </button>
          </div>
          {loginResult && (
            <div className="space-y-1.5 p-2 bg-neutral-50 border border-neutral-200 rounded text-[11px]">
              <p>{loginResult.message}</p>
              {loginResult.userCode && (
                <p className="font-mono text-neutral-700">Code: {loginResult.userCode}</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-green-700 font-medium">
              ✓ Logged in{account ? ` · ${account}` : ''}
            </span>
            <button
              onClick={handleLogout}
              disabled={logoutLoading}
              className="px-2 py-1 text-[11px] text-neutral-500 hover:text-red-600 underline"
            >
              {logoutLoading ? 'Logging out...' : 'Log out'}
            </button>
          </div>
          <label className="block text-[11px] font-medium text-neutral-700">
            Model
            <input
              type="text"
              value={localModel}
              onChange={(e) => setLocalModel(e.target.value)}
              placeholder="codex-recommended"
              className="mt-0.5 block w-full rounded border border-neutral-300 px-2 py-1 text-[12px] font-mono"
            />
          </label>
          <p className="text-[10px] text-neutral-500">
            Use <code>codex-recommended</code> or choose a resolved model ID from the Codex catalog.
          </p>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1 text-[11px] font-medium bg-neutral-800 text-white rounded hover:bg-neutral-900 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <ProviderProbe
            buildConfig={() => ({ provider: 'codex-account', codexAccountModel: localModel })}
            onPickModel={setLocalModel}
            onStatusChange={onStatusChange}
            testLabel="Test connection"
            listLabel="List models"
          />
        </div>
      )}

      {!authenticated && (
        <ProviderProbe
          buildConfig={() => ({ provider: 'codex-account', codexAccountModel: localModel })}
          onPickModel={setLocalModel}
          onStatusChange={onStatusChange}
          listLabel="List known models"
        />
      )}

      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function AiAgentsTab() {
  const ai = useAiSettings();
  const offline = useSettingsOffline();
  const patch = useSettingsStore((s) => s.patch);
  const [probeStatuses, setProbeStatuses] = useState<Partial<Record<AiProviderId, ProviderCardStatus>>>({});
  const [methodCapabilities, setMethodCapabilities] = useState<AiMethodCapability[]>([]);
  const [claudeMethod, setClaudeMethod] = useState<string>(
    ai.provider === 'claude-account' ? 'claude-account-native' : 'anthropic-api-key',
  );
  const [openaiMethod, setOpenaiMethod] = useState<string>(
    ai.provider === 'codex-account' ? 'codex-account-app-server' : 'openai-api-key',
  );

  const setProbeStatus = (provider: AiProviderId, status: ProviderCardStatus) => {
    setProbeStatuses((current) => ({ ...current, [provider]: status }));
  };

  // Determine provider connection status
  const openaiStatus: ProviderCardProps['status'] = probeStatuses.openai ?? (ai.hasOpenAIKey ? 'connected' : 'key-needed');
  const anthropicStatus: ProviderCardProps['status'] = probeStatuses.anthropic ?? (ai.hasAnthropicKey ? 'connected' : 'key-needed');
  // 'key-needed' when gate is on but user hasn't signed in; 'upcoming' only when gate is off.
  const claudeAccountStatus: ProviderCardProps['status'] = probeStatuses['claude-account']
    ?? (ai.claudeAccountAuthenticated
      ? 'connected'
      : (ai.claudeAccountAvailable ? 'key-needed' : 'upcoming'));
  // When the Codex opt-in env var is not set, treat as 'upcoming' (not 'key-needed') so the
  // status pill accurately reflects unavailability rather than implying a key entry is needed.
  const codexAccountStatus: ProviderCardProps['status'] = probeStatuses['codex-account']
    ?? (ai.codexAccountAvailable
      ? (ai.codexAccountAuthenticated ? 'connected' : 'key-needed')
      : 'upcoming');
  const ollamaStatus: ProviderCardProps['status'] = probeStatuses.ollama ?? 'not-tested';
  // ── Local OpenAI-compatible derived state (uses split localOpenaiCompatible* fields) ──
  const localCompatiblePreset = presetFor(ai.localOpenaiCompatiblePreset ?? ai.openaiCompatiblePreset);
  const localCompatibleStatus: ProviderCardProps['status'] = probeStatuses['openai-compatible']
    ?? (localCompatiblePreset.requiresKey && !ai.hasLocalOpenAICompatibleKey ? 'key-needed' : 'not-tested');

  // ── Cloud OpenAI-compatible derived state (uses split cloudOpenaiCompatible* fields) ──
  const cloudCompatiblePreset = presetFor(ai.cloudOpenaiCompatiblePreset ?? ai.openaiCompatiblePreset);
  const cloudCompatibleActive = openAICompatiblePresetMatchesMode(
    ai.cloudOpenaiCompatiblePreset ?? ai.openaiCompatiblePreset,
    ai.cloudOpenaiCompatibleBaseUrl ?? ai.openaiCompatibleBaseUrl,
    'cloud',
  );
  const cloudCompatibleRequiresKey = (ai.cloudOpenaiCompatiblePreset ?? ai.openaiCompatiblePreset) === 'custom'
    ? true
    : cloudCompatiblePreset.requiresKey;
  const cloudCompatibleStatus: ProviderCardProps['status'] = probeStatuses['openai-compatible']
    ?? (cloudCompatibleRequiresKey && !ai.hasCloudOpenAICompatibleKey ? 'key-needed' : 'not-tested');
  const cloudCompatibleLabel = cloudCompatibleActive
    ? `${cloudCompatiblePreset.label} · ${ai.cloudOpenaiCompatibleModel || ai.openaiCompatibleModel || 'choose a model'}`
    : `${presetFor(CLOUD_COMPATIBLE_DEFAULT_PRESET).label} · not configured`;
  const activeCompatibleStatus = ai.defaultProviderInstanceId === 'local-openai-compatible'
    ? localCompatibleStatus
    : cloudCompatibleStatus;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (ai.provider === 'claude-account') setClaudeMethod('claude-account-native');
      if (ai.provider === 'anthropic') setClaudeMethod('anthropic-api-key');
      if (ai.provider === 'codex-account') setOpenaiMethod('codex-account-app-server');
      if (ai.provider === 'openai') setOpenaiMethod('openai-api-key');
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [ai.provider]);

  useEffect(() => {
    if (offline) return;
    void getAiMethodCapabilities()
      .then(setMethodCapabilities)
      .catch(() => {});
  }, [offline]);

  const claudeMethodOptions = methodCapabilities.filter((method) => method.serviceFamily === 'claude');
  const openaiMethodOptions = methodCapabilities.filter((method) => method.serviceFamily === 'codex-openai');
  const cloudMethods = methodCapabilities.filter((method) => method.serviceFamily === 'external-router' && method.providerId === 'openai-compatible');
  const cloudPresetMethodIds: AiOpenAICompatiblePresetId[] = (
    methodCapabilities.length > 0
      ? [...new Set([...cloudMethods.map((method) => method.presetId).filter(Boolean), 'custom'])]
      : ['openrouter', 'groq', 'mistral', 'together', 'fireworks', 'custom']
  ) as AiOpenAICompatiblePresetId[];
  const methodById = new Map(methodCapabilities.map((method) => [method.id, method]));
  const capabilityState = (
    id: string,
    fallback: { availability: AiMethodCapability['availability']; reason?: string; featureRoutable: boolean },
  ) => {
    const method = methodById.get(id);
    return method
      ? { availability: method.availability, reason: method.availabilityReason, featureRoutable: method.featureRoutable }
      : fallback;
  };
  const providerAvailability: Partial<Record<AiProviderId, { availability: AiMethodCapability['availability']; reason?: string; featureRoutable: boolean }>> = {
    openai: capabilityState('openai-api-key', { availability: ai.hasOpenAIKey ? 'available' : 'auth-required', reason: ai.hasOpenAIKey ? undefined : 'OpenAI API key is not configured.', featureRoutable: true }),
    anthropic: capabilityState('anthropic-api-key', { availability: ai.hasAnthropicKey ? 'available' : 'auth-required', reason: ai.hasAnthropicKey ? undefined : 'Anthropic API key is not configured.', featureRoutable: true }),
    'claude-account': capabilityState('claude-account-native', {
      availability: ai.claudeAccountAvailable
        ? (ai.claudeAccountAuthenticated ? 'available' : 'auth-required')
        : 'unavailable',
      reason: ai.claudeAccountAvailable
        ? (ai.claudeAccountAuthenticated ? undefined : 'Sign in with Claude account to enable this method.')
        : 'Claude account login is disabled by server configuration. Use the Anthropic API method, or set SEEDBANK_ENABLE_CLAUDE_ACCOUNT=1 to enable account login.',
      featureRoutable: true,
    }),
    'codex-account': capabilityState('codex-account-app-server', { availability: ai.codexAccountAvailable ? (ai.codexAccountAuthenticated ? 'available' : 'auth-required') : 'unavailable', reason: ai.codexAccountAvailable ? 'Sign in with Codex account to enable this method.' : 'Codex account method is disabled by server configuration.', featureRoutable: true }),
    ollama: capabilityState('ollama-local', { availability: 'available', featureRoutable: true }),
    'openai-compatible': capabilityState(
      `openai-compatible:${ai.defaultProviderInstanceId === 'local-openai-compatible' ? (ai.localOpenaiCompatiblePreset ?? ai.openaiCompatiblePreset) : (ai.cloudOpenaiCompatiblePreset ?? ai.openaiCompatiblePreset)}`,
      { availability: 'available', featureRoutable: true },
    ),
  };

  /** Maps legacy AiProviderId to the new provider-instance ID for non-openai-compatible providers. */
  const PROVIDER_TO_INSTANCE_ID: Partial<Record<AiProviderId, AiProviderInstanceId>> = {
    anthropic:        'claude-api',
    'claude-account': 'claude-account',
    openai:           'openai-api',
    'codex-account':  'codex-account',
    ollama:           'ollama',
    // openai-compatible has two instances; callers pass an explicit instanceId instead.
  };

  const setDefaultProvider = async (provider: AiProviderId, instanceId?: AiProviderInstanceId) => {
    const resolved = instanceId ?? PROVIDER_TO_INSTANCE_ID[provider];
    await patch('ai', { provider, ...(resolved ? { defaultProviderInstanceId: resolved } : {}) });
  };

  const saveOpenAI = async (model: string, key?: string) => {
    await patch('ai', { openaiModel: model, ...(key ? { openaiApiKey: key } : {}) });
  };

  const saveAnthropic = async (model: string, key?: string) => {
    await patch('ai', { anthropicModel: model, ...(key ? { anthropicApiKey: key } : {}) });
  };

  const saveClaudeAccount = async (model: string, compactEnabled: boolean) => {
    await patch('ai', { claudeAccountModel: model, claudeAccountCompact: compactEnabled });
  };

  const saveCodexAccount = async (model: string) => {
    await patch('ai', { codexAccountModel: model });
  };

  const saveOllama = async (model: string, baseUrl: string) => {
    await patch('ai', { ollamaModel: model, ollamaBaseUrl: baseUrl });
  };

  const saveLocalOpenAICompatible = async (
    preset: AiOpenAICompatiblePresetId,
    model: string,
    baseUrl: string,
    key?: string,
  ) => {
    await patch('ai', {
      localOpenaiCompatiblePreset: preset,
      localOpenaiCompatibleModel: model,
      localOpenaiCompatibleBaseUrl: baseUrl,
      ...(key ? { localOpenaiCompatibleApiKey: key } : {}),
    });
  };

  const saveCloudOpenAICompatible = async (
    preset: AiOpenAICompatiblePresetId,
    model: string,
    baseUrl: string,
    key?: string,
  ) => {
    const previousPreset = ai.cloudOpenaiCompatiblePreset ?? ai.openaiCompatiblePreset;
    const previousBaseUrl = ai.cloudOpenaiCompatibleBaseUrl ?? ai.openaiCompatibleBaseUrl;
    const endpointChanged = previousPreset !== preset || previousBaseUrl !== baseUrl;
    await patch('ai', {
      cloudOpenaiCompatiblePreset: preset,
      cloudOpenaiCompatibleModel: model,
      cloudOpenaiCompatibleBaseUrl: baseUrl,
      ...(key ? { cloudOpenaiCompatibleApiKey: key } : {}),
      ...(!key && endpointChanged ? { cloudOpenaiCompatibleApiKey: '' } : {}),
    });
  };

  const saveBudget = async (budget: number) => {
    await patch('ai', { dailyTokenBudget: budget });
  };

  const saveFeatureRoutes = async (featureRoutes: AiPublicConfig['featureRoutes']) => {
    await patch('ai', { featureRoutes });
  };

  // ── Local Models section ─────────────────────────────────────────────────────
  const [localServerType, setLocalServerType] = useState<LocalServerType>(() => initialLocalServerType(ai));
  const localServerOpt = LOCAL_SERVER_OPTIONS.find((o) => o.id === localServerType)!;
  const localServerPresetId: AiOpenAICompatiblePresetId = localServerOpt.presetId ?? 'custom';
  const providerDiagnostics = Object.values(ai.providerInstances).flatMap((instance) => {
    const issues: string[] = [];
    if (instance.available === 'auth-required') {
      issues.push(instance.availabilityReason ?? `${instance.label}: authentication required.`);
    } else if (instance.available === 'unavailable') {
      issues.push(instance.availabilityReason ?? `${instance.label}: unavailable.`);
    }
    if (instance.requiresApiKey && !instance.hasApiKey) {
      issues.push(`${instance.label}: API key missing.`);
    }
    return issues;
  });

  return (
    <div className="space-y-8">
      {offline && (
        <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-card text-xs text-amber-800">
          Offline — AI settings shown from local cache. Changes will sync when the server reconnects.
        </div>
      )}

      {/* ── A1 + A2: Service areas + methods ────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <h3 className="text-xs font-mono uppercase tracking-wider text-ink-500">
              AI Services
            </h3>
            <HelpButton
              helpId="ai-providers"
              title="Choosing an AI Provider"
              summary="Settings are grouped by service family (Claude, Codex/OpenAI, Local Models, External/Cloud). Choose API key for direct provider access or Account login to use your subscription."
              details="Feature Defaults routes only chat/model-capable methods. Connection type — API key or Account login — is set per service family in the cards above."
              manualSection="provider-chooser"
              alwaysShow
            />
          </div>
        </div>
        <p className="text-xs text-ink-400">
          Configure each service family. Choose <strong>API key</strong> for direct provider access or{' '}
          <strong>Account login</strong> to use your subscription. Global default and Feature Defaults apply to
          chat/model-capable methods only.
        </p>
        {providerDiagnostics.length > 0 && (
          <div className="rounded-card border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 font-mono space-y-1">
            {providerDiagnostics.slice(0, 4).map((line) => (
              <p key={line}>{line}</p>
            ))}
            {providerDiagnostics.length > 4 && <p>+{providerDiagnostics.length - 4} more diagnostics</p>}
          </div>
        )}

        <div className="space-y-4">
          <div className="rounded-card border border-ink-100 bg-paper p-3 space-y-3">
            <p className="text-[10px] font-mono uppercase tracking-wider text-ink-400">Claude Service</p>
            <ServiceMethodSwitch
              title="Method"
              value={claudeMethod}
              onChange={(next) => setClaudeMethod(next)}
              options={(claudeMethodOptions.length > 0
                ? claudeMethodOptions.filter((m) => m.channel !== 'file-agent')
                : [
                    { id: 'anthropic-api-key', label: 'API key', channel: 'chat-model', availability: 'available' as const },
                    { id: 'claude-account-native', label: 'Account login', channel: 'chat-model', availability: (ai.claudeAccountAuthenticated ? 'available' : 'auth-required') as AiMethodCapability['availability'] },
                  ] as AiMethodCapability[]
              ).map(optionFromMethodCapability)}
            />
            {claudeMethod === 'anthropic-api-key' && (
              <ProviderCard
                label={aiProviderLabel('anthropic')}
                icon="🧠"
                isDefault={ai.provider === 'anthropic'}
                status={anthropicStatus}
                modelLabel={ai.anthropicModel}
                onSetDefault={() => void setDefaultProvider('anthropic')}
                actions={(
                  <ProviderProbe
                    buildConfig={() => ({ provider: 'anthropic', anthropicModel: ai.anthropicModel })}
                    onStatusChange={(status) => setProbeStatus('anthropic', status)}
                    testLabel="Test saved"
                    listLabel="List saved models"
                  />
                )}
              >
                <AnthropicDetail
                  model={ai.anthropicModel}
                  hasKey={ai.hasAnthropicKey}
                  onSave={saveAnthropic}
                />
              </ProviderCard>
            )}
            {claudeMethod === 'claude-account-native' && (
              <ProviderCard
                label={aiProviderLabel('claude-account')}
                icon="🟣"
                isDefault={ai.provider === 'claude-account'}
                status={claudeAccountStatus}
                modelLabel={ai.claudeAccountModel || 'claude-sonnet-latest'}
                onSetDefault={() => void setDefaultProvider('claude-account')}
                canSetDefault={claudeAccountStatus === 'connected'}
              >
                <ClaudeAccountDetail
                  model={ai.claudeAccountModel || 'claude-sonnet-latest'}
                  compactEnabled={ai.claudeAccountCompact !== false}
                  onSave={saveClaudeAccount}
                  authenticated={ai.claudeAccountAuthenticated}
                  available={ai.claudeAccountAvailable}
                  onStatusChange={(status) => setProbeStatus('claude-account', status)}
                />
              </ProviderCard>
            )}

          </div>

          <div className="rounded-card border border-ink-100 bg-paper p-3 space-y-3">
            <p className="text-[10px] font-mono uppercase tracking-wider text-ink-400">Codex / OpenAI Service</p>
            <ServiceMethodSwitch
              title="Method"
              value={openaiMethod}
              onChange={(next) => setOpenaiMethod(next)}
              options={(openaiMethodOptions.length > 0
                ? openaiMethodOptions.filter((m) => m.channel !== 'file-agent')
                : [
                    { id: 'openai-api-key', label: 'API key', channel: 'chat-model', availability: 'available' as const },
                    { id: 'codex-account-app-server', label: 'Account login', channel: 'chat-model', availability: (ai.codexAccountAuthenticated ? 'available' : 'auth-required') as AiMethodCapability['availability'] },
                  ] as AiMethodCapability[]
              ).map(optionFromMethodCapability)}
            />
            {openaiMethod === 'openai-api-key' && (
              <ProviderCard
                label={aiProviderLabel('openai')}
                icon="🤖"
                isDefault={ai.provider === 'openai'}
                status={openaiStatus}
                modelLabel={ai.openaiModel}
                onSetDefault={() => void setDefaultProvider('openai')}
                actions={(
                  <ProviderProbe
                    buildConfig={() => ({ provider: 'openai', openaiModel: ai.openaiModel })}
                    onStatusChange={(status) => setProbeStatus('openai', status)}
                    testLabel="Test saved"
                    listLabel="List saved models"
                  />
                )}
              >
                <OpenAIDetail
                  model={ai.openaiModel}
                  hasKey={ai.hasOpenAIKey}
                  onSave={saveOpenAI}
                />
              </ProviderCard>
            )}
            {openaiMethod === 'codex-account-app-server' && (
              <ProviderCard
                label={aiProviderLabel('codex-account')}
                icon="⌁"
                isDefault={ai.provider === 'codex-account'}
                status={codexAccountStatus}
                modelLabel={ai.codexAccountModel || 'codex-recommended'}
                onSetDefault={() => void setDefaultProvider('codex-account')}
                canSetDefault={ai.codexAccountAvailable === true && ai.codexAccountAuthenticated === true && codexAccountStatus === 'connected'}
              >
                <CodexAccountDetail
                  model={ai.codexAccountModel || 'codex-recommended'}
                  onSave={saveCodexAccount}
                  authenticated={ai.codexAccountAuthenticated}
                  available={ai.codexAccountAvailable}
                  onStatusChange={(status) => setProbeStatus('codex-account', status)}
                />
              </ProviderCard>
            )}

          </div>

          {/* ── Local Models ─────────────────────────────────────────────────── */}
          <div className="rounded-card border border-ink-100 bg-paper p-3 space-y-3">
            <p className="text-[10px] font-mono uppercase tracking-wider text-ink-400">Local Models</p>

            {/* Server-type dropdown — single selector for all local servers */}
            <label className="block text-xs text-ink-500">
              Server type
              <select
                value={localServerType}
                onChange={(e) => setLocalServerType(e.target.value as LocalServerType)}
                className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800"
              >
                {LOCAL_SERVER_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </label>

            {localServerType === 'ollama' && (
              <ProviderCard
                label="Ollama"
                icon="🦙"
                isDefault={ai.provider === 'ollama'}
                status={ollamaStatus}
                modelLabel={`${ai.ollamaModel} · ${ai.ollamaBaseUrl}`}
                onSetDefault={() => void setDefaultProvider('ollama')}
                actions={(
                  <ProviderProbe
                    buildConfig={() => ({ provider: 'ollama', ollamaModel: ai.ollamaModel, ollamaBaseUrl: ai.ollamaBaseUrl })}
                    onStatusChange={(status) => setProbeStatus('ollama', status)}
                    testLabel="Run saved smoke test"
                    listLabel="List saved models"
                  />
                )}
              >
                <OllamaDetail
                  model={ai.ollamaModel}
                  baseUrl={ai.ollamaBaseUrl}
                  onSave={saveOllama}
                />
              </ProviderCard>
            )}

            {localServerType !== 'ollama' && (
              <ProviderCard
                label={localServerOpt.label}
                icon="🧩"
                isDefault={
                  ai.defaultProviderInstanceId === 'local-openai-compatible'
                  || (ai.provider === 'openai-compatible'
                      && (ai.localOpenaiCompatiblePreset ?? ai.openaiCompatiblePreset) === localServerPresetId
                      && isLikelyLocalUrl(ai.localOpenaiCompatibleBaseUrl ?? ai.openaiCompatibleBaseUrl))
                }
                status={localCompatibleStatus}
                modelLabel={
                  (ai.localOpenaiCompatiblePreset ?? ai.openaiCompatiblePreset) === localServerPresetId
                  && isLikelyLocalUrl(ai.localOpenaiCompatibleBaseUrl ?? ai.openaiCompatibleBaseUrl)
                    ? `${localServerOpt.label} · ${ai.localOpenaiCompatibleModel || ai.openaiCompatibleModel || 'choose a model'}`
                    : `${localServerOpt.label} · not configured`
                }
                onSetDefault={() => void setDefaultProvider('openai-compatible', 'local-openai-compatible')}
                actions={(
                  <ProviderProbe
                    buildConfig={() => ({
                      provider: 'openai-compatible',
                      providerInstanceId: 'local-openai-compatible' as AiProviderInstanceId,
                      openaiCompatiblePreset: ai.localOpenaiCompatiblePreset ?? ai.openaiCompatiblePreset,
                      openaiCompatibleModel: ai.localOpenaiCompatibleModel || ai.openaiCompatibleModel,
                      openaiCompatibleBaseUrl: ai.localOpenaiCompatibleBaseUrl ?? ai.openaiCompatibleBaseUrl,
                    })}
                    onStatusChange={(status) => setProbeStatus('openai-compatible', status)}
                    testLabel="Test saved"
                    listLabel="List saved models"
                  />
                )}
              >
                <OpenAICompatibleDetail
                  preset={ai.localOpenaiCompatiblePreset ?? ai.openaiCompatiblePreset}
                  model={ai.localOpenaiCompatibleModel || ai.openaiCompatibleModel}
                  baseUrl={ai.localOpenaiCompatibleBaseUrl ?? ai.openaiCompatibleBaseUrl}
                  hasKey={ai.hasLocalOpenAICompatibleKey}
                  mode="local"
                  allowedPresets={[localServerPresetId]}
                  guidance={
                    localServerType === 'custom-local'
                      ? 'Custom local endpoints should use a localhost, 127.0.0.1, or .local URL.'
                      : `${localServerOpt.label} runs a local OpenAI-compatible server. Ensure it is running before testing.`
                  }
                  onSave={saveLocalOpenAICompatible}
                />
              </ProviderCard>
            )}
          </div>

          {/* ── External / Cloud ─────────────────────────────────────────────── */}
          <div className="rounded-card border border-ink-100 bg-paper p-3 space-y-3">
            <p className="text-[10px] font-mono uppercase tracking-wider text-ink-400">External / Cloud</p>
            <p className="text-[11px] text-ink-400">
              Connect to hosted services: OpenRouter, Groq, Mistral, Together, Fireworks, or a custom cloud endpoint.
              Requests from this card leave your machine and are processed by the selected cloud provider.
            </p>
            <ProviderCard
              label={cloudCompatibleActive ? cloudCompatiblePreset.label : 'Cloud provider'}
              icon="☁️"
              isDefault={
                ai.defaultProviderInstanceId === 'cloud-openai-compatible'
                || (ai.provider === 'openai-compatible' && cloudCompatibleActive
                    && ai.defaultProviderInstanceId !== 'local-openai-compatible')
              }
              status={cloudCompatibleStatus}
              modelLabel={cloudCompatibleLabel}
              onSetDefault={() => void setDefaultProvider('openai-compatible', 'cloud-openai-compatible')}
              actions={(
                <ProviderProbe
                  buildConfig={() => ({
                    provider: 'openai-compatible',
                    providerInstanceId: 'cloud-openai-compatible' as AiProviderInstanceId,
                    openaiCompatiblePreset: ai.cloudOpenaiCompatiblePreset ?? ai.openaiCompatiblePreset,
                    openaiCompatibleModel: ai.cloudOpenaiCompatibleModel || ai.openaiCompatibleModel,
                    openaiCompatibleBaseUrl: ai.cloudOpenaiCompatibleBaseUrl ?? ai.openaiCompatibleBaseUrl,
                  })}
                  onStatusChange={(status) => setProbeStatus('openai-compatible', status)}
                  testLabel="Test saved"
                  listLabel="List saved models"
                />
              )}
            >
              <OpenAICompatibleDetail
                preset={ai.cloudOpenaiCompatiblePreset ?? ai.openaiCompatiblePreset}
                model={ai.cloudOpenaiCompatibleModel || ai.openaiCompatibleModel}
                baseUrl={ai.cloudOpenaiCompatibleBaseUrl ?? ai.openaiCompatibleBaseUrl}
                hasKey={ai.hasCloudOpenAICompatibleKey}
                mode="cloud"
                allowedPresets={cloudPresetMethodIds}
                guidance="Custom cloud endpoints should use a remote HTTPS URL from the hosted service."
                onSave={saveCloudOpenAICompatible}
              />
            </ProviderCard>
          </div>
        </div>
      </section>

      {/* key is intentionally absent — key-based remount caused unsaved route
          drafts to be discarded whenever any other AI setting was saved. */}
      <section className="p-4 bg-paper-warm border border-ink-100 rounded-card">
        <FeatureRoutingSection
          ai={ai}
          providerStatuses={{
            openai: openaiStatus,
            anthropic: anthropicStatus,
            'claude-account': claudeAccountStatus,
            'codex-account': codexAccountStatus,
            ollama: ollamaStatus,
            'openai-compatible': activeCompatibleStatus,
          }}
          providerAvailability={providerAvailability}
          onSave={saveFeatureRoutes}
        />
      </section>

      {/* ── A3: Guardrails (privacy + budget + usage + advanced controls) ─── */}
      <section className="p-4 bg-paper-warm border border-ink-100 rounded-card">
        <GuardrailsSection
          ai={ai}
          onSaveBudget={saveBudget}
          onSaveGuardrails={async (guardrailsPatch) => {
            await patch('ai', { guardrails: guardrailsPatch });
          }}
        />
      </section>

      {/* Inline help covers the agents guide — external link placeholder removed */}
    </div>
  );
}
