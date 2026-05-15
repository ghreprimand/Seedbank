/**
 * Data-access layer for ideas.
 *
 * All persistence goes through these functions.
 * Components should never touch `db` directly.
 */

import { v4 as uuid } from 'uuid';
import { db } from '@/db';
import { duplicateIdeaPayload } from '../../../shared/ideaDuplication';
import type {
  Idea,
  IdeaVersion,
  IdeaSnapshot,
  IdeaFilters,
  Category,
  Stage,
} from '@/lib/types';

// ── Helpers ─────────────────────────────────────────────────────────

/** Extract the versionable content fields from an idea. */
function snapshotFrom(idea: Idea): IdeaSnapshot {
  return {
    title: idea.title,
    pitch: idea.pitch,
    category: idea.category,
    stage: idea.stage,
    tags: [...idea.tags],
    moodLabels: [...idea.moodLabels],
    fullNotes: idea.fullNotes,
    hook: idea.hook,
    whyItMightWork: idea.whyItMightWork,
    risks: idea.risks,
    techStack: idea.techStack,
    aesthetic: idea.aesthetic,
    retrospective: idea.retrospective,
    jamScore: idea.jamScore,
    excitementScore: idea.excitementScore,
    links: idea.links.map((l) => ({ ...l })),
    images: [...idea.images],
  };
}

/**
 * Determine whether two snapshots differ meaningfully enough to
 * warrant creating a version record. Ignores whitespace-only diffs
 * in long-form text fields.
 */
function hasContentChanged(a: IdeaSnapshot, b: IdeaSnapshot): boolean {
  // Quick structural check on simple fields
  if (
    a.title !== b.title ||
    a.pitch !== b.pitch ||
    a.category !== b.category ||
    a.stage !== b.stage ||
    a.jamScore !== b.jamScore ||
    a.excitementScore !== b.excitementScore
  ) {
    return true;
  }

  // Long-form text fields — trim to ignore trailing whitespace edits
  if (
    a.fullNotes.trim() !== b.fullNotes.trim() ||
    a.hook.trim() !== b.hook.trim() ||
    a.whyItMightWork.trim() !== b.whyItMightWork.trim() ||
    a.risks.trim() !== b.risks.trim() ||
    a.techStack.trim() !== b.techStack.trim() ||
    a.aesthetic.trim() !== b.aesthetic.trim() ||
    a.retrospective.trim() !== b.retrospective.trim()
  ) {
    return true;
  }

  // Array fields
  if (
    JSON.stringify(a.tags) !== JSON.stringify(b.tags) ||
    JSON.stringify(a.moodLabels) !== JSON.stringify(b.moodLabels) ||
    JSON.stringify(a.links) !== JSON.stringify(b.links) ||
    JSON.stringify(a.images) !== JSON.stringify(b.images)
  ) {
    return true;
  }

  return false;
}

/** Generate an auto-label for a version based on what changed. */
function autoVersionLabel(prev: IdeaSnapshot, next: IdeaSnapshot): string {
  if (prev.stage !== next.stage) return `Stage → ${next.stage}`;
  if (prev.title !== next.title) return 'Title updated';
  if (prev.pitch !== next.pitch) return 'Pitch revised';
  if (prev.fullNotes.trim() !== next.fullNotes.trim()) return 'Notes edited';
  if (prev.category !== next.category) return `Category → ${next.category}`;
  return 'Updated';
}

// ── Default factory ─────────────────────────────────────────────────

