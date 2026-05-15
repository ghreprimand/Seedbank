/** Board page — main garden view with responsive card grid, filter bar, and search. */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchIdeas, getAllIdeas } from '@/api/client';
import { useFilterStore } from '@/stores/filters';
import type { Idea } from '@/lib/types';
import IdeaCard from '@/components/IdeaCard';
import StagesView from '@/pages/StagesView';
import FilterBar from '@/components/FilterBar';
import { collectTags } from '@/lib/collectTags';
import EmptyState from '@/components/EmptyState';
import { seedDatabase } from '@/lib/import';

type GardenViewMode = 'grid' | 'stages';

const GARDEN_VIEW_STORAGE_KEY = 'seedbank:garden-view-mode';

export default function Board() {
  const navigate = useNavigate();
  const filters = useFilterStore();

  const [allIdeas, setAllIdeas] = useState<Idea[]>([]);
  const [filteredIdeas, setFilteredIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [viewMode, setViewMode] = useState<GardenViewMode>(() => {
    if (typeof window === 'undefined') return 'grid';
    return window.localStorage.getItem(GARDEN_VIEW_STORAGE_KEY) === 'stages' ? 'stages' : 'grid';
  });

  const { query, categories, stages, tags, sortBy, sortDirection } = filters;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [all, filtered] = await Promise.all([
          getAllIdeas(),
          searchIdeas({
            query: query || undefined,
            categories: categories.length ? categories : undefined,
            stages: stages.length ? stages : undefined,
            tags: tags.length ? tags : undefined,
            sortBy,
            sortDirection,
          }),
        ]);
        if (cancelled) return;
        setAllIdeas(all);
        setFilteredIdeas(filtered);
      } catch (err) {
        if (!cancelled) console.error('Failed to load ideas:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, categories, stages, tags, sortBy, sortDirection, reloadKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(GARDEN_VIEW_STORAGE_KEY, viewMode);
  }, [viewMode]);

  const reload = () => setReloadKey((k) => k + 1);

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
        <div data-help="garden-page">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-serif font-semibold text-ink-900 tracking-tight">
              The Garden
            </h1>
          </div>
          <p className="text-ink-400 text-sm mt-1">Your project seed collection.</p>
        </div>
        <EmptyState
          onPlantSeed={() => navigate('/idea/new')}
          onSeedExamples={async () => {
            await seedDatabase();
            reload();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-help="garden-page">
      {/* Page header */}
      <div className="animate-fade-in">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-serif font-semibold text-ink-900 tracking-tight">
              The Garden
            </h1>
            <p className="text-ink-400 text-sm mt-0.5 font-mono">
              {allIdeas.length} seed{allIdeas.length !== 1 ? 's' : ''} planted
            </p>
          </div>
          <div
            className="inline-flex items-center rounded-pill border border-ink-100 bg-paper p-1"
            data-help="stages-view"
          >
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1 text-xs rounded-pill transition-colors ${
                viewMode === 'grid'
                  ? 'bg-sage-600 text-paper'
                  : 'text-ink-500 hover:bg-ink-50'
              }`}
            >
              Grid
            </button>
            <button
              type="button"
              onClick={() => setViewMode('stages')}
              className={`px-3 py-1 text-xs rounded-pill transition-colors ${
                viewMode === 'stages'
                  ? 'bg-sage-600 text-paper'
                  : 'text-ink-500 hover:bg-ink-50'
              }`}
            >
              Stages
            </button>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div data-help="garden-filters">
        <FilterBar
          availableTags={availableTags}
          totalCount={allIdeas.length}
          filteredCount={filteredIdeas.length}
        />
      </div>

      {/* Cards grid */}
      {filteredIdeas.length > 0 ? (
        viewMode === 'grid'
          ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-help="garden-grid">
                {filteredIdeas.map((idea, i) => (
                  <IdeaCard key={idea.id} idea={idea} index={i} />
                ))}
              </div>
            )
          : (
              <StagesView ideas={filteredIdeas} onIdeasChanged={reload} />
            )
      ) : (
        <EmptyState
          isFiltered
          onClearFilters={() => filters.clearAll()}
        />
      )}
    </div>
  );
}
