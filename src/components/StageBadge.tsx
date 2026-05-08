import type { Stage } from '@/lib/types';
import { STAGE_LABELS } from '@/lib/types';

/** Per-stage colour classes. Gardening-themed palette. */
const STAGE_COLORS: Record<Stage, string> = {
  'seed':         'bg-sage-100 text-sage-700 border-sage-200',
  'sprout':       'bg-sage-200 text-sage-800 border-sage-300',
  'pitch':        'bg-amber-100 text-amber-800 border-amber-200',
  'prototype':    'bg-clay-100 text-clay-700 border-clay-200',
  'plot':         'bg-sage-300 text-sage-900 border-sage-400',
  'shelved':      'bg-frost-100 text-frost-600 border-frost-200',
  'cold-storage': 'bg-frost-200 text-frost-700 border-frost-300',
  'shipped':      'bg-amber-200 text-amber-900 border-amber-300',
};

interface StageBadgeProps {
  stage: Stage;
  className?: string;
}

export default function StageBadge({ stage, className = '' }: StageBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide border rounded-badge leading-tight ${STAGE_COLORS[stage]} ${className}`}
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}
