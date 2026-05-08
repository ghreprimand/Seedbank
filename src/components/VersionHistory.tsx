import { useState, useEffect } from 'react';
import { History, RotateCcw, Eye, X } from 'lucide-react';
import { getVersions, restoreVersion } from '@/db/ideas';
import type { IdeaVersion } from '@/lib/types';
import { STAGE_LABELS, CATEGORY_LABELS } from '@/lib/types';
import { timeAgo } from '@/lib/timeago';

interface VersionHistoryProps {
  ideaId: string;
  /** Called after a version restore so the parent can reload */
  onRestored: () => void;
}

export default function VersionHistory({ ideaId, onRestored }: VersionHistoryProps) {
  const [versions, setVersions] = useState<IdeaVersion[]>([]);
  const [viewingVersion, setViewingVersion] = useState<IdeaVersion | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    getVersions(ideaId).then(setVersions);
  }, [ideaId]);

  const handleRestore = async (version: IdeaVersion) => {
    await restoreVersion(ideaId, version.id);
    setConfirming(null);
    setViewingVersion(null);
    onRestored();
    // Refresh version list
    getVersions(ideaId).then(setVersions);
  };

  if (versions.length === 0) {
    return (
      <div className="text-xs text-ink-400 italic flex items-center gap-1.5 py-2">
        <History className="w-3.5 h-3.5" />
        No version history yet — edits will be tracked automatically.
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-xs font-medium text-ink-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <History className="w-3.5 h-3.5" />
        Version History ({versions.length})
      </h3>

      <ul className="space-y-1 max-h-64 overflow-y-auto">
        {versions.map((v) => (
          <li
            key={v.id}
            className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs rounded-badge hover:bg-paper-warm transition-colors group"
          >
            <div className="min-w-0">
              <span className="font-medium text-ink-700 block truncate">
                {v.versionLabel}
              </span>
              <span className="text-ink-400 text-[11px]">
                {timeAgo(v.timestamp, 'saved')}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => setViewingVersion(v)}
                title="View snapshot"
                className="p-1 text-ink-400 hover:text-sage-600 transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
              {confirming === v.id ? (
                <button
                  type="button"
                  onClick={() => handleRestore(v)}
                  className="px-2 py-0.5 text-[11px] font-medium bg-clay-500 text-paper rounded-badge hover:bg-clay-600 transition-colors"
                >
                  Confirm
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(v.id)}
                  title="Restore this version"
                  className="p-1 text-ink-400 hover:text-clay-600 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Read-only snapshot viewer modal */}
      {viewingVersion && (
        <SnapshotViewer
          version={viewingVersion}
          onClose={() => setViewingVersion(null)}
          onRestore={() => handleRestore(viewingVersion)}
        />
      )}
    </div>
  );
}

// ── Read-only snapshot viewer ───────────────────────────────────────

function SnapshotViewer({
  version,
  onClose,
  onRestore,
}: {
  version: IdeaVersion;
  onClose: () => void;
  onRestore: () => void;
}) {
  const s = version.snapshot;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/40 backdrop-blur-sm">
      <div className="bg-paper w-full max-w-lg max-h-[80vh] rounded-card shadow-modal border border-ink-200 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-ink-200">
          <div>
            <h3 className="text-sm font-serif font-semibold text-ink-900">
              {version.versionLabel}
            </h3>
            <span className="text-[11px] text-ink-400">
              {timeAgo(version.timestamp, 'saved')}
            </span>
          </div>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-5 py-4 space-y-3 text-sm">
          <SnapshotField label="Title" value={s.title} />
          <SnapshotField label="Pitch" value={s.pitch} />
          <SnapshotField label="Stage" value={STAGE_LABELS[s.stage]} />
          <SnapshotField label="Category" value={CATEGORY_LABELS[s.category]} />
          <SnapshotField label="Full Notes" value={s.fullNotes} multiline />
          <SnapshotField label="Hook" value={s.hook} multiline />
          <SnapshotField label="Why It Might Work" value={s.whyItMightWork} multiline />
          <SnapshotField label="Risks" value={s.risks} multiline />
          <SnapshotField label="Tech Stack" value={s.techStack} multiline />
          {s.tags.length > 0 && (
            <SnapshotField label="Tags" value={s.tags.join(', ')} />
          )}
          {s.moodLabels.length > 0 && (
            <SnapshotField label="Mood Labels" value={s.moodLabels.join(', ')} />
          )}
          <SnapshotField label="Excitement" value={`${s.excitementScore}/5`} />
          <SnapshotField label="Jam Score" value={`${s.jamScore}/5`} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-ink-200">
          <button onClick={onClose} className="text-xs text-ink-400 hover:text-ink-600">
            Close
          </button>
          <button
            onClick={onRestore}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-clay-500 text-paper rounded-badge hover:bg-clay-600 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Restore this version
          </button>
        </div>
      </div>
      <div className="fixed inset-0 -z-10" onClick={onClose} />
    </div>
  );
}

function SnapshotField({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  if (!value || value === '0/5') return null;
  return (
    <div>
      <span className="text-[11px] font-medium text-ink-400 uppercase tracking-wider">
        {label}
      </span>
      {multiline ? (
        <p className="text-ink-700 whitespace-pre-wrap mt-0.5">{value}</p>
      ) : (
        <p className="text-ink-700 mt-0.5">{value}</p>
      )}
    </div>
  );
}
