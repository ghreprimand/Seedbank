/**
 * FeatureRoutingSection — per-feature AI provider/model routing table.
 */
import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type {
  AiFeatureId,
  AiFeatureRoute,
  AiConfigInput,
  AiMethodCapability,
  AiProviderId,
  AiProviderInstanceId,
  AiPublicConfig,
  AiReasoningEffort,
} from '@/lib/types';
import { HelpButton } from '@/help/HelpPopover';
import {
  presetFor,
  providerInstanceBadge,
  providerLabel,
  providerModel,
  providerSupportsEffort,
  providerSupportsVerbosity,
  routeModel,
  updateRouteControl,
} from './helpers';
import { AI_FEATURE_ROWS } from './constants';
import { ModelPicker } from './ModelPicker';
import type { ProviderCardStatus } from './types';

export interface FeatureRoutingSectionProps {
  ai: AiPublicConfig;
  providerStatuses: Partial<Record<AiProviderId, ProviderCardStatus>>;
  providerAvailability: Partial<Record<AiProviderId, {
    availability: AiMethodCapability['availability'];
    reason?: string;
    featureRoutable: boolean;
  }>>;
  onSave: (routes: AiPublicConfig['featureRoutes']) => Promise<void>;
  onSaveDefault: (config: Partial<AiConfigInput>) => Promise<void>;
}

