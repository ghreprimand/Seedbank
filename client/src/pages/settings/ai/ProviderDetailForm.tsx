/**
 * ProviderDetailForm — unified detail form for API-key and local-server providers.
 *
 * Replaces the near-identical OpenAIDetail, AnthropicDetail, and OllamaDetail
 * with a single parameterised component. The caller declares which fields to
 * show and how to build the draft probe config.
 */
import { useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import type { AiConfigInput } from '@/lib/types';
import { ProviderProbe } from './ProviderProbe';

// ── Field configuration ───────────────────────────────────────────────────────

export interface ProviderDetailFormField {
  /** Internal key — used for state management, not displayed. */
  key: string;
  /** Visible label above the input. */
  label: string;
  /** Input placeholder text. */
  placeholder?: string;
  /** If true, renders as type="password". */
  secret?: boolean;
  /** Initial value. Falls back to ''. */
  initialValue?: string;
}

export interface ProviderDetailFormProps {
  /** Ordered list of editable fields. */
  fields: ProviderDetailFormField[];
  /**
   * Called with the current field values map on save.
   * The caller is responsible for mapping to the correct patch shape.
   */
  onSave: (values: Record<string, string>) => Promise<void>;
  /**
   * Build the draft AiConfigInput for the ProviderProbe.
   * Receives the current live field values.
   */
  buildProbeConfig: (values: Record<string, string>) => AiConfigInput;
  /** Optional description paragraph rendered above the fields. */
  description?: string;
  /** Optional hint rendered when the 'model' field is empty. */
  emptyModelHint?: string;
  /** Labels for the ProviderProbe test/list buttons. */
  probeTestLabel?: string;
  probeListLabel?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ProviderDetailForm({
  fields,
  onSave,
  buildProbeConfig,
  description,
  emptyModelHint,
  probeTestLabel = 'Test draft',
  probeListLabel = 'List draft models',
}: ProviderDetailFormProps) {
  // Track each field's current value keyed by field.key
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) init[f.key] = f.initialValue ?? '';
    return init;
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await onSave(values);
      // Clear secret fields after successful save
      setValues((prev) => {
        const next = { ...prev };
        for (const f of fields) {
          if (f.secret) next[f.key] = '';
        }
        return next;
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  // Determine if the model field is empty (for the optional hint)
  const modelField = fields.find((f) => f.key === 'model');
  const modelEmpty = modelField ? !values[modelField.key]?.trim() : false;

  return (
    <div className="space-y-3">
      {description && (
        <p className="text-[11px] text-ink-500 leading-relaxed">{description}</p>
      )}

      {fields.map((field) => (
        <label key={field.key} className="block text-xs text-ink-500">
          {field.label}
          <input
            type={field.secret ? 'password' : 'text'}
            value={values[field.key]}
            onChange={(e) => setValue(field.key, e.target.value)}
            placeholder={field.placeholder}
            className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800 placeholder:text-ink-300"
          />
        </label>
      ))}

      {emptyModelHint && modelEmpty && (
        <p className="text-[11px] text-ink-400">{emptyModelHint}</p>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold
                   bg-sage-600 hover:bg-sage-700 disabled:bg-ink-300 text-white rounded-card transition-colors"
      >
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : saved ? <Check className="w-3 h-3" /> : null}
        {saved ? 'Saved' : 'Save'}
      </button>

      <ProviderProbe
        buildConfig={() => buildProbeConfig(values)}
        onPickModel={modelField ? (model) => setValue(modelField.key, model) : undefined}
        testLabel={probeTestLabel}
        listLabel={probeListLabel}
      />

      {saveError && <p className="text-[11px] text-red-600 font-mono">{saveError}</p>}
    </div>
  );
}
