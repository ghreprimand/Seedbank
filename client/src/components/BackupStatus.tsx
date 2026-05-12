/**
 * BackupStatus header pill — status-only.
 *
 * Shows last backup time; clicking navigates to Settings → Backups.
 * All configuration controls live in the Backups tab.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive } from 'lucide-react';
import { getBackupStatus, type BackupStatus as BackupState } from '@/api/client';
import { timeAgo } from '@/lib/timeago';

function lastBackupDate(status: BackupState | null): Date | null {
  const timestamp =
    status?.lastRun?.timestamp ??
    status?.latestDatabaseBackup?.timestamp ??
    status?.latestJsonExport?.timestamp;
  return timestamp ? new Date(timestamp) : null;
}

export default function BackupStatus() {
  const [status, setStatus] = useState<BackupState | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBackupStatus()
      .then((next) => { if (!cancelled) setStatus(next); })
      .catch(() => { /* silently ignore — pill just shows default */ });
    return () => { cancelled = true; };
  }, []);

  const last = lastBackupDate(status);
  const label = last ? timeAgo(last, 'backed up') : 'No backups yet';

  return (
    <Link
      to="/settings/backups"
      title={label}
      className="hidden sm:flex p-2 text-ink-400 hover:text-ink-600 transition-all duration-200 rounded-card hover:bg-ink-50"
    >
      <Archive className="w-[18px] h-[18px]" />
    </Link>
  );
}
