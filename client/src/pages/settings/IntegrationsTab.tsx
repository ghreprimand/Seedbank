/**
 * Settings → Integrations: configure external project adapters and graduation paths.
 *
 * Fields are driven dynamically from each integration's configSchema, so no
 * hard-coded per-integration UI branching is needed here.
 *
 * Data: reads integration list from the settings store (hydrated on boot).
 * Mutations: configureIntegration goes direct to POST /api/integrations/:id/configure
 *   (not part of aggregate PATCH). After configure, we refresh the full store so
 *   the `configured` flag updates everywhere.
 *
 * Health: each card exposes a "Test connection" button that calls
 *   GET /api/integrations/:id/health without mutating state.
 */
import { useState } from 'react';
import { FolderPlus, Network, Check, Loader2, CheckCircle2, AlertTriangle, XCircle, HelpCircle as HelpCircleIcon } from 'lucide-react';
import { checkIntegrationHealth, configureIntegration } from '@/api/client';
import { useIntegrationsSettings, useSettingsStore, useSettingsOffline } from '@/stores/settings';
import { HelpButton } from '@/help/HelpPopover';
import type { ConfigFieldDescriptor, IntegrationHealthResult, IntegrationSummary } from '@/lib/types';

const ICONS = { Network, FolderPlus } as const;

function IconFor({ icon }: { icon: string }) {
  const Icon = ICONS[icon as keyof typeof ICONS] ?? FolderPlus;
  return <Icon className="w-4 h-4" />;
}

// ── Health indicator ──────────────────────────────────────────────────────────

