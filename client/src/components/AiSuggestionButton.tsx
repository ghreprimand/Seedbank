import { useState } from 'react';
import { Wand2 } from 'lucide-react';
import type { AiSuggestionField, Idea } from '@/lib/types';
import AiAssistModal from '@/components/AiAssistModal';
import { FIELD_LABELS } from '@/lib/aiAssist';

interface AiSuggestionButtonProps {
  idea: Idea;
  field: AiSuggestionField;
  currentValue: string;
  onApply: (value: string) => void;
}

export default function AiSuggestionButton({ idea, field, currentValue, onApply }: AiSuggestionButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="AI assistance for this field"
        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono rounded-badge
                   text-sage-700 bg-sage-50 border border-sage-100 hover:border-sage-300 transition-colors"
      >
        <Wand2 className="w-3 h-3" /> Ask AI
      </button>

      {open && (
        <AiAssistModal
          context={{
            idea,
            field,
            fieldLabel: FIELD_LABELS[field] ?? field,
            currentValue,
          }}
          onApply={onApply}
          onClose={() => setOpen(false)}
          featureKey="field-suggestions"
        />
      )}
    </>
  );
}
