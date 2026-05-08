import { useState } from 'react';
import { X, Plus, ExternalLink } from 'lucide-react';
import type { IdeaLink } from '@/lib/types';

interface LinkEditorProps {
  links: IdeaLink[];
  onChange: (links: IdeaLink[]) => void;
}

export default function LinkEditor({ links, onChange }: LinkEditorProps) {
  const [adding, setAdding] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const addLink = () => {
    const url = newUrl.trim();
    if (!url) return;
    const label = newLabel.trim() || url;
    onChange([...links, { url, label }]);
    setNewUrl('');
    setNewLabel('');
    setAdding(false);
  };

  const removeLink = (index: number) => {
    onChange(links.filter((_, i) => i !== index));
  };

  return (
    <div>
      <label className="block text-xs font-medium text-ink-500 uppercase tracking-wider mb-1.5">
        Links & References
      </label>

      {links.length > 0 && (
        <ul className="space-y-1 mb-2">
          {links.map((link, i) => (
            <li
              key={i}
              className="flex items-center gap-2 text-sm group"
            >
              <ExternalLink className="w-3.5 h-3.5 text-ink-300 shrink-0" />
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sage-600 hover:text-sage-800 underline underline-offset-2 truncate"
              >
                {link.label}
              </a>
              <button
                type="button"
                onClick={() => removeLink(i)}
                className="text-ink-300 hover:text-ink-600 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="flex flex-col gap-2 p-2 bg-paper-warm border border-ink-200 rounded-badge">
          <input
            autoFocus
            type="url"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://..."
            className="w-full px-2 py-1 text-sm bg-paper border border-ink-200 rounded-badge outline-none focus:ring-2 focus:ring-sage-400"
          />
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Label (optional)"
            className="w-full px-2 py-1 text-sm bg-paper border border-ink-200 rounded-badge outline-none focus:ring-2 focus:ring-sage-400"
            onKeyDown={(e) => { if (e.key === 'Enter') addLink(); }}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setAdding(false); setNewUrl(''); setNewLabel(''); }}
              className="text-xs text-ink-400 hover:text-ink-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={addLink}
              disabled={!newUrl.trim()}
              className="text-xs font-medium text-sage-600 hover:text-sage-800 disabled:opacity-40"
            >
              Add link
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 text-xs text-ink-400 hover:text-sage-600 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add link
        </button>
      )}
    </div>
  );
}
