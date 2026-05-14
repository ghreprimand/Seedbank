import { useEffect, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import type { Idea } from '@/lib/types';
import { getDeletedIdeas, purgeDeletedIdea, restoreDeletedIdea } from '@/api/client';
import StageBadge from '@/components/StageBadge';
import CategoryBadge from '@/components/CategoryBadge';
import { HelpButton } from '@/help/HelpPopover';

function daysUntilPurge(idea: Idea, retentionDays: number): number {
  if (!idea.deletedAt) return retentionDays;
  const ageMs = Date.now() - idea.deletedAt.getTime();
  return Math.max(0, retentionDays - Math.floor(ageMs / (24 * 60 * 60 * 1000)));
}

export default function Compost() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [retentionDays, setRetentionDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const loadCompost = async () => {
    setLoading(true);
    try {
      const response = await getDeletedIdeas();
      setIdeas(response.items);
      setRetentionDays(response.retentionDays);
    } catch (err) {
      console.error('Failed to load compost:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    getDeletedIdeas()
      .then((response) => {
        if (!cancelled) {
          setIdeas(response.items);
          setRetentionDays(response.retentionDays);
        }
      })
      .catch((err) => {
        if (!cancelled) console.error('Failed to load compost:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const restore = async (id: string) => {
    setWorkingId(id);
    try {
      await restoreDeletedIdea(id);
      await loadCompost();
    } finally {
      setWorkingId(null);
    }
  };

  const purge = async (id: string) => {
    setWorkingId(id);
    try {
      await purgeDeletedIdea(id);
      await loadCompost();
    } finally {
      setWorkingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 animate-fade-in">
        <div className="flex flex-col items-center gap-3">
          <Trash2 className="w-6 h-6 text-ink-300 animate-pulse" />
          <span className="text-ink-400 text-sm font-mono italic">Loading compost...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" data-help="compost-page">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-serif font-semibold text-ink-900 tracking-tight">
            Compost
          </h1>
            <HelpButton
              helpId="compost-header"
              title="Compost Bin"
              summary="Deleted ideas stay here for a recovery window before being purged permanently. Restore any idea or delete it immediately."
              details="Expired entries are purged when Compost is loaded."
              manualSection="compost"
            />
        </div>
        <p className="text-ink-400 text-sm mt-1">
          Deleted ideas stay recoverable for {retentionDays} days.
        </p>
      </div>

      {ideas.length === 0 ? (
        <div className="py-16 text-center bg-paper-warm border border-ink-100 rounded-card">
          <Trash2 className="w-8 h-8 text-ink-300 mx-auto mb-3" />
          <h2 className="text-lg font-serif font-semibold text-ink-800 mb-1">
            Compost is empty
          </h2>
          <p className="text-sm text-ink-400">Deleted ideas will appear here before they are purged.</p>
        </div>
      ) : (
        <div className="space-y-3" data-help="compost-list">
          {ideas.map((idea) => (
            <article
              key={idea.id}
              className="bg-paper border border-ink-100 rounded-card p-4 shadow-card flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-serif font-semibold text-ink-900">
                  {idea.title || 'Untitled Seed'}
                </h2>
                {idea.pitch && (
                  <p className="text-sm text-ink-400 line-clamp-2 mt-1">{idea.pitch}</p>
                )}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <StageBadge stage={idea.stage} />
                  <CategoryBadge category={idea.category} />
                  <span className="px-2 py-0.5 text-[11px] font-mono text-amber-700 bg-amber-50 border border-amber-100 rounded-badge">
                    {daysUntilPurge(idea, retentionDays)} days left
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => restore(idea.id)}
                  disabled={workingId === idea.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-sage-700 bg-sage-50 border border-sage-100 rounded-badge hover:bg-sage-100 transition-colors disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restore
                </button>
                <button
                  type="button"
                  onClick={() => purge(idea.id)}
                  disabled={workingId === idea.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-100 rounded-badge hover:bg-red-100 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Purge
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
