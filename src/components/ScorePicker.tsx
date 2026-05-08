import { Star } from 'lucide-react';

interface ScorePickerProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** Max score — defaults to 5 */
  max?: number;
}

export default function ScorePicker({ label, value, onChange, max = 5 }: ScorePickerProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-500 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <div className="flex items-center gap-1">
        {Array.from({ length: max }, (_, i) => {
          const score = i + 1;
          const active = score <= value;
          return (
            <button
              key={score}
              type="button"
              onClick={() => onChange(value === score ? 0 : score)}
              title={value === score ? 'Clear score' : `${score}/${max}`}
              className={`p-0.5 transition-colors ${
                active
                  ? 'text-amber-400 hover:text-amber-500'
                  : 'text-ink-200 hover:text-ink-300'
              }`}
            >
              <Star
                className="w-5 h-5"
                fill={active ? 'currentColor' : 'none'}
              />
            </button>
          );
        })}
        {value > 0 && (
          <span className="ml-2 text-xs text-ink-400">{value}/{max}</span>
        )}
      </div>
    </div>
  );
}
