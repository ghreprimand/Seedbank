import { useState } from 'react';
import { Check, Wand2, X } from 'lucide-react';
import type { AiSuggestionField, Idea } from '@/lib/types';
import { suggestIdeaField } from '@/api/client';

interface AiSuggestionButtonProps {
  idea: Idea;
  field: AiSuggestionField;
  currentValue: string;
  onApply: (value: string) => void;
}

export default function AiSuggestionButton({ idea, field, currentValue, onApply }: AiSuggestionButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const [rationale, setRationale] = useState('');
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const response = await suggestIdeaField(idea.id, field, currentValue);
      setSuggestion(response.suggestion);
      setRationale(response.rationale);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={ask}
        title="Ask AI"
        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono rounded-badge
                   text-sage-700 bg-sage-50 border border-sage-100 hover:border-sage-300 transition-colors"
      >
        <Wand2 className="w-3 h-3" /> Ask AI
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/30 backdrop-blur-sm animate-fade-in">
          <div className="bg-paper w-full max-w-2xl rounded-card shadow-modal border border-ink-100 p-5 animate-scale-in">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-serif font-semibold text-ink-900">AI suggestion</h2>
                <p className="text-xs text-ink-400 mt-1">Review before applying to this field.</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 text-ink-300 hover:text-ink-600 rounded-card hover:bg-ink-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {loading ? (
              <p className="text-sm text-ink-400 font-mono italic py-10 text-center">Thinking…</p>
            ) : error ? (
              <div className="px-3 py-2 bg-red-50 border border-red-100 rounded-card text-xs text-red-700">
                {error}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] font-mono uppercase text-ink-400 mb-1">Current</div>
                  <div className="min-h-32 whitespace-pre-wrap text-sm text-ink-600 bg-paper-warm border border-ink-100 rounded-card p-3">
                    {currentValue || 'Empty'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-mono uppercase text-ink-400 mb-1">Suggested</div>
                  <div className="min-h-32 whitespace-pre-wrap text-sm text-ink-800 bg-sage-50 border border-sage-100 rounded-card p-3">
                    {suggestion}
                  </div>
                </div>
              </div>
            )}

            {rationale && (
              <p className="text-xs text-ink-400 mt-3">{rationale}</p>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 py-2 text-sm text-ink-500 hover:bg-ink-50 rounded-card transition-colors"
              >
                Reject
              </button>
              <button
                type="button"
                disabled={!suggestion || loading}
                onClick={() => {
                  onApply(suggestion);
                  setOpen(false);
                }}
                className="inline-flex items-center gap-1 px-3 py-2 text-sm font-semibold bg-sage-600 hover:bg-sage-700 disabled:bg-ink-200 text-white rounded-card transition-colors"
              >
                <Check className="w-4 h-4" /> Apply
              </button>
            </div>
          </div>
          <div className="fixed inset-0 -z-10" onClick={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}
