/**
 * Seedbank core domain types.
 *
 * These types define the shape of data stored in IndexedDB via Dexie.
 * All IDs are UUIDs generated client-side.
 */

// ── Enums / unions ──────────────────────────────────────────────────

/** Idea categories — what kind of project is this? */
export const CATEGORIES = [
  'game',
  'app',
  'tool',
  'art-project',
  'local-ai',
  'mobile',
  'browser',
  'open-source-utility',
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Human-readable labels for categories */
export const CATEGORY_LABELS: Record<Category, string> = {
  'game': 'Game',
  'app': 'App',
  'tool': 'Tool',
  'art-project': 'Art Project',
  'local-ai': 'Local AI',
  'mobile': 'Mobile',
  'browser': 'Browser',
  'open-source-utility': 'Open-Source Utility',
};

/**
 * Idea stages — gardening-themed lifecycle.
 *
 * seed        → rough / new / just captured
 * sprout      → stronger concept, some structure
 * pitch       → developed enough to explain clearly
 * prototype   → actively being built / experimented with
 * plot        → full active project
 * shelved     → paused but preserved ("cold storage lite")
 * cold-storage → deep archive, still searchable
 * shipped     → done, released, or completed
 */
export const STAGES = [
  'seed',
  'sprout',
  'pitch',
  'prototype',
  'plot',
  'shelved',
  'cold-storage',
  'shipped',
] as const;

export type Stage = (typeof STAGES)[number];

/** Human-readable labels for stages */
export const STAGE_LABELS: Record<Stage, string> = {
  'seed': 'Seed',
  'sprout': 'Sprout',
  'pitch': 'Pitch',
  'prototype': 'Prototype',
  'plot': 'Plot',
  'shelved': 'Shelved',
  'cold-storage': 'Cold Storage',
  'shipped': 'Shipped',
};

/** Emoji/icon hints for stages (used in badges) */
export const STAGE_ICONS: Record<Stage, string> = {
  'seed': '🌱',
  'sprout': '🌿',
  'pitch': '📋',
  'prototype': '🔧',
  'plot': '🌳',
  'shelved': '📦',
  'cold-storage': '❄️',
  'shipped': '🚀',
};

// ── Link type ───────────────────────────────────────────────────────

/** A labeled URL reference attached to an idea */
export interface IdeaLink {
  url: string;
  label: string;
}

// ── Core idea type ──────────────────────────────────────────────────

/**
 * The main Idea record stored in IndexedDB.
 *
 * Fields map to the readme spec:
 *   title, pitch, category, stage, tags, moodLabels,
 *   fullNotes, hook, whyItMightWork, risks, techStack,
 *   jamScore, excitementScore, relatedIdeaIds, links, images,
 *   createdAt, updatedAt
 */
export interface Idea {
  /** UUID v4, generated client-side */
  id: string;

  // ── Identity ────────────────────────────────────────
  title: string;
  /** One-line pitch */
  pitch: string;
  category: Category;
  stage: Stage;

  // ── Taxonomy ────────────────────────────────────────
  tags: string[];
  /** Mood / vibe labels (e.g. "cozy", "chaotic", "meditative") */
  moodLabels: string[];

  // ── Long-form fields ────────────────────────────────
  /** Full pitch notes / detailed description */
  fullNotes: string;
  /** Hook or 30-second demo concept */
  hook: string;
  /** Why this idea might work */
  whyItMightWork: string;
  /** Risks and blockers */
  risks: string;
  /** Tech stack notes */
  techStack: string;

  // ── Scores ──────────────────────────────────────────
  /** Jam suitability 1–5 (0 = unscored) */
  jamScore: number;
  /** Personal excitement 1–5 (0 = unscored) */
  excitementScore: number;

  // ── Relations ───────────────────────────────────────
  /** IDs of related ideas (cross-references) */
  relatedIdeaIds: string[];
  /** External links with labels */
  links: IdeaLink[];
  /** Paths or data-URIs for attached images */
  images: string[];

  // ── Timestamps ──────────────────────────────────────
  createdAt: Date;
  updatedAt: Date;
}

// ── Version snapshot ────────────────────────────────────────────────

/**
 * A point-in-time snapshot of an idea's content fields.
 * Stored in a separate table so we never lose history.
 *
 * Contains all the "content" fields of Idea (everything except id,
 * relatedIdeaIds, createdAt, updatedAt — those are structural).
 */
export interface IdeaVersion {
  /** UUID v4 */
  id: string;
  /** The idea this version belongs to */
  ideaId: string;
  /** Human label, e.g. "first spark", "stronger pitch", auto-generated */
  versionLabel: string;
  /** Optional notes about what changed */
  notes: string;
  /** ISO timestamp of when the snapshot was taken */
  timestamp: Date;
  /** Serialized snapshot of the idea's content fields */
  snapshot: IdeaSnapshot;
}

/**
 * The subset of Idea fields that get versioned.
 * Structural fields (id, relatedIdeaIds, timestamps) are excluded.
 */
export interface IdeaSnapshot {
  title: string;
  pitch: string;
  category: Category;
  stage: Stage;
  tags: string[];
  moodLabels: string[];
  fullNotes: string;
  hook: string;
  whyItMightWork: string;
  risks: string;
  techStack: string;
  jamScore: number;
  excitementScore: number;
  links: IdeaLink[];
  images: string[];
}

// ── Filter / search types ───────────────────────────────────────────

export type SortField = 'createdAt' | 'updatedAt' | 'excitementScore' | 'title';
export type SortDirection = 'asc' | 'desc';

export interface IdeaFilters {
  /** Free-text search across title, pitch, notes, tags */
  query?: string;
  /** Filter to these categories (empty = all) */
  categories?: Category[];
  /** Filter to these stages (empty = all) */
  stages?: Stage[];
  /** Filter to ideas that have ALL of these tags */
  tags?: string[];
  /** Sort field */
  sortBy?: SortField;
  /** Sort direction */
  sortDirection?: SortDirection;
}
