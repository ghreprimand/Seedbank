import { useState } from 'react';
import { ChevronDown, X, ArrowUpDown } from 'lucide-react';
import { CATEGORIES, STAGES, CATEGORY_LABELS, STAGE_LABELS, STAGE_ICONS } from '@/lib/types';
import type { SortField } from '@/lib/types';
import { useFilterStore } from '@/stores/filters';

const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: 'updatedAt', label: 'Recently updated' },
  { field: 'createdAt', label: 'Newest first' },
  { field: 'excitementScore', label: 'Most excited' },
  { field: 'title', label: 'Alphabetical' },
];

/** Collects all unique tags from the provided ideas. */
export function collectTags(ideas: { tags: string[] }[]): string[] {
  const tagSet = new Set<string>();
  for (const idea of ideas) {
    for (const t of idea.tags) tagSet.add(t);
  }
  return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
}

interface FilterBarProps {
  availableTags: string[];
  totalCount: number;
  filteredCount: number;
}

export default function FilterBar({ availableTags, totalCount, filteredCount }: FilterBarProps) {
  const {
    categories,
    stages,
    tags,
    sortBy,
    sortDirection,
    toggleCategory,
    toggleStage,
    toggleTag,
    setSort,
    clearAll,
  } = useFilterStore();

  const [openPanel, setOpenPanel] = useState<'category' | 'stage' | 'tag' | 'sort' | null>(null);

  const hasFilters = categories.length > 0 || stages.length > 0 || tags.length > 0;

  const toggle = (panel: typeof openPanel) =>
    setOpenPanel((prev) => (prev === panel ? null : panel));

  return (
    <div className="space-y-2">
      {/* Top row: filter buttons + sort */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Category dropdown */}
        <div className="relative">
          <button
            onClick={() => toggle('category')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-pill border transition-all duration-200 ${
              categories.length > 0
                ? 'bg-sage-50 border-sage-200 text-sage-800'
                : 'bg-paper border-ink-100 text-ink-500 hover:border-ink-200'
            }`}
          >
            Category
            {categories.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 text-[10px] bg-sage-200 rounded-full font-mono">
                {categories.length}
              </span>
            )}
            <ChevronDown className="w-3 h-3" />
          </button>
          {openPanel === 'category' && (
            <DropdownPanel onClose={() => setOpenPanel(null)}>
              {CATEGORIES.map((c) => (
                <FilterChip
                  key={c}
                  label={CATEGORY_LABELS[c]}
                  active={categories.includes(c)}
                  onClick={() => toggleCategory(c)}
                />
              ))}
            </DropdownPanel>
          )}
        </div>

        {/* Stage dropdown */}
        <div className="relative">
          <button
            onClick={() => toggle('stage')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-pill border transition-all duration-200 ${
              stages.length > 0
                ? 'bg-sage-50 border-sage-200 text-sage-800'
                : 'bg-paper border-ink-100 text-ink-500 hover:border-ink-200'
            }`}
          >
            Stage
            {stages.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 text-[10px] bg-sage-200 rounded-full font-mono">
                {stages.length}
              </span>
            )}
            <ChevronDown className="w-3 h-3" />
          </button>
          {openPanel === 'stage' && (
            <DropdownPanel onClose={() => setOpenPanel(null)}>
              {STAGES.map((s) => (
                <FilterChip
                  key={s}
                  label={`${STAGE_ICONS[s]} ${STAGE_LABELS[s]}`}
                  active={stages.includes(s)}
                  onClick={() => toggleStage(s)}
                />
              ))}
            </DropdownPanel>
          )}
        </div>

        {/* Tag dropdown */}
        {availableTags.length > 0 && (
          <div className="relative">
            <button
              onClick={() => toggle('tag')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-pill border transition-all duration-200 ${
                tags.length > 0
                  ? 'bg-sage-50 border-sage-200 text-sage-800'
                  : 'bg-paper border-ink-100 text-ink-500 hover:border-ink-200'
              }`}
            >
              Tags
              {tags.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 text-[10px] bg-sage-200 rounded-full font-mono">
                  {tags.length}
                </span>
              )}
              <ChevronDown className="w-3 h-3" />
            </button>
            {openPanel === 'tag' && (
              <DropdownPanel onClose={() => setOpenPanel(null)}>
                {availableTags.map((t) => (
                  <FilterChip
                    key={t}
                    label={t}
                    active={tags.includes(t)}
                    onClick={() => toggleTag(t)}
                  />
                ))}
              </DropdownPanel>
            )}
          </div>
        )}

        {/* Sort dropdown */}
        <div className="relative ml-auto">
          <button
            onClick={() => toggle('sort')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-pill
                       border border-ink-100 text-ink-400 hover:border-ink-200 bg-paper transition-all duration-200"
          >
            <ArrowUpDown className="w-3 h-3" />
            {SORT_OPTIONS.find((o) => o.field === sortBy)?.label}
          </button>
          {openPanel === 'sort' && (
            <DropdownPanel onClose={() => setOpenPanel(null)} align="right">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.field}
                  onClick={() => {
                    setSort(opt.field);
                    setOpenPanel(null);
                  }}
                  className={`block w-full text-left px-3 py-2 text-xs rounded-badge transition-colors ${
                    sortBy === opt.field
                      ? 'bg-sage-50 text-sage-800 font-semibold'
                      : 'text-ink-600 hover:bg-ink-50'
                  }`}
                >
                  {opt.label}
                  {sortBy === opt.field && (
                    <span className="ml-1 text-[10px] text-ink-300 font-mono">
                      ({sortDirection === 'desc' ? '↓' : '↑'})
                    </span>
                  )}
                </button>
              ))}
            </DropdownPanel>
          )}
        </div>
      </div>

      {/* Active filter summary + clear */}
      {hasFilters && (
        <div className="flex flex-wrap items-center gap-1.5 animate-fade-in">
          <span className="text-[11px] text-ink-300 font-mono">
            Showing {filteredCount} of {totalCount} seed{totalCount !== 1 ? 's' : ''}
          </span>
          <button
            onClick={clearAll}
            className="ml-2 flex items-center gap-1 px-2 py-0.5 text-[11px] text-ink-400
                       hover:text-ink-600 hover:bg-ink-50 rounded-badge transition-colors"
          >
            <X className="w-3 h-3" />
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function DropdownPanel({
  children,
  onClose,
  align = 'left',
}: {
  children: React.ReactNode;
  onClose: () => void;
  align?: 'left' | 'right';
}) {
  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div
        className={`absolute top-full mt-1 z-30 bg-paper border border-ink-100 rounded-card
                    shadow-modal p-2 min-w-[180px] flex flex-wrap gap-1 animate-scale-in ${
          align === 'right' ? 'right-0' : 'left-0'
        }`}
      >
        {children}
      </div>
    </>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-xs rounded-pill border transition-all duration-200 whitespace-nowrap ${
        active
          ? 'bg-sage-600 text-paper border-sage-600 shadow-sm'
          : 'bg-paper text-ink-500 border-ink-100 hover:border-sage-300 hover:bg-sage-50'
      }`}
    >
      {label}
    </button>
  );
}