/** Create a blank idea with sensible defaults. */
export function newIdea(partial: Partial<Idea> = {}): Idea {
  const now = new Date();
  return {
    id: uuid(),
    title: '',
    pitch: '',
    category: 'app' as Category,
    stage: 'seed' as Stage,
    tags: [],
    moodLabels: [],
    fullNotes: '',
    hook: '',
    whyItMightWork: '',
    risks: '',
    techStack: '',
    aesthetic: '',
    retrospective: '',
    jamScore: 0,
    excitementScore: 0,
    relatedIdeaIds: [],
    links: [],
    images: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

// ── CRUD ────────────────────────────────────────────────────────────

/** Insert a new idea into the database. Returns the created idea. */
export async function createIdea(partial: Partial<Idea> = {}): Promise<Idea> {
  const idea = newIdea(partial);
  await db.ideas.add(idea);
  return idea;
}

/** Get a single idea by ID. Returns undefined if not found. */
export async function getIdea(id: string): Promise<Idea | undefined> {
  return db.ideas.get(id);
}

/** Get all ideas, unfiltered, sorted by updatedAt desc. */
export async function getAllIdeas(): Promise<Idea[]> {
  return db.ideas.orderBy('updatedAt').reverse().toArray();
}

/**
 * Update an idea. Automatically creates a version snapshot if the
 * content has changed meaningfully since the last save.
 *
 * @param id      The idea ID to update
 * @param changes Partial idea fields to merge
 * @returns       The updated idea, or undefined if not found
 */
export async function updateIdea(
  id: string,
  changes: Partial<Omit<Idea, 'id' | 'createdAt'>>,
): Promise<Idea | undefined> {
  return db.transaction('rw', db.ideas, db.versions, async () => {
    const existing = await db.ideas.get(id);
    if (!existing) return undefined;

    const prevSnapshot = snapshotFrom(existing);

    // Merge changes
    const updated: Idea = {
      ...existing,
      ...changes,
      id: existing.id,           // prevent ID overwrite
      createdAt: existing.createdAt, // prevent createdAt overwrite
      updatedAt: new Date(),
    };

    const nextSnapshot = snapshotFrom(updated);

    // Auto-version if content changed meaningfully
    if (hasContentChanged(prevSnapshot, nextSnapshot)) {
      const version: IdeaVersion = {
        id: uuid(),
        ideaId: id,
        versionLabel: autoVersionLabel(prevSnapshot, nextSnapshot),
        notes: '',
        timestamp: new Date(),
        snapshot: prevSnapshot,
      };
      await db.versions.add(version);
    }

    await db.ideas.put(updated);
    return updated;
  });
}

/** Delete an idea and all its version history. */
export async function deleteIdea(id: string): Promise<void> {
  await db.transaction('rw', db.ideas, db.versions, async () => {
    await db.ideas.delete(id);
    await db.versions.where('ideaId').equals(id).delete();

    // Remove this ID from other ideas' relatedIdeaIds
    const referencing = await db.ideas
      .filter((idea) => idea.relatedIdeaIds.includes(id))
      .toArray();

    for (const idea of referencing) {
      await db.ideas.update(idea.id, {
        relatedIdeaIds: idea.relatedIdeaIds.filter((rid) => rid !== id),
      });
    }
  });
}

/**
 * Duplicate an idea: copies all content fields, resets ID and timestamps,
 * prefixes title with "Copy of". Does NOT copy version history.
 */
export async function duplicateIdea(id: string): Promise<Idea | undefined> {
  const original = await db.ideas.get(id);
  if (!original) return undefined;

  const copy = newIdea(duplicateIdeaPayload(original, uuid(), new Date()));

  await db.ideas.add(copy);
  return copy;
}

// ── Versioning ──────────────────────────────────────────────────────

/** Get all version snapshots for an idea, newest first. */
export async function getVersions(ideaId: string): Promise<IdeaVersion[]> {
  return db.versions
    .where('ideaId')
    .equals(ideaId)
    .reverse()
    .sortBy('timestamp');
}

/** Manually create a version snapshot with a custom label. */
export async function createVersion(
  ideaId: string,
  label: string,
  notes = '',
): Promise<IdeaVersion | undefined> {
  const idea = await db.ideas.get(ideaId);
  if (!idea) return undefined;

  const version: IdeaVersion = {
    id: uuid(),
    ideaId,
    versionLabel: label,
    notes,
    timestamp: new Date(),
    snapshot: snapshotFrom(idea),
  };

  await db.versions.add(version);
  return version;
}

/**
 * Restore an idea to a previous version's snapshot.
 * This is itself a versioned update (the current state is saved
 * as a version before the restore happens).
 */
export async function restoreVersion(
  ideaId: string,
  versionId: string,
): Promise<Idea | undefined> {
  return db.transaction('rw', db.ideas, db.versions, async () => {
    const idea = await db.ideas.get(ideaId);
    const version = await db.versions.get(versionId);
    if (!idea || !version || version.ideaId !== ideaId) return undefined;

    // Save current state as a version before restoring
    const currentSnapshot: IdeaVersion = {
      id: uuid(),
      ideaId,
      versionLabel: `Before restore to "${version.versionLabel}"`,
      notes: '',
      timestamp: new Date(),
      snapshot: snapshotFrom(idea),
    };
    await db.versions.add(currentSnapshot);

    // Apply the snapshot
    const restored: Idea = {
      ...idea,
      ...version.snapshot,
      id: idea.id,
      relatedIdeaIds: idea.relatedIdeaIds,
      createdAt: idea.createdAt,
      updatedAt: new Date(),
    };

    await db.ideas.put(restored);
    return restored;
  });
}

// ── Search & filter ─────────────────────────────────────────────────

/**
 * Query ideas with optional filters, search, and sorting.
 *
 * For text search we do a simple case-insensitive substring match
 * across title, pitch, fullNotes, hook, tags, and moodLabels.
 * (Can upgrade to Fuse.js for fuzzy matching later.)
 */
export async function searchIdeas(filters: IdeaFilters = {}): Promise<Idea[]> {
  const {
    query,
    categories,
    stages,
    tags,
    sortBy = 'updatedAt',
    sortDirection = 'desc',
  } = filters;

  const collection = db.ideas.toCollection();

  // Apply indexed filters where possible
  // (Dexie can only use one index per query, so we filter the rest in JS)

  let results = await collection.toArray();

  // Category filter
  if (categories && categories.length > 0) {
    const catSet = new Set(categories);
    results = results.filter((idea) => catSet.has(idea.category));
  }

  // Stage filter
  if (stages && stages.length > 0) {
    const stageSet = new Set(stages);
    results = results.filter((idea) => stageSet.has(idea.stage));
  }

  // Tag filter (idea must have ALL specified tags)
  if (tags && tags.length > 0) {
    results = results.filter((idea) =>
      tags.every((tag) =>
        idea.tags.some((t) => t.toLowerCase() === tag.toLowerCase()),
      ),
    );
  }

  // Full-text search
  if (query && query.trim()) {
    const q = query.trim().toLowerCase();
    results = results.filter((idea) => {
      const searchable = [
        idea.title,
        idea.pitch,
        idea.fullNotes,
        idea.hook,
        idea.whyItMightWork,
        idea.risks,
        idea.techStack,
        ...idea.tags,
        ...idea.moodLabels,
      ]
        .join(' ')
        .toLowerCase();

      return searchable.includes(q);
    });
  }

  // Sort
  results.sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case 'createdAt':
        cmp = a.createdAt.getTime() - b.createdAt.getTime();
        break;
      case 'updatedAt':
        cmp = a.updatedAt.getTime() - b.updatedAt.getTime();
        break;
      case 'excitementScore':
        cmp = a.excitementScore - b.excitementScore;
        break;
      case 'title':
        cmp = a.title.localeCompare(b.title);
        break;
    }
    return sortDirection === 'desc' ? -cmp : cmp;
  });

  return results;
}

// ── Stats ───────────────────────────────────────────────────────────

/** Get a count of ideas grouped by stage. */
export async function getStageStats(): Promise<Record<string, number>> {
  const all = await db.ideas.toArray();
  const stats: Record<string, number> = {};
  for (const idea of all) {
    stats[idea.stage] = (stats[idea.stage] || 0) + 1;
  }
  return stats;
}

/** Get total idea count. */
export async function getIdeaCount(): Promise<number> {
  return db.ideas.count();
}
