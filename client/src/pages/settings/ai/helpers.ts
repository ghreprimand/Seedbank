/**
 * Pure helper functions for the AI & Agents settings page.
 * No React dependencies — safe to import from any module.
 */
import { aiProviderLabel, isAiProviderId } from '@/lib/types';
import type {
  AiFeatureRoute,
  AiMethodCapability,
  AiModelInfo,
  AiOllamaDiagnostics,
  AiOllamaModelResidency,
  AiOpenAICompatiblePresetId,
  AiPreflightResult,
  AiProviderId,
  AiProviderInstanceId,
  AiPublicConfig,
  AiReasoningEffort,
  AiTextVerbosity,
} from '@/lib/types';
import {
  CLOUD_COMPATIBLE_PRESETS,
  CLOUD_COMPATIBLE_DEFAULT_PRESET,
  CLOUD_CUSTOM_BASE_URL,
  LOCAL_COMPATIBLE_DEFAULT_PRESET,
  LOCAL_METHOD_PRESETS,
  LOCAL_RESIDENCY_PRESETS,
  OPENAI_COMPATIBLE_PRESETS,
  ROUTE_LABELS,
} from './constants';
import type { DataResidency, LocalServerType, OpenAICompatibleMode, ServiceMethodOption } from './types';

// ── Token formatting ──────────────────────────────────────────────────────────

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ── Preset helpers ────────────────────────────────────────────────────────────

export function presetFor(id: AiOpenAICompatiblePresetId) {
  return OPENAI_COMPATIBLE_PRESETS.find((preset) => preset.id === id) ?? OPENAI_COMPATIBLE_PRESETS[0];
}

export function openAICompatibleDefaults(
  presetId: AiOpenAICompatiblePresetId,
  mode: OpenAICompatibleMode,
) {
  const presetConfig = presetFor(presetId);
  if (presetId === 'custom' && mode === 'cloud') {
    return { ...presetConfig, baseUrl: CLOUD_CUSTOM_BASE_URL, requiresKey: true };
  }
  return presetConfig;
}

export function openAICompatiblePresetMatchesMode(
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

export function isUnsafeCloudEndpoint(url: string): boolean {
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

export function preferredOpenAICompatiblePreset(
  presetList: Array<{ id: AiOpenAICompatiblePresetId }>,
  mode: OpenAICompatibleMode,
): AiOpenAICompatiblePresetId {
  const preferred = mode === 'local' ? LOCAL_COMPATIBLE_DEFAULT_PRESET : CLOUD_COMPATIBLE_DEFAULT_PRESET;
  if (presetList.some((item) => item.id === preferred)) return preferred;
  return presetList.find((item) => item.id !== 'custom')?.id ?? presetList[0]?.id ?? preferred;
}

// ── URL / residency helpers ───────────────────────────────────────────────────

export function isLikelyLocalUrl(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const hostname = new URL(value.trim()).hostname.toLowerCase();
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.endsWith('.local')
    );
  } catch {
    return false;
  }
}

export function initialLocalServerType(ai: AiPublicConfig): LocalServerType {
  const preset = ai.localOpenaiCompatiblePreset ?? ai.openaiCompatiblePreset;
  const url    = ai.localOpenaiCompatibleBaseUrl ?? ai.openaiCompatibleBaseUrl;
  if (preset === 'lm-studio' && isLikelyLocalUrl(url)) return 'lm-studio';
  if (preset === 'vllm'      && isLikelyLocalUrl(url)) return 'vllm';
  if (preset === 'llama-cpp' && isLikelyLocalUrl(url)) return 'llama-cpp';
  if (preset === 'localai'   && isLikelyLocalUrl(url)) return 'localai';
  if (preset === 'custom'    && isLikelyLocalUrl(url)) return 'custom-local';
  return 'ollama';
}

export function dataResidency(ai: AiPublicConfig): DataResidency {
  if (ai.provider === 'ollama') return 'local';
  if (ai.provider === 'openai-compatible') {
    const isLocalInstance = ai.defaultProviderInstanceId === 'local-openai-compatible';
    const preset = (
      isLocalInstance ? ai.localOpenaiCompatiblePreset : ai.cloudOpenaiCompatiblePreset
    ) as string;
    const url = isLocalInstance
      ? ai.localOpenaiCompatibleBaseUrl
      : ai.cloudOpenaiCompatibleBaseUrl;
    if (preset === 'custom') return 'mixed';
    if (isLikelyLocalUrl(url)) return 'local';
    if (CLOUD_COMPATIBLE_PRESETS.has(preset)) return 'cloud';
    if (LOCAL_RESIDENCY_PRESETS.has(preset)) return 'cloud';
    return 'mixed';
  }
  return 'cloud';
}

