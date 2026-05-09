import { useState } from 'react';
import { Plus, X, ExternalLink } from 'lucide-react';
import type { IdeaLink } from '@/lib/types';

interface LinkEditorProps {
  links: IdeaLink[];
  onChange: (links: IdeaLink[]) => void;
}

export default function LinkEditor({ links, onChange }: LinkEditorProps) {
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');

  const addLink = () => {
    const trimUrl = url.trim();
    if (!trimUrl) return;
    onChange([...links, { url: trimUrl, label: label.trim() || trimUrl }]);
    setUrl('');
    setLabel('');
    setAdding(false);
  };

  const removeLink = (index: number) => {
    onChange(links.filter((_, i) => i !== index));
  };

  return (
    <div>
      <label className="block text-[11px] font-medium text-ink-400 uppercase tracking-wider mb-1.5 font-mono">
        Links & References
      </label>

      {links.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {links.map((link, i) => (
            <div
              key={i}
              className="flex items-center gap-2 group px-3 py-2 bg-paper-warm border border-ink-100
                         rounded-card text-sm transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 text-ink-300 shrink-0" />
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sage-600 hover:text-sage-700 underline underline-offset-2 decoration-sage-200
                           hover:decoration-sage-400 truncate transition-colors flex-1"
              >
                {link.label || link.url}
              </a>
              <button
                type="button"
                onClick={() => removeLink(i)}
                className="opacity-0 group-hover:opacity-100 text-ink-300 hover:text-red-400
                           transition-all p-0.5"
                title="Remove link"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="flex flex-col gap-2 p-3 bg-paper-warm border border-ink-100 rounded-card animate-slide-up">
          <input
            autoFocus
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="w-full px-2.5 py-1.5 text-sm bg-paper border border-ink-100 rounded-badge
                       outline-none focus:ring-2 focus:ring-sage-400 focus:border-sage-300
                       transition-all placeholder:text-ink-300"
          />
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)"
            className="w-full px-2.5 py-1.5 text-sm bg-paper border border-ink-100 rounded-badge
                       outline-none focus:ring-2 focus:ring-sage-400 focus:border-sage-300
                       transition-all placeholder:text-ink-300"
            onKeyDown={(e) => { if (e.key === 'Enter') addLink(); }}
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setAdding(false); setUrl(''); setLabel(''); }}
              className="px-2.5 py-1 text-xs text-ink-400 hover:text-ink-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={addLink}
              disabled={!url.trim()}
              className="px-3 py-1 text-xs font-medium bg-sage-600 hover:bg-sage-700 text-paper
                         rounded-badge transition-all disabled:opacity-40 active:scale-[0.98]"
            >
              Add
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-xs text-ink-400 hover:text-sage-600
                     transition-colors group"
        >
          <Plus className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform duration-200" />
          Add link
        </button>
      )}
    </div>
  );
}
