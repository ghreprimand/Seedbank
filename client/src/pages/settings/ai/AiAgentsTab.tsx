/**
 * AiAgentsTab — composition root for the AI & Agents settings page.
 *
 * All sub-components live in sibling files under ./ai/. This file manages
 * top-level state, data fetching, save handlers, and the JSX layout.
 */
import { useState, useEffect } from 'react';
import { useAiSettings, useSettingsOffline, useSettingsStore } from '@/stores/settings';
import { getAiMethodCapabilities } from '@/api/client';
import { aiProviderLabel } from '@/lib/types';
import type {
  AiMethodCapability,
  AiOpenAICompatiblePresetId,
  AiProviderInstanceConfig,
  AiProviderInstanceId,
  AiProviderId,
  AiPublicConfig,
} from '@/lib/types';
import { HelpButton } from '@/help/HelpPopover';

import {
  ProviderCard,
  ProviderProbe,
  ServiceMethodSwitch,
  OpenAICompatibleDetail,
  ClaudeAccountDetail,
  CodexAccountDetail,
  FeatureRoutingSection,
  GuardrailsSection,
  ProviderDetailForm,
} from './';
import {
  presetFor,
  openAICompatiblePresetMatchesMode,
  isLikelyLocalUrl,
  initialLocalServerType,
  optionFromMethodCapability,
} from './helpers';
import { LOCAL_SERVER_OPTIONS, CLOUD_COMPATIBLE_DEFAULT_PRESET } from './constants';
import type { ProviderCardStatus, LocalServerType } from './types';

