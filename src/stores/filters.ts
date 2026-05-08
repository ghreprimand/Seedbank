/**
 * Zustand store for the board's search / filter / sort state.
 *
 * Shared between the Layout header (search input) and the Board page
 * (filter bar + card grid).
 */

import { create } from 'zustand';
import type { Category, Stage, SortField, SortDirection } from '@/lib/types';

interface FilterState {
  /** Free-text search query */
  query: string;
  /** Selected category filters (empty = all) */
  categories: Category[];
  /** Selected stage filters (empty = all) */
  stages: Stage[];
  /** Tag filter (idea must have ALL of these) */
  tags: string[];
  /** Sort field */
  sortBy: SortField;
  /** Sort direction */
  sortDirection: SortDirection;

  // Actions
  setQuery: (q: string) => void;
  toggleCategory: (c: Category) => void;
  toggleStage: (s: Stage) => void;
  toggleTag: (t: string) => void;
  clearTag: (t: string) => void;
  setSort: (field: SortField, direction?: SortDirection) => void;
  clearAll: () => void;
  /** Number of active filters (for badge display) */
  activeFilterCount: () => number;
}

export const useFilterStore = create<FilterState>((set, get) => ({
  query: '',
  categories: [],
  stages: [],
  tags: [],
  sortBy: 'updatedAt',
  sortDirection: 'desc',

  setQuery: (query) => set({ query }),

  toggleCategory: (c) =>
    set((s) => ({
      categories: s.categories.includes(c)
        ? s.categories.filter((x) => x !== c)
        : [...s.categories, c],
    })),

  toggleStage: (s) =>
    set((state) => ({
      stages: state.stages.includes(s)
        ? state.stages.filter((x) => x !== s)
        : [...state.stages, s],
    })),

  toggleTag: (t) =>
    set((s) => ({
      tags: s.tags.includes(t) ? s.tags.filter((x) => x !== t) : [...s.tags, t],
    })),

  clearTag: (t) => set((s) => ({ tags: s.tags.filter((x) => x !== t) })),

  setSort: (field, direction) =>
    set((s) => ({
      sortBy: field,
      sortDirection: direction ?? (s.sortBy === field && s.sortDirection === 'desc' ? 'asc' : 'desc'),
    })),

  clearAll: () =>
    set({
      query: '',
      categories: [],
      stages: [],
      tags: [],
      sortBy: 'updatedAt',
      sortDirection: 'desc',
    }),

  activeFilterCount: () => {
    const s = get();
    let count = 0;
    if (s.query.trim()) count++;
    count += s.categories.length;
    count += s.stages.length;
    count += s.tags.length;
    if (s.sortBy !== 'updatedAt' || s.sortDirection !== 'asc') {
      // don't count default sort as a filter
    }
    return count;
  },
}));