export function cloudProviderLabel(ai: AiPublicConfig): string {
  if (ai.provider === 'openai')         return aiProviderLabel('openai');
  if (ai.provider === 'anthropic')      return aiProviderLabel('anthropic');
  if (ai.provider === 'claude-account') return aiProviderLabel('claude-account');
  if (ai.provider === 'codex-account')  return aiProviderLabel('codex-account');
  if (ai.provider === 'openai-compatible') {
    const isLocal = ai.defaultProviderInstanceId === 'local-openai-compatible';
    const preset  = presetFor(isLocal ? ai.localOpenaiCompatiblePreset : ai.cloudOpenaiCompatiblePreset);
    return preset.label;
  }
  return 'the AI provider';
}

/**
 * Derive data residency for PrivacyNotice.
 *
 * Priority:
 *  1. Preflight result — authoritative (backend resolves full feature config).
 *  2. Provider-instance registry — `dataResidency` field on the default instance.
 *  3. Legacy fallback — preset/URL heuristics.
 */
export function deriveResidency(
  ai: AiPublicConfig,
  preflight: AiPreflightResult | null | undefined,
): DataResidency {
  if (preflight != null) {
    if (preflight.local) return 'local';
    const leavesDevice = preflight.contentLeavesDevice ?? preflight.contentLeavesMachine;
    if (leavesDevice) return 'cloud';
    return 'mixed';
  }
  const defaultInstance = ai.providerInstances[ai.defaultProviderInstanceId];
  if (defaultInstance) {
    if (defaultInstance.dataResidency === 'local') return 'local';
    if (defaultInstance.dataResidency === 'cloud') return 'cloud';
  }
  return dataResidency(ai);
}

export function defaultInstanceLabel(ai: AiPublicConfig): string {
  const instance = ai.providerInstances[ai.defaultProviderInstanceId];
  if (instance?.label) return instance.label;
  return cloudProviderLabel(ai);
}

export function isAccountLoginProvider(ai: AiPublicConfig): boolean {
  const instance = ai.providerInstances[ai.defaultProviderInstanceId];
  if (instance) return instance.family === 'account';
  return ai.provider === 'claude-account' || ai.provider === 'codex-account';
}

// ── Ollama helpers ────────────────────────────────────────────────────────────

export function describeOllamaResidency(residency: AiOllamaModelResidency | undefined): string {
  if (!residency)               return 'unknown';
  if (residency === 'resident') return 'resident';
  if (residency === 'idle')     return 'loaded with unload timer';
  return 'not loaded';
}

