/** Board page — main garden view with responsive card grid, filter bar, and search. */
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchIdeas, getAllIdeas } from '@/db/ideas';
import { useFilterStore } from '@/stores/filters';
import type { Idea } from '@/lib/types';
import IdeaCard from '@/components/IdeaCard';
import FilterBar, { collectTags } from '@/components/FilterBar';
import EmptyState from '@/components/EmptyState';
import { seedDatabase } from '@/lib/import';

export default function Board() {
  const navigate = useNavigate();
  const filters = useFilterStore();

  const [allIdeas, setAllIdeas] = useState<Idea[]>([]);
  const [filteredIdeas, setFilteredIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);

  const loadIdeas = useCallback(async () => {
    try {
      const [all, filtered] = await Promise.all([
        getAllIdeas(),
        searchIdeas({
          query: filters.query || undefined,
          categories: filters.categories.length ? filters.categories : undefined,
          stages: filters.stages.length ? filters.stages : undefined,
          tags: filters.tags.length ? filters.tags : undefined,
          sortBy: filters.sortBy,
          sortDirection: filters.sortDirection,
        }),
      ]);
      setAllIdeas(all);
      setFilteredIdeas(filtered);
    } catch (err) {
      console.error('Failed to load ideas:', err);
    } finally {
      setLoading(false);
    }
  }, [
    filters.query,
    filters.categories,
    filters.stages,
    filters.tags,
    filters.sortBy,
    filters.sortDirection,
  ]);

  useEffect(() => {
    loadIdeas();
  }, [loadIdeas]);

  const availableTags = collectTags(allIdeas);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 animate-fade-in">
        <div className="flex flex-col items-center gap-3">
          <span className="text-2xl animate-pulse">🌱</span>
          <span className="text-ink-400 text-sm font-mono italic">Loading your garden…</span>
        </div>
      </div>
    );
  }

  // Empty DB — show first-time empty state
  if (allIdeas.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-serif font-semibold text-ink-900 tracking-tight">
            The Garden
          </h1>
          <p className="text-ink-400 text-sm mt-1">Your project seed collection.</p>
        </div>
        <EmptyState
          onPlantSeed={() => navigate('/idea/new')}
          onSeedExamples={async () => {
            await seedDatabase();
            loadIdeas();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="animate-fade-in">
        <h1 className="text-3xl font-serif font-semibold text-ink-900 tracking-tight">
          The Garden
        </h1>
        <p className="text-ink-400 text-sm mt-0.5 font-mono">
          {allIdeas.length} seed{allIdeas.length !== 1 ? 's' : ''} planted
        </p>
      </div>

      {/* Filter bar */}
      <FilterBar
        availableTags={availableTags}
        totalCount={allIdeas.length}
        filteredCount={filteredIdeas.length}
      />

      {/* Cards grid */}
      {filteredIdeas.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredIdeas.map((idea, i) => (
            <IdeaCard key={idea.id} idea={idea} index={i} />
          ))}
        </div>
      ) : (
        <EmptyState
          isFiltered
          onClearFilters={() => filters.clearAll()}
        />
      )}
    </div>
  );
}
