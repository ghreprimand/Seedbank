/**
 * ModelPicker — combobox for AI model IDs with discovered-model autocomplete.
 *
 * Renders a real select for discovered models and keeps a custom text field as
 * a fallback for model IDs that are not in the discovered list.
 */
import { useState } from 'react';
import type { AiModelInfo } from '@/lib/types';

export interface ModelPickerProps {
  discoveredModels: AiModelInfo[];
  value: string;
  onChange: (model: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function ModelPicker({
  discoveredModels,
  value,
  onChange,
  disabled = false,
  placeholder,
  className = 'mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-sm text-ink-800 disabled:bg-ink-50 disabled:text-ink-400',
}: ModelPickerProps) {
  const discovered = discoveredModels.slice(0, 200);
  const hasDiscovered = discovered.length > 0;
  const knownValue = discovered.some((model) => model.id === value);
  const [userCustomMode, setUserCustomMode] = useState(false);
  const customMode = (hasDiscovered && value !== '' && !knownValue) || (userCustomMode && !knownValue);
  const inputClassName = hasDiscovered && !disabled
    ? className.replace('mt-1 ', '')
    : className;

  return (
    <div className="mt-1 space-y-1">
      {hasDiscovered && !disabled && (
        <select
          value={customMode ? '__custom__' : knownValue ? value : ''}
          onChange={(event) => {
            if (event.target.value === '__custom__') {
              setUserCustomMode(true);
              return;
            }
            setUserCustomMode(false);
            onChange(event.target.value);
          }}
          className={className}
        >
          <option value="">Choose discovered model</option>
          {discovered.map((model) => {
            const label = model.displayName ?? model.name ?? model.id;
            return (
              <option key={model.id} value={model.id}>
                {label !== model.id ? `${label} — ${model.id}` : label}
              </option>
            );
          })}
          <option value="__custom__">Custom model ID...</option>
        </select>
      )}
      {(!hasDiscovered || customMode || disabled) && (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className={inputClassName}
        />
      )}
      {hasDiscovered && (
        <p className="text-[10px] text-ink-400">
          {discoveredModels.length} discovered model{discoveredModels.length === 1 ? '' : 's'}
          {disabled ? ' from the effective provider' : ''}
        </p>
      )}
    </div>
  );
}
