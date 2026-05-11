/** Search-and-link component for connecting related ideas to the current idea. */
import { useState, useEffect, useRef } from 'react';
import { X, Plus, Link2 } from 'lucide-react';
import { getAllIdeas } from '@/api/client';
import type { Idea } from '@/lib/types';

interface RelatedIdeasLinkerProps {
  ideaId: string;
  relatedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function RelatedIdeasLinker({ ideaId, relatedIds, onChange }: RelatedIdeasLinkerProps) {
  const [allIdeas, setAllIdeas] = useState<Idea[]>([]);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAllIdeas().then(setAllIdeas);
  }, []);

  const relatedIdeas = relatedIds
    .map((id) => allIdeas.find((i) => i.id === id))
    .filter(Boolean) as Idea[];

  const results = searching && query.trim()
    ? allIdeas.filter(
        (idea) =>
          idea.id !== ideaId &&
          !relatedIds.includes(idea.id) &&
          idea.title.toLowerCase().includes(query.toLowerCase()),
      ).slice(0, 8)
    : [];

  const addRelated = (id: string) => {
    onChange([...relatedIds, id]);
    setQuery('');
    setSearching(false);
  };

  const removeRelated = (id: string) => {
    onChange(relatedIds.filter((r) => r !== id));
  };

  return (
    <div>
      <label className="block text-[11px] font-medium text-ink-400 uppercase tracking-wider mb-1.5 font-mono">
        Related Ideas
      </label>

      {relatedIdeas.length > 0 && (
        <ul className="space-y-1 mb-3">
          {relatedIdeas.map((idea) => (
            <li
              key={idea.id}
              className="flex items-center gap-2 text-sm group px-3 py-2
                         bg-paper-warm border border-ink-100 rounded-card transition-colors"
            >
              <Link2 className="w-3.5 h-3.5 text-ink-300 shrink-0" />
              <span className="text-ink-700 truncate flex-1">{idea.title || 'Untitled'}</span>
              <button
                type="button"
                onClick={() => removeRelated(idea.id)}
                className="text-ink-300 hover:text-red-400 opacity-0 group-hover:opacity-100
                           transition-all p-0.5 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {searching ? (
        <div className="relative">
          <input
            ref={inputRef}
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ideas to link…"
            className="w-full px-3 py-2 text-sm bg-paper-warm border border-ink-100 rounded-card
                       outline-none focus:ring-2 focus:ring-sage-400 focus:border-sage-300
                       transition-all placeholder:text-ink-300"
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setSearching(false); setQuery(''); }
            }}
          />
          {results.length > 0 && (
            <ul className="absolute left-0 right-0 top-full mt-1 z-20 bg-paper border border-ink-100
                           rounded-card shadow-modal max-h-48 overflow-y-auto animate-scale-in">
              {results.map((idea) => (
                <li key={idea.id}>
                  <button
                    type="button"
                    onClick={() => addRelated(idea.id)}
                    className="w-full text-left px-3 py-2 text-sm text-ink-700
                               hover:bg-sage-50 transition-colors truncate"
                  >
                    {idea.title || 'Untitled'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.trim() && results.length === 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-paper border border-ink-100
                            rounded-card shadow-modal px-3 py-2 text-xs text-ink-300 italic font-mono
                            animate-scale-in">
              No matching ideas
            </div>
          )}
          <div className="fixed inset-0 -z-10" onClick={() => { setSearching(false); setQuery(''); }} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setSearching(true)}
          className="flex items-center gap-1.5 text-xs text-ink-400 hover:text-sage-600
                     transition-colors group"
        >
          <Plus className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform duration-200" />
          Link idea
        </button>
      )}
    </div>
  );
}