export default function AiAgentsTab() {
  const ai = useAiSettings();
  const offline = useSettingsOffline();
  const patch = useSettingsStore((s) => s.patch);
  const refreshSettings = useSettingsStore((s) => s.refresh);

  // ── Probe status tracking ──────────────────────────────────────────────────
  const [probeStatuses, setProbeStatuses] = useState<Partial<Record<AiProviderId, ProviderCardStatus>>>({});
  const setProbeStatus = (provider: AiProviderId, status: ProviderCardStatus) => {
    setProbeStatuses((current) => ({ ...current, [provider]: status }));
  };
  const persistProbeStatus = (
    instanceId: AiProviderInstanceId,
    provider: AiProviderId,
    status: ProviderCardStatus,
  ) => {
    setProbeStatus(provider, status);
    void patch('ai', {
      providerInstances: {
        [instanceId]: {
          lastProbeStatus: status,
          lastProbedAt: new Date().toISOString(),
        },
      },
    });
  };

  // ── Method capabilities ────────────────────────────────────────────────────
  const [methodCapabilities, setMethodCapabilities] = useState<AiMethodCapability[]>([]);
  const claudeMethod = ai.claudeServiceMethod;
  const openaiMethod = ai.codexOpenAIServiceMethod;

  const saveClaudeMethod = (method: string) => {
    if (method !== 'anthropic-api-key' && method !== 'claude-account-native') return;
    void patch('ai', { claudeServiceMethod: method });
  };

  const saveOpenaiMethod = (method: string) => {
    if (method !== 'openai-api-key' && method !== 'codex-account-app-server') return;
    void patch('ai', { codexOpenAIServiceMethod: method });
  };

  useEffect(() => {
    if (offline) return;
    void getAiMethodCapabilities()
      .then(setMethodCapabilities)
      .catch(() => {});
  }, [offline]);

  // ── Derived status values ──────────────────────────────────────────────────
  const openaiStatus: ProviderCardStatus = probeStatuses.openai ?? (ai.hasOpenAIKey ? 'connected' : 'key-needed');
  const anthropicStatus: ProviderCardStatus = probeStatuses.anthropic ?? (ai.hasAnthropicKey ? 'connected' : 'key-needed');
  const claudeAccountStatus: ProviderCardStatus = probeStatuses['claude-account']
    ?? (ai.claudeAccountAuthenticated ? 'connected' : (ai.claudeAccountAvailable ? 'key-needed' : 'unreachable'));
  const codexAccountStatus: ProviderCardStatus = probeStatuses['codex-account']
    ?? (ai.codexAccountAvailable ? (ai.codexAccountAuthenticated ? 'connected' : 'key-needed') : 'unreachable');
  const instanceProbeStatus = (instanceId: AiProviderInstanceId, fallback: ProviderCardStatus): ProviderCardStatus =>
    ai.providerInstances[instanceId]?.lastProbeStatus ?? fallback;
  const ollamaStatus: ProviderCardStatus = probeStatuses.ollama ?? instanceProbeStatus('ollama', 'not-tested');

  const localCompatiblePreset = presetFor(ai.localOpenaiCompatiblePreset ?? ai.openaiCompatiblePreset);
  const localCompatibleStatus: ProviderCardStatus = probeStatuses['openai-compatible']
    ?? instanceProbeStatus(
      'local-openai-compatible',
      localCompatiblePreset.requiresKey && !ai.hasLocalOpenAICompatibleKey ? 'key-needed' : 'not-tested',
    );

  const cloudCompatiblePreset = presetFor(ai.cloudOpenaiCompatiblePreset ?? ai.openaiCompatiblePreset);
  const cloudCompatibleActive = openAICompatiblePresetMatchesMode(
    ai.cloudOpenaiCompatiblePreset ?? ai.openaiCompatiblePreset,
    ai.cloudOpenaiCompatibleBaseUrl ?? ai.openaiCompatibleBaseUrl,
    'cloud',
  );
  const cloudCompatibleRequiresKey = (ai.cloudOpenaiCompatiblePreset ?? ai.openaiCompatiblePreset) === 'custom'
    ? true : cloudCompatiblePreset.requiresKey;
  const cloudCompatibleStatus: ProviderCardStatus = probeStatuses['openai-compatible']
    ?? instanceProbeStatus(
      'cloud-openai-compatible',
      cloudCompatibleRequiresKey && !ai.hasCloudOpenAICompatibleKey ? 'key-needed' : 'not-tested',
    );
  const cloudCompatibleLabel = cloudCompatibleActive
    ? `${cloudCompatiblePreset.label} · ${ai.cloudOpenaiCompatibleModel || ai.openaiCompatibleModel || 'choose a model'}`
    : `${presetFor(CLOUD_COMPATIBLE_DEFAULT_PRESET).label} · not configured`;
  const activeCompatibleStatus = ai.defaultProviderInstanceId === 'local-openai-compatible'
    ? localCompatibleStatus : cloudCompatibleStatus;

  const providerEnabled = (provider: AiProviderId) =>
    ai.guardrails.providerEnabled[provider] !== false;
  const instanceEnabled = (instanceId: AiProviderInstanceId) => {
    const instance = ai.providerInstances[instanceId];
    return Boolean(instance)
      && providerEnabled(instance.provider)
      && ai.guardrails.providerInstanceEnabled[instanceId] !== false;
  };
  const disabledProviderNote = (
    <div className="rounded-card border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
      One or more provider methods are disabled in Usage &amp; Guardrails. Disabled methods are
      hidden from setup and Feature Defaults until re-enabled.
    </div>
  );
  const hasDisabledProviderMethods = Object.values(ai.providerInstances).some(
    (instance) => !instanceEnabled(instance.id),
  );

  // ── Method options ─────────────────────────────────────────────────────────
  const claudeMethodOptions = methodCapabilities.filter((m) => m.serviceFamily === 'claude');
  const visibleClaudeMethodOptions = claudeMethodOptions.filter((m) => {
    if (m.id === 'anthropic-api-key') return instanceEnabled('claude-api');
    if (m.id === 'claude-account-native') return instanceEnabled('claude-account');
    return true;
  });
  const openaiMethodOptions = methodCapabilities.filter((m) => m.serviceFamily === 'codex-openai');
  const visibleOpenaiMethodOptions = openaiMethodOptions.filter((m) => {
    if (m.id === 'openai-api-key') return instanceEnabled('openai-api');
    if (m.id === 'codex-account-app-server') return instanceEnabled('codex-account');
    return true;
  });
  const cloudMethods = methodCapabilities.filter((m) => m.serviceFamily === 'external-router' && m.providerId === 'openai-compatible');
  const cloudPresetMethodIds: AiOpenAICompatiblePresetId[] = (
    methodCapabilities.length > 0
      ? [...new Set([...cloudMethods.map((m) => m.presetId).filter(Boolean), 'custom'])]
      : ['openrouter', 'groq', 'mistral', 'together', 'fireworks', 'custom']
  ) as AiOpenAICompatiblePresetId[];

  const methodById = new Map(methodCapabilities.map((m) => [m.id, m]));
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
      availability: ai.claudeAccountAvailable ? (ai.claudeAccountAuthenticated ? 'available' : 'auth-required') : 'unavailable',
      reason: ai.claudeAccountAvailable
        ? (ai.claudeAccountAuthenticated ? undefined : 'Sign in with Claude account to enable this method.')
        : 'Claude account login is not available from this server session.',
      featureRoutable: true,
    }),
    'codex-account': capabilityState('codex-account-app-server', {
      availability: ai.codexAccountAvailable ? (ai.codexAccountAuthenticated ? 'available' : 'auth-required') : 'unavailable',
      reason: ai.codexAccountAvailable ? 'Sign in with Codex account to enable this method.' : 'Codex account app-server is unavailable.',
      featureRoutable: true,
    }),
    ollama: capabilityState('ollama-local', { availability: 'available', featureRoutable: true }),
    'openai-compatible': capabilityState(
      `openai-compatible:${ai.defaultProviderInstanceId === 'local-openai-compatible' ? (ai.localOpenaiCompatiblePreset ?? ai.openaiCompatiblePreset) : (ai.cloudOpenaiCompatiblePreset ?? ai.openaiCompatiblePreset)}`,
      { availability: 'available', featureRoutable: true },
    ),
  };

  // ── Provider instance mapping ──────────────────────────────────────────────
  const PROVIDER_TO_INSTANCE_ID: Partial<Record<AiProviderId, AiProviderInstanceId>> = {
    anthropic: 'claude-api', 'claude-account': 'claude-account',
    openai: 'openai-api', 'codex-account': 'codex-account', ollama: 'ollama',
  };

  const setDefaultProvider = async (provider: AiProviderId, instanceId?: AiProviderInstanceId) => {
    const resolved = instanceId ?? PROVIDER_TO_INSTANCE_ID[provider];
    await patch('ai', { provider, ...(resolved ? { defaultProviderInstanceId: resolved } : {}) });
  };

  // ── Save handlers ──────────────────────────────────────────────────────────
  const scheduleModelRefresh = () => {
    for (const delayMs of [1500, 4000, 8000]) {
      window.setTimeout(() => void refreshSettings(), delayMs);
    }
  };

  const saveOpenAI = async (model: string, key?: string) => {
    await patch('ai', { openaiModel: model, ...(key ? { openaiApiKey: key } : {}) });
    if (key) scheduleModelRefresh();
  };
  const saveAnthropic = async (model: string, key?: string) => {
    await patch('ai', { anthropicModel: model, ...(key ? { anthropicApiKey: key } : {}) });
    if (key) scheduleModelRefresh();
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
    preset: AiOpenAICompatiblePresetId, model: string, baseUrl: string, key?: string,
  ) => {
    await patch('ai', {
      localOpenaiCompatiblePreset: preset, localOpenaiCompatibleModel: model,
      localOpenaiCompatibleBaseUrl: baseUrl, ...(key ? { localOpenaiCompatibleApiKey: key } : {}),
    });
    if (key) scheduleModelRefresh();
  };
  const saveCloudOpenAICompatible = async (
    preset: AiOpenAICompatiblePresetId, model: string, baseUrl: string, key?: string,
  ) => {
    const previousPreset = ai.cloudOpenaiCompatiblePreset ?? ai.openaiCompatiblePreset;
    const previousBaseUrl = ai.cloudOpenaiCompatibleBaseUrl ?? ai.openaiCompatibleBaseUrl;
    const endpointChanged = previousPreset !== preset || previousBaseUrl !== baseUrl;
    await patch('ai', {
      cloudOpenaiCompatiblePreset: preset, cloudOpenaiCompatibleModel: model,
      cloudOpenaiCompatibleBaseUrl: baseUrl,
      ...(key ? { cloudOpenaiCompatibleApiKey: key } : {}),
      ...(!key && endpointChanged ? { cloudOpenaiCompatibleApiKey: '' } : {}),
    });
    if (key) scheduleModelRefresh();
  };
  const saveBudget = async (budget: number) => { await patch('ai', { dailyTokenBudget: budget }); };
  const saveFeatureRoutes = async (featureRoutes: AiPublicConfig['featureRoutes']) => { await patch('ai', { featureRoutes }); };
  const saveDynamicProviderInstance = async (
    instanceId: AiProviderInstanceId,
    instancePatch: Partial<AiProviderInstanceConfig>,
    apiKey?: string,
  ) => {
    await patch('ai', {
      providerInstances: { [instanceId]: instancePatch },
      ...(apiKey?.trim() ? { providerInstanceApiKeys: { [instanceId]: apiKey.trim() } } : {}),
    });
    if (apiKey?.trim()) scheduleModelRefresh();
  };
  const removeDynamicProviderInstance = async (instanceId: AiProviderInstanceId) => {
    await patch('ai', { removedProviderInstanceIds: [instanceId] });
  };
  const slugifyInstancePart = (value: string) =>
    value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36) || 'provider';
  const dynamicLocalInstances = Object.values(ai.providerInstances).filter((instance) =>
    !['ollama', 'local-openai-compatible'].includes(instance.id) &&
    instance.local &&
    (instance.provider === 'ollama' || instance.provider === 'openai-compatible') &&
    instanceEnabled(instance.id),
  );
  const dynamicCloudInstances = Object.values(ai.providerInstances).filter((instance) =>
    instance.id !== 'cloud-openai-compatible' &&
    !instance.local &&
    instance.provider === 'openai-compatible' &&
    instanceEnabled(instance.id),
  );

  // ── Local Models section ───────────────────────────────────────────────────
  const localServerType = ai.localModelServiceMethod ?? initialLocalServerType(ai);
  const localServerOpt = LOCAL_SERVER_OPTIONS.find((o) => o.id === localServerType)!;
  const localServerPresetId: AiOpenAICompatiblePresetId = localServerOpt.presetId ?? 'custom';
  const [newLocalType, setNewLocalType] = useState<LocalServerType>('lm-studio');
  const [newLocalLabel, setNewLocalLabel] = useState('');
  const [newLocalBaseUrl, setNewLocalBaseUrl] = useState('http://localhost:1234/v1');
  const [newLocalModel, setNewLocalModel] = useState('');
  const [newCloudPreset, setNewCloudPreset] = useState<AiOpenAICompatiblePresetId>('openrouter');
  const [newCloudLabel, setNewCloudLabel] = useState('');
  const [newCloudBaseUrl, setNewCloudBaseUrl] = useState('https://openrouter.ai/api/v1');
  const [newCloudModel, setNewCloudModel] = useState('openai/gpt-4o-mini');
  const [newCloudKey, setNewCloudKey] = useState('');
  const saveLocalServerType = (next: LocalServerType) => {
    const option = LOCAL_SERVER_OPTIONS.find((o) => o.id === next);
    const patchBody: Partial<AiPublicConfig> = { localModelServiceMethod: next };
    if (option?.presetId) {
      patchBody.localOpenaiCompatiblePreset = option.presetId;
      patchBody.localOpenaiCompatibleBaseUrl = option.defaultUrl;
    }
    void patch('ai', patchBody);
  };
  const changeNewLocalType = (next: LocalServerType) => {
    setNewLocalType(next);
    const option = LOCAL_SERVER_OPTIONS.find((o) => o.id === next);
    if (option) {
      setNewLocalBaseUrl(option.defaultUrl);
      if (!newLocalLabel.trim()) setNewLocalLabel(option.label);
    }
  };
  const changeNewCloudPreset = (next: AiOpenAICompatiblePresetId) => {
    setNewCloudPreset(next);
    const preset = presetFor(next);
    setNewCloudBaseUrl(preset.baseUrl);
    setNewCloudModel(preset.model);
    if (!newCloudLabel.trim()) setNewCloudLabel(preset.label);
  };
  const addLocalInstance = async () => {
    const option = LOCAL_SERVER_OPTIONS.find((o) => o.id === newLocalType) ?? LOCAL_SERVER_OPTIONS[0];
    const id = `local-${slugifyInstancePart(newLocalLabel || option.label)}-${Date.now().toString(36)}`;
    if (newLocalType === 'ollama') {
      await saveDynamicProviderInstance(id, {
        id,
        provider: 'ollama',
        label: newLocalLabel.trim() || 'Ollama',
        family: 'local',
        connectionMode: 'local-server',
        dataResidency: 'local',
        capabilities: ['chat', 'streaming', 'model-discovery', 'local'],
        featureRoutable: true,
        modelDiscovery: true,
        configuredModel: newLocalModel.trim() || 'llama3.2',
        discoveredModels: [],
        available: 'available',
        requiresApiKey: false,
        hasApiKey: false,
        local: true,
        baseUrl: newLocalBaseUrl.trim() || option.defaultUrl,
      });
    } else {
      const presetId = option.presetId ?? 'custom';
      await saveDynamicProviderInstance(id, {
        id,
        provider: 'openai-compatible',
        label: newLocalLabel.trim() || option.label,
        family: 'custom-endpoint',
        connectionMode: 'openai-compatible-local',
        dataResidency: 'local',
        capabilities: ['chat', 'streaming', 'model-discovery', 'local'],
        featureRoutable: true,
        modelDiscovery: true,
        configuredModel: newLocalModel.trim(),
        discoveredModels: [],
        available: 'available',
        requiresApiKey: false,
        hasApiKey: false,
        local: true,
        baseUrl: newLocalBaseUrl.trim() || option.defaultUrl,
        presetId,
      });
    }
    setNewLocalLabel('');
    setNewLocalModel('');
  };
  const addCloudInstance = async () => {
    const preset = presetFor(newCloudPreset);
    const id = `cloud-${slugifyInstancePart(newCloudLabel || preset.label)}-${Date.now().toString(36)}`;
    await saveDynamicProviderInstance(id, {
      id,
      provider: 'openai-compatible',
      label: newCloudLabel.trim() || preset.label,
      family: 'custom-endpoint',
      connectionMode: 'openai-compatible-cloud',
      dataResidency: newCloudPreset === 'custom' ? 'user-controlled' : 'cloud',
      capabilities: ['chat', 'streaming', 'model-discovery', 'api-key'],
      featureRoutable: true,
      modelDiscovery: true,
      configuredModel: newCloudModel.trim() || preset.model,
      discoveredModels: [],
      available: newCloudKey.trim() ? 'available' : 'auth-required',
      requiresApiKey: true,
      hasApiKey: Boolean(newCloudKey.trim()),
      local: false,
      baseUrl: newCloudBaseUrl.trim() || preset.baseUrl,
      presetId: newCloudPreset,
    }, newCloudKey);
    setNewCloudLabel('');
    setNewCloudKey('');
  };

  const helpForProviderCard = (
    title: string,
    summary: string,
    details: string,
  ) => ({
    helpId: 'settings-ai-provider-card',
    helpTitle: title,
    helpBody: summary,
    helpDetails: details,
    helpManualSection: 'settings-ai',
  });

  // ── Diagnostics — only active providers ────────────────────────────────────
  const activeInstanceIds: Set<string> = new Set([
    ai.defaultProviderInstanceId,
    ...Object.values(ai.featureRoutes)
      .filter((route) => route.provider !== 'default')
      .flatMap((route) => {
        if (route.providerInstanceId) return [route.providerInstanceId];
        const inst = Object.values(ai.providerInstances).find(
          (i) => i.provider === route.provider && i.featureRoutable,
        );
        return inst ? [inst.id] : [];
      }),
  ]);
  const providerDiagnostics = Object.values(ai.providerInstances)
    .filter((instance) => activeInstanceIds.has(instance.id))
    .flatMap((instance) => {
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8" data-help="settings-ai-services">
      {offline && (
        <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-card text-xs text-amber-800">
          Offline — AI settings shown from local cache. Changes will sync when the server reconnects.
        </div>
      )}

      {/* ── AI Services ─────────────────────────────────────────────────────── */}
      <section className="space-y-3" data-help="settings-ai-services">
        <div className="flex items-center gap-1.5">
          <h3 className="text-xs font-mono uppercase tracking-wider text-ink-500">AI Services</h3>
          <HelpButton
            helpId="ai-providers"
            title="Choosing an AI Provider"
            summary="Settings are grouped by service family (Claude, Codex/OpenAI, Local Models, External/Cloud). Choose API key for direct provider access or Account login to use your subscription."
            details="Feature Defaults routes only chat/model-capable methods. Connection type — API key or Account login — is set per service family in the cards above."
            manualSection="provider-chooser"
            alwaysShow
          />
        </div>
        <p className="text-xs text-ink-400">
          Configure each service family. Choose <strong>API key</strong> for direct provider access or{' '}
          <strong>Account login</strong> to use your subscription. Global default and Feature Defaults apply to
          chat/model-capable methods only.
        </p>
        {hasDisabledProviderMethods && disabledProviderNote}
        {providerDiagnostics.length > 0 && (
          <div className="rounded-card border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 font-mono space-y-1">
            {providerDiagnostics.slice(0, 4).map((line) => <p key={line}>{line}</p>)}
            {providerDiagnostics.length > 4 && <p>+{providerDiagnostics.length - 4} more diagnostics</p>}
          </div>
        )}

        <div className="space-y-4">
          {/* ── Claude Service ─────────────────────────────────────────────── */}
          <div className="rounded-card border border-ink-100 bg-paper p-3 space-y-3" data-help="settings-ai-claude-service">
            <p className="text-[10px] font-mono uppercase tracking-wider text-ink-400">Claude Service</p>
            <ServiceMethodSwitch
              title="Method"
              value={claudeMethod}
              onChange={saveClaudeMethod}
              options={(visibleClaudeMethodOptions.length > 0
                ? visibleClaudeMethodOptions.filter((m) => m.channel !== 'file-agent')
                : [
                    ...(instanceEnabled('claude-api') ? [{ id: 'anthropic-api-key', label: 'API key', channel: 'chat-model', availability: 'available' as const }] : []),
                    ...(instanceEnabled('claude-account') ? [{ id: 'claude-account-native', label: 'Account login', channel: 'chat-model', availability: (ai.claudeAccountAuthenticated ? 'available' : 'auth-required') as AiMethodCapability['availability'] }] : []),
                  ] as AiMethodCapability[]
              ).map(optionFromMethodCapability)}
            />
            {claudeMethod === 'anthropic-api-key' && instanceEnabled('claude-api') && (
              <ProviderCard
                label={aiProviderLabel('anthropic')}
                icon="🧠"
                isDefault={ai.provider === 'anthropic'}
                status={anthropicStatus}
                modelLabel={ai.anthropicModel}
                discoveredModelCount={ai.providerInstances['claude-api']?.discoveredModels?.length}
                discoveredModels={ai.providerInstances['claude-api']?.discoveredModels}
                onSetDefault={() => void setDefaultProvider('anthropic')}
                actions={
                  <ProviderProbe
                    buildConfig={() => ({ provider: 'anthropic', anthropicModel: ai.anthropicModel })}
                    onStatusChange={(status) => persistProbeStatus('claude-api', 'anthropic', status)}
                    testLabel="Test saved"
                    listLabel="List saved models"
                  />
                }
                {...helpForProviderCard(
                  'Anthropic API Method',
                  'Direct API-key method for Claude models from Anthropic. Use this when you manage usage through Anthropic API billing.',
                  'This is a chat/model provider method used by Feature Defaults and Ask AI. It is not the Claude Code CLI agent.',
                )}
              >
                <ProviderDetailForm
                  fields={[
                    { key: 'model', label: 'Model', initialValue: ai.anthropicModel, placeholder: 'List models, then choose one' },
                    { key: 'apiKey', label: 'API key', secret: true, placeholder: ai.hasAnthropicKey ? '(stored — enter new value to update)' : 'sk-ant-…' },
                  ]}
                  onSave={async (v) => saveAnthropic(v.model, v.apiKey || undefined)}
                  buildProbeConfig={(v) => ({ provider: 'anthropic', anthropicModel: v.model, ...(v.apiKey ? { anthropicApiKey: v.apiKey } : {}) })}
                  emptyModelHint="This endpoint needs a model ID before chat requests can run. Use List models when the service is available."
                />
              </ProviderCard>
            )}
            {claudeMethod === 'claude-account-native' && instanceEnabled('claude-account') && (
              <ProviderCard
                label={aiProviderLabel('claude-account')}
                icon="🟣"
                isDefault={ai.provider === 'claude-account'}
                status={claudeAccountStatus}
                modelLabel={ai.claudeAccountModel || 'claude-sonnet-latest'}
                discoveredModelCount={ai.providerInstances['claude-account']?.discoveredModels?.length}
                discoveredModels={ai.providerInstances['claude-account']?.discoveredModels}
                onSetDefault={() => void setDefaultProvider('claude-account')}
                canSetDefault={claudeAccountStatus === 'connected'}
                defaultExpanded={!ai.claudeAccountAuthenticated}
                {...helpForProviderCard(
                  'Claude Account Login Method',
                  'Account-login method that routes AI features through your Claude account session instead of an Anthropic API key.',
                  'Use login/logout in this card to manage account auth. This method is routable in Feature Defaults and Ask AI.',
                )}
              >
                <ClaudeAccountDetail
                  model={ai.claudeAccountModel || 'claude-sonnet-latest'}
                  compactEnabled={ai.claudeAccountCompact !== false}
                  onSave={saveClaudeAccount}
                  authenticated={ai.claudeAccountAuthenticated}
                  available={ai.claudeAccountAvailable}
                  discoveredModels={ai.providerInstances['claude-account']?.discoveredModels}
                  onStatusChange={(status) => persistProbeStatus('claude-account', 'claude-account', status)}
                />
              </ProviderCard>
            )}
          </div>

          {/* ── Codex / OpenAI Service ─────────────────────────────────────── */}
          <div className="rounded-card border border-ink-100 bg-paper p-3 space-y-3" data-help="settings-ai-codex-service">
            <p className="text-[10px] font-mono uppercase tracking-wider text-ink-400">Codex / OpenAI Service</p>
            <ServiceMethodSwitch
              title="Method"
              value={openaiMethod}
              onChange={saveOpenaiMethod}
              options={(visibleOpenaiMethodOptions.length > 0
                ? visibleOpenaiMethodOptions.filter((m) => m.channel !== 'file-agent')
                : [
                    ...(instanceEnabled('openai-api') ? [{ id: 'openai-api-key', label: 'API key', channel: 'chat-model', availability: 'available' as const }] : []),
                    ...(instanceEnabled('codex-account') ? [{ id: 'codex-account-app-server', label: 'Account login', channel: 'chat-model', availability: (ai.codexAccountAuthenticated ? 'available' : 'auth-required') as AiMethodCapability['availability'] }] : []),
                  ] as AiMethodCapability[]
              ).map(optionFromMethodCapability)}
            />
            {openaiMethod === 'openai-api-key' && instanceEnabled('openai-api') && (
              <ProviderCard
                label={aiProviderLabel('openai')}
                icon="🤖"
                isDefault={ai.provider === 'openai'}
                status={openaiStatus}
                modelLabel={ai.openaiModel}
                discoveredModelCount={ai.providerInstances['openai-api']?.discoveredModels?.length}
                discoveredModels={ai.providerInstances['openai-api']?.discoveredModels}
                onSetDefault={() => void setDefaultProvider('openai')}
                actions={
                  <ProviderProbe
                    buildConfig={() => ({ provider: 'openai', openaiModel: ai.openaiModel })}
                    onStatusChange={(status) => persistProbeStatus('openai-api', 'openai', status)}
                    testLabel="Test saved"
                    listLabel="List saved models"
                  />
                }
                {...helpForProviderCard(
                  'OpenAI API Method',
                  'Direct API-key method for OpenAI models. Use this path when you want explicit model/API control through OpenAI API billing.',
                  'This method participates in Feature Defaults and Ask AI model routing. It is separate from Codex account login and Codex CLI.',
                )}
              >
                <ProviderDetailForm
                  fields={[
                    { key: 'model', label: 'Model', initialValue: ai.openaiModel },
                    { key: 'apiKey', label: 'API key', secret: true, placeholder: ai.hasOpenAIKey ? '(stored — enter new value to update)' : 'sk-…' },
                  ]}
                  onSave={async (v) => saveOpenAI(v.model, v.apiKey || undefined)}
                  buildProbeConfig={(v) => ({ provider: 'openai', openaiModel: v.model, ...(v.apiKey ? { openaiApiKey: v.apiKey } : {}) })}
                />
              </ProviderCard>
            )}
            {openaiMethod === 'codex-account-app-server' && instanceEnabled('codex-account') && (
              <ProviderCard
                label={aiProviderLabel('codex-account')}
                icon="⌁"
                isDefault={ai.provider === 'codex-account'}
                status={codexAccountStatus}
                modelLabel={ai.codexAccountModel || 'codex-recommended'}
                discoveredModelCount={ai.providerInstances['codex-account']?.discoveredModels?.length}
                discoveredModels={ai.providerInstances['codex-account']?.discoveredModels}
                onSetDefault={() => void setDefaultProvider('codex-account')}
                canSetDefault={ai.codexAccountAvailable === true && ai.codexAccountAuthenticated === true && codexAccountStatus === 'connected'}
                defaultExpanded={!ai.codexAccountAuthenticated}
                {...helpForProviderCard(
                  'Codex Account Login Method',
                  'Account-login method via local Codex app-server. This is a chat/model provider route, not an external cloud-router card.',
                  'Feature Defaults and Ask AI can route to this method when account auth is available. Model options come from the discovered Codex account catalog.',
                )}
              >
                <CodexAccountDetail
                  model={ai.codexAccountModel || 'codex-recommended'}
                  onSave={saveCodexAccount}
                  authenticated={ai.codexAccountAuthenticated}
                  available={ai.codexAccountAvailable}
                  discoveredModels={ai.providerInstances['codex-account']?.discoveredModels}
                  onStatusChange={(status) => persistProbeStatus('codex-account', 'codex-account', status)}
                />
              </ProviderCard>
            )}
          </div>

          {/* ── Local Models ───────────────────────────────────────────────── */}
          <div className="rounded-card border border-ink-100 bg-paper p-3 space-y-3" data-help="settings-ai-local-models">
            <p className="text-[10px] font-mono uppercase tracking-wider text-ink-400">Local Models</p>
            <label className="block text-xs text-ink-500">
              Server type
              <select
                value={localServerType}
                onChange={(e) => saveLocalServerType(e.target.value as LocalServerType)}
                className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800"
              >
                {LOCAL_SERVER_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] text-sage-600 font-mono">
                enabled: {localServerOpt.label}
              </span>
            </label>
            {localServerType === 'ollama' && instanceEnabled('ollama') && (
              <ProviderCard
                label="Ollama"
                icon="🦙"
                isDefault={ai.provider === 'ollama'}
                status={ollamaStatus}
                modelLabel={`${ai.ollamaModel} · ${ai.ollamaBaseUrl}`}
                discoveredModelCount={ai.providerInstances['ollama']?.discoveredModels?.length}
                discoveredModels={ai.providerInstances['ollama']?.discoveredModels}
                onSetDefault={() => void setDefaultProvider('ollama')}
                actions={
                  <ProviderProbe
                    buildConfig={() => ({ provider: 'ollama', ollamaModel: ai.ollamaModel, ollamaBaseUrl: ai.ollamaBaseUrl })}
                    onStatusChange={(status) => persistProbeStatus('ollama', 'ollama', status)}
                    testLabel="Run saved smoke test"
                    listLabel="List saved models"
                  />
                }
                {...helpForProviderCard(
                  'Ollama Local Method',
                  'Local inference method using the configured Ollama host and model. No cloud provider is required.',
                  'If your base URL points to localhost or a trusted LAN host you control, idea content stays on that configured host.',
                )}
              >
                <ProviderDetailForm
                  fields={[
                    { key: 'model', label: 'Model', initialValue: ai.ollamaModel },
                    { key: 'baseUrl', label: 'Base URL', initialValue: ai.ollamaBaseUrl },
                  ]}
                  onSave={async (v) => saveOllama(v.model, v.baseUrl)}
                  buildProbeConfig={(v) => ({ provider: 'ollama', ollamaModel: v.model, ollamaBaseUrl: v.baseUrl })}
                  description="Ollama prompts and responses stay on the configured Ollama host. This can be your local machine, or another host on your LAN/server if you set a remote base URL."
                  probeTestLabel="Run draft smoke test"
                  probeListLabel="List draft models"
                />
              </ProviderCard>
            )}
            {localServerType !== 'ollama' && instanceEnabled('local-openai-compatible') && (
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
                discoveredModelCount={ai.providerInstances['local-openai-compatible']?.discoveredModels?.length}
                discoveredModels={ai.providerInstances['local-openai-compatible']?.discoveredModels}
                modelLabel={
                  (ai.localOpenaiCompatiblePreset ?? ai.openaiCompatiblePreset) === localServerPresetId
                  && isLikelyLocalUrl(ai.localOpenaiCompatibleBaseUrl ?? ai.openaiCompatibleBaseUrl)
                    ? `${localServerOpt.label} · ${ai.localOpenaiCompatibleModel || ai.openaiCompatibleModel || 'choose a model'}`
                    : `${localServerOpt.label} · not configured`
                }
                onSetDefault={() => void setDefaultProvider('openai-compatible', 'local-openai-compatible')}
                actions={
                  <ProviderProbe
                    buildConfig={() => ({
                      provider: 'openai-compatible',
                      providerInstanceId: 'local-openai-compatible' as AiProviderInstanceId,
                      openaiCompatiblePreset: ai.localOpenaiCompatiblePreset ?? ai.openaiCompatiblePreset,
                      openaiCompatibleModel: ai.localOpenaiCompatibleModel || ai.openaiCompatibleModel,
                      openaiCompatibleBaseUrl: ai.localOpenaiCompatibleBaseUrl ?? ai.openaiCompatibleBaseUrl,
                    })}
                    onStatusChange={(status) => persistProbeStatus('local-openai-compatible', 'openai-compatible', status)}
                    testLabel="Test saved"
                    listLabel="List saved models"
                  />
                }
                {...helpForProviderCard(
                  `${localServerOpt.label} Local Endpoint`,
                  'Local OpenAI-compatible inference method for the selected local server type.',
                  'Use this for local runtimes like LM Studio, vLLM, llama.cpp, LocalAI, or another localhost-compatible endpoint.',
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
            {dynamicLocalInstances.map((instance) => (
              <ProviderCard
                key={instance.id}
                label={instance.label}
                icon={instance.provider === 'ollama' ? '🦙' : '🧩'}
                isDefault={ai.defaultProviderInstanceId === instance.id}
                status={instance.lastProbeStatus ?? (instance.available === 'available' ? 'not-tested' : instance.available === 'auth-required' ? 'key-needed' : 'unreachable')}
                modelLabel={`${instance.configuredModel || 'choose a model'}${instance.baseUrl ? ` · ${instance.baseUrl}` : ''}`}
                discoveredModelCount={instance.discoveredModels?.length}
                discoveredModels={instance.discoveredModels}
                onSetDefault={() => void setDefaultProvider(instance.provider, instance.id)}
                actions={
                  <ProviderProbe
                    buildConfig={() => ({ provider: instance.provider, providerInstanceId: instance.id })}
                    onStatusChange={(status) => persistProbeStatus(instance.id, instance.provider, status)}
                    onModelsListed={(models) => void saveDynamicProviderInstance(instance.id, { discoveredModels: models })}
                    testLabel="Test saved"
                    listLabel="List saved models"
                  />
                }
                {...helpForProviderCard(
                  `${instance.label} Local Instance`,
                  'Saved local provider instance with its own base URL, model selection, and probe status.',
                  'Use this when you run multiple local endpoints and want each one to be independently routable in Feature Defaults and Ask AI.',
                )}
              >
                {instance.provider === 'ollama' ? (
                  <ProviderDetailForm
                    fields={[
                      { key: 'model', label: 'Model', initialValue: instance.configuredModel },
                      { key: 'baseUrl', label: 'Base URL', initialValue: instance.baseUrl ?? 'http://localhost:11434' },
                    ]}
                    onSave={async (v) => saveDynamicProviderInstance(instance.id, {
                      configuredModel: v.model,
                      baseUrl: v.baseUrl,
                    })}
                    buildProbeConfig={(v) => ({
                      provider: 'ollama',
                      providerInstanceId: instance.id,
                      providerInstances: { [instance.id]: { ...instance, configuredModel: v.model, baseUrl: v.baseUrl } },
                    })}
                  />
                ) : (
                  <OpenAICompatibleDetail
                    preset={instance.presetId ?? 'custom'}
                    model={instance.configuredModel}
                    baseUrl={instance.baseUrl ?? ''}
                    hasKey={instance.hasApiKey}
                    mode="local"
                    allowedPresets={[instance.presetId ?? 'custom']}
                    onSave={(preset, model, baseUrl, key) => saveDynamicProviderInstance(instance.id, {
                      presetId: preset,
                      configuredModel: model,
                      baseUrl,
                    }, key)}
                  />
                )}
                <button
                  type="button"
                  onClick={() => void removeDynamicProviderInstance(instance.id)}
                  className="text-[11px] font-medium text-red-600 hover:text-red-700"
                >
                  Remove instance
                </button>
              </ProviderCard>
            ))}
            <div className="rounded-card border border-dashed border-ink-200 bg-paper-warm p-3 space-y-2" data-help="settings-ai-add-local-instance">
              <p className="text-[11px] font-mono uppercase tracking-wider text-ink-400">Add local instance</p>
              <div className="grid gap-2 md:grid-cols-[1fr_1fr_1.4fr_1fr_auto] md:items-end">
                <label className="block text-xs text-ink-500">
                  Type
                  <select value={newLocalType} onChange={(e) => changeNewLocalType(e.target.value as LocalServerType)} className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800">
                    {LOCAL_SERVER_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                </label>
                <label className="block text-xs text-ink-500">
                  Label
                  <input value={newLocalLabel} onChange={(e) => setNewLocalLabel(e.target.value)} placeholder="LM Studio laptop" className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800" />
                </label>
                <label className="block text-xs text-ink-500">
                  Base URL
                  <input value={newLocalBaseUrl} onChange={(e) => setNewLocalBaseUrl(e.target.value)} className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800" />
                </label>
                <label className="block text-xs text-ink-500">
                  Default model
                  <input value={newLocalModel} onChange={(e) => setNewLocalModel(e.target.value)} placeholder="optional" className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800" />
                </label>
                <button type="button" onClick={() => void addLocalInstance()} className="px-3 py-1.5 text-xs font-semibold bg-sage-600 hover:bg-sage-700 text-white rounded-card transition-colors">
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* ── External / Cloud ───────────────────────────────────────────── */}
          <div className="rounded-card border border-ink-100 bg-paper p-3 space-y-3" data-help="settings-ai-external-cloud">
            <p className="text-[10px] font-mono uppercase tracking-wider text-ink-400">External / Cloud</p>
            <p className="text-[11px] text-ink-400">
              Connect to hosted services: OpenRouter, Groq, Mistral, Together, Fireworks, or a custom cloud endpoint.
              Requests from this card leave your machine and are processed by the selected cloud provider.
            </p>
            {instanceEnabled('cloud-openai-compatible') && (
              <ProviderCard
                label={cloudCompatibleActive ? cloudCompatiblePreset.label : 'Cloud provider'}
                icon="☁️"
                isDefault={
                  ai.defaultProviderInstanceId === 'cloud-openai-compatible'
                  || (ai.provider === 'openai-compatible' && cloudCompatibleActive
                      && ai.defaultProviderInstanceId !== 'local-openai-compatible')
                }
                status={cloudCompatibleStatus}
                discoveredModelCount={ai.providerInstances['cloud-openai-compatible']?.discoveredModels?.length}
                discoveredModels={ai.providerInstances['cloud-openai-compatible']?.discoveredModels}
                modelLabel={cloudCompatibleLabel}
                onSetDefault={() => void setDefaultProvider('openai-compatible', 'cloud-openai-compatible')}
                actions={
                  <ProviderProbe
                    buildConfig={() => ({
                      provider: 'openai-compatible',
                      providerInstanceId: 'cloud-openai-compatible' as AiProviderInstanceId,
                      openaiCompatiblePreset: ai.cloudOpenaiCompatiblePreset ?? ai.openaiCompatiblePreset,
                      openaiCompatibleModel: ai.cloudOpenaiCompatibleModel || ai.openaiCompatibleModel,
                      openaiCompatibleBaseUrl: ai.cloudOpenaiCompatibleBaseUrl ?? ai.openaiCompatibleBaseUrl,
                    })}
                    onStatusChange={(status) => persistProbeStatus('cloud-openai-compatible', 'openai-compatible', status)}
                    testLabel="Test saved"
                    listLabel="List saved models"
                  />
                }
                {...helpForProviderCard(
                  'Cloud OpenAI-Compatible Method',
                  'Hosted OpenAI-compatible provider route for external services such as OpenRouter, Groq, Mistral, Together, Fireworks, or custom HTTPS endpoints.',
                  'Requests on this method leave your machine and are processed by the selected cloud provider. Use enabled-model lists to limit routable models.',
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
            )}
            {dynamicCloudInstances.map((instance) => (
              <ProviderCard
                key={instance.id}
                label={instance.label}
                icon="☁️"
                isDefault={ai.defaultProviderInstanceId === instance.id}
                status={instance.lastProbeStatus ?? (instance.available === 'available' ? 'not-tested' : instance.available === 'auth-required' ? 'key-needed' : 'unreachable')}
                discoveredModelCount={instance.discoveredModels?.length}
                discoveredModels={instance.discoveredModels}
                modelLabel={`${presetFor(instance.presetId ?? 'custom').label} · ${instance.configuredModel || 'choose a model'}`}
                onSetDefault={() => void setDefaultProvider('openai-compatible', instance.id)}
                actions={
                  <ProviderProbe
                    buildConfig={() => ({ provider: 'openai-compatible', providerInstanceId: instance.id })}
                    onStatusChange={(status) => persistProbeStatus(instance.id, 'openai-compatible', status)}
                    onModelsListed={(models) => void saveDynamicProviderInstance(instance.id, { discoveredModels: models })}
                    testLabel="Test saved"
                    listLabel="List saved models"
                  />
                }
                {...helpForProviderCard(
                  `${instance.label} External Instance`,
                  'Saved external/cloud provider instance with its own API key presence, model catalog, and routing identity.',
                  'Use this when you need separate cloud accounts, billing contexts, or model allowlists across providers.',
                )}
              >
                <OpenAICompatibleDetail
                  preset={instance.presetId ?? 'custom'}
                  model={instance.configuredModel}
                  baseUrl={instance.baseUrl ?? ''}
                  hasKey={instance.hasApiKey}
                  mode="cloud"
                  allowedPresets={cloudPresetMethodIds}
                  guidance="Use enabled models below to limit which discovered catalog models appear in Feature Defaults."
                  onSave={(preset, model, baseUrl, key) => saveDynamicProviderInstance(instance.id, {
                    presetId: preset,
                    configuredModel: model,
                    baseUrl,
                    requiresApiKey: presetFor(preset).requiresKey,
                    hasApiKey: instance.hasApiKey || Boolean(key?.trim()),
                  }, key)}
                />
                {instance.discoveredModels.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-ink-400">
                      Enabled models in Seedbank
                    </p>
                    <div className="max-h-40 overflow-auto rounded-card border border-ink-100 bg-paper p-2 space-y-1">
                      {instance.discoveredModels.slice(0, 120).map((model) => {
                        const enabledSet = new Set(instance.enabledModelIds ?? []);
                        const enabled = enabledSet.size === 0 || enabledSet.has(model.id);
                        const label = model.displayName ?? model.name ?? model.id;
                        return (
                          <label key={model.id} className="flex items-center gap-2 text-[11px] text-ink-600">
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={(event) => {
                                const current = enabledSet.size === 0
                                  ? new Set(instance.discoveredModels.map((item) => item.id))
                                  : enabledSet;
                                if (event.target.checked) current.add(model.id);
                                else current.delete(model.id);
                                void saveDynamicProviderInstance(instance.id, {
                                  enabledModelIds: [...current],
                                });
                              }}
                              className="w-3.5 h-3.5 accent-sage-600"
                            />
                            <span className="truncate" title={model.id}>{label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => void removeDynamicProviderInstance(instance.id)}
                  className="text-[11px] font-medium text-red-600 hover:text-red-700"
                >
                  Remove instance
                </button>
              </ProviderCard>
            ))}
            <div className="rounded-card border border-dashed border-ink-200 bg-paper-warm p-3 space-y-2" data-help="settings-ai-add-external-instance">
              <p className="text-[11px] font-mono uppercase tracking-wider text-ink-400">Add external instance</p>
              <div className="grid gap-2 md:grid-cols-[1fr_1fr_1.4fr_1fr_1fr_auto] md:items-end">
                <label className="block text-xs text-ink-500">
                  Provider
                  <select value={newCloudPreset} onChange={(e) => changeNewCloudPreset(e.target.value as AiOpenAICompatiblePresetId)} className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800">
                    {cloudPresetMethodIds.map((presetId) => <option key={presetId} value={presetId}>{presetFor(presetId).label}</option>)}
                  </select>
                </label>
                <label className="block text-xs text-ink-500">
                  Label
                  <input value={newCloudLabel} onChange={(e) => setNewCloudLabel(e.target.value)} placeholder="OpenRouter personal" className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800" />
                </label>
                <label className="block text-xs text-ink-500">
                  Base URL
                  <input value={newCloudBaseUrl} onChange={(e) => setNewCloudBaseUrl(e.target.value)} className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800" />
                </label>
                <label className="block text-xs text-ink-500">
                  Default model
                  <input value={newCloudModel} onChange={(e) => setNewCloudModel(e.target.value)} className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800" />
                </label>
                <label className="block text-xs text-ink-500">
                  API key
                  <input type="password" value={newCloudKey} onChange={(e) => setNewCloudKey(e.target.value)} placeholder="required" className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800" />
                </label>
                <button type="button" onClick={() => void addCloudInstance()} className="px-3 py-1.5 text-xs font-semibold bg-sage-600 hover:bg-sage-700 text-white rounded-card transition-colors">
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature Defaults ─────────────────────────────────────────────────── */}
      <section className="p-4 bg-paper-warm border border-ink-100 rounded-card" data-help="settings-ai-feature-defaults">
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
          onSaveDefault={async (config) => {
            await patch('ai', config);
          }}
          onSave={saveFeatureRoutes}
        />
      </section>

      {/* ── Usage & Guardrails ───────────────────────────────────────────────── */}
      <section className="p-4 bg-paper-warm border border-ink-100 rounded-card" data-help="settings-ai-guardrails">
        <GuardrailsSection
          ai={ai}
          onSaveBudget={saveBudget}
          onSaveGuardrails={async (guardrailsPatch) => {
            await patch('ai', { guardrails: guardrailsPatch });
          }}
        />
      </section>
    </div>
  );
}
