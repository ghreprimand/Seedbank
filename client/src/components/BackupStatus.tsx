import { useEffect, useState } from 'react';
import { Archive, RefreshCw, X } from 'lucide-react';
import {
  getBackupStatus,
  runBackupNow,
  updateBackupConfig,
  type BackupFrequency,
  type BackupStatus as BackupState,
} from '@/api/client';
import { timeAgo } from '@/lib/timeago';

const FREQUENCIES: BackupFrequency[] = ['daily', 'weekly', 'off'];

function lastBackupDate(status: BackupState | null): Date | null {
  const timestamp = status?.lastRun?.timestamp
    ?? status?.latestDatabaseBackup?.timestamp
    ?? status?.latestJsonExport?.timestamp;
  return timestamp ? new Date(timestamp) : null;
}

export default function BackupStatus() {
  const [status, setStatus] = useState<BackupState | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBackupStatus()
      .then((next) => {
        if (!cancelled) {
          setStatus(next);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Backup status unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runNow = async () => {
    setBusy(true);
    try {
      const result = await runBackupNow();
      setStatus(result.status);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup failed');
    } finally {
      setBusy(false);
    }
  };

  const setFrequency = async (frequency: BackupFrequency) => {
    setBusy(true);
    try {
      setStatus(await updateBackupConfig({ frequency }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update backup settings');
    } finally {
      setBusy(false);
    }
  };

  const last = lastBackupDate(status);
  const label = last ? timeAgo(last, 'backed up') : 'No backups yet';

  return (
    <div className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={label}
        className="p-2 text-ink-400 hover:text-ink-600 transition-all duration-200 rounded-card hover:bg-ink-50"
      >
        <Archive className="w-[18px] h-[18px]" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-30 w-80 bg-paper border border-ink-100 rounded-card shadow-modal p-4 animate-scale-in">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="text-sm font-serif font-semibold text-ink-900">Backups</h2>
                <p className="text-xs text-ink-400 mt-0.5">{label}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 text-ink-300 hover:text-ink-500 rounded-card hover:bg-ink-50 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-[11px] font-medium text-ink-400 uppercase tracking-wider mb-1.5 font-mono">
                  Schedule
                </div>
                <div className="flex gap-1">
                  {FREQUENCIES.map((frequency) => (
                    <button
                      key={frequency}
                      type="button"
                      onClick={() => setFrequency(frequency)}
                      disabled={busy}
                      className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-badge border transition-colors disabled:opacity-50 ${
                        status?.config.frequency === frequency
                          ? 'bg-sage-50 border-sage-200 text-sage-700'
                          : 'bg-paper-warm border-ink-100 text-ink-500 hover:bg-ink-50'
                      }`}
                    >
                      {frequency}
                    </button>
                  ))}
                </div>
              </div>

              {status && (
                <div className="text-[11px] text-ink-400 font-mono space-y-1">
                  <div className="truncate">DB: {status.latestDatabaseBackup?.path ?? status.paths.backupsDir}</div>
                  <div className="truncate">JSON: {status.latestJsonExport?.path ?? status.paths.exportsDir}</div>
                </div>
              )}

              {error && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-card px-3 py-2">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={runNow}
                disabled={busy}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-sage-600 hover:bg-sage-700 text-paper rounded-card transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
                Run backup now
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
