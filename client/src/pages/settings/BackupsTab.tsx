/** Settings → Backups: full backup configuration (ported from BackupStatus popover). */
import { useEffect, useState } from 'react';
import { RefreshCw, Archive } from 'lucide-react';
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
  const timestamp =
    status?.lastRun?.timestamp ??
    status?.latestDatabaseBackup?.timestamp ??
    status?.latestJsonExport?.timestamp;
  return timestamp ? new Date(timestamp) : null;
}

export default function BackupsTab() {
  const [status, setStatus] = useState<BackupState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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
    setError(null);
    setSuccessMsg(null);
    try {
      const result = await runBackupNow();
      setStatus(result.status);
      setSuccessMsg('Backup completed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup failed');
    } finally {
      setBusy(false);
    }
  };

  const setFrequency = async (frequency: BackupFrequency) => {
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      setStatus(await updateBackupConfig({ frequency }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update backup settings');
    } finally {
      setBusy(false);
    }
  };

  const last = lastBackupDate(status);
  const lastLabel = last ? timeAgo(last, 'backed up') : 'No backups yet';

  return (
    <div className="space-y-8 max-w-xl">
      {/* Status summary */}
      <section className="flex items-start gap-4 p-4 bg-paper-warm border border-ink-100 rounded-card">
        <div className="mt-0.5 p-2 rounded-full bg-sage-50 border border-sage-100">
          <Archive className="w-4 h-4 text-sage-600" />
        </div>
        <div>
          <div className="text-sm font-semibold text-ink-800">Last backup</div>
          <div className="text-xs text-ink-400 mt-0.5 font-mono">{lastLabel}</div>
          {status && (
            <div className="mt-2 space-y-1 text-[11px] text-ink-400 font-mono">
              <div className="truncate">
                DB: {status.latestDatabaseBackup?.path ?? status.paths.backupsDir}
              </div>
              <div className="truncate">
                JSON: {status.latestJsonExport?.path ?? status.paths.exportsDir}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Schedule */}
      <section>
        <h3 className="text-base font-serif font-semibold text-ink-800 mb-1">Schedule</h3>
        <p className="text-sm text-ink-400 mb-3">
          How often Seedbank automatically backs up your data.
        </p>
        <div className="flex gap-2">
          {FREQUENCIES.map((frequency) => (
            <button
              key={frequency}
              type="button"
              onClick={() => setFrequency(frequency)}
              disabled={busy}
              className={`flex-1 max-w-[120px] px-3 py-2 text-sm font-medium rounded-card border
                         transition-colors disabled:opacity-50 capitalize ${
                status?.config.frequency === frequency
                  ? 'bg-sage-50 border-sage-300 text-sage-700 shadow-sm'
                  : 'bg-paper border-ink-200 text-ink-500 hover:bg-ink-50 hover:border-ink-300'
              }`}
            >
              {frequency}
            </button>
          ))}
        </div>
      </section>

      {/* Manual trigger */}
      <section>
        <h3 className="text-base font-serif font-semibold text-ink-800 mb-1">Manual backup</h3>
        <p className="text-sm text-ink-400 mb-3">
          Run a backup now, regardless of your schedule.
        </p>
        <button
          type="button"
          onClick={runNow}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium
                     bg-sage-600 hover:bg-sage-700 text-paper rounded-card
                     transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
          Run backup now
        </button>

        {successMsg && (
          <p className="mt-2 text-xs text-sage-700 font-mono">{successMsg}</p>
        )}
      </section>

      {error && (
        <div className="px-3 py-2 bg-red-50 border border-red-100 rounded-card text-xs text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
