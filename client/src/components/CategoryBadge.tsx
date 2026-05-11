/** Neutral ink-toned badge showing an idea's category label. */
import type { Category } from '@/lib/types';
import { CATEGORY_LABELS } from '@/lib/types';

interface CategoryBadgeProps {
  category: Category;
  className?: string;
}

export default function CategoryBadge({ category, className = '' }: CategoryBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium font-mono
                  text-ink-400 bg-paper-warm border border-ink-100 rounded-badge leading-tight
                  transition-colors ${className}`}
    >
      {CATEGORY_LABELS[category]}
    </span>
  );
}
