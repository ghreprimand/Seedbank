import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import type {
  Category,
  Idea,
  IdeaFilters,
  IdeaSnapshot,
  IdeaVersion,
  SortDirection,
  SortField,
  Stage,
} from '../../shared/types.js';
import {
  autoVersionLabel,
  hasContentChanged,
  mergeIdea,
  newIdea,
  normalizeVersion,
  snapshotFrom,
  type IdeaInput,
  type VersionInput,
} from './domain.js';

interface IdeaRow {
  id: string;
  title: string;
  pitch: string;
  category: Category;
  stage: Stage;
  tags: string;
  mood_labels: string;
  full_notes: string;
  hook: string;
  why_it_might_work: string;
  risks: string;
  tech_stack: string;
  jam_score: number;
  excitement_score: number;
  related_idea_ids: string;
  links: string;
  images: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  graduated_to: string | null;
}

interface VersionRow {
  id: string;
  idea_id: string;
  version_label: string;
  notes: string;
  timestamp: string;
  snapshot: string;
}

export interface ListIdeasOptions extends IdeaFilters {
  includeDeleted?: boolean;
  page?: number;
  limit?: number;
}

export interface ListIdeasResult {
  items: Idea[];
  total: number;
  page: number;
  limit: number;
}

export interface ImportArchive {
  ideas?: IdeaInput[];
  versions?: VersionInput[];
}

export interface ImportResult {
  imported: number;
  skipped: number;
  versionsImported: number;
  warnings: string[];
}

