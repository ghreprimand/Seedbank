import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { StageTransition } from '@/lib/types';
import { STAGE_ICONS, STAGE_LABELS } from '@/lib/types';
import { getStageTransitions } from '@/api/client';

interface StageTimelineProps {
  ideaId: string;
}

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d ago`;
  if (diff < MONTH) return `${Math.floor(diff / WEEK)}w ago`;
  if (diff < YEAR) return `${Math.floor(diff / MONTH)}mo ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function StageTimeline({ ideaId }: StageTimelineProps) {
  const [open, setOpen] = useState(false);
  const [transitions, setTransitions] = useState<StageTransition[]>([]);

  useEffect(() => {
    let cancelled = false;
    getStageTransitions(ideaId).then((items) => {
      if (cancelled) return;
      setTransitions(items);
    }).catch(() => {
      if (cancelled) return;
      setTransitions([]);
    });
    return () => {
      cancelled = true;
    };
  }, [ideaId]);

  const sorted = useMemo(
    () => [...transitions].sort((a, b) => b.transitionedAt.getTime() - a.transitionedAt.getTime()),
    [transitions],
  );

  return (
    <div className="border border-ink-100 rounded-card bg-paper-warm/70" data-help="stage-timeline">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-[11px] font-medium text-ink-500 uppercase tracking-wider font-mono">
          Stage Timeline {sorted.length > 0 ? `(${sorted.length})` : ''}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-ink-300 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-1.5 animate-fade-in">
          {sorted.length === 0 ? (
            <p className="text-xs text-ink-400">No stage transitions recorded yet.</p>
          ) : (
            sorted.map((transition) => (
              <div
                key={transition.id}
                className="text-xs text-ink-600 flex items-center justify-between gap-3"
              >
                <span className="truncate">
                  {STAGE_ICONS[transition.fromStage]} {STAGE_LABELS[transition.fromStage]} {'→'} {STAGE_ICONS[transition.toStage]} {STAGE_LABELS[transition.toStage]}
                </span>
                <span className="text-[11px] font-mono text-ink-400 whitespace-nowrap">
                  {relativeTime(transition.transitionedAt)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
