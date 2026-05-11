/**
 * Import utilities for Seedbank ideas.
 *
 * Supports importing from:
 *   - Seedbank JSON archive (full restore or merge)
 *   - Markdown files (parse heading structure into idea fields)
 *   - Inline seed data (from README pitch documents)
 */

import { v4 as uuid } from 'uuid';
import { db } from '@/db';
import { createIdea, importArchive } from '@/api/client';
import type { Idea, IdeaVersion, Category, IdeaLink } from '@/lib/types';
import { CATEGORIES, STAGES } from '@/lib/types';
import type { SeedbankArchive } from '@/lib/export';

// ── Types ───────────────────────────────────────────────────────────

export interface ImportResult {
  /** Number of ideas successfully imported */
  imported: number;
  /** Number of ideas skipped (e.g. duplicates in merge mode) */
  skipped: number;
  /** Number of versions imported */
  versionsImported: number;
  /** Any warnings or issues encountered */
  warnings: string[];
}

export type ImportMode = 'merge' | 'replace';

// ── File reading helper ─────────────────────────────────────────────

/** Read a File object as text. */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsText(file);
  });
}

// ── JSON Import ─────────────────────────────────────────────────────

/**
 * Validate and parse a Seedbank JSON archive.
 * Returns the parsed archive or throws with a descriptive error.
 */
function parseArchiveJSON(text: string): SeedbankArchive {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON file. Could not parse the file contents.');
  }

  const data = parsed as Record<string, unknown>;

  // Could be a single idea (direct Idea JSON export)
  if (data.id && data.title !== undefined && data.stage && data.category) {
    // Wrap single idea into an archive shape
    return {
      seedbankVersion: 1,
      exportedAt: new Date().toISOString(),
      ideas: [data as unknown as Idea],
      versions: [],
    };
  }

  // Full archive format
  if (!data.ideas || !Array.isArray(data.ideas)) {
    throw new Error(
      'Unrecognized JSON format. Expected a Seedbank archive with an "ideas" array, ' +
      'or a single idea object with "id", "title", "stage", and "category" fields.'
    );
  }

  return {
    seedbankVersion: 1,
    exportedAt: (data.exportedAt as string) ?? new Date().toISOString(),
    ideas: data.ideas as Idea[],
    versions: (data.versions as IdeaVersion[]) ?? [],
  };
}

/**
 * Hydrate date fields from ISO strings (JSON parse produces strings, not Date objects).
 */
function hydrateIdeaDates(idea: Idea): Idea {
  return {
    ...idea,
    createdAt: new Date(idea.createdAt),
    updatedAt: new Date(idea.updatedAt),
  };
}

function hydrateVersionDates(version: IdeaVersion): IdeaVersion {
  return {
    ...version,
    timestamp: new Date(version.timestamp),
  };
}

/**
 * Import ideas from a Seedbank JSON file.
 *
 * @param text  Raw JSON string contents
 * @param mode  'merge' = skip existing IDs, add new ones.
 *              'replace' = clear all data first, then import everything.
 */
