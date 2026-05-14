/**
 * GuardrailsSection — token budget, usage summary, and advanced guardrail controls.
 * Composes: BudgetSection, AdvancedGuardrailsSection, PrivacyNotice, UsageAuditSection.
 */
import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Info,
  Loader2,
  Lock,
} from 'lucide-react';
import type {
  AiFeatureId,
  AiGuardrailsConfig,
  AiPreflightResult,
  AiProviderId,
  AiProviderFamily,
  AiProviderInstanceId,
  AiPublicConfig,
} from '@/lib/types';
import type { AiUsageDetail, AiUsageSummary } from '@/api/client';
import { getAiUsage, getAiUsageDetail, preflightAiRequest } from '@/api/client';
import { HelpButton } from '@/help/HelpPopover';
import {
  FEATURE_IDS,
  FEATURE_LABELS,
  PROVIDER_FAMILY_IDS,
  PROVIDER_IDS,
  REMOTE_PROVIDERS,
} from './constants';
import { fmtTokens, providerFamilyLabel } from './helpers';
import { PrivacyNotice } from './PrivacyNotice';
import { UsageAuditSection } from './UsageAuditSection';

// ── BudgetSection ─────────────────────────────────────────────────────────────

interface BudgetSectionProps {
  budget: number;
  onSave: (budget: number) => Promise<void>;
}

function BudgetSection({ budget, onSave }: BudgetSectionProps) {
  const [localDraft, setLocalDraft] = useState<number | null>(null);
  const draft = localDraft ?? budget;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [usage, setUsage] = useState<AiUsageSummary | null>(null);

  useEffect(() => {
    void getAiUsage()
      .then(setUsage)
      .catch(() => { /* offline */ });
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await onSave(draft);
      setLocalDraft(null);
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
          className="mb-0.5 flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-sage-600 hover:bg-sage-700 disabled:bg-ink-300 text-white rounded-card transition-colors"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : saved ? <Check className="w-3 h-3" /> : null}
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>
      {saveError && <p className="text-[11px] text-red-600 font-mono">{saveError}</p>}
      {draft === 0 && (
        <p className="text-[11px] text-ink-400">
          Daily budget enforcement is disabled. Per-minute rate limiting still applies.
        </p>
      )}
      {usage !== null && (
        <div className="font-mono text-[11px] text-ink-400 space-y-0.5">
          <div>
            <span className="text-ink-700 font-semibold">{fmtTokens(usage.last24h)}</span> tokens
            used in the last 24 h
            {draft > 0 && (
              <span className="ml-1">
                ({Math.round((usage.last24h / draft) * 100)}% of budget)
              </span>
            )}
          </div>
          <div>
            <span className="text-ink-700 font-semibold">{fmtTokens(usage.last7d)}</span> tokens
            used in the last 7 d
          </div>
        </div>
      )}
    </div>
  );
}

// ── AdvancedGuardrailsSection ─────────────────────────────────────────────────

interface AdvancedGuardrailsSectionProps {
  guardrails: AiGuardrailsConfig;
  providerInstances: AiPublicConfig['providerInstances'];
  onSave: (patch: Partial<AiGuardrailsConfig>) => Promise<void>;
}