interface SettingRow {
  key: string;
  value_json: string;
  updated_at: string;
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function dateOrNull(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

function ideaFromRow(row: IdeaRow): Idea {
  return {
    id: row.id,
    title: row.title,
    pitch: row.pitch,
    category: row.category,
    stage: row.stage,
    tags: parseJson<string[]>(row.tags, []),
    moodLabels: parseJson<string[]>(row.mood_labels, []),
    fullNotes: row.full_notes,
    hook: row.hook,
    whyItMightWork: row.why_it_might_work,
    risks: row.risks,
    techStack: row.tech_stack,
    jamScore: row.jam_score,
    excitementScore: row.excitement_score,
    relatedIdeaIds: parseJson<string[]>(row.related_idea_ids, []),
    links: parseJson(row.links, []),
    images: parseJson<string[]>(row.images, []),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: dateOrNull(row.deleted_at),
    graduatedTo: row.graduated_to,
  };
}

function versionFromRow(row: VersionRow): IdeaVersion {
  return {
    id: row.id,
    ideaId: row.idea_id,
    versionLabel: row.version_label,
    notes: row.notes,
    timestamp: new Date(row.timestamp),
    snapshot: parseJson<IdeaSnapshot>(row.snapshot, {} as IdeaSnapshot),
  };
}

function ideaParams(idea: Idea) {
  return {
    id: idea.id,
    title: idea.title,
    pitch: idea.pitch,
    category: idea.category,
    stage: idea.stage,
    tags: JSON.stringify(idea.tags),
    moodLabels: JSON.stringify(idea.moodLabels),
    fullNotes: idea.fullNotes,
    hook: idea.hook,
    whyItMightWork: idea.whyItMightWork,
    risks: idea.risks,
    techStack: idea.techStack,
    jamScore: idea.jamScore,
    excitementScore: idea.excitementScore,
    relatedIdeaIds: JSON.stringify(idea.relatedIdeaIds),
    links: JSON.stringify(idea.links),
    images: JSON.stringify(idea.images),
    createdAt: idea.createdAt.toISOString(),
    updatedAt: idea.updatedAt.toISOString(),
    deletedAt: idea.deletedAt ? idea.deletedAt.toISOString() : null,
    graduatedTo: idea.graduatedTo ?? null,
  };
}

function versionParams(version: IdeaVersion) {
  return {
    id: version.id,
    ideaId: version.ideaId,
    versionLabel: version.versionLabel,
    notes: version.notes,
    timestamp: version.timestamp.toISOString(),
    snapshot: JSON.stringify(version.snapshot),
  };
}

function splitParam(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.flatMap((item) => splitParam(item) ?? []);
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function sortIdeas(ideas: Idea[], sortBy: SortField, sortDirection: SortDirection): Idea[] {
  const sorted = [...ideas];
  sorted.sort((a, b) => {
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
  return sorted;
}

export class SeedbankRepository {
  constructor(private readonly db: Database.Database) {}

  database(): Database.Database {
    return this.db;
  }

  private insertOrReplaceIdea(idea: Idea) {
    this.db.prepare(`
      INSERT INTO ideas (
        id, title, pitch, category, stage, tags, mood_labels, full_notes, hook,
        why_it_might_work, risks, tech_stack, jam_score, excitement_score,
        related_idea_ids, links, images, created_at, updated_at, deleted_at, graduated_to
      ) VALUES (
        @id, @title, @pitch, @category, @stage, @tags, @moodLabels, @fullNotes, @hook,
        @whyItMightWork, @risks, @techStack, @jamScore, @excitementScore,
        @relatedIdeaIds, @links, @images, @createdAt, @updatedAt, @deletedAt, @graduatedTo
      )
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        pitch = excluded.pitch,
        category = excluded.category,
        stage = excluded.stage,
        tags = excluded.tags,
        mood_labels = excluded.mood_labels,
        full_notes = excluded.full_notes,
        hook = excluded.hook,
        why_it_might_work = excluded.why_it_might_work,
        risks = excluded.risks,
        tech_stack = excluded.tech_stack,
        jam_score = excluded.jam_score,
        excitement_score = excluded.excitement_score,
        related_idea_ids = excluded.related_idea_ids,
        links = excluded.links,
        images = excluded.images,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at,
        graduated_to = excluded.graduated_to
    `).run(ideaParams(idea));
  }

  private insertVersion(version: IdeaVersion) {
    this.db.prepare(`
      INSERT OR REPLACE INTO versions (id, idea_id, version_label, notes, timestamp, snapshot)
      VALUES (@id, @ideaId, @versionLabel, @notes, @timestamp, @snapshot)
    `).run(versionParams(version));
  }

  createIdea(input: IdeaInput = {}): Idea {
    const idea = newIdea(input);
    this.insertOrReplaceIdea(idea);
    return idea;
  }

  getIdea(id: string, includeDeleted = false): Idea | undefined {
    const row = this.db.prepare('SELECT * FROM ideas WHERE id = ?').get(id) as IdeaRow | undefined;
    if (!row) return undefined;
    const idea = ideaFromRow(row);
    if (!includeDeleted && idea.deletedAt) return undefined;
    return idea;
  }

  getVersionCount(ideaId: string): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM versions WHERE idea_id = ?')
      .get(ideaId) as { count: number };
    return row.count;
  }

  listIdeas(options: ListIdeasOptions = {}): ListIdeasResult {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(500, Math.max(1, Number(options.limit) || 100));
    const sortBy = options.sortBy ?? 'updatedAt';
    const sortDirection = options.sortDirection ?? 'desc';
    const categories = options.categories ?? splitParam(options.categories);
    const stages = options.stages ?? splitParam(options.stages);
    const tags = options.tags ?? splitParam(options.tags);

    let ideas = (this.db.prepare('SELECT * FROM ideas').all() as IdeaRow[])
      .map(ideaFromRow)
      .filter((idea) => options.includeDeleted || !idea.deletedAt);

    if (categories && categories.length > 0) {
      const categorySet = new Set(categories);
      ideas = ideas.filter((idea) => categorySet.has(idea.category));
    }

    if (stages && stages.length > 0) {
      const stageSet = new Set(stages);
      ideas = ideas.filter((idea) => stageSet.has(idea.stage));
    }

    if (tags && tags.length > 0) {
      ideas = ideas.filter((idea) =>
        tags.every((tag) => idea.tags.some((ideaTag) => ideaTag.toLowerCase() === tag.toLowerCase())),
      );
    }

    if (options.query?.trim()) {
      const query = options.query.trim().toLowerCase();
      ideas = ideas.filter((idea) => {
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
        ].join(' ').toLowerCase();
        return searchable.includes(query);
      });
    }

    const total = ideas.length;
    const start = (page - 1) * limit;
    return {
      items: sortIdeas(ideas, sortBy, sortDirection).slice(start, start + limit),
      total,
      page,
      limit,
    };
  }

  updateIdea(id: string, changes: IdeaInput): Idea | undefined {
    const update = this.db.transaction(() => {
      const existing = this.getIdea(id, true);
      if (!existing) return undefined;

      const prevSnapshot = snapshotFrom(existing);
      const updated = mergeIdea(existing, changes);
      const nextSnapshot = snapshotFrom(updated);

      if (hasContentChanged(prevSnapshot, nextSnapshot)) {
        this.insertVersion({
          id: uuid(),
          ideaId: id,
          versionLabel: autoVersionLabel(prevSnapshot, nextSnapshot),
          notes: '',
          timestamp: new Date(),
          snapshot: prevSnapshot,
        });
      }

      this.insertOrReplaceIdea(updated);
      return updated;
    });

    return update();
  }

  softDeleteIdea(id: string): Idea | undefined {
    return this.updateIdea(id, { deletedAt: new Date() });
  }

  restoreDeletedIdea(id: string): Idea | undefined {
    return this.updateIdea(id, { deletedAt: null });
  }

  purgeIdea(id: string): boolean {
    const purge = this.db.transaction(() => {
      this.db.prepare('DELETE FROM versions WHERE idea_id = ?').run(id);
      const result = this.db.prepare('DELETE FROM ideas WHERE id = ?').run(id);
      return result.changes > 0;
    });

    return purge();
  }

  listDeletedIdeas(): Idea[] {
    return this.listIdeas({ includeDeleted: true, limit: 500 }).items
      .filter((idea) => idea.deletedAt)
      .sort((a, b) => {
        const aTime = a.deletedAt?.getTime() ?? 0;
        const bTime = b.deletedAt?.getTime() ?? 0;
        return bTime - aTime;
      });
  }

  purgeDeletedBefore(cutoff: Date): number {
    const ids = this.listDeletedIdeas()
      .filter((idea) => idea.deletedAt && idea.deletedAt < cutoff)
      .map((idea) => idea.id);

    for (const id of ids) this.purgeIdea(id);
    return ids.length;
  }

  getSetting<T>(key: string): T | undefined {
    const row = this.db.prepare('SELECT * FROM settings WHERE key = ?').get(key) as SettingRow | undefined;
    if (!row) return undefined;
    return parseJson<T | undefined>(row.value_json, undefined);
  }

  setSetting<T>(key: string, value: T): void {
    this.db.prepare(`
      INSERT INTO settings (key, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `).run(key, JSON.stringify(value), new Date().toISOString());
  }

  deleteSetting(key: string): void {
    this.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  }

  getVersions(ideaId: string): IdeaVersion[] {
    return (this.db.prepare('SELECT * FROM versions WHERE idea_id = ? ORDER BY timestamp DESC').all(ideaId) as VersionRow[])
      .map(versionFromRow);
  }

  createVersion(ideaId: string, label: string, notes = ''): IdeaVersion | undefined {
    const idea = this.getIdea(ideaId, true);
    if (!idea) return undefined;

    const version: IdeaVersion = {
      id: uuid(),
      ideaId,
      versionLabel: label,
      notes,
      timestamp: new Date(),
      snapshot: snapshotFrom(idea),
    };
    this.insertVersion(version);
    return version;
  }

  restoreVersion(ideaId: string, versionId: string): Idea | undefined {
    const restore = this.db.transaction(() => {
      const idea = this.getIdea(ideaId, true);
      const row = this.db.prepare('SELECT * FROM versions WHERE id = ?').get(versionId) as VersionRow | undefined;
      if (!idea || !row) return undefined;

      const version = versionFromRow(row);
      if (version.ideaId !== ideaId) return undefined;

      this.insertVersion({
        id: uuid(),
        ideaId,
        versionLabel: `Before restore to "${version.versionLabel}"`,
        notes: '',
        timestamp: new Date(),
        snapshot: snapshotFrom(idea),
      });

      const restored = newIdea({
        ...idea,
        ...version.snapshot,
        id: idea.id,
        relatedIdeaIds: idea.relatedIdeaIds,
        createdAt: idea.createdAt,
        updatedAt: new Date(),
        deletedAt: idea.deletedAt,
        graduatedTo: idea.graduatedTo,
      });

      this.insertOrReplaceIdea(restored);
      return restored;
    });

    return restore();
  }

  getStats() {
    const ideas = this.listIdeas({ includeDeleted: true, limit: 500 }).items;
    const active = ideas.filter((idea) => !idea.deletedAt);
    const deleted = ideas.filter((idea) => idea.deletedAt);
    const byStage: Record<string, number> = {};
    const byCategory: Record<string, number> = {};

    for (const idea of active) {
      byStage[idea.stage] = (byStage[idea.stage] ?? 0) + 1;
      byCategory[idea.category] = (byCategory[idea.category] ?? 0) + 1;
    }

    return {
      total: active.length,
      byStage,
      byCategory,
      status: {
        active: active.length,
        deleted: deleted.length,
      },
      recentActivity: sortIdeas(active, 'updatedAt', 'desc').slice(0, 10),
    };
  }

  exportArchive(includeDeleted = false) {
    return {
      seedbankVersion: 1,
      exportedAt: new Date().toISOString(),
      ideas: this.listIdeas({ includeDeleted, limit: 500 }).items,
      versions: (this.db.prepare('SELECT * FROM versions ORDER BY timestamp DESC').all() as VersionRow[]).map(versionFromRow),
    };
  }

  importArchive(archive: ImportArchive, mode: 'merge' | 'replace' = 'merge'): ImportResult {
    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      versionsImported: 0,
      warnings: [],
    };

    const runImport = this.db.transaction(() => {
      if (mode === 'replace') {
        this.db.prepare('DELETE FROM versions').run();
        this.db.prepare('DELETE FROM ideas').run();
      }

      for (const rawIdea of archive.ideas ?? []) {
        try {
          const idea = newIdea(rawIdea);
          if (mode === 'merge' && this.getIdea(idea.id, true)) {
            result.skipped += 1;
            continue;
          }
          this.insertOrReplaceIdea(idea);
          result.imported += 1;
        } catch (err) {
          result.warnings.push(err instanceof Error ? err.message : String(err));
        }
      }

      for (const rawVersion of archive.versions ?? []) {
        try {
          if (!rawVersion.ideaId) {
            result.warnings.push('Skipped version without ideaId.');
            continue;
          }
          if (mode === 'merge') {
            const existing = this.db.prepare('SELECT id FROM versions WHERE id = ?').get(rawVersion.id);
            if (existing) continue;
          }
          const idea = this.getIdea(rawVersion.ideaId, true);
          if (!idea) {
            result.warnings.push(`Skipped version ${rawVersion.id ?? '(new)'} for missing idea ${rawVersion.ideaId}.`);
            continue;
          }
          this.insertVersion(normalizeVersion(rawVersion, idea));
          result.versionsImported += 1;
        } catch (err) {
          result.warnings.push(err instanceof Error ? err.message : String(err));
        }
      }
    });

    runImport();
    return result;
  }
}
