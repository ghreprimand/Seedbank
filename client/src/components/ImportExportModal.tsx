/**
 * Import/Export modal for archive-level operations.
 *
 * Supports:
 *   - Export archive as JSON or Markdown
 *   - Import from Seedbank JSON (merge or replace)
 *   - Import from Markdown files
 */

import { useState, useRef } from 'react';
import {
  X,
  Download,
  Upload,
  FileJson,
  FileText,
  AlertTriangle,
  Check,
} from 'lucide-react';
import { exportArchiveAsJSON, exportArchiveAsMarkdown } from '@/lib/export';
import {
  importFromJSON,
  importFromMarkdown,
  readFileAsText,
  type ImportResult,
  type ImportMode,
} from '@/lib/import';

interface ImportExportModalProps {
  onClose: () => void;
  onImported?: () => void;
}

type Tab = 'export' | 'import';

export default function ImportExportModal({ onClose, onImported }: ImportExportModalProps) {
  const [tab, setTab] = useState<Tab>('export');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [showReplaceWarning, setShowReplaceWarning] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportJSON = async () => {
    try {
      await exportArchiveAsJSON();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const handleExportMarkdown = async () => {
    try {
      await exportArchiveAsMarkdown();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setError(null);
    setImportResult(null);

    const fileArray = Array.from(files);
    setPendingFiles(fileArray);

    if (importMode === 'replace') {
      setShowReplaceWarning(true);
    } else {
      processImport(fileArray, 'merge');
    }
  };

  const processImport = async (files: File[], mode: ImportMode) => {
    setImporting(true);
    setShowReplaceWarning(false);
    setError(null);

    try {
      const jsonFiles = files.filter((f) => f.name.endsWith('.json'));
      const mdFiles = files.filter((f) =>
        f.name.endsWith('.md') || f.name.endsWith('.markdown') || f.name.endsWith('.txt')
      );

      const combinedResult: ImportResult = {
        imported: 0,
        skipped: 0,
        versionsImported: 0,
        warnings: [],
      };

      for (const file of jsonFiles) {
        const text = await readFileAsText(file);
        const result = await importFromJSON(text, mode);
        combinedResult.imported += result.imported;
        combinedResult.skipped += result.skipped;
        combinedResult.versionsImported += result.versionsImported;
        combinedResult.warnings.push(...result.warnings);
      }

      if (mdFiles.length > 0) {
        const texts = await Promise.all(mdFiles.map(readFileAsText));
        const result = await importFromMarkdown(texts);
        combinedResult.imported += result.imported;
        combinedResult.skipped += result.skipped;
        combinedResult.warnings.push(...result.warnings);
      }

      if (jsonFiles.length === 0 && mdFiles.length === 0) {
        setError('No supported files found. Please select .json or .md files.');
      } else {
        setImportResult(combinedResult);
        if (combinedResult.imported > 0) {
          onImported?.();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
      setPendingFiles(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const confirmReplace = () => {
    if (pendingFiles) {
      processImport(pendingFiles, 'replace');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/30 backdrop-blur-sm animate-fade-in" data-help="import-export-modal">
      <div className="bg-paper w-full max-w-lg rounded-card shadow-modal border border-ink-100 animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-lg font-serif font-semibold text-ink-900">
            Import & Export
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-ink-300 hover:text-ink-500 transition-colors rounded-card hover:bg-ink-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex px-6 gap-1">
          <button
            onClick={() => { setTab('export'); setError(null); setImportResult(null); }}
            className={`px-4 py-2 text-sm font-medium rounded-t-badge transition-all duration-200 ${
              tab === 'export'
                ? 'bg-paper-warm text-ink-800 border border-b-0 border-ink-100'
                : 'text-ink-400 hover:text-ink-600'
            }`}
          >
            <Download className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            Export
          </button>
          <button
            onClick={() => { setTab('import'); setError(null); setImportResult(null); }}
            className={`px-4 py-2 text-sm font-medium rounded-t-badge transition-all duration-200 ${
              tab === 'import'
                ? 'bg-paper-warm text-ink-800 border border-b-0 border-ink-100'
                : 'text-ink-400 hover:text-ink-600'
            }`}
          >
            <Upload className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            Import
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 bg-paper-warm border-t border-ink-100 rounded-b-card space-y-4">
          {tab === 'export' && (
            <>
              <p className="text-sm text-ink-400">
                Download your entire idea archive. Your data stays yours.
              </p>

              <div className="space-y-3">
                <button
                  onClick={handleExportJSON}
                  className="w-full flex items-center gap-3 px-4 py-3.5 bg-paper border border-ink-100 rounded-card
                             shadow-card hover:shadow-card-hover hover:border-sage-300
                             transition-all text-left group"
                >
                  <div className="w-10 h-10 rounded-full bg-sage-50 border border-sage-100 flex items-center justify-center shrink-0 group-hover:bg-sage-100 transition-colors">
                    <FileJson className="w-5 h-5 text-sage-600" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-ink-800">
                      Archive as JSON
                    </div>
                    <div className="text-xs text-ink-400">
                      All ideas + version history. Best for backup & re-import.
                    </div>
                  </div>
                </button>

                <button
                  onClick={handleExportMarkdown}
                  className="w-full flex items-center gap-3 px-4 py-3.5 bg-paper border border-ink-100 rounded-card
                             shadow-card hover:shadow-card-hover hover:border-sage-300
                             transition-all text-left group"
                >
                  <div className="w-10 h-10 rounded-full bg-sage-50 border border-sage-100 flex items-center justify-center shrink-0 group-hover:bg-sage-100 transition-colors">
                    <FileText className="w-5 h-5 text-sage-600" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-ink-800">
                      Archive as Markdown
                    </div>
                    <div className="text-xs text-ink-400">
                      Human-readable document. One section per idea.
                    </div>
                  </div>
                </button>
              </div>
            </>
          )}

          {tab === 'import' && !showReplaceWarning && (
            <>
              <p className="text-sm text-ink-400">
                Import ideas from Seedbank JSON archives or Markdown files.
              </p>

              {/* Import mode selector */}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer group">
                  <input
                    type="radio"
                    name="importMode"
                    checked={importMode === 'merge'}
                    onChange={() => setImportMode('merge')}
                    className="accent-sage-500"
                  />
                  <span className="text-ink-600 group-hover:text-ink-800 transition-colors">
                    Merge
                    <span className="text-ink-300 text-xs ml-1 font-mono">(keep + add)</span>
                  </span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer group">
                  <input
                    type="radio"
                    name="importMode"
                    checked={importMode === 'replace'}
                    onChange={() => setImportMode('replace')}
                    className="accent-sage-500"
                  />
                  <span className="text-ink-600 group-hover:text-ink-800 transition-colors">
                    Replace
                    <span className="text-ink-300 text-xs ml-1 font-mono">(clear first)</span>
                  </span>
                </label>
              </div>

              {/* File input */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.md,.markdown,.txt"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                  id="import-file-input"
                />
                <label
                  htmlFor="import-file-input"
                  className={`flex flex-col items-center justify-center gap-2 px-4 py-8 bg-paper border-2
                             border-dashed border-ink-200 rounded-card cursor-pointer
                             hover:border-sage-400 hover:bg-sage-50/40 transition-all text-center ${
                    importing ? 'opacity-50 pointer-events-none' : ''
                  }`}
                >
                  <Upload className="w-6 h-6 text-ink-300" />
                  <span className="text-sm text-ink-400">
                    {importing ? 'Importing…' : 'Choose .json or .md files'}
                  </span>
                  <span className="text-[11px] text-ink-300 font-mono">
                    or drag and drop
                  </span>
                </label>
              </div>

              {/* Import result */}
              {importResult && (
                <div className="p-4 bg-sage-50 border border-sage-200 rounded-card text-sm animate-slide-up">
                  <div className="flex items-center gap-2 text-sage-700 font-medium mb-2">
                    <Check className="w-4 h-4" />
                    Import complete
                  </div>
                  <ul className="text-xs text-sage-600 space-y-0.5 ml-6 font-mono">
                    <li>{importResult.imported} idea{importResult.imported !== 1 ? 's' : ''} imported</li>
                    {importResult.skipped > 0 && (
                      <li>{importResult.skipped} skipped (already exist)</li>
                    )}
                    {importResult.versionsImported > 0 && (
                      <li>{importResult.versionsImported} version{importResult.versionsImported !== 1 ? 's' : ''} restored</li>
                    )}
                  </ul>
                  {importResult.warnings.length > 0 && (
                    <div className="mt-2 text-xs text-amber-700">
                      {importResult.warnings.map((w, i) => (
                        <div key={i} className="flex items-start gap-1">
                          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                          {w}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Replace confirmation */}
          {showReplaceWarning && (
            <div className="space-y-4 animate-scale-in">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-card">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-serif font-semibold text-amber-800 mb-1">
                      Replace all existing data?
                    </h3>
                    <p className="text-xs text-amber-700 leading-relaxed">
                      This will permanently delete all your current ideas and version
                      history, then import the contents of the selected file.
                      This cannot be undone.
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowReplaceWarning(false); setPendingFiles(null); }}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-ink-500 hover:bg-ink-50
                             rounded-card transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmReplace}
                  className="flex-1 px-4 py-2.5 text-sm font-medium bg-amber-600 hover:bg-amber-700
                             text-white rounded-card transition-all active:scale-[0.98]"
                >
                  Yes, replace everything
                </button>
              </div>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-card text-sm text-red-700 flex items-start gap-2 animate-slide-up">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}
        </div>
      </div>
      <div className="fixed inset-0 -z-10" onClick={onClose} />
    </div>
  );
}
