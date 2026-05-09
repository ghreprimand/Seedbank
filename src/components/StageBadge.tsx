import type { Stage } from '@/lib/types';
import { STAGE_LABELS, STAGE_ICONS } from '@/lib/types';

/**
 * Per-stage colour classes. Gardening-themed palette:
 *  - Growth stages: sage greens (progressively deeper)
 *  - Pitch/prototype: amber & clay (active energy)
 *  - Shelved/cold-storage: frost blues (dormancy)
 *  - Shipped: amber/gold (celebration)
 */
const STAGE_COLORS: Record<Stage, string> = {
  'seed':         'bg-sage-50 text-sage-700 border-sage-200',
  'sprout':       'bg-sage-100 text-sage-800 border-sage-200',
  'pitch':        'bg-amber-50 text-amber-800 border-amber-200',
  'prototype':    'bg-clay-50 text-clay-700 border-clay-200',
  'plot':         'bg-sage-200 text-sage-900 border-sage-300',
  'shelved':      'bg-frost-50 text-frost-600 border-frost-200',
  'cold-storage': 'bg-frost-100 text-frost-700 border-frost-200',
  'shipped':      'bg-amber-100 text-amber-900 border-amber-200',
};

interface StageBadgeProps {
  stage: Stage;
  /** Show the stage icon (emoji) before the label */
  showIcon?: boolean;
  className?: string;
}

export default function StageBadge({ stage, showIcon = false, className = '' }: StageBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide border rounded-badge leading-tight transition-colors ${STAGE_COLORS[stage]} ${className}`}
    >
      {showIcon && (
        <span className="text-[10px] -ml-0.5" aria-hidden>{STAGE_ICONS[stage]}</span>
      )}
      {STAGE_LABELS[stage]}
    </span>
  );
}
