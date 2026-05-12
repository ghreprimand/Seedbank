/**
 * Settings → Integrations: configure external project adapters and graduation paths.
 *
 * Data: reads integration list from the settings store (hydrated on boot).
 * Mutations: configureIntegration goes direct to POST /api/integrations/:id/configure
 *   (not part of aggregate PATCH). After configure, we refresh the full store so
 *   the `configured` flag updates everywhere.
 */
import { useState } from 'react';
import { FolderPlus, Network, Check, Loader2 } from 'lucide-react';
import { configureIntegration } from '@/api/client';
import { useIntegrationsSettings, useSettingsStore, useSettingsOffline } from '@/stores/settings';
import type { IntegrationSummary } from '@/lib/types';

const ICONS = { Network, FolderPlus } as const;

function IconFor({ icon }: { icon: string }) {
  const Icon = ICONS[icon as keyof typeof ICONS] ?? FolderPlus;
  return <Icon className="w-4 h-4" />;
}

function configPlaceholder(id: string, field: 'root' | 'archon') {
  if (field === 'archon') return '/path/to/your/adapter-workspace';
  if (id === 'archon') return '/path/to/your/adapter-workspace/projects';
  return '/path/to/your/projects';
}

interface CardState {
  projectRoot: string;
  archonRoot: string;
  busy: boolean;
  saved: boolean;
  error: string | null;
}

function defaultCardState(): CardState {
  return { projectRoot: '', archonRoot: '', busy: false, saved: false, error: null };
}

export default function IntegrationsTab() {
  const integrations = useIntegrationsSettings();
  const loaded = useSettingsStore((s) => s.loaded);
  const refreshSettings = useSettingsStore((s) => s.refresh);
  const offline = useSettingsOffline();

  const [cardState, setCardState] = useState<Record<string, CardState>>(() => {
    const initial: Record<string, CardState> = {};
    for (const item of integrations) initial[item.id] = defaultCardState();
    return initial;
  });

  const patchCard = (id: string, patch: Partial<CardState>) =>
    setCardState((prev) => ({ ...prev, [id]: { ...(prev[id] ?? defaultCardState()), ...patch } }));

  const handleSave = async (integration: IntegrationSummary) => {
    const state = cardState[integration.id] ?? defaultCardState();
    patchCard(integration.id, { busy: true, error: null, saved: false });
    try {
      const config: Record<string, string> = {};
      if (state.projectRoot.trim()) config.projectRoot = state.projectRoot.trim();
      if (integration.id === 'archon' && state.archonRoot.trim()) {
        config.archonRoot = state.archonRoot.trim();
      }
      await configureIntegration(integration.id, config);
      // Refresh full aggregate so integrations[].configured updates in store.
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

  if (!loaded) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-ink-400 font-mono">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading integrations…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-xl">
      <p className="text-sm text-ink-400">
        Configure where Seedbank creates project scaffolds when you graduate an idea.
        Set a project root for any adapter you plan to use.
      </p>

      {offline && integrations.length === 0 && (
        <div className="px-3 py-2.5 bg-sage-50 border border-sage-200 rounded-card text-xs text-sage-800">
          Integration details are not available while offline.
        </div>
      )}

      {integrations.map((integration) => {
        const state = cardState[integration.id] ?? defaultCardState();
        return (
          <div
            key={integration.id}
            className="p-5 bg-paper border border-ink-100 rounded-card shadow-card space-y-4"
          >
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
                </div>
                <p className="text-xs text-ink-400 mt-0.5">{integration.description}</p>
              </div>
            </div>

            {/* Config fields */}
            <div className="space-y-3">
              {integration.id === 'archon' && (
                <label className="block">
                  <span className="block text-[11px] font-mono uppercase text-ink-400 mb-1 tracking-wider">
                    Workspace root
                  </span>
                  <input
                    value={state.archonRoot}
                    onChange={(e) => patchCard(integration.id, { archonRoot: e.target.value })}
                    placeholder={configPlaceholder(integration.id, 'archon')}
                    className="w-full px-3 py-2 text-sm bg-paper-warm border border-ink-100
                               rounded-card outline-none focus:ring-2 focus:ring-sage-400
                               transition-all placeholder:text-ink-300"
                  />
                </label>
              )}
              <label className="block">
                <span className="block text-[11px] font-mono uppercase text-ink-400 mb-1 tracking-wider">
                  Project root
                </span>
                <input
                  value={state.projectRoot}
                  onChange={(e) => patchCard(integration.id, { projectRoot: e.target.value })}
                  placeholder={configPlaceholder(integration.id, 'root')}
                  className="w-full px-3 py-2 text-sm bg-paper-warm border border-ink-100
                             rounded-card outline-none focus:ring-2 focus:ring-sage-400
                             transition-all placeholder:text-ink-300"
                />
              </label>
            </div>

            {/* Error */}
            {state.error && (
              <div className="px-3 py-2 bg-sage-50 border border-sage-200 rounded-card text-xs text-sage-800">
                {state.error}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleSave(integration)}
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
              {offline && (
                <span className="text-xs text-ink-400 font-mono">API offline</span>
              )}
            </div>
          </div>
        );
      })}

      {!offline && integrations.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <span className="text-3xl mb-3">🔌</span>
          <p className="text-sm font-mono text-ink-400">No integrations available</p>
        </div>
      )}
    </div>
  );
}
