/**
 * ProviderProbe — interactive test + model-list component for provider cards.
 */
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type {
  AiConfigInput,
  AiModelInfo,
  AiOllamaDiagnostics,
  AiModelListResult,
  AiProviderHealth,
} from '@/lib/types';
import { listAiModels, testAiProvider } from '@/api/client';
import { describeOllamaResidency, summarizeOllamaCapabilities } from './helpers';
import type { ProviderCardStatus } from './types';

export interface ProviderProbeProps {
  buildConfig: () => AiConfigInput;
  onPickModel?: (model: string) => void;
  onModelsListed?: (models: AiModelInfo[]) => void;
  onStatusChange?: (status: ProviderCardStatus) => void;
  testLabel?: string;
  listLabel?: string;
}

export function ProviderProbe({
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
      setMessage(
        result.ok
          ? `${result.message}${result.normalizedBaseUrl ? ` · ${result.normalizedBaseUrl}` : ''}`
          : result.message,
      );
      onStatusChange?.(
        result.ok
          ? 'connected'
          : result.code === 'not_configured'
            ? 'key-needed'
            : 'unreachable',
      );
    } catch (err) {
      onStatusChange?.('unreachable');
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
      onStatusChange?.(
        result.ok
          ? 'connected'
          : result.code === 'not_configured'
            ? 'key-needed'
            : 'unreachable',
      );
      setMessage(
        result.ok
          ? `${result.models.length} models found${result.normalizedBaseUrl ? ` · ${result.normalizedBaseUrl}` : ''}`
          : (result.message ?? 'Model discovery failed.'),
      );
    } catch (err) {
      onStatusChange?.('unreachable');
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
            <option value="" disabled>
              Choose discovered model
            </option>
            {models.slice(0, 80).map((model) => {
              const label = model.displayName ?? model.name ?? model.id;
              const showId = label !== model.id;
              return (
                <option key={model.id} value={model.id}>
                  {showId ? `${label} — ${model.id}` : label}
                </option>
              );
            })}
          </select>
        )}
      </div>
      {message && (
        <p className="text-[11px] text-ink-500 font-mono break-words">{message}</p>
      )}
      {ollama && (
        <div className="text-[11px] text-ink-500 font-mono space-y-1">
          {ollama.endpoint && <p>Endpoint: {ollama.endpoint}</p>}
          {ollama.live && (
            <p>
              Daemon: {ollama.live.up ? 'up' : 'down'}
              {ollama.live.version ? ` · v${ollama.live.version}` : ''}
              {ollama.live.loadedModel ? ` · loaded: ${ollama.live.loadedModel}` : ''}
              {ollama.live.selectedModelResidency
                ? ` · selected: ${describeOllamaResidency(ollama.live.selectedModelResidency)}`
                : ''}
            </p>
          )}
          {capabilitySummary && <p>Capabilities: {capabilitySummary}</p>}
          {ollama.capabilityWarning && (
            <p className="text-amber-700">{ollama.capabilityWarning}</p>
          )}
          {ollama.responseDetail && (
            <p className="text-amber-700">Detail: {ollama.responseDetail}</p>
          )}
        </div>
      )}
    </div>
  );
}
