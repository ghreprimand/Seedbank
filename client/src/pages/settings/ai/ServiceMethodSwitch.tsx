/**
 * ServiceMethodSwitch — radio-style method selector for provider service families.
 */
import { methodCapabilityLabel } from './helpers';
import type { ServiceMethodOption } from './types';

export type { ServiceMethodOption };

interface ServiceMethodSwitchProps {
  title: string;
  value: string;
  onChange: (next: string) => void;
  options: ServiceMethodOption[];
}

export function ServiceMethodSwitch({
  title,
  value,
  onChange,
  options,
}: ServiceMethodSwitchProps) {
  const selected = options.find((option) => option.id === value);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-mono uppercase tracking-wider text-ink-500">{title}</p>
        {selected && (
          <p className="rounded-badge border border-sage-200 bg-sage-50 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide text-sage-700">
            enabled: {selected.label}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = value === option.id;
          const disabled = option.availability === 'unavailable';
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              disabled={disabled}
              className={`px-2.5 py-1.5 rounded-card border text-[11px] transition-colors ${
                active
                  ? 'border-sage-300 bg-sage-50 text-sage-800'
                  : 'border-ink-200 bg-paper text-ink-600 hover:border-sage-300 hover:text-sage-700'
              } ${
                disabled
                  ? 'opacity-60 cursor-not-allowed hover:border-ink-200 hover:text-ink-600'
                  : ''
              }`}
            >
              <span className="font-medium">{option.label}</span>
              {active && (
                <span className="ml-2 font-mono text-[10px] text-sage-700">enabled</span>
              )}
              <span className="ml-2 font-mono text-[10px] text-ink-400">
                {methodCapabilityLabel(option.capability)}
              </span>
              {option.availability === 'auth-required' && (
                <span className="ml-2 font-mono text-[10px] text-amber-600">auth required</span>
              )}
              {option.availability === 'unavailable' && (
                <span className="ml-2 font-mono text-[10px] text-red-600">unavailable</span>
              )}
              {!active && option.availability !== 'unavailable' && (
                <span className="ml-2 font-mono text-[10px] text-ink-300">not enabled</span>
              )}
            </button>
          );
        })}
      </div>
      {options.find((option) => option.id === value)?.availabilityReason && (
        <p className="text-[11px] text-ink-500">
          {options.find((option) => option.id === value)?.availabilityReason}
        </p>
      )}
    </div>
  );
}
