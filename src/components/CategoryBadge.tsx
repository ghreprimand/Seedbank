import type { Category } from '@/lib/types';
import { CATEGORY_LABELS } from '@/lib/types';

interface CategoryBadgeProps {
  category: Category;
  className?: string;
}

export default function CategoryBadge({ category, className = '' }: CategoryBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium text-ink-500 bg-ink-50 border border-ink-200 rounded-badge leading-tight ${className}`}
    >
      {CATEGORY_LABELS[category]}
    </span>
  );
}