function HealthDot({ health }: { health: IntegrationHealthResult | null }) {
  if (!health) return null;
  const cfg = {
    ok:           { color: 'bg-sage-500',   label: 'Connected' },
    degraded:     { color: 'bg-amber-400',  label: 'Degraded' },
    unreachable:  { color: 'bg-red-400',    label: 'Unreachable' },
    unconfigured: { color: 'bg-ink-300',    label: 'Not configured' },
  }[health.status];

  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-ink-500">
      <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.color}`} aria-hidden />
      {cfg.label}
      {health.latencyMs !== undefined && (
        <span className="text-ink-300">({health.latencyMs} ms)</span>
      )}
    </span>
  );
}

function HealthIcon({ health }: { health: IntegrationHealthResult | null }) {
  if (!health) return null;
  switch (health.status) {
    case 'ok':           return <CheckCircle2  className="w-3.5 h-3.5 text-sage-500" />;
    case 'degraded':     return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
    case 'unreachable':  return <XCircle       className="w-3.5 h-3.5 text-red-400" />;
    case 'unconfigured': return <HelpCircleIcon className="w-3.5 h-3.5 text-ink-300" />;
  }
}

// ── Card state ────────────────────────────────────────────────────────────────

interface CardState {
  /** Field values keyed by configSchema[].key */
  values: Record<string, string>;
  busy: boolean;
  saved: boolean;
  error: string | null;
  health: IntegrationHealthResult | null;
  healthChecking: boolean;
  healthMessage: string | null;
}

function defaultCardState(integration: IntegrationSummary): CardState {
  return {
    values: { ...integration.configValues },
    busy: false,
    saved: false,
    error: null,
    health: null,
    healthChecking: false,
    healthMessage: null,
  };
}

// ── Dynamic field renderer ────────────────────────────────────────────────────

function ConfigField({
  field,
  value,
  integrationId,
  onChange,
}: {
  field: ConfigFieldDescriptor;
  value: string;
  integrationId: string;
  onChange: (key: string, val: string) => void;
}) {
  const inputId = `field-${integrationId}-${field.key}`;
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label
          htmlFor={inputId}
          className="text-[11px] font-mono uppercase text-ink-400 tracking-wider"
        >
          {field.label}
          {field.required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
        {field.helpText && (
          <HelpButton
            helpId={`${integrationId}-${field.key}`}
            title={field.label}
            summary={field.helpText}
            alwaysShow
          />
        )}
      </div>
      <input
        id={inputId}
        type={field.type === 'secret' ? 'password' : 'text'}
        value={value}
        onChange={(e) => onChange(field.key, e.target.value)}
        placeholder={field.placeholder ?? ''}
        autoComplete={field.type === 'secret' ? 'off' : undefined}
        className="w-full px-3 py-2 text-sm bg-paper-warm border border-ink-100
                   rounded-card outline-none focus:ring-2 focus:ring-sage-400
                   transition-all placeholder:text-ink-300"
      />
    </div>
  );
}

// ── Integration card ──────────────────────────────────────────────────────────

/**
 * User-facing description overrides for well-known adapters.
 * The server description is implementation-oriented; these are task-oriented.
 */
const ADAPTER_COPY: Record<string, { description: string; generatedFiles?: string }> = {
  'generic-project': {
    description: 'Creates a project folder in the directory you choose. Always includes README.md with your idea brief and CLAUDE.md with AI context. Also adds a package.json and starter file for most ideas; game ideas get a project.godot stub instead.',
    generatedFiles: 'README.md · CLAUDE.md (always) · package.json + starter file (all non-game ideas) · project.godot stub (game ideas)',
  },
  'custom-local': {
    description: 'An optional adapter for integrating with a specific local workflow tool. Not required for standard project graduation — use Local Project scaffold for most cases.',
  },
};

interface IntegrationCardProps {
  integration: IntegrationSummary;
  state: CardState;
  offline: boolean;
  onSave: (integration: IntegrationSummary) => Promise<void>;
  onTest: (integration: IntegrationSummary) => Promise<void>;
  onFieldChange: (integrationId: string, key: string, value: string) => void;
}

function IntegrationCard({ integration, state, offline, onSave, onTest, onFieldChange }: IntegrationCardProps) {
  const copy = ADAPTER_COPY[integration.id];
  const description = copy?.description ?? integration.description;

  const hasDraftChanges = integration.configSchema.some(
    (f) => (state.values[f.key] ?? '') !== (integration.configValues[f.key] ?? ''),
  );

  return (
    <div className="p-5 bg-paper border border-ink-100 rounded-card shadow-card space-y-4">
      {/* Card header */}
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-sage-600">
          <IconFor icon={integration.icon} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-ink-800">{integration.name}</span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded-badge ${
                integration.configured
                  ? 'bg-sage-100 text-sage-700'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              {integration.configured ? 'configured' : 'needs path'}
            </span>
            {state.health && (
              <span className="inline-flex items-center gap-1">
                <HealthIcon health={state.health} />
                <HealthDot health={state.health} />
              </span>
            )}
          </div>
          <p className="text-xs text-ink-400 mt-0.5">{description}</p>
          {copy?.generatedFiles && (
            <p className="text-[11px] text-ink-300 mt-1 font-mono">{copy.generatedFiles}</p>
          )}
        </div>
        {integration.helpSectionId && (
          <HelpButton
            helpId={`integration-card-${integration.id}`}
            title={integration.name}
            summary={description}
            manualSection={integration.helpSectionId}
            alwaysShow
          />
        )}
      </div>

      {/* Dynamic config fields */}
      {integration.configSchema.length > 0 && (
        <div className="space-y-3">
          {integration.configSchema.map((field) => (
            <ConfigField
              key={field.key}
              field={field}
              value={state.values[field.key] ?? ''}
              integrationId={integration.id}
              onChange={(key, val) => onFieldChange(integration.id, key, val)}
            />
          ))}
        </div>
      )}

      {/* Health message */}
      {state.healthMessage && (
        <div
          className={`px-3 py-2 rounded-card text-xs font-mono ${
            state.health?.status === 'ok'
              ? 'bg-sage-50 border border-sage-200 text-sage-700'
              : 'bg-amber-50 border border-amber-200 text-amber-800'
          }`}
        >
          {state.healthMessage}
        </div>
      )}

      {/* Error */}
      {state.error && (
        <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-card text-xs text-red-700">
          {state.error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => { void onSave(integration); }}
          disabled={state.busy || offline}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium
                     bg-sage-600 hover:bg-sage-700 text-paper rounded-card
                     transition-colors disabled:opacity-50"
        >
          {state.busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : state.saved ? (
            <Check className="w-3.5 h-3.5" />
          ) : null}
          {state.saved ? 'Saved' : 'Save'}
        </button>

        <button
          type="button"
          onClick={() => { void onTest(integration); }}
          disabled={state.healthChecking || offline}
          title={
            hasDraftChanges
              ? 'Tests saved configuration — save first to test new values'
              : 'Test saved configuration'
          }
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium
                     bg-paper border border-ink-200 hover:border-ink-300 text-ink-600
                     hover:text-ink-800 rounded-card transition-colors disabled:opacity-50"
        >
          {state.healthChecking && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Test connection
        </button>

        {hasDraftChanges && !state.busy && (
          <span className="text-[11px] text-amber-600 font-mono leading-none">
            Save first to test new values
          </span>
        )}

        {offline && (
          <span className="text-xs text-ink-400 font-mono">API offline</span>
        )}
      </div>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function IntegrationsTab() {
  const integrations = useIntegrationsSettings();
  const loaded = useSettingsStore((s) => s.loaded);
  const refreshSettings = useSettingsStore((s) => s.refresh);
  const offline = useSettingsOffline();

  const [cardState, setCardState] = useState<Record<string, CardState>>(() => {
    const initial: Record<string, CardState> = {};
    for (const item of integrations) initial[item.id] = defaultCardState(item);
    return initial;
  });

  const patchCard = (id: string, patch: Partial<CardState>) =>
    setCardState((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? defaultCardState(integrations.find((i) => i.id === id)!)),
        ...patch,
      },
    }));

  const handleFieldChange = (integrationId: string, key: string, value: string) => {
    setCardState((prev) => ({
      ...prev,
      [integrationId]: {
        ...(prev[integrationId] ?? defaultCardState(integrations.find((i) => i.id === integrationId)!)),
        values: {
          ...(prev[integrationId]?.values ?? {}),
          [key]: value,
        },
      },
    }));
  };

  const handleSave = async (integration: IntegrationSummary) => {
    const state = cardState[integration.id] ?? defaultCardState(integration);
    patchCard(integration.id, { busy: true, error: null, saved: false });
    try {
      // Send all schema fields including empty strings.
      // An empty string signals "clear this field" to the server.
      const config: Record<string, string> = {};
      for (const [k, v] of Object.entries(state.values)) {
        config[k] = v.trim();
      }
      await configureIntegration(integration.id, config);
      await refreshSettings();
      patchCard(integration.id, { busy: false, saved: true });
      setTimeout(() => patchCard(integration.id, { saved: false }), 2500);
    } catch (err) {
      patchCard(integration.id, {
        busy: false,
        error: err instanceof Error ? err.message : 'Save failed',
      });
    }
  };

  const handleTestConnection = async (integration: IntegrationSummary) => {
    patchCard(integration.id, { healthChecking: true, health: null, healthMessage: null });
    try {
      const result = await checkIntegrationHealth(integration.id);
      patchCard(integration.id, { healthChecking: false, health: result, healthMessage: result.message ?? null });
    } catch (err) {
      patchCard(integration.id, {
        healthChecking: false,
        health: { status: 'unreachable' },
        healthMessage: err instanceof Error ? err.message : 'Health check failed',
      });
    }
  };

  if (!loaded) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-ink-400 font-mono">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading integrations…
      </div>
    );
  }

  // Split integrations into primary (generic-project) and advanced (others)
  const primaryIntegration = integrations.find((i) => i.id === 'generic-project');
  const advancedIntegrations = integrations.filter((i) => i.id !== 'generic-project');

  return (
    <div className="space-y-6 max-w-xl">
      {/* Tab header */}
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-1.5">
          <p className="text-sm text-ink-600">
            When you graduate a seed, Seedbank creates a project folder containing your idea's context —
            ready to open in your editor or hand to an AI agent.
          </p>
          <p className="text-xs text-ink-400">
            Set the <strong className="font-medium text-ink-500">project root</strong> — the parent folder where
            Seedbank will create new project directories. Each graduated idea gets its own subfolder named after the idea title.
          </p>
        </div>
        <HelpButton
          helpId="integrations-tab"
          title="Project Graduation"
          summary="Graduating a seed creates a project folder with README.md and CLAUDE.md pre-filled with your idea's context. Set the project root to tell Seedbank where to create these folders."
          details="Seedbank always creates README.md and CLAUDE.md. For all ideas except games it also adds a package.json and starter file. For game ideas it adds a project.godot stub instead. Test connection checks that the path exists and is accessible — the directory is created on first graduation."
          manualSection="settings-integrations"
          alwaysShow
        />
      </div>

      {offline && integrations.length === 0 && (
        <div className="px-3 py-2.5 bg-sage-50 border border-sage-200 rounded-card text-xs text-sage-800">
          Integration details are not available while offline.
        </div>
      )}

      {/* Primary adapter — local project scaffold */}
      {primaryIntegration && (
        <IntegrationCard
          integration={primaryIntegration}
          state={cardState[primaryIntegration.id] ?? defaultCardState(primaryIntegration)}
          offline={offline}
          onSave={handleSave}
          onTest={handleTestConnection}
          onFieldChange={handleFieldChange}
        />
      )}

      {/* Advanced adapters — collapsed by default */}
      {advancedIntegrations.length > 0 && (
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer list-none select-none py-1">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-400 group-open:text-ink-600">
              Advanced — Custom adapters
            </span>
            <span className="text-[10px] text-ink-300 group-open:hidden">▶</span>
            <span className="text-[10px] text-ink-300 hidden group-open:inline">▼</span>
          </summary>
          <p className="text-xs text-ink-400 mt-1 mb-3">
            Custom local adapters integrate with a specific local workflow tool. These are optional
            and are not needed for standard project graduation.
          </p>
          <div className="space-y-4">
            {advancedIntegrations.map((integration) => (
              <IntegrationCard
                key={integration.id}
                integration={integration}
                state={cardState[integration.id] ?? defaultCardState(integration)}
                offline={offline}
                onSave={handleSave}
                onTest={handleTestConnection}
                onFieldChange={handleFieldChange}
              />
            ))}
          </div>
        </details>
      )}

      {!offline && integrations.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <span className="text-3xl mb-3">🔌</span>
          <p className="text-sm font-mono text-ink-400">No integrations available</p>
        </div>
      )}
    </div>
  );
}
