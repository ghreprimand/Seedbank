import { useState } from 'react';
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
        pitch: '', // Quick capture only takes title/notes
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/40 backdrop-blur-sm">
      <div 
        className="bg-paper w-full max-w-md rounded-card shadow-modal border border-ink-200 p-6 animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-serif font-semibold text-ink-900 flex items-center gap-2">
            <span>🌱</span> Plant a Seed
          </h2>
          <button 
            onClick={onClose}
            className="text-ink-400 hover:text-ink-600 p-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-500 uppercase tracking-wider mb-1">
              Idea Title
            </label>
            <input 
              autoFocus
              type="text" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's the spark?"
              className="w-full px-3 py-2 bg-paper-warm border border-ink-200 rounded-badge focus:outline-none focus:ring-2 focus:ring-sage-400 transition-all text-ink-900"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-500 uppercase tracking-wider mb-1">
              Rough Notes
            </label>
            <textarea 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="A few thoughts, a hook, or why it's interesting..."
              className="w-full px-3 py-2 bg-paper-warm border border-ink-200 rounded-badge focus:outline-none focus:ring-2 focus:ring-sage-400 transition-all text-ink-900 min-h-[120px]"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium text-ink-600 hover:bg-ink-100 rounded-badge transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isSaving || !title.trim()}
              className="flex-1 px-4 py-2 text-sm font-medium bg-sage-600 hover:bg-sage-700 text-paper rounded-badge transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Planting...' : 'Plant Seed'}
            </button>
          </div>
        </form>
      </div>
      <div className="fixed inset-0 -z-10" onClick={onClose} />
    </div>
  );
}
