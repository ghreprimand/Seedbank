/** Neutral ink-toned badge showing an idea's category label. */
import type { Category } from '@/lib/types';
import { CATEGORY_LABELS } from '@/lib/types';
import { useCategoriesSettings } from '@/stores/settings';

interface CategoryBadgeProps {
  category: Category;
  className?: string;
}

export default function CategoryBadge({ category, className = '' }: CategoryBadgeProps) {
  const categorySettings = useCategoriesSettings();
  const def = categorySettings.items.find((c) => c.id === category);

  // Resolve label: configured definition → CATEGORY_LABELS fallback → raw id
  const label = def?.label ?? CATEGORY_LABELS[category] ?? category;
  const icon = def?.icon;
  const color = def?.color;

  const style: React.CSSProperties = color
    ? { borderColor: color, color }
    : {};

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium font-mono
                  text-ink-500 bg-paper-warm border border-ink-100 rounded-badge leading-tight
                  transition-colors ${className}`}
      style={style}
    >
      {icon && <span className="text-xs leading-none">{icon}</span>}
      {label}
    </span>
  );
}