export function FeatureRoutingSection({
  ai,
  providerStatuses,
  providerAvailability,
  onSave,
  onSaveDefault,
}: FeatureRoutingSectionProps) {
  const defaultEffortForInstance = (instanceId: AiProviderInstanceId): AiReasoningEffort | '' =>
    instanceId === 'codex-account'
      ? ai.codexReasoningEffort ?? ''
      : instanceId === 'openai-api'
        ? ai.openaiReasoningEffort ?? ''
        : '';

  const [routes, setRoutes] = useState(ai.featureRoutes);
  const [lastFeatureRoutes, setLastFeatureRoutes] = useState(ai.featureRoutes);
  const [defaultInstanceId, setDefaultInstanceId] = useState(ai.defaultProviderInstanceId);
  const [lastDefaultDraft, setLastDefaultDraft] = useState(() => ({
    instanceId: ai.defaultProviderInstanceId,
    providerInstances: ai.providerInstances,
    codexReasoningEffort: ai.codexReasoningEffort,
    openaiReasoningEffort: ai.openaiReasoningEffort,
  }));
  const [defaultModel, setDefaultModel] = useState(
    ai.providerInstances[ai.defaultProviderInstanceId]?.configuredModel ?? '',
  );
  const [defaultEffort, setDefaultEffort] = useState<AiReasoningEffort | ''>(
    defaultEffortForInstance(ai.defaultProviderInstanceId),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (ai.featureRoutes !== lastFeatureRoutes) {
    setLastFeatureRoutes(ai.featureRoutes);
    setRoutes(ai.featureRoutes);
  }

  if (
    ai.defaultProviderInstanceId !== lastDefaultDraft.instanceId ||
    ai.providerInstances !== lastDefaultDraft.providerInstances ||
    ai.codexReasoningEffort !== lastDefaultDraft.codexReasoningEffort ||
    ai.openaiReasoningEffort !== lastDefaultDraft.openaiReasoningEffort
  ) {
    const instance = ai.providerInstances[ai.defaultProviderInstanceId];
    setLastDefaultDraft({
      instanceId: ai.defaultProviderInstanceId,
      providerInstances: ai.providerInstances,
      codexReasoningEffort: ai.codexReasoningEffort,
      openaiReasoningEffort: ai.openaiReasoningEffort,
    });
    setDefaultInstanceId(ai.defaultProviderInstanceId);
    setDefaultModel(instance?.configuredModel ?? '');
    setDefaultEffort(defaultEffortForInstance(ai.defaultProviderInstanceId));
  }

  const isLocalInstance = ai.defaultProviderInstanceId === 'local-openai-compatible';
  const openAICompatiblePreset = presetFor(
    isLocalInstance
      ? (ai.localOpenaiCompatiblePreset ?? ai.openaiCompatiblePreset)
      : (ai.cloudOpenaiCompatiblePreset ?? ai.openaiCompatiblePreset),
  );
  const instanceRoutingOptions = Object.values(ai.providerInstances).filter(
    (instance) =>
      instance.featureRoutable &&
      ai.guardrails.providerEnabled[instance.provider] !== false &&
      ai.guardrails.providerInstanceEnabled[instance.id] !== false,
  );
  const firstInstanceForProvider = (provider: AiProviderId): AiProviderInstanceId | null =>
    instanceRoutingOptions.find((instance) => instance.provider === provider)?.id ?? null;
  const fallbackDefaultInstanceId = instanceRoutingOptions[0]?.id ?? ai.defaultProviderInstanceId;
  const selectedDefaultInstanceId = instanceRoutingOptions.some((instance) => instance.id === defaultInstanceId)
    ? defaultInstanceId
    : fallbackDefaultInstanceId;
  const defaultInstance = ai.providerInstances[selectedDefaultInstanceId];
  const defaultProvider = defaultInstance?.provider ?? ai.provider;
  const defaultInstanceModels = defaultInstance?.enabledModelIds?.length
    ? (defaultInstance.discoveredModels ?? []).filter((model) =>
        defaultInstance.enabledModelIds?.includes(model.id),
      )
    : defaultInstance?.discoveredModels ?? [];
  const defaultSupportsEffort = providerSupportsEffort(
    defaultProvider,
    selectedDefaultInstanceId,
    defaultModel,
  );

  const modelPatchForInstance = (
    instanceId: AiProviderInstanceId,
    model: string,
  ): Partial<AiPublicConfig> => {
    const trimmed = model.trim();
    if (!trimmed) return {};
    if (instanceId === 'claude-api') return { anthropicModel: trimmed };
    if (instanceId === 'claude-account') return { claudeAccountModel: trimmed };
    if (instanceId === 'openai-api') return { openaiModel: trimmed };
    if (instanceId === 'codex-account') return { codexAccountModel: trimmed };
    if (instanceId === 'ollama') return { ollamaModel: trimmed };
    if (instanceId === 'local-openai-compatible') return { localOpenaiCompatibleModel: trimmed };
    return { cloudOpenaiCompatibleModel: trimmed };
  };

  const defaultConfigPatch = (): Partial<AiConfigInput> => ({
    defaultProviderInstanceId: selectedDefaultInstanceId,
    provider: defaultProvider,
    ...modelPatchForInstance(selectedDefaultInstanceId, defaultModel),
    ...(selectedDefaultInstanceId === 'openai-api'
      ? { openaiReasoningEffort: defaultSupportsEffort && defaultEffort ? defaultEffort : null }
      : { openaiReasoningEffort: null }),
    ...(selectedDefaultInstanceId === 'codex-account'
      ? { codexReasoningEffort: defaultSupportsEffort && defaultEffort ? defaultEffort : null }
      : { codexReasoningEffort: null }),
  });

  const instanceForRoute = (route: AiFeatureRoute) => {
    if (route.provider === 'default') return null;
    const instanceId = route.providerInstanceId ?? firstInstanceForProvider(route.provider);
    return instanceId ? ai.providerInstances[instanceId] : null;
  };

  const updateRoute = (feature: AiFeatureId, route: AiFeatureRoute) => {
    setRoutes((current) => ({ ...current, [feature]: route }));
  };

  const save = async () => {
    // Gate: prevent saving routes to providers/methods marked unavailable.
    const unavailableRoutes = Object.values(routes).filter((route) => {
      if (route.provider === 'default') return false;
      const instanceId = route.providerInstanceId ?? firstInstanceForProvider(route.provider);
      if (!instanceId) return false;
      const instance = ai.providerInstances[instanceId];
      if (!instance) return false;
      if (ai.guardrails.providerEnabled[instance.provider] === false) return true;
      if (ai.guardrails.providerInstanceEnabled[instance.id] === false) return true;
      return instance.available === 'unavailable';
    });
    if (unavailableRoutes.length > 0) {
      const reasons = unavailableRoutes
        .map((route) => instanceForRoute(route)?.availabilityReason ?? null)
        .filter(Boolean)
        .join(' ');
      setSaveError(
        `One or more features are routed to an unavailable or disabled method. Change those routes before saving.${
          reasons ? ` ${reasons}` : ''
        }`,
      );
      return;
    }
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await onSaveDefault(defaultConfigPatch());
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
              summary="Each row is a real runtime route for that feature. Provider/model/effort in this table directly controls what the backend uses."
              details="Use global default means inherit the top row. Any non-default row is an explicit override. Check each row's Effective line before saving if privacy, cost, or latency matter."
              manualSection="settings-ai"
              alwaysShow
            />
          </div>
          <p className="text-xs text-ink-400 mt-1">
            Route each AI feature to the global provider or a specific chat/model-capable provider.
            Account login, API key, local model, and OpenAI-compatible methods are all eligible.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-sage-600 hover:bg-sage-700 disabled:bg-ink-300 text-white rounded-card transition-colors"
        >
          {saving ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : saved ? (
            <Check className="w-3 h-3" />
          ) : null}
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>

      <div
        className="grid gap-3 p-3 border border-ink-100 rounded-card bg-paper md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-start"
        data-help="settings-ai-feature-defaults-global"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-800">Global default</p>
          <p className="text-xs text-ink-400">
            Used by every feature row set to Use global default.
          </p>
        </div>

        <label
          className="block text-xs text-ink-500"
          data-help="settings-ai-feature-provider"
          data-help-title="Global Default Provider"
          data-help-body="Select the provider instance inherited by rows set to Use global default."
          data-help-details="This is the baseline runtime route for most features unless a row overrides it."
          data-help-manual="settings-ai"
        >
          Provider
          <select
            value={selectedDefaultInstanceId}
            onChange={(event) => {
              const nextId = event.target.value as AiProviderInstanceId;
              const instance = ai.providerInstances[nextId];
              if (!instance) return;
              setDefaultInstanceId(nextId);
              setDefaultModel(instance.configuredModel || '');
              setDefaultEffort(
                nextId === 'codex-account'
                  ? ai.codexReasoningEffort ?? ''
                  : nextId === 'openai-api'
                    ? ai.openaiReasoningEffort ?? ''
                    : '',
              );
            }}
            className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800"
          >
            {instanceRoutingOptions.map((instance) => (
              <option key={instance.id} value={instance.id}>
                {instance.label}
                {instance.available === 'auth-required' ? ' — auth required' : ''}
                {instance.available === 'unavailable' ? ' — unavailable' : ''}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] text-ink-400">
            Current global default: {providerInstanceBadge(ai, selectedDefaultInstanceId, defaultModel)}
          </span>
        </label>

        <label
          className="block text-xs text-ink-500"
          data-help="settings-ai-feature-model"
          data-help-title="Global Default Model"
          data-help-body="Select the default model for the current global provider instance."
          data-help-details="Rows set to Use global default inherit this model unless they are explicitly overridden."
          data-help-manual="settings-ai"
        >
          Model
          <ModelPicker
            discoveredModels={defaultInstanceModels}
            value={defaultModel}
            onChange={setDefaultModel}
            placeholder={defaultInstance?.configuredModel || 'Choose a model'}
          />
          <span className="mt-1 block text-[11px] text-ink-400">
            This is the model inherited by Use global default rows.
          </span>
        </label>

        <label
          className="block text-xs text-ink-500 min-w-[110px]"
          data-help="settings-ai-feature-effort"
          data-help-title="Global Default Effort"
          data-help-body="Reasoning effort defaults for rows inheriting the global route."
          data-help-details="Effort appears only for provider/model combinations that support it."
          data-help-manual="settings-ai"
        >
          Effort
          <select
            value={defaultSupportsEffort ? defaultEffort : ''}
            disabled={!defaultSupportsEffort}
            onChange={(event) => {
              const value = event.target.value;
              setDefaultEffort(
                value === 'minimal' || value === 'low' || value === 'medium' || value === 'high'
                  ? value
                  : '',
              );
            }}
            className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800 disabled:bg-ink-50 disabled:text-ink-400"
          >
            <option value="">{defaultSupportsEffort ? 'Default' : 'Not available'}</option>
            {defaultSupportsEffort && (
              <>
                <option value="minimal">Minimal</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </>
            )}
          </select>
          <span className="mt-1 block text-[11px] text-ink-400">
            {defaultSupportsEffort ? 'Inherited unless a feature overrides it.' : 'Not supported by this provider/model.'}
          </span>
        </label>
      </div>

      <div className="divide-y divide-ink-100 border border-ink-100 rounded-card bg-paper overflow-hidden">
        {AI_FEATURE_ROWS.map((feature) => {
          const route = routes[feature.id] ?? { provider: 'default' as const };
          const savedEffective = ai.effectiveFeatureRoutes[feature.id];
          const effective = route.provider === 'default'
            ? {
                provider: defaultProvider,
                providerInstanceId: selectedDefaultInstanceId,
                model: defaultModel,
                ...(defaultSupportsEffort && defaultEffort ? { effort: defaultEffort } : {}),
                inherited: true,
              }
            : savedEffective;
          const selectedInstanceId =
            route.provider === 'default'
              ? null
              : (route.providerInstanceId ?? firstInstanceForProvider(route.provider));
          const selectedInstance = selectedInstanceId
            ? ai.providerInstances[selectedInstanceId]
            : null;
          const modelPickerInstance = route.provider === 'default'
            ? defaultInstance
            : selectedInstance;
          const modelPickerModels = modelPickerInstance?.enabledModelIds?.length
            ? (modelPickerInstance.discoveredModels ?? []).filter((model) =>
                modelPickerInstance.enabledModelIds?.includes(model.id),
              )
            : modelPickerInstance?.discoveredModels ?? [];
          const modelPickerValue =
            route.provider === 'default'
              ? defaultModel
              : route.model ?? selectedInstance?.configuredModel ?? '';
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
                    : selectedProvider === 'openai-compatible' &&
                        openAICompatiblePreset.requiresKey &&
                        !(
                          ai.hasCloudOpenAICompatibleKey ||
                          ai.hasLocalOpenAICompatibleKey ||
                          ai.hasOpenAICompatibleKey
                        )
                      ? 'This endpoint preset needs an API key — add it in the External / Cloud card.'
                      : providerAvailability[selectedProvider] &&
                          providerAvailability[selectedProvider]?.availability !== 'available'
                        ? (providerAvailability[selectedProvider]?.reason ??
                            'Selected method is not available right now.')
                        : selectedProvider === 'ollama' &&
                            providerStatuses.ollama === 'unreachable'
                          ? 'Ollama host is unreachable. Check the Ollama base URL and daemon.'
                          : null;

          const providerHint =
            selectedProvider === 'default'
              ? 'Uses whichever provider is set as global default above.'
              : selectedUnavailableReason
                ? `Unavailable right now: ${selectedUnavailableReason}`
                : selectedProvider === 'claude-account'
                  ? ai.claudeAccountAvailable
                    ? ai.claudeAccountAuthenticated
                      ? 'Subscription login path (not API-key billing).'
                      : 'Claude account requires sign-in before routing features here.'
                    : 'Claude account login runtime is unavailable. Refresh status or use the Anthropic API provider for Claude models.'
                  : selectedProvider === 'codex-account'
                    ? 'Codex account subscription transport — separate from OpenAI API billing. See the Codex account card for setup.'
                    : selectedProvider === 'openai-compatible'
                      ? 'Custom endpoint — accepts manual model IDs. Verify whether your preset is a local server or cloud service.'
                      : 'Overrides the global default for this feature.';

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
          const controlModel = route.provider === 'default'
            ? defaultModel
            : routeModel(route, selectedInstance);
          const supportsEffort = providerSupportsEffort(
            route.provider,
            selectedInstanceId,
            controlModel,
          );
          const supportsVerbosity = providerSupportsVerbosity(selectedInstanceId, controlModel);
          const effortHint = route.provider === 'default'
            ? 'Inherited from the global default route.'
            : supportsEffort
              ? 'Controls reasoning depth for this feature.'
              : 'Effort is not available for this provider/model.';

          return (
            <div
              key={feature.id}
              className={`grid gap-3 p-3 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-start ${
                feature.secondary ? 'opacity-60' : ''
              }`}
              data-help="settings-ai-feature-defaults-row"
              data-help-title={`${feature.label} Route`}
              data-help-body={`Controls provider routing for ${feature.label}. "${feature.detail}"`}
              data-help-details={feature.secondary
                ? 'This is a fallback row used only when a feature has no dedicated route.'
                : 'Set provider to Use global default to inherit, or choose a specific provider instance to override.'}
              data-help-manual="settings-ai"
            >
              <div className="min-w-0">
                <p
                  className={`text-sm text-ink-800 ${
                    feature.secondary ? 'font-normal italic' : 'font-semibold'
                  }`}
                >
                  {feature.label}
                </p>
                <p className="text-xs text-ink-400">{feature.detail}</p>
              </div>

              <label
                className="block text-xs text-ink-500"
                data-help="settings-ai-feature-provider"
                data-help-title={`${feature.label} Provider`}
                data-help-body={`Choose which provider instance runs ${feature.label}.`}
                data-help-details={providerHint}
                data-help-manual="settings-ai"
              >
                Provider
                <select
                  value={
                    selectedProvider === 'default' ? 'default' : (selectedInstanceId ?? '')
                  }
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
                <span className="mt-1 block text-[11px] text-ink-400">{providerHint}</span>
              </label>

              <label
                className="block text-xs text-ink-500"
                data-help="settings-ai-feature-model"
                data-help-title={`${feature.label} Model`}
                data-help-body={`Select the model used by ${feature.label} for the current provider selection.`}
                data-help-details={modelHint}
                data-help-manual="settings-ai"
              >
                Model
                <ModelPicker
                  discoveredModels={modelPickerModels}
                  value={modelPickerValue}
                  disabled={route.provider === 'default'}
                  onChange={(model) => updateRoute(feature.id, { ...route, model })}
                  placeholder={
                    route.provider === 'default'
                      ? providerModel(ai, ai.provider)
                      : selectedInstance?.configuredModel || providerModel(ai, route.provider)
                  }
                />
                <span className="mt-1 block text-[11px] text-ink-400">{modelHint}</span>
              </label>

              <div className="space-y-2 min-w-[110px]">
                <label
                  className="block text-xs text-ink-500"
                  data-help="settings-ai-feature-effort"
                  data-help-title={`${feature.label} Effort`}
                  data-help-body="Controls reasoning depth when the selected provider/model supports effort."
                  data-help-details={effortHint}
                  data-help-manual="settings-ai"
                >
                  Effort
                  <select
                    value={supportsEffort ? route.effort ?? '' : ''}
                    disabled={!supportsEffort}
                    onChange={(event) =>
                      updateRoute(
                        feature.id,
                        updateRouteControl(route, 'effort', event.target.value),
                      )
                    }
                    className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800 disabled:bg-ink-50 disabled:text-ink-400"
                  >
                    <option value="">{supportsEffort ? 'Default' : 'Not available'}</option>
                    {supportsEffort && (
                      <>
                        <option value="minimal">Minimal</option>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </>
                    )}
                  </select>
                  <span className="mt-1 block text-[11px] text-ink-400">{effortHint}</span>
                </label>
                {supportsVerbosity && (
                  <label
                    className="block text-xs text-ink-500"
                    data-help="settings-ai-feature-verbosity"
                    data-help-title={`${feature.label} Verbosity`}
                    data-help-body="Controls response length/detail for supporting provider/model routes."
                    data-help-details="Leave at Default unless this feature consistently needs shorter or more detailed responses."
                    data-help-manual="settings-ai"
                  >
                    Verbosity
                    <select
                      value={route.verbosity ?? ''}
                      onChange={(event) =>
                        updateRoute(
                          feature.id,
                          updateRouteControl(route, 'verbosity', event.target.value),
                        )
                      }
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
            </div>
          );
        })}
      </div>
      {saveError && <p className="text-[11px] text-red-600 font-mono">{saveError}</p>}
    </div>
  );
}
