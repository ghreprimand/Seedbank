import { Sprout } from 'lucide-react';

interface EmptyStateProps {
  /** True when there are ideas in the DB but filters hide them all */
  isFiltered?: boolean;
  onClearFilters?: () => void;
  onPlantSeed?: () => void;
  onSeedExamples?: () => void;
}

export default function EmptyState({ isFiltered, onClearFilters, onPlantSeed, onSeedExamples }: EmptyStateProps) {
  if (isFiltered) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 rounded-full bg-frost-100 flex items-center justify-center mb-4">
          <span className="text-2xl">🔍</span>
        </div>
        <h2 className="text-lg font-serif font-semibold text-ink-700 mb-1">
          No seeds match those filters
        </h2>
        <p className="text-sm text-ink-400 max-w-sm mb-4">
          Try broadening your search or clearing some filters.
        </p>
        {onClearFilters && (
          <button
            onClick={onClearFilters}
            className="px-4 py-1.5 text-sm font-medium text-sage-700 bg-sage-100 hover:bg-sage-200 rounded-pill transition-colors"
          >
            Clear all filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-sage-100 flex items-center justify-center mb-5">
        <Sprout className="w-8 h-8 text-sage-500" />
      </div>
      <h2 className="text-xl font-serif font-semibold text-ink-800 mb-2">
        Your garden is empty
      </h2>
      <p className="text-sm text-ink-400 max-w-md mb-6 leading-relaxed">
        Every project starts as a seed. Capture a rough idea — a title and a few
        thoughts is all you need. You can grow it later.
      </p>
      <div className="flex flex-col items-center gap-3">
        {onPlantSeed && (
          <button
            onClick={onPlantSeed}
            className="bg-clay-500 hover:bg-clay-600 text-paper px-5 py-2 rounded-pill text-sm font-medium transition-colors flex items-center gap-2 shadow-card"
          >
            <span className="text-lg">🌱</span>
            Plant your first seed
          </button>
        )}
        {onSeedExamples && (
          <button
            onClick={onSeedExamples}
            className="text-xs text-ink-400 hover:text-sage-600 transition-colors"
          >
            or start with example ideas →
          </button>
        )}
      </div>
    </div>
  );
}
