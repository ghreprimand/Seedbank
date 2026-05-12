/** Clickable 1–5 star picker for excitement and jam suitability scores. */
import { Star } from 'lucide-react';
import { HelpButton } from '@/help/HelpPopover';

interface ScorePickerProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  helpSummary?: string;
  helpManualSection?: string;
}

export default function ScorePicker({ label, value, onChange, helpSummary, helpManualSection }: ScorePickerProps) {
  return (
    <div>
      <div className="flex items-center gap-1 mb-1.5">
        <label className="text-[11px] font-medium text-ink-400 uppercase tracking-wider font-mono">
          {label}
        </label>
        {helpSummary && (
          <HelpButton
            helpId={`score-${label}`}
            title={label}
            summary={helpSummary}
            manualSection={helpManualSection}
          />
        )}
      </div>
      <div className="flex items-center gap-1 p-2 bg-paper-warm border border-ink-100 rounded-card">
        {Array.from({ length: 5 }, (_, i) => {
          const starVal = i + 1;
          const active = starVal <= value;
          return (
            <button
              key={starVal}
              type="button"
              onClick={() => onChange(starVal === value ? 0 : starVal)}
              className={`p-1 rounded-badge transition-all duration-200 ${
                active
                  ? 'text-amber-400 hover:text-amber-500 scale-110'
                  : 'text-ink-200 hover:text-amber-300'
              }`}
              title={`${starVal} / 5${starVal === value ? ' (click to clear)' : ''}`}
            >
              <Star
                className="w-5 h-5"
                fill={active ? 'currentColor' : 'none'}
                strokeWidth={active ? 1.5 : 1.5}
              />
            </button>
          );
        })}
        {value > 0 && (
          <span className="ml-1 text-[11px] text-ink-300 font-mono">{value}/5</span>
        )}
      </div>
    </div>
  );
}
