import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Database, X } from 'lucide-react';
import {
  inspectBrowserMigration,
  migrateBrowserData,
  type MigrationInspection,
  type MigrationProgress,
} from '@/api/client';

interface DataMigrationDialogProps {
  onMigrated?: () => void;
}

export default function DataMigrationDialog({ onMigrated }: DataMigrationDialogProps) {
  const [inspection, setInspection] = useState<MigrationInspection | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [progress, setProgress] = useState<MigrationProgress | null>(null);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    inspectBrowserMigration()
      .then((result) => {
        if (!cancelled) setInspection(result);
      })
      .catch((err) => {
        if (!cancelled) console.error('Migration inspection failed:', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!inspection?.shouldPrompt || dismissed) return null;

  const percent = progress
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  const handleMigrate = async () => {
    setIsMigrating(true);
    setError(null);
    try {
      await migrateBrowserData(setProgress);
      setComplete(true);
      onMigrated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Migration failed');
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/30 backdrop-blur-sm animate-fade-in">
      <div className="bg-paper w-full max-w-md rounded-card shadow-modal border border-ink-100 p-6 animate-scale-in">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-sage-50 border border-sage-100 flex items-center justify-center shrink-0">
              {complete ? (
                <Check className="w-5 h-5 text-sage-600" />
              ) : (
                <Database className="w-5 h-5 text-sage-600" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-serif font-semibold text-ink-900">
                {complete ? 'Migration complete' : 'Move browser ideas to persistent storage?'}
              </h2>
              <p className="text-sm text-ink-400 leading-relaxed mt-1">
                {complete
                  ? 'Your browser ideas were copied to the backend.'
                  : `Found ${inspection.localIdeaCount} browser idea${inspection.localIdeaCount !== 1 ? 's' : ''} and ${inspection.localVersionCount} version${inspection.localVersionCount !== 1 ? 's' : ''}.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="p-1 text-ink-300 hover:text-ink-500 transition-colors rounded-card hover:bg-ink-50"
            disabled={isMigrating}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!complete && (
          <p className="text-sm text-ink-500 leading-relaxed mb-5">
            This copies your existing IndexedDB archive into the SQLite-backed server at localhost:4800.
            The browser copy stays available as an offline fallback.
          </p>
        )}

        {progress && (
          <div className="space-y-2 mb-5">
            <div className="h-2 bg-paper-warm border border-ink-100 rounded-pill overflow-hidden">
              <div
                className="h-full bg-sage-500 transition-all duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] font-mono text-ink-300">
              <span>{progress.label}</span>
              <span>{percent}%</span>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-card text-sm text-red-700 flex items-start gap-2 mb-5">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-3">
          {complete ? (
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="flex-1 px-4 py-2.5 text-sm font-medium bg-sage-600 hover:bg-sage-700 text-paper rounded-card transition-all active:scale-[0.98]"
            >
              Done
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                disabled={isMigrating}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-ink-500 hover:bg-ink-50 rounded-card transition-colors disabled:opacity-50"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={handleMigrate}
                disabled={isMigrating}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-sage-600 hover:bg-sage-700 text-paper rounded-card transition-all disabled:opacity-50 active:scale-[0.98]"
              >
                {isMigrating ? 'Migrating...' : 'Migrate'}
              </button>
            </>
          )}
        </div>
      </div>
      <div className="fixed inset-0 -z-10" />
    </div>
  );
}
