/**
 * OpenAICompatibleDetail — detail form for OpenAI-compatible provider cards
 * (both local and cloud modes).
 */
import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { AiOpenAICompatiblePresetId } from '@/lib/types';
import {
  isUnsafeCloudEndpoint,
  openAICompatibleDefaults,
  openAICompatiblePresetMatchesMode,
  preferredOpenAICompatiblePreset,
} from './helpers';
import {
  CLOUD_COMPATIBLE_PRESETS,
  LOCAL_OPTGROUP_PRESETS,
  OPENAI_COMPATIBLE_PRESETS,
} from './constants';
import { ProviderProbe } from './ProviderProbe';
import type { OpenAICompatibleMode } from './types';

export interface OpenAICompatibleDetailProps {
  preset: AiOpenAICompatiblePresetId;
  model: string;
  baseUrl: string;
  hasKey: boolean;
  mode: OpenAICompatibleMode;
  allowedPresets?: AiOpenAICompatiblePresetId[];
  guidance?: string;
  sharedConfigNotice?: string;
  onSave: (
    preset: AiOpenAICompatiblePresetId,
    model: string,
    baseUrl: string,
    key?: string,
  ) => Promise<void>;
}

interface DraftState {
  signature: string;
  selectedPreset: AiOpenAICompatiblePresetId;
  model: string;
  url: string;
  key: string;
}

export function OpenAICompatibleDetail({
  preset,
  model,
  baseUrl,
  hasKey,
  mode,
  allowedPresets,
  guidance,
  sharedConfigNotice,
  onSave,
}: OpenAICompatibleDetailProps) {
  const presetList =
    allowedPresets && allowedPresets.length > 0
      ? OPENAI_COMPATIBLE_PRESETS.filter((item) => allowedPresets.includes(item.id))
      : OPENAI_COMPATIBLE_PRESETS;

  const currentPresetFitsCard =
    presetList.some((item) => item.id === preset) &&
    openAICompatiblePresetMatchesMode(preset, baseUrl, mode);

  const draftPreset = currentPresetFitsCard
    ? preset
    : preferredOpenAICompatiblePreset(presetList, mode);
  const draftDefaults = openAICompatibleDefaults(draftPreset, mode);
  const draftUrl = currentPresetFitsCard ? baseUrl : draftDefaults.baseUrl;
  const draftModel = currentPresetFitsCard ? model : draftDefaults.model;
  const draftSignature = `${mode}|${draftPreset}|${draftModel}|${draftUrl}`;

  const [draft, setDraft] = useState<DraftState>(() => ({
    signature: draftSignature,
    selectedPreset: draftPreset,
    model: draftModel,
    url: draftUrl,
    key: '',
  }));

  const currentDraft: DraftState =
    draft.signature === draftSignature
      ? draft
      : { signature: draftSignature, selectedPreset: draftPreset, model: draftModel, url: draftUrl, key: '' };

  const { selectedPreset, model: m, url, key } = currentDraft;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const selected = openAICompatibleDefaults(selectedPreset, mode);
  const intro =
    mode === 'local'
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
  const cloudCustomUnsafe =
    mode === 'cloud' && selectedPreset === 'custom' && isUnsafeCloudEndpoint(url);
  const saveDisabled = saving || cloudCustomUnsafe;

  const updateDraft = (patch: Partial<Omit<DraftState, 'signature'>>) => {
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
      <p className="text-[11px] text-ink-500 leading-relaxed">{intro}</p>
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
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))
          ) : (
            <>
              <optgroup label="Local servers (stays on this machine)">
                {OPENAI_COMPATIBLE_PRESETS.filter((p) => LOCAL_OPTGROUP_PRESETS.has(p.id)).map(
                  (item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ),
                )}
              </optgroup>
              <optgroup label="Cloud / external services">
                {OPENAI_COMPATIBLE_PRESETS.filter((p) => CLOUD_COMPATIBLE_PRESETS.has(p.id)).map(
                  (item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ),
                )}
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
          This endpoint needs a model ID before chat requests can run. Use List draft models when the
          service is available.
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
