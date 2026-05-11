/**
 * Seedbank Dexie database.
 *
 * Single IndexedDB database with two tables:
 *   - ideas:    the main idea records
 *   - versions: point-in-time snapshots of idea content
 *
 * Dexie's schema notation:
 *   &  = unique index
 *   *  = multi-entry index (for array fields)
 *   ++ = auto-increment (not used — we use UUIDs)
 */

import Dexie, { type EntityTable } from 'dexie';
import type { Idea, IdeaVersion } from '@/lib/types';

class SeedbankDB extends Dexie {
  ideas!: EntityTable<Idea, 'id'>;
  versions!: EntityTable<IdeaVersion, 'id'>;

  constructor() {
    super('seedbank');

    this.version(1).stores({
      ideas: '&id, title, category, stage, *tags, createdAt, updatedAt, excitementScore',
      versions: '&id, ideaId, timestamp',
    });
  }
}

/** Singleton database instance */
export const db = new SeedbankDB();
