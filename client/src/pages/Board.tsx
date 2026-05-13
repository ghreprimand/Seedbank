/** Board page — main garden view with responsive card grid, filter bar, and search. */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchIdeas, getAllIdeas } from '@/api/client';
import { useFilterStore } from '@/stores/filters';
import type { Idea } from '@/lib/types';
import IdeaCard from '@/components/IdeaCard';
import FilterBar from '@/components/FilterBar';
import { collectTags } from '@/lib/collectTags';
import EmptyState from '@/components/EmptyState';
import { seedDatabase } from '@/lib/import';
import { HelpButton } from '@/help/HelpPopover';

export default function Board() {
  const navigate = useNavigate();
  const filters = useFilterStore();

  const [allIdeas, setAllIdeas] = useState<Idea[]>([]);
  const [filteredIdeas, setFilteredIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

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
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-serif font-semibold text-ink-900 tracking-tight">
              The Garden
            </h1>
            <HelpButton
              helpId="garden-header"
              title="The Garden"
              summary="Your main idea board. Filter by stage, category, or tag. Search across title, pitch, notes, and tags. Multiple filters combine with AND logic."
              details="Press N to capture a new idea. Press / to focus search. Shelved and Cold Storage ideas are hidden by default — use the stage filter to find them."
              manualSection="garden"
            />
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
    <div className="space-y-5">
      {/* Page header */}
      <div className="animate-fade-in">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-serif font-semibold text-ink-900 tracking-tight">
            The Garden
          </h1>
          <HelpButton
            helpId="garden-header"
            title="The Garden"
            summary="Your main idea board. Filter by stage, category, or tag. Search across title, pitch, notes, and tags. Multiple filters combine with AND logic."
            details="Press N to capture a new idea. Press / to focus search. Shelved and Cold Storage ideas are hidden by default — use the stage filter to find them."
            manualSection="garden"
          />
        </div>
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