function AdvancedGuardrailsSection({
  guardrails,
  providerInstances,
  onSave,
}: AdvancedGuardrailsSectionProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [featureEnabled, setFeatureEnabled] = useState<Partial<Record<AiFeatureId, boolean>>>(
    guardrails.featureEnabled,
  );
  const [providerEnabled, setProviderEnabled] = useState<Partial<Record<AiProviderId, boolean>>>(
    guardrails.providerEnabled,
  );
  const [providerInstanceEnabled, setProviderInstanceEnabled] = useState<
    Partial<Record<AiProviderInstanceId, boolean>>
  >(guardrails.providerInstanceEnabled);
  const [warnOnRemote, setWarnOnRemote] = useState(guardrails.warnOnRemoteProvider);
  const [requireConfirm, setRequireConfirm] = useState(
    guardrails.requireConfirmationForRemoteProvider,
  );
  const [featureBudgets, setFeatureBudgets] = useState<Partial<Record<AiFeatureId, number>>>(
    guardrails.featureDailyTokenBudgets,
  );
  const [providerFamilyBudgets, setProviderFamilyBudgets] = useState<
    Partial<Record<AiProviderFamily, number>>
  >(guardrails.providerFamilyDailyTokenBudgets);
  const [providerInstanceBudgets, setProviderInstanceBudgets] = useState<
    Partial<Record<AiProviderInstanceId, number>>
  >(guardrails.providerInstanceDailyTokenBudgets);
  const [allowedModelsText, setAllowedModelsText] = useState(
    guardrails.allowedModels.join(', '),
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  const providerInstanceRows = Object.values(providerInstances);
  const remoteProviderInstances = providerInstanceRows.filter((inst) => !inst.local);
  const instanceIsEnabled = (inst: AiPublicConfig['providerInstances'][string]) =>
    providerEnabled[inst.provider] !== false && providerInstanceEnabled[inst.id] !== false;
  const providerEnabledFromInstances = (
    instancesEnabled: Partial<Record<AiProviderInstanceId, boolean>>,
  ): Partial<Record<AiProviderId, boolean>> => {
    const next = { ...providerEnabled };
    for (const providerId of PROVIDER_IDS) {
      const providerRows = providerInstanceRows.filter((inst) => inst.provider === providerId);
      if (providerRows.length > 0) {
        next[providerId] = providerRows.some((inst) => instancesEnabled[inst.id] !== false);
      }
    }
    return next;
  };
  const toggleProviderInstance = (
    instance: AiPublicConfig['providerInstances'][string],
    enabled: boolean,
  ) => {
    const nextInstances = { ...providerInstanceEnabled, [instance.id]: enabled };
    setProviderInstanceEnabled(nextInstances);
    setProviderEnabled(providerEnabledFromInstances(nextInstances));
  };
  const privacyModeOn =
    warnOnRemote &&
    requireConfirm &&
    remoteProviderInstances.every((inst) => !instanceIsEnabled(inst));

  function togglePrivacyMode() {
    if (privacyModeOn) {
      setProviderEnabled((prev) => {
        const next = { ...prev };
        REMOTE_PROVIDERS.forEach((p) => { next[p] = true; });
        next['openai-compatible'] = true;
        return next;
      });
      setProviderInstanceEnabled((prev) => {
        const next = { ...prev };
        providerInstanceRows.forEach((inst) => { next[inst.id] = true; });
        return next;
      });
      setWarnOnRemote(false);
      setRequireConfirm(false);
    } else {
      setProviderEnabled((prev) => {
        const next = { ...prev };
        REMOTE_PROVIDERS.forEach((p) => { next[p] = false; });
        next['openai-compatible'] = true;
        return next;
      });
      setProviderInstanceEnabled((prev) => {
        const next = { ...prev };
        providerInstanceRows.forEach((inst) => { next[inst.id] = inst.local; });
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
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await onSave({
        featureEnabled,
        providerEnabled: providerEnabledFromInstances(providerInstanceEnabled),
        providerInstanceEnabled,
        warnOnRemoteProvider: warnOnRemote,
        requireConfirmationForRemoteProvider: requireConfirm,
        featureDailyTokenBudgets: featureBudgets,
        providerFamilyDailyTokenBudgets: providerFamilyBudgets,
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
        className="flex items-center gap-1.5 text-xs font-medium text-ink-400 hover:text-sage-700 transition-colors"
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
                    Blocks cloud API/account routes while leaving Ollama and local OpenAI-compatible
                    endpoints available.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={togglePrivacyMode}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    privacyModeOn ? 'bg-sage-500' : 'bg-ink-200'
                  }`}
                  aria-checked={privacyModeOn}
                  role="switch"
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      privacyModeOn ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Remote-provider warning toggles */}
          <div className="space-y-2">
            <p className="text-[11px] font-mono uppercase tracking-wider text-ink-400">
              Cloud provider alerts
            </p>
            <p className="text-[10px] text-ink-400 leading-relaxed">
              These affect the AI Assistance modal (✨ buttons on idea fields). When a cloud
              provider is about to be used, the modal will pause with a warning or ask for
              confirmation before running.
            </p>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={warnOnRemote}
                onChange={(e) => setWarnOnRemote(e.target.checked)}
                className="w-3.5 h-3.5 accent-sage-600"
              />
              <span className="text-xs text-ink-700">
                Show a warning in the AI modal before sending to a cloud provider
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={requireConfirm}
                onChange={(e) => setRequireConfirm(e.target.checked)}
                className="w-3.5 h-3.5 accent-sage-600"
              />
              <span className="text-xs text-ink-700">
                Require a "Confirm &amp; run" click in the AI modal before each cloud request
              </span>
            </label>
          </div>

          {/* Feature enable/disable */}
          <div className="space-y-2">
            <p className="text-[11px] font-mono uppercase tracking-wider text-ink-400">
              Feature enable
            </p>
            <div className="space-y-1.5">
              {FEATURE_IDS.map((fid) => {
                const enabled = featureEnabled[fid] !== false;
                return (
                  <label key={fid} className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) =>
                        setFeatureEnabled((prev) => ({ ...prev, [fid]: e.target.checked }))
                      }
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

          {/* Provider method enable/disable */}
          <div className="space-y-2">
            <p className="text-[11px] font-mono uppercase tracking-wider text-ink-400">
              Provider methods
            </p>
            <p className="text-[10px] text-ink-400 leading-relaxed">
              Enable the concrete methods Seedbank can show in setup and Feature Defaults.
            </p>
            <div className="space-y-1.5">
              {providerInstanceRows.map((inst) => {
                const enabled = instanceIsEnabled(inst);
                return (
                  <label key={inst.id} className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => toggleProviderInstance(inst, e.target.checked)}
                      className="w-3.5 h-3.5 accent-sage-600"
                    />
                    <span className="text-xs text-ink-700">{inst.label}</span>
                    <span className="text-[10px] text-ink-400">
                      {inst.local ? 'local' : 'cloud/account'}
                    </span>
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
              <p className="text-[11px] font-mono uppercase tracking-wider text-ink-400">
                Per-feature daily token caps
              </p>
              <span title="0 = inherits global budget">
                <Info className="w-3 h-3 text-ink-300" />
              </span>
            </div>
            <div className="space-y-2">
              {FEATURE_IDS.map((fid) => (
                <label key={fid} className="flex items-center gap-2">
                  <span className="text-[11px] text-ink-600 w-36 shrink-0">
                    {FEATURE_LABELS[fid]}
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    placeholder="0 = global"
                    value={featureBudgets[fid] ?? 0}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setFeatureBudgets((prev) => ({ ...prev, [fid]: isNaN(v) ? 0 : v }));
                    }}
                    className="w-28 px-2 py-1 text-[11px] font-mono border border-ink-100 rounded bg-white text-ink-700 focus:outline-none focus:border-sage-400"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Per-provider-family daily token budgets */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] font-mono uppercase tracking-wider text-ink-400">
                Per-provider-family daily token caps
              </p>
              <span title="0 = no family-level cap">
                <Info className="w-3 h-3 text-ink-300" />
              </span>
            </div>
            <div className="space-y-2">
              {PROVIDER_FAMILY_IDS.map((family) => (
                <label key={family} className="flex items-center gap-2">
                  <span className="text-[11px] text-ink-600 w-44 shrink-0">
                    {providerFamilyLabel(family)}
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    placeholder="0 = no cap"
                    value={providerFamilyBudgets[family] ?? 0}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setProviderFamilyBudgets((prev) => ({
                        ...prev,
                        [family]: isNaN(v) ? 0 : v,
                      }));
                    }}
                    className="w-28 px-2 py-1 text-[11px] font-mono border border-ink-100 rounded bg-white text-ink-700 focus:outline-none focus:border-sage-400"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Per-provider-instance daily token budgets */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] font-mono uppercase tracking-wider text-ink-400">
                Per-provider-instance daily token caps
              </p>
              <span title="0 = no instance-specific cap">
                <Info className="w-3 h-3 text-ink-300" />
              </span>
            </div>
            <div className="space-y-2">
              {providerInstanceRows.map((inst) => (
                <label key={inst.id} className="flex items-center gap-2">
                  <span className="text-[11px] text-ink-600 w-44 shrink-0">{inst.label}</span>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    placeholder="0 = no cap"
                    value={providerInstanceBudgets[inst.id] ?? 0}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setProviderInstanceBudgets((prev) => ({
                        ...prev,
                        [inst.id]: isNaN(v) ? 0 : v,
                      }));
                    }}
                    className="w-28 px-2 py-1 text-[11px] font-mono border border-ink-100 rounded bg-white text-ink-700 focus:outline-none focus:border-sage-400"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Model allowlist */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] font-mono uppercase tracking-wider text-ink-400">
                Model allowlist
              </p>
              <span title="Comma-separated. Empty = all models allowed.">
                <Info className="w-3 h-3 text-ink-300" />
              </span>
            </div>
            <input
              type="text"
              value={allowedModelsText}
              onChange={(e) => setAllowedModelsText(e.target.value)}
              placeholder="gpt-4.1-mini, claude-3-haiku-20240307 … (empty = all)"
              className="w-full px-2 py-1.5 text-[11px] font-mono border border-ink-100 rounded bg-white text-ink-700 focus:outline-none focus:border-sage-400"
            />
            <p className="text-[10px] text-ink-400">
              Comma-separated model IDs. When set, AI requests using any other model will be blocked.
            </p>
          </div>

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
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sage-500 text-white rounded hover:bg-sage-600 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            Save advanced settings
          </button>
        </div>
      )}
    </div>
  );
}

// ── GuardrailsSection (composition root) ─────────────────────────────────────

export interface GuardrailsSectionProps {
  ai: AiPublicConfig;
  onSaveBudget: (budget: number) => Promise<void>;
  onSaveGuardrails: (patch: Partial<AiGuardrailsConfig>) => Promise<void>;
}

export function GuardrailsSection({ ai, onSaveBudget, onSaveGuardrails }: GuardrailsSectionProps) {
  const [detail, setDetail] = useState<AiUsageDetail | null>(null);
  const [basicUsage, setBasicUsage] = useState<AiUsageSummary | null>(null);
  const [preflight, setPreflight] = useState<AiPreflightResult | null>(null);

  useEffect(() => {
    void getAiUsageDetail()
      .then(setDetail)
      .catch(() => void getAiUsage().then(setBasicUsage).catch(() => {}));
  }, []);

  useEffect(() => {
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
        <h3 className="text-xs font-mono uppercase tracking-wider text-ink-500">
          Usage &amp; Guardrails
        </h3>
        <HelpButton
          helpId="guardrails"
          title="Usage & Guardrails"
          summary="Controls how much AI Seedbank uses and where your data goes. The token budget caps spending. The privacy notice shows whether idea content leaves this machine."
          details="Ollama and local custom endpoints (LM Studio, vLLM, llama.cpp, LocalAI) send content only to the configured local host. Cloud providers (OpenAI API, Anthropic API, OpenRouter, Groq, Mistral, and other external endpoints) send field content to their servers. Use Advanced controls to set per-feature budgets, provider/model allowlists, and local-only mode."
          manualSection="settings-ai"
          alwaysShow
        />
      </div>

      <PrivacyNotice ai={ai} preflight={preflight} />
      <BudgetSection budget={ai.dailyTokenBudget} onSave={onSaveBudget} />
      <UsageAuditSection detail={detail} basicUsage={basicUsage} />
      <AdvancedGuardrailsSection
        guardrails={ai.guardrails}
        providerInstances={ai.providerInstances}
        onSave={onSaveGuardrails}
      />
    </div>
  );
}
