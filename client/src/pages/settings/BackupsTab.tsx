import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Archive, HardDrive, Cloud, CircleCheck, CircleAlert } from 'lucide-react';
import {
  runBackupNow,
  testBackupDestination,
  testBackupRestore,
  type BackupDestinationConfig,
  type BackupDestinationTestResult,
  type BackupFrequency,
} from '@/api/client';
import { HelpButton } from '@/help/HelpPopover';
import { useBackupsSettings, useSettingsStore } from '@/stores/settings';
import { timeAgo } from '@/lib/timeago';

const FREQUENCIES: BackupFrequency[] = ['daily', 'weekly', 'off'];

type DestinationDraft = BackupDestinationConfig;

function newDestination(type: 'local-path' | 'rclone-remote'): DestinationDraft {
  const id = globalThis.crypto?.randomUUID?.() ?? `${type}-${Date.now()}`;
  return type === 'local-path'
    ? {
        id,
        type,
        label: 'Local folder',
        enabled: true,
        includeDatabase: true,
        includeJsonExport: true,
        localPath: '',
      }
    : {
        id,
        type,
        label: 'Rclone remote',
        enabled: true,
        includeDatabase: true,
        includeJsonExport: true,
        remotePath: '',
      };
}

function lastBackupDate(backups: ReturnType<typeof useBackupsSettings>): Date | null {
  const timestamp =
    backups.lastRun?.timestamp ??
    backups.latestDatabaseBackup?.timestamp ??
    backups.latestJsonExport?.timestamp;
  return timestamp ? new Date(timestamp) : null;
}

function fmtDate(ts?: string | null): string {
  if (!ts) return '—';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return ts;
  return date.toLocaleString();
}

function statusIcon(ok: boolean) {
  return ok
    ? <CircleCheck className="w-4 h-4 text-sage-700" />
    : <CircleAlert className="w-4 h-4 text-amber-700" />;
}