export function summarizeOllamaCapabilities(diag: AiOllamaDiagnostics | null): string | null {
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

// ── Provider model helpers ────────────────────────────────────────────────────

export function providerModel(ai: AiPublicConfig, provider: AiProviderId): string {
  if (provider === 'openai')    return ai.openaiModel;
  if (provider === 'anthropic') return ai.anthropicModel;
  if (provider === 'claude-account') return ai.claudeAccountModel;
  if (provider === 'codex-account')  return ai.codexAccountModel;
  if (provider === 'openai-compatible') {
    const isLocal = ai.defaultProviderInstanceId === 'local-openai-compatible';
    return isLocal
      ? (ai.localOpenaiCompatibleModel || ai.openaiCompatibleModel)
      : (ai.cloudOpenaiCompatibleModel || ai.openaiCompatibleModel);
  }
  return ai.ollamaModel;
}

export function openAIModelSupportsReasoningEffort(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return normalized.startsWith('gpt-5') || /^o[1-9](?:[-_.]|$)/.test(normalized);
}

export function openAIModelSupportsTextVerbosity(model: string): boolean {
  return model.trim().toLowerCase().startsWith('gpt-5');
}

export function routeModel(
  route: AiFeatureRoute,
  selectedInstance: AiPublicConfig['providerInstances'][AiProviderInstanceId] | null,
): string {
  return route.model?.trim() || selectedInstance?.configuredModel || '';
}

export function providerSupportsEffort(
  provider: AiProviderId | 'default',
  providerInstanceId: AiProviderInstanceId | null,
  model: string,
): boolean {
  if (provider === 'default') return false;
  if (providerInstanceId === 'openai-api') return openAIModelSupportsReasoningEffort(model);
  return providerInstanceId === 'codex-account';
}

export function providerSupportsVerbosity(
  providerInstanceId: AiProviderInstanceId | null,
  model: string,
): boolean {
  return providerInstanceId === 'openai-api' && openAIModelSupportsTextVerbosity(model);
}

export function updateRouteControl<K extends 'effort' | 'verbosity'>(
  route: AiFeatureRoute,
  key: K,
  value: string,
): AiFeatureRoute {
  const next = { ...route } as AiFeatureRoute;
  if (key === 'effort') {
    if (value === 'minimal' || value === 'low' || value === 'medium' || value === 'high') {
      next.effort = value as AiReasoningEffort;
    } else {
      delete next.effort;
    }
  } else {
    if (value === 'low' || value === 'medium' || value === 'high') {
      next.verbosity = value as AiTextVerbosity;
    } else {
      delete next.verbosity;
    }
  }
  return next;
}

export function providerLabel(provider: AiProviderId): string {
  return aiProviderLabel(provider);
}

export function providerInstanceBadge(
  ai: AiPublicConfig,
  providerInstanceId: AiProviderInstanceId,
  model?: string,
): string {
  const instance = ai.providerInstances[providerInstanceId];
  if (!instance) {
    return `${providerLabel(ai.provider)} · ${model || 'choose a model'}`;
  }
  return `${instance.label} · ${model || instance.configuredModel || 'choose a model'}`;
}

// ── Service method helpers ────────────────────────────────────────────────────

export function methodCapabilityLabel(capability: ServiceMethodOption['capability']): string {
  if (capability === 'chat')  return 'chat/model routing';
  if (capability === 'agent') return 'file-producing agent';
  return 'chat + file agent';
}

export function optionFromMethodCapability(method: AiMethodCapability): ServiceMethodOption {
  const capability: ServiceMethodOption['capability'] =
    method.channel === 'file-agent' ? 'agent' : 'chat';
  return {
    id: method.id,
    label: method.label,
    capability,
    availability: method.availability,
    availabilityReason: method.availabilityReason,
  };
}

// ── Usage audit helpers ───────────────────────────────────────────────────────

export function routeLabel(route: string): string {
  if (isAiProviderId(route)) return aiProviderLabel(route);
  return ROUTE_LABELS[route] ?? route;
}

export function transportLabel(transport: string): string {
  switch (transport) {
    case 'openai-responses':         return 'OpenAI Responses';
    case 'anthropic-messages':       return 'Anthropic Messages';
    case 'ollama-chat':              return 'Ollama chat';
    case 'openai-chat-completions':  return 'OpenAI-compatible chat';
    case 'claude-account-native':    return 'Claude account';
    case 'codex-account-app-server': return 'Codex account';
    default:                         return transport;
  }
}

export function providerFamilyLabel(family: string): string {
  switch (family) {
    case 'api':             return 'API key';
    case 'local':           return 'Local';
    case 'custom-endpoint': return 'Custom endpoint';
    case 'account':         return 'Account';
    default:                return family;
  }
}

export interface ExecutionMetadataDisplay {
  providerFamily?: string;
  transport?: string;
  requestedModel?: string;
  resolvedModelId?: string;
  contentLeavesDevice?: boolean;
}

export function executionMetadataLabel(row: ExecutionMetadataDisplay): string | null {
  const parts: string[] = [];
  if (row.providerFamily) parts.push(providerFamilyLabel(row.providerFamily));
  if (row.transport)      parts.push(transportLabel(row.transport));
  if (typeof row.contentLeavesDevice === 'boolean') {
    parts.push(row.contentLeavesDevice ? 'leaves this device' : 'stays on this device');
  }
  if (row.resolvedModelId && row.resolvedModelId !== row.requestedModel) {
    parts.push(`resolved: ${row.resolvedModelId}`);
  }
  return parts.length ? parts.join(' · ') : null;
}

// ── Model display ─────────────────────────────────────────────────────────────

/** Display label for a discovered model entry. */
export function modelDisplayLabel(model: AiModelInfo): string {
  return model.displayName ?? model.name ?? model.id;
}
