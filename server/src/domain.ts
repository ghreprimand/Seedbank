import { v4 as uuid } from 'uuid';
import type {
  Category,
  Idea,
  IdeaLink,
  IdeaSnapshot,
  IdeaVersion,
  Stage,
} from '../../shared/types.js';
import { STAGES } from '../../shared/types.js';

type DateInput = Date | string | null | undefined;

export type IdeaInput = Partial<Omit<Idea, 'createdAt' | 'updatedAt' | 'deletedAt'>> & {
  createdAt?: DateInput;
  updatedAt?: DateInput;
  deletedAt?: DateInput;
};

export type VersionInput = Partial<Omit<IdeaVersion, 'timestamp'>> & {
  timestamp?: DateInput;
};

export function normalizeCategoryId(value: unknown): Category | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isStage(value: unknown): value is Stage {
  return typeof value === 'string' && STAGES.includes(value as Stage);
}

function dateFrom(value: DateInput, fallback = new Date()): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
}

function nullableDateFrom(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  return dateFrom(value);
}

function arrayFrom<T>(value: unknown, fallback: T[] = []): T[] {
  return Array.isArray(value) ? value as T[] : fallback;
}

function numberFrom(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function stringFrom(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function newIdea(partial: IdeaInput = {}): Idea {
  const now = new Date();
  const createdAt = dateFrom(partial.createdAt, now);
  const updatedAt = dateFrom(partial.updatedAt, createdAt);

  return {
    id: typeof partial.id === 'string' && partial.id ? partial.id : uuid(),
    title: stringFrom(partial.title),
    pitch: stringFrom(partial.pitch),
    category: normalizeCategoryId(partial.category) ?? 'app',
    stage: isStage(partial.stage) ? partial.stage : 'seed',
    tags: arrayFrom<string>(partial.tags),
    moodLabels: arrayFrom<string>(partial.moodLabels),
    fullNotes: stringFrom(partial.fullNotes),
    hook: stringFrom(partial.hook),
    whyItMightWork: stringFrom(partial.whyItMightWork),
    risks: stringFrom(partial.risks),
    techStack: stringFrom(partial.techStack),
    aesthetic: stringFrom(partial.aesthetic),
    retrospective: stringFrom(partial.retrospective),
    jamScore: numberFrom(partial.jamScore),
    excitementScore: numberFrom(partial.excitementScore),
    relatedIdeaIds: arrayFrom<string>(partial.relatedIdeaIds),
    links: arrayFrom<IdeaLink>(partial.links),
    images: arrayFrom<string>(partial.images),
    createdAt,
    updatedAt,
    deletedAt: nullableDateFrom(partial.deletedAt),
    graduatedTo: typeof partial.graduatedTo === 'string' ? partial.graduatedTo : null,
  };
}

export function snapshotFrom(idea: Idea): IdeaSnapshot {
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
    links: idea.links.map((link) => ({ ...link })),
    images: [...idea.images],
  };
}

export function hasContentChanged(a: IdeaSnapshot, b: IdeaSnapshot): boolean {
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

  return (
    JSON.stringify(a.tags) !== JSON.stringify(b.tags) ||
    JSON.stringify(a.moodLabels) !== JSON.stringify(b.moodLabels) ||
    JSON.stringify(a.links) !== JSON.stringify(b.links) ||
    JSON.stringify(a.images) !== JSON.stringify(b.images)
  );
}

export function autoVersionLabel(prev: IdeaSnapshot, next: IdeaSnapshot): string {
  if (prev.stage !== next.stage) return `Stage -> ${next.stage}`;
  if (prev.title !== next.title) return 'Title updated';
  if (prev.pitch !== next.pitch) return 'Pitch revised';
  if (prev.fullNotes.trim() !== next.fullNotes.trim()) return 'Notes edited';
  if (prev.category !== next.category) return `Category -> ${next.category}`;
  return 'Updated';
}

export function mergeIdea(existing: Idea, changes: IdeaInput): Idea {
  return newIdea({
    ...existing,
    ...changes,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date(),
  });
}

export function normalizeVersion(input: VersionInput, idea: Idea): IdeaVersion {
  return {
    id: typeof input.id === 'string' && input.id ? input.id : uuid(),
    ideaId: typeof input.ideaId === 'string' && input.ideaId ? input.ideaId : idea.id,
    versionLabel: typeof input.versionLabel === 'string' ? input.versionLabel : 'Imported',
    notes: typeof input.notes === 'string' ? input.notes : '',
    timestamp: dateFrom(input.timestamp),
    snapshot: input.snapshot ?? snapshotFrom(idea),
  };
}