export default function BackupsTab() {
  const backups = useBackupsSettings();
  const patchSettings = useSettingsStore((s) => s.patch);
  const refreshSettings = useSettingsStore((s) => s.refresh);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [retentionDraft, setRetentionDraft] = useState(String(backups.config.retentionCount ?? 10));
  const [destinationsDraft, setDestinationsDraft] = useState<DestinationDraft[]>(backups.config.destinations ?? []);
  const [destinationTests, setDestinationTests] = useState<Record<string, BackupDestinationTestResult>>({});
  const [restoreTest, setRestoreTest] = useState<Awaited<ReturnType<typeof testBackupRestore>> | null>(null);

  useEffect(() => {
    setRetentionDraft(String(backups.config.retentionCount ?? 10));
    setDestinationsDraft(backups.config.destinations ?? []);
  }, [backups.config.retentionCount, backups.config.destinations]);

  const last = lastBackupDate(backups);
  const lastLabel = last ? timeAgo(last, 'backed up') : 'No backups yet';

  const destinationsDirty = useMemo(() => (
    JSON.stringify(destinationsDraft) !== JSON.stringify(backups.config.destinations ?? [])
  ), [destinationsDraft, backups.config.destinations]);

  const runNow = async () => {
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const result = await runBackupNow();
      await refreshSettings();
      const destinationFailures = result.run?.destinations?.filter((row) => row.attempted && !row.ok).length ?? 0;
      setSuccessMsg(destinationFailures > 0
        ? `Backup finished with ${destinationFailures} destination warning(s).`
        : 'Backup completed.');
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

  const setExportJson = async (enabled: boolean) => {
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await patchSettings('backups', { config: { exportJson: enabled } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update JSON export setting');
    } finally {
      setBusy(false);
    }
  };

  const saveRetention = async () => {
    const parsed = Number(retentionDraft);
    if (!Number.isFinite(parsed)) {
      setError('Retention must be a number.');
      return;
    }
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await patchSettings('backups', { config: { retentionCount: parsed } });
      setSuccessMsg('Retention updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update retention');
    } finally {
      setBusy(false);
    }
  };

  const saveDestinations = async () => {
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await patchSettings('backups', { config: { destinations: destinationsDraft } });
      setSuccessMsg('Destinations saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save destinations');
    } finally {
      setBusy(false);
    }
  };

  const testDestination = async (destination: DestinationDraft) => {
    setError(null);
    try {
      const result = await testBackupDestination({ destination });
      setDestinationTests((prev) => ({ ...prev, [destination.id]: result }));
    } catch (err) {
      setDestinationTests((prev) => ({
        ...prev,
        [destination.id]: {
          destinationId: destination.id,
          label: destination.label,
          type: destination.type,
          ok: false,
          message: 'Destination test failed.',
          detail: err instanceof Error ? err.message : 'Unknown error',
        },
      }));
    }
  };

  const runRestoreValidation = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await testBackupRestore();
      setRestoreTest(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore validation failed');
    } finally {
      setBusy(false);
    }
  };

  const updateDestination = (
    id: string,
    updater: (current: DestinationDraft) => DestinationDraft,
  ) => {
    setDestinationsDraft((current) => current.map((item) => (item.id === id ? updater(item) : item)));
  };

  const removeDestination = (id: string) => {
    setDestinationsDraft((current) => current.filter((item) => item.id !== id));
    setDestinationTests((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  return (
    <div className="space-y-8 max-w-3xl">
      <section className="flex items-start gap-4 p-4 bg-paper-warm border border-ink-100 rounded-card">
        <div className="mt-0.5 p-2 rounded-full bg-sage-50 border border-sage-100">
          <Archive className="w-4 h-4 text-sage-600" />
        </div>
        <div className="space-y-2 w-full">
          <div>
            <div className="text-sm font-semibold text-ink-800">Last backup</div>
            <div className="text-xs text-ink-400 mt-0.5 font-mono">{lastLabel}</div>
          </div>
          <div className="grid sm:grid-cols-2 gap-2 text-[11px] text-ink-500 font-mono">
            <div className="truncate">Latest DB: {backups.latestDatabaseBackup?.path ?? backups.paths.backupsDir}</div>
            <div className="truncate">Latest JSON: {backups.latestJsonExport?.path ?? backups.paths.exportsDir}</div>
          </div>
          <div className="text-[11px] font-mono text-ink-500">
            Rclone: {backups.rclone.available ? `available${backups.rclone.version ? ` (${backups.rclone.version})` : ''}` : 'not detected'}
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-base font-serif font-semibold text-ink-800">Schedule</h3>
          <HelpButton
            helpId="backup-schedule"
            title="Backup Schedule"
            summary="Configure schedule, retention, and JSON export. Startup still creates a local DB snapshot if a database already exists."
            manualSection="settings-backups"
            alwaysShow
          />
        </div>
        <p className="text-sm text-ink-400 mb-3">How often Seedbank automatically backs up your data.</p>
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

      <section className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-card border border-ink-100 p-4 space-y-2">
          <div className="text-sm font-semibold text-ink-800">JSON archive export</div>
          <p className="text-xs text-ink-400">When enabled, each backup run also writes a full JSON archive snapshot.</p>
          <label className="inline-flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={backups.config.exportJson}
              onChange={(event) => { void setExportJson(event.target.checked); }}
              disabled={busy}
            />
            Enable JSON export
          </label>
        </div>

        <div className="rounded-card border border-ink-100 p-4 space-y-2">
          <div className="text-sm font-semibold text-ink-800">Retention</div>
          <p className="text-xs text-ink-400">How many database backup files to keep in the local backup directory.</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={500}
              value={retentionDraft}
              onChange={(event) => setRetentionDraft(event.target.value)}
              className="w-24 px-2 py-1.5 text-sm border border-ink-200 rounded-card bg-paper"
            />
            <button
              type="button"
              onClick={() => void saveRetention()}
              disabled={busy}
              className="px-3 py-1.5 text-xs font-medium rounded-card border border-ink-200 text-ink-700 hover:bg-ink-50 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-serif font-semibold text-ink-800">Offsite destinations</h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDestinationsDraft((current) => [...current, newDestination('local-path')])}
              className="px-3 py-1.5 text-xs rounded-card border border-ink-200 text-ink-700 hover:bg-ink-50"
            >
              + Local path
            </button>
            <button
              type="button"
              onClick={() => setDestinationsDraft((current) => [...current, newDestination('rclone-remote')])}
              className="px-3 py-1.5 text-xs rounded-card border border-ink-200 text-ink-700 hover:bg-ink-50"
            >
              + Rclone remote
            </button>
          </div>
        </div>

        {destinationsDraft.length === 0 && (
          <div className="text-xs text-ink-500 border border-dashed border-ink-200 rounded-card p-3">
            No offsite destinations configured. Local backups still run on schedule.
          </div>
        )}

        {destinationsDraft.map((destination) => {
          const testResult = destinationTests[destination.id];
          return (
            <div key={destination.id} className="rounded-card border border-ink-100 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-ink-700">
                  {destination.type === 'local-path'
                    ? <HardDrive className="w-4 h-4" />
                    : <Cloud className="w-4 h-4" />}
                  <span className="font-medium">{destination.type === 'local-path' ? 'Local path' : 'Rclone remote'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeDestination(destination.id)}
                  className="text-xs text-ink-500 hover:text-ink-700"
                >
                  Remove
                </button>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <label className="text-xs text-ink-500">
                  Label
                  <input
                    type="text"
                    value={destination.label}
                    onChange={(event) => updateDestination(destination.id, (current) => ({ ...current, label: event.target.value }))}
                    className="mt-1 w-full px-2 py-1.5 text-sm border border-ink-200 rounded-card bg-paper"
                  />
                </label>

                {destination.type === 'local-path' ? (
                  <label className="text-xs text-ink-500">
                    Folder path
                    <input
                      type="text"
                      value={destination.localPath}
                      onChange={(event) => updateDestination(destination.id, (current) => (
                        current.type === 'local-path'
                          ? { ...current, localPath: event.target.value }
                          : current
                      ))}
                      className="mt-1 w-full px-2 py-1.5 text-sm border border-ink-200 rounded-card bg-paper"
                    />
                  </label>
                ) : (
                  <label className="text-xs text-ink-500">
                    Remote path (`remote:path`)
                    <input
                      type="text"
                      value={destination.remotePath}
                      onChange={(event) => updateDestination(destination.id, (current) => (
                        current.type === 'rclone-remote'
                          ? { ...current, remotePath: event.target.value }
                          : current
                      ))}
                      className="mt-1 w-full px-2 py-1.5 text-sm border border-ink-200 rounded-card bg-paper"
                    />
                  </label>
                )}
              </div>

              <div className="flex flex-wrap gap-3 text-xs text-ink-600">
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={destination.enabled}
                    onChange={(event) => updateDestination(destination.id, (current) => ({ ...current, enabled: event.target.checked }))}
                  />
                  Enabled
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={destination.includeDatabase}
                    onChange={(event) => updateDestination(destination.id, (current) => ({ ...current, includeDatabase: event.target.checked }))}
                  />
                  Copy DB files
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={destination.includeJsonExport}
                    onChange={(event) => updateDestination(destination.id, (current) => ({ ...current, includeJsonExport: event.target.checked }))}
                  />
                  Copy JSON exports
                </label>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { void testDestination(destination); }}
                  className="px-3 py-1.5 text-xs font-medium rounded-card border border-ink-200 text-ink-700 hover:bg-ink-50"
                >
                  Test destination
                </button>
                {testResult && (
                  <div className="flex items-center gap-1.5 text-xs text-ink-600">
                    {statusIcon(testResult.ok)}
                    <span>{testResult.message}</span>
                    {testResult.detail && <span className="text-ink-400">({testResult.detail})</span>}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => { void saveDestinations(); }}
          disabled={busy || !destinationsDirty}
          className="px-4 py-2 text-sm font-medium rounded-card border border-ink-200 text-ink-700 hover:bg-ink-50 disabled:opacity-50"
        >
          Save destinations
        </button>
      </section>

      <section>
        <h3 className="text-base font-serif font-semibold text-ink-800 mb-1">Manual backup</h3>
        <p className="text-sm text-ink-400 mb-3">Run a backup now, regardless of your schedule.</p>
        <button
          type="button"
          onClick={() => { void runNow(); }}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium
                     bg-sage-600 hover:bg-sage-700 text-paper rounded-card
                     transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
          Run backup now
        </button>

        {backups.lastRun && (
          <div className="mt-3 p-3 border border-ink-100 rounded-card text-xs text-ink-600 space-y-2">
            <div>Last run: {fmtDate(backups.lastRun.timestamp)} ({backups.lastRun.reason})</div>
            {(backups.lastRun.artifacts ?? []).map((artifact) => (
              <div key={artifact.type} className="flex items-center gap-1.5">
                {statusIcon(artifact.ok)}
                <span className="font-mono">{artifact.type}</span>
                <span>{artifact.ok ? 'ok' : artifact.error ?? 'failed'}</span>
              </div>
            ))}
            {(backups.lastRun.destinations ?? []).map((destination) => (
              <div key={destination.destinationId} className="flex items-center gap-1.5">
                {statusIcon(destination.ok)}
                <span>{destination.label}</span>
                <span>{destination.attempted ? (destination.ok ? 'synced' : destination.error ?? 'failed') : 'skipped'}</span>
              </div>
            ))}
          </div>
        )}

        {successMsg && (
          <p className="mt-2 text-xs text-sage-700 font-mono">{successMsg}</p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-base font-serif font-semibold text-ink-800">Test restore (safe validation)</h3>
        <p className="text-sm text-ink-400">Validates your latest backup files without replacing live data.</p>
        <button
          type="button"
          onClick={() => { void runRestoreValidation(); }}
          disabled={busy}
          className="px-4 py-2 text-sm font-medium rounded-card border border-ink-200 text-ink-700 hover:bg-ink-50 disabled:opacity-50"
        >
          Run restore validation
        </button>

        {restoreTest && (
          <div className="p-3 border border-ink-100 rounded-card text-xs text-ink-600 space-y-2">
            <div>Validated at: {fmtDate(restoreTest.testedAt)}</div>
            <div className="flex items-center gap-1.5">
              {statusIcon(restoreTest.database.ok)}
              <span>Database: {restoreTest.database.ok ? 'ok' : restoreTest.database.error ?? 'failed'}</span>
              {restoreTest.database.path && <span className="font-mono text-ink-400">({restoreTest.database.path})</span>}
            </div>
            <div className="flex items-center gap-1.5">
              {statusIcon(restoreTest.jsonExport.ok)}
              <span>JSON export: {restoreTest.jsonExport.ok ? 'ok' : restoreTest.jsonExport.error ?? 'failed'}</span>
              {restoreTest.jsonExport.path && <span className="font-mono text-ink-400">({restoreTest.jsonExport.path})</span>}
            </div>
          </div>
        )}
      </section>

      {error && (
        <div
          className="px-3 py-2.5 bg-red-50 border border-red-200 rounded-card text-xs text-red-700"
          role="alert"
        >
          {error}
        </div>
      )}
    </div>
  );
}
