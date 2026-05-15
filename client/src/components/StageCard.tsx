import { Link } from 'react-router-dom';
import type { DragEvent } from 'react';
import type { Idea, Stage } from '@/lib/types';
import { STAGE_LABELS } from '@/lib/types';
import CategoryBadge from './CategoryBadge';

interface StageCardProps {
  idea: Idea;
  touchMode: boolean;
  moveMenuOpen: boolean;
  onToggleMoveMenu: () => void;
  onMoveStage: (stage: Stage) => void;
  onDragStart: (ideaId: string, stage: Stage, event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  disabled?: boolean;
}

function ExcitementDots({ score }: { score: number }) {
  if (score === 0) return null;
  return (
    <div className="flex items-center gap-1" title={`Excitement: ${score}/5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`inline-block w-1.5 h-1.5 rounded-full ${i < score ? 'bg-amber-400' : 'bg-ink-100'}`}
        />
      ))}
    </div>
  );
}

export default function StageCard({
  idea,
  touchMode,
  moveMenuOpen,
  onToggleMoveMenu,
  onMoveStage,
  onDragStart,
  onDragEnd,
  disabled = false,
}: StageCardProps) {
  return (
    <div
      draggable={!touchMode && !disabled}
      onDragStart={(event) => onDragStart(idea.id, idea.stage, event)}
      onDragEnd={onDragEnd}
      className={`w-full md:w-[260px] rounded-card border border-ink-100 bg-paper p-3 shadow-card transition-all ${
        touchMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
      } ${disabled ? 'opacity-60 pointer-events-none' : 'hover:border-sage-300'}`}
      onClick={touchMode ? onToggleMoveMenu : undefined}
      role={touchMode ? 'button' : undefined}
      tabIndex={touchMode ? 0 : undefined}
      onKeyDown={touchMode ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggleMoveMenu();
        }
      } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/idea/${idea.id}`}
          className="text-sm font-semibold text-ink-900 leading-snug hover:text-sage-700 transition-colors line-clamp-2"
          onClick={(event) => event.stopPropagation()}
        >
          {idea.title || 'Untitled Seed'}
        </Link>
        <ExcitementDots score={idea.excitementScore} />
      </div>

      {idea.pitch && (
        <p className="mt-1.5 text-xs text-ink-400 leading-relaxed line-clamp-2">{idea.pitch}</p>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <CategoryBadge category={idea.category} className="max-w-[170px] truncate" />
        {touchMode && (
          <span className="text-[10px] font-mono text-ink-300">tap to move</span>
        )}
      </div>

      {touchMode && moveMenuOpen && (
        <div className="mt-3 border-t border-ink-100 pt-2">
          <p className="text-[11px] font-mono text-ink-400 mb-2">Move to stage</p>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(STAGE_LABELS) as Stage[])
              .filter((stage) => stage !== idea.stage)
              .map((stage) => (
                <button
                  key={stage}
                  type="button"
                  className="text-left px-2 py-1.5 rounded-badge border border-ink-100 text-[11px] text-ink-600 hover:border-sage-300 hover:bg-sage-50 transition-colors"
                  onClick={(event) => {
                    event.stopPropagation();
                    onMoveStage(stage);
                  }}
                >
                  {STAGE_LABELS[stage]}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
