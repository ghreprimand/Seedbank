import { Link } from 'react-router-dom';
import type { Idea } from '@/lib/types';
import { STAGE_ICONS } from '@/lib/types';
import { timeAgo } from '@/lib/timeago';
import StageBadge from './StageBadge';
import CategoryBadge from './CategoryBadge';

interface IdeaCardProps {
  idea: Idea;
}

/** Render 1-5 excitement dots. 0 = unscored, shows nothing. */
function ExcitementDots({ score }: { score: number }) {
  if (score === 0) return null;
  return (
    <div className="flex items-center gap-0.5" title={`Excitement: ${score}/5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`inline-block w-1.5 h-1.5 rounded-full ${
            i < score ? 'bg-amber-400' : 'bg-ink-200'
          }`}
        />
      ))}
    </div>
  );
}

export default function IdeaCard({ idea }: IdeaCardProps) {
  return (
    <Link
      to={`/idea/${idea.id}`}
      className="group block bg-paper border border-ink-200 rounded-card p-4 shadow-card
                 hover:shadow-card-hover hover:border-sage-300 transition-all duration-200
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-400"
    >
      {/* Header row: stage icon + title */}
      <div className="flex items-start gap-2 mb-1.5">
        <span className="text-base leading-none mt-0.5 shrink-0" aria-hidden>
          {STAGE_ICONS[idea.stage]}
        </span>
        <h3 className="text-base font-serif font-semibold text-ink-900 leading-snug line-clamp-2 group-hover:text-sage-700 transition-colors">
          {idea.title || 'Untitled Seed'}
        </h3>
      </div>

      {/* Pitch */}
      {idea.pitch && (
        <p className="text-sm text-ink-500 leading-relaxed line-clamp-2 mb-3 pl-6">
          {idea.pitch}
        </p>
      )}

      {/* Badges row */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3 pl-6">
        <StageBadge stage={idea.stage} />
        <CategoryBadge category={idea.category} />
      </div>

      {/* Tags */}
      {idea.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3 pl-6">
          {idea.tags.slice(0, 5).map((tag) => (
            <span
              key={tag}
              className="inline-block px-2 py-0.5 text-[11px] font-medium bg-paper-warm text-ink-500 border border-ink-200 rounded-badge leading-tight"
            >
              {tag}
            </span>
          ))}
          {idea.tags.length > 5 && (
            <span className="inline-block px-2 py-0.5 text-[11px] text-ink-400 leading-tight">
              +{idea.tags.length - 5}
            </span>
          )}
        </div>
      )}

      {/* Footer: excitement + timestamp */}
      <div className="flex items-center justify-between pl-6 pt-2 border-t border-ink-100">
        <ExcitementDots score={idea.excitementScore} />
        <span className="text-[11px] text-ink-400 italic">
          {timeAgo(idea.createdAt)}
        </span>
      </div>
    </Link>
  );
}
