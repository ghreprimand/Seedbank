/**
 * Settings → Backups: full backup configuration.
 *
 * Data: reads backup status from the settings store (hydrated on app boot).
 * Mutations:
 *   - Schedule change: settingsStore.patch('backups', { config: { frequency } })
 *   - Run now: direct POST /api/backups/run; refreshes store after.
 */
import { useState } from 'react';
import { RefreshCw, Archive } from 'lucide-react';
import { HelpButton } from '@/help/HelpPopover';
import { runBackupNow, type BackupFrequency } from '@/api/client';
import { useBackupsSettings, useSettingsStore } from '@/stores/settings';
import { timeAgo } from '@/lib/timeago';

const FREQUENCIES: BackupFrequency[] = ['daily', 'weekly', 'off'];

function lastBackupDate(backups: ReturnType<typeof useBackupsSettings>): Date | null {
  const timestamp =
    backups.lastRun?.timestamp ??
    backups.latestDatabaseBackup?.timestamp ??
    backups.latestJsonExport?.timestamp;
  return timestamp ? new Date(timestamp) : null;
}

export default function BackupsTab() {
  const backups = useBackupsSettings();
  const patchSettings = useSettingsStore((s) => s.patch);
  const refreshSettings = useSettingsStore((s) => s.refresh);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const runNow = async () => {
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await runBackupNow();
      // Refresh full aggregate so lastRun / latestDatabaseBackup update.
      await refreshSettings();
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
      await patchSettings('backups', { config: { frequency } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update backup settings');
    } finally {
      setBusy(false);
    }
  };

  const last = lastBackupDate(backups);
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
          <div className="mt-2 space-y-1 text-[11px] text-ink-400 font-mono">
            <div className="truncate">
              DB: {backups.latestDatabaseBackup?.path ?? backups.paths.backupsDir}
            </div>
            <div className="truncate">
              JSON: {backups.latestJsonExport?.path ?? backups.paths.exportsDir}
            </div>
          </div>
        </div>
      </section>

      {/* Schedule */}
      <section>
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-base font-serif font-semibold text-ink-800">Schedule</h3>
          <HelpButton
            helpId="backup-schedule"
            title="Backup Schedule"
            summary="Seedbank keeps the latest 10 database backups and prunes older ones automatically. A startup backup always runs regardless of schedule. Backups go to ~/.seedbank/backups/."
            manualSection="settings-backups"
            alwaysShow
          />
        </div>
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
                backups.config.frequency === frequency
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
        <div
          className="px-3 py-2.5 bg-sage-50 border border-sage-200 rounded-card text-xs text-sage-800"
          role="alert"
        >
          {error}
        </div>
      )}
    </div>
  );
}
