/** Settings → General: import/export and keyboard shortcuts. */
import { useState } from 'react';
import { ArrowUpDown, Keyboard } from 'lucide-react';
import ImportExportModal from '@/components/ImportExportModal';
import { useNavigate } from 'react-router-dom';

const SHORTCUTS = [
  { key: '/', description: 'Focus search' },
  { key: 'N', description: 'Open quick capture' },
  { key: 'Esc', description: 'Close modal / blur search' },
];

export default function GeneralTab() {
  const [importExportOpen, setImportExportOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="space-y-8">
      {/* Import / Export */}
      <section>
        <h3 className="text-base font-serif font-semibold text-ink-800 mb-1">Data</h3>
        <p className="text-sm text-ink-400 mb-4">
          Export your entire idea archive or import from a previous export.
        </p>
        <button
          onClick={() => setImportExportOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium
                     bg-paper border border-ink-200 hover:border-sage-300 hover:bg-sage-50
                     text-ink-700 rounded-card shadow-card hover:shadow-card-hover
                     transition-all duration-200"
        >
          <ArrowUpDown className="w-4 h-4" />
          Import &amp; Export
        </button>
      </section>

      {/* Keyboard shortcuts */}
      <section>
        <h3 className="text-base font-serif font-semibold text-ink-800 mb-1 flex items-center gap-2">
          <Keyboard className="w-4 h-4 text-ink-400" />
          Keyboard shortcuts
        </h3>
        <div className="mt-3 divide-y divide-ink-100 border border-ink-100 rounded-card overflow-hidden">
          {SHORTCUTS.map(({ key, description }) => (
            <div key={key} className="flex items-center justify-between px-4 py-2.5 bg-paper">
              <span className="text-sm text-ink-600">{description}</span>
              <kbd className="px-2 py-0.5 text-[11px] font-mono bg-paper-warm border border-ink-200
                             text-ink-500 rounded-badge shadow-sm">
                {key}
              </kbd>
            </div>
          ))}
        </div>
      </section>

      {importExportOpen && (
        <ImportExportModal
          onClose={() => setImportExportOpen(false)}
          onImported={() => {
            setImportExportOpen(false);
            navigate('/');
          }}
        />
      )}
    </div>
  );
}