export async function importFromJSON(
  text: string,
  mode: ImportMode = 'merge',
): Promise<ImportResult> {
  const archive = parseArchiveJSON(text);
  const result: ImportResult = {
    imported: 0,
    skipped: 0,
    versionsImported: 0,
    warnings: [],
  };

  try {
    await importArchive(archive, mode);
    return {
      imported: archive.ideas.length,
      skipped: 0,
      versionsImported: archive.versions.length,
      warnings: [],
    };
  } catch {
    // Fall back to IndexedDB import when the backend is unavailable.
  }

  if (mode === 'replace') {
    // Clear all existing data
    await db.transaction('rw', db.ideas, db.versions, async () => {
      await db.ideas.clear();
      await db.versions.clear();
    });
  }

  // Import ideas
  for (const rawIdea of archive.ideas) {
    try {
      const idea = hydrateIdeaDates(rawIdea);

      if (mode === 'merge') {
        const existing = await db.ideas.get(idea.id);
        if (existing) {
          result.skipped++;
          continue;
        }
      }

      await db.ideas.put(idea);
      result.imported++;
    } catch (err) {
      result.warnings.push(
        `Failed to import idea "${rawIdea.title || rawIdea.id}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Import versions
  for (const rawVersion of archive.versions) {
    try {
      const version = hydrateVersionDates(rawVersion);

      if (mode === 'merge') {
        const existing = await db.versions.get(version.id);
        if (existing) continue;
      }

      await db.versions.put(version);
      result.versionsImported++;
    } catch (err) {
      result.warnings.push(
        `Failed to import version ${rawVersion.id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return result;
}

// ── Markdown Import ─────────────────────────────────────────────────

/**
 * Parse a Markdown document into idea fields.
 *
 * Recognizes this structure:
 *   # Title
 *   > **Stage:** 🌱 Seed
 *   > **Category:** Game
 *   > **Tags:** tag1, tag2
 *   > **Mood:** cozy, chaotic
 *   ## Pitch
 *   One-line pitch text
 *   ## Notes
 *   Full notes...
 *   ## Hook / 30-Second Demo
 *   ...
 *   ## Why It Might Work
 *   ...
 *   ## Risks & Blockers
 *   ...
 *   ## Tech Stack
 *   ...
 *   ## Links & References
 *   - [label](url)
 *   <!-- seedbank-id: uuid -->
 */
export function parseMarkdownIdea(markdown: string): Partial<Idea> {
  const lines = markdown.split('\n');
  const idea: Partial<Idea> = {
    tags: [],
    moodLabels: [],
    links: [],
    images: [],
    relatedIdeaIds: [],
  };

  let currentSection = '';
  const sectionContent: Record<string, string[]> = {};

  for (const line of lines) {
    // Extract seedbank ID from HTML comment
    const idMatch = line.match(/<!--\s*seedbank-id:\s*([^\s]+)\s*-->/);
    if (idMatch) {
      idea.id = idMatch[1];
      continue;
    }

    // H1 = title
    const h1Match = line.match(/^#\s+(.+)$/);
    if (h1Match) {
      idea.title = h1Match[1].trim();
      currentSection = '';
      continue;
    }

    // H2 = section header
    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      currentSection = h2Match[1].trim().toLowerCase();
      sectionContent[currentSection] = [];
      continue;
    }

    // Metadata in blockquotes
    const metaMatch = line.match(/^>\s+\*\*(.+?):\*\*\s*(.+)$/);
    if (metaMatch) {
      const key = metaMatch[1].trim().toLowerCase();
      const value = metaMatch[2].trim().replace(/\s{2,}$/, '');

      switch (key) {
        case 'stage': {
          // Strip emoji prefix and match to stage
          const stageText = value.replace(/^[^\w]+/, '').trim().toLowerCase().replace(/\s+/g, '-');
          const matched = STAGES.find(
            (s) => s === stageText || s.replace('-', '') === stageText.replace('-', '')
          );
          if (matched) idea.stage = matched;
          break;
        }
        case 'category': {
          const catText = value.toLowerCase().replace(/\s+/g, '-');
          const matched = CATEGORIES.find(
            (c) => c === catText || CATEGORIES.includes(catText as Category)
          );
          if (matched) idea.category = matched as Category;
          break;
        }
        case 'tags':
          idea.tags = value.split(',').map((t) => t.trim()).filter(Boolean);
          break;
        case 'mood':
          idea.moodLabels = value.split(',').map((t) => t.trim()).filter(Boolean);
          break;
        case 'excitement': {
          const stars = (value.match(/★/g) || []).length;
          if (stars > 0) idea.excitementScore = stars;
          break;
        }
        case 'jam suitability': {
          const stars = (value.match(/★/g) || []).length;
          if (stars > 0) idea.jamScore = stars;
          break;
        }
      }
      continue;
    }

    // Accumulate section content
    if (currentSection && sectionContent[currentSection]) {
      sectionContent[currentSection].push(line);
    }
  }

  // Map sections to idea fields
  const getSection = (key: string): string =>
    (sectionContent[key] || []).join('\n').trim();

  if (sectionContent['pitch']) {
    idea.pitch = getSection('pitch');
  }
  if (sectionContent['notes'] || sectionContent['full notes']) {
    idea.fullNotes = getSection('notes') || getSection('full notes');
  }
  if (sectionContent['hook / 30-second demo'] || sectionContent['hook']) {
    idea.hook = getSection('hook / 30-second demo') || getSection('hook');
  }
  if (sectionContent['why it might work']) {
    idea.whyItMightWork = getSection('why it might work');
  }
  if (sectionContent['risks & blockers'] || sectionContent['risks']) {
    idea.risks = getSection('risks & blockers') || getSection('risks');
  }
  if (sectionContent['tech stack'] || sectionContent['tech stack notes']) {
    idea.techStack = getSection('tech stack') || getSection('tech stack notes');
  }

  // Parse links from the links section
  const linksSection = sectionContent['links & references'] || sectionContent['links'];
  if (linksSection) {
    const parsedLinks: IdeaLink[] = [];
    for (const linkLine of linksSection) {
      const linkMatch = linkLine.match(/^\s*-\s+\[([^\]]*)\]\(([^)]+)\)/);
      if (linkMatch) {
        parsedLinks.push({ label: linkMatch[1], url: linkMatch[2] });
      }
    }
    if (parsedLinks.length) idea.links = parsedLinks;
  }

  return idea;
}

/**
 * Import ideas from one or more Markdown files.
 *
 * Each file is parsed as a single idea. If the file contains
 * multiple ideas separated by `---`, each section is parsed separately.
 */
export async function importFromMarkdown(texts: string[]): Promise<ImportResult> {
  const result: ImportResult = {
    imported: 0,
    skipped: 0,
    versionsImported: 0,
    warnings: [],
  };

  for (const text of texts) {
    // Split on horizontal rules that separate multiple ideas
    const sections = text
      .split(/\n---\n/)
      .filter((s) => s.trim() && s.includes('# '));

    for (const section of sections) {
      try {
        const partial = parseMarkdownIdea(section);

        if (!partial.title) {
          result.warnings.push('Skipped a section with no title.');
          result.skipped++;
          continue;
        }

        // If the idea has a seedbank-id, check if it already exists
        if (partial.id) {
          const existing = await db.ideas.get(partial.id);
          if (existing) {
            result.skipped++;
            continue;
          }
        }

        await createIdea({
          ...partial,
          id: partial.id || uuid(),
        });
        result.imported++;
      } catch (err) {
        result.warnings.push(
          `Failed to parse Markdown section: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  return result;
}

// ── Seed Data ───────────────────────────────────────────────────────

/**
 * Seed ideas — project concepts extracted from the Seedbank README.
 * These represent the "existing pitch documents" mentioned in the build plan.
 * They populate the garden with real example ideas when the user first opens the app.
 */
const SEED_IDEAS: Array<Partial<Idea>> = [
  {
    title: 'Daily Seed',
    pitch: 'Resurface one forgotten idea each day with a prompt to develop it further.',
    category: 'tool',
    stage: 'sprout',
    tags: ['rediscovery', 'prompts', 'daily-habit'],
    moodLabels: ['reflective', 'encouraging'],
    fullNotes:
      'On app open (or via a button), surface one random idea from the archive ' +
      'with a prompt like "add one reason this might work." The goal is to make ' +
      'returning to old ideas feel rewarding rather than overwhelming.',
    hook: 'Open the app → see a forgotten idea → add one thought → move on.',
    whyItMightWork:
      'Most idea archives die because nobody revisits them. A daily nudge keeps ' +
      'the archive alive without requiring a full review session.',
    risks: 'Could feel nagging if the prompt is too aggressive. Needs gentle framing.',
    techStack: 'Random selection from IndexedDB, simple UI overlay or dedicated panel.',
    excitementScore: 4,
    jamScore: 3,
  },
  {
    title: 'Cross-Pollinate',
    pitch: 'Pick two random ideas and ask what hybrid could exist between them.',
    category: 'tool',
    stage: 'seed',
    tags: ['creativity', 'recombination', 'random'],
    moodLabels: ['playful', 'experimental'],
    fullNotes:
      'A discovery feature that picks two random ideas from the archive and ' +
      'displays them side-by-side with a prompt: "What hybrid could exist?" ' +
      'This is about serendipity — finding unexpected connections between unrelated concepts.',
    hook: 'Two random ideas appear side-by-side. What if they merged?',
    whyItMightWork:
      'Combinatorial creativity is real — many good ideas come from mashing ' +
      'two existing concepts together. This makes that process effortless.',
    risks: 'Only useful with a decent-sized archive. Might feel gimmicky with < 10 ideas.',
    techStack: 'Two random DB reads, side-by-side card layout, optional "save hybrid" action.',
    excitementScore: 4,
    jamScore: 2,
  },
  {
    title: 'Idea Weather',
    pitch: 'Show patterns and statistics across your idea archive.',
    category: 'tool',
    stage: 'seed',
    tags: ['analytics', 'self-reflection', 'patterns'],
    moodLabels: ['introspective', 'calm'],
    fullNotes:
      'A stats panel that surfaces patterns in the archive: "You have X seeds, ' +
      'Y sprouts, Z shipped" plus insights like "Most ideas tagged with: ___" or ' +
      '"You keep returning to local-first tools." Think personal analytics for creativity.',
    hook: 'A weather report for your creative brain.',
    whyItMightWork:
      'People enjoy seeing patterns in their own behavior. This turns the archive ' +
      'into a mirror for creative tendencies.',
    risks: 'Could be overwhelming or depressing ("you have 50 seeds and 0 shipped"). Needs positive framing.',
    techStack: 'Aggregation queries on IndexedDB, simple chart or stat-card components.',
    excitementScore: 3,
    jamScore: 2,
  },
  {
    title: 'Pitch Pressure',
    pitch: 'Turn a messy note into a structured pitch with guided prompts.',
    category: 'tool',
    stage: 'seed',
    tags: ['writing', 'prompts', 'structure'],
    moodLabels: ['focused', 'productive'],
    fullNotes:
      'A guided flow that takes a rough idea and walks you through: ' +
      '(1) write a one-line pitch, (2) describe the 30-second hook, ' +
      '(3) outline a build plan. Turns stream-of-consciousness into structure.',
    hook: 'From messy note → clear pitch in three steps.',
    whyItMightWork:
      'The blank-page problem is real. Guided prompts lower the barrier ' +
      'to developing raw ideas into something presentable.',
    risks: 'Could feel too rigid or formulaic. Needs to feel like guidance, not a template.',
    techStack: 'Multi-step form/wizard UI, saves progress to the idea record.',
    excitementScore: 3,
    jamScore: 3,
  },
  {
    title: 'Shelf Without Shame',
    pitch: 'Make archiving an idea feel like preservation, not failure.',
    category: 'app',
    stage: 'sprout',
    tags: ['ux', 'emotional-design', 'archival'],
    moodLabels: ['gentle', 'warm'],
    fullNotes:
      'The language around shelving/archiving ideas matters. "Cold storage" should feel like ' +
      '"safely preserved for later" not "abandoned." The UI should celebrate that the idea existed ' +
      'and is being kept. Maybe a small animation or message: "Tucked away safely. It\'ll be here when you need it."',
    hook: 'Shelve an idea → warm confirmation → it stays searchable and retrievable.',
    whyItMightWork:
      'Idea guilt is real — people feel bad about abandoning projects. Reframing ' +
      'archival as preservation removes friction from the cleanup process.',
    risks: 'Could be seen as patronizing. The gentleness needs to feel authentic.',
    techStack: 'UX copy, micro-interaction animations, stage transition UI.',
    excitementScore: 3,
    jamScore: 2,
  },
];

/**
 * Check if the database has been seeded already.
 * We consider it seeded if there are any ideas at all.
 */
export async function isDatabaseSeeded(): Promise<boolean> {
  const count = await db.ideas.count();
  return count > 0;
}

/**
 * Seed the database with initial ideas derived from the README pitch documents.
 * Only runs if the database is empty (first-time use).
 *
 * @returns Number of ideas seeded, or 0 if already seeded.
 */
export async function seedDatabase(): Promise<number> {
  const alreadySeeded = await isDatabaseSeeded();
  if (alreadySeeded) return 0;

  let count = 0;
  for (const seed of SEED_IDEAS) {
    await createIdea(seed);
    count++;
  }
  return count;
}
