/** Quick capture modal — minimal title + notes form for fast idea entry ("Plant a Seed"). */
import { useState } from 'react';
import { X } from 'lucide-react';
import { createIdea } from '@/db/ideas';

interface QuickCaptureProps {
  onClose: () => void;
  onSuccess: (id: string) => void;
}

export default function QuickCapture({ onClose, onSuccess }: QuickCaptureProps) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSaving(true);
    try {
      const idea = await createIdea({
        title: title.trim(),
        pitch: '',
        fullNotes: notes.trim(),
        category: 'app',
        stage: 'seed',
        tags: [],
        moodLabels: [],
        hook: '',
        whyItMightWork: '',
        risks: '',
        techStack: '',
        jamScore: 0,
        excitementScore: 0,
        relatedIdeaIds: [],
        links: [],
        images: [],
      });
      onSuccess(idea.id);
    } catch (err) {
      console.error('Failed to create idea:', err);
      alert('Error saving seed. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/30 backdrop-blur-sm animate-fade-in">
      <div
        className="bg-paper w-full max-w-md rounded-card shadow-modal border border-ink-100 p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-xl font-serif font-semibold text-ink-900 flex items-center gap-2">
            <span>🌱</span> Plant a Seed
          </h2>
          <button
            onClick={onClose}
            className="text-ink-300 hover:text-ink-500 p-1 transition-colors rounded-card hover:bg-ink-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-ink-400 uppercase tracking-wider mb-1.5 font-mono">
              Idea Title
            </label>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's the spark?"
              className="w-full px-3 py-2.5 bg-paper-warm border border-ink-100 rounded-card
                         focus:outline-none focus:ring-2 focus:ring-sage-400 focus:border-sage-300
                         transition-all text-ink-900 text-[15px] font-serif placeholder:text-ink-300"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-ink-400 uppercase tracking-wider mb-1.5 font-mono">
              Rough Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="A few thoughts, a hook, or why it's interesting…"
              className="w-full px-3 py-2.5 bg-paper-warm border border-ink-100 rounded-card
                         focus:outline-none focus:ring-2 focus:ring-sage-400 focus:border-sage-300
                         transition-all text-ink-800 text-sm min-h-[120px] resize-none
                         leading-relaxed placeholder:text-ink-300"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-ink-500
                         hover:bg-ink-50 rounded-card transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !title.trim()}
              className="flex-1 px-4 py-2.5 text-sm font-medium bg-sage-600 hover:bg-sage-700
                         active:bg-sage-800 text-paper rounded-card transition-all
                         disabled:opacity-50 disabled:cursor-not-allowed
                         shadow-card hover:shadow-card-hover active:scale-[0.98]"
            >
              {isSaving ? 'Planting…' : 'Plant Seed'}
            </button>
          </div>
        </form>
      </div>
      <div className="fixed inset-0 -z-10" onClick={onClose} />
    </div>
  );
}
