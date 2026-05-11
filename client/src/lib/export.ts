/**
 * Export utilities for Seedbank ideas.
 *
 * Supports exporting individual ideas and the full archive
 * to both Markdown and JSON formats.
 */

import type { Idea, IdeaVersion, IdeaLink } from '@/lib/types';
import { CATEGORY_LABELS, STAGE_LABELS, STAGE_ICONS } from '@/lib/types';
import { exportArchive, getAllIdeas } from '@/api/client';
import { db } from '@/db';

// ── Helpers ─────────────────────────────────────────────────────────

/** Trigger a file download in the browser. */
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Slugify a title for use in filenames. */
function slugify(title: string): string {
  return (title || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/** Format a date as YYYY-MM-DD. */
function formatDate(date: Date): string {
  return date instanceof Date ? date.toISOString().split('T')[0] : String(date);
}

/** Format a date as YYYY-MM-DD HH:mm. */
function formatDateTime(date: Date): string {
  if (!(date instanceof Date)) return String(date);
  return date.toISOString().replace('T', ' ').slice(0, 16);
}

/** Render a score as star characters (e.g. "★★★☆☆"). */
function renderScore(score: number, max = 5): string {
  if (score === 0) return 'Unscored';
  return '★'.repeat(score) + '☆'.repeat(max - score);
}

/** Format links as a Markdown list. */
function formatLinks(links: IdeaLink[]): string {
  if (!links.length) return '';
  return links
    .map((l) => `- [${l.label || l.url}](${l.url})`)
    .join('\n');
}

// ── Markdown Export ─────────────────────────────────────────────────

/**
 * Convert a single idea to a formatted Markdown document.
 * Includes YAML-ish front-matter-style metadata and all content fields.
 */
export function ideaToMarkdown(idea: Idea): string {
  const lines: string[] = [];

  // Title
  lines.push(`# ${idea.title || 'Untitled Idea'}`);
  lines.push('');

  // Metadata block
  lines.push(`> **Stage:** ${STAGE_ICONS[idea.stage]} ${STAGE_LABELS[idea.stage]}  `);
  lines.push(`> **Category:** ${CATEGORY_LABELS[idea.category]}  `);
  if (idea.tags.length) {
    lines.push(`> **Tags:** ${idea.tags.join(', ')}  `);
  }
  if (idea.moodLabels.length) {
    lines.push(`> **Mood:** ${idea.moodLabels.join(', ')}  `);
  }
  lines.push(`> **Excitement:** ${renderScore(idea.excitementScore)}  `);
  lines.push(`> **Jam Suitability:** ${renderScore(idea.jamScore)}  `);
  lines.push(`> **Planted:** ${formatDate(idea.createdAt)}  `);
  lines.push(`> **Last tended:** ${formatDate(idea.updatedAt)}`);
  lines.push('');

  // Pitch
  if (idea.pitch) {
    lines.push(`## Pitch`);
    lines.push('');
    lines.push(idea.pitch);
    lines.push('');
  }

  // Full Notes
  if (idea.fullNotes.trim()) {
    lines.push(`## Notes`);
    lines.push('');
    lines.push(idea.fullNotes.trim());
    lines.push('');
  }

  // Hook
  if (idea.hook.trim()) {
    lines.push(`## Hook / 30-Second Demo`);
    lines.push('');
    lines.push(idea.hook.trim());
    lines.push('');
  }

  // Why it might work
  if (idea.whyItMightWork.trim()) {
    lines.push(`## Why It Might Work`);
    lines.push('');
    lines.push(idea.whyItMightWork.trim());
    lines.push('');
  }

  // Risks
  if (idea.risks.trim()) {
    lines.push(`## Risks & Blockers`);
    lines.push('');
    lines.push(idea.risks.trim());
    lines.push('');
  }

  // Tech Stack
  if (idea.techStack.trim()) {
    lines.push(`## Tech Stack`);
    lines.push('');
    lines.push(idea.techStack.trim());
    lines.push('');
  }

  // Links
  if (idea.links.length) {
    lines.push(`## Links & References`);
    lines.push('');
    lines.push(formatLinks(idea.links));
    lines.push('');
  }

  // Footer with ID for re-import. Kept inside the idea section
  // (no leading `---`) so archive splitting on horizontal rules
  // preserves the ID alongside its idea.
  lines.push(`<!-- seedbank-id: ${idea.id} -->`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Export a single idea as a Markdown file download.
 */
export function exportIdeaAsMarkdown(idea: Idea) {
  const md = ideaToMarkdown(idea);
  const filename = `seedbank-${slugify(idea.title)}.md`;
  downloadFile(md, filename, 'text/markdown;charset=utf-8');
}

/**
 * Export a single idea as a JSON file download.
 */
export function exportIdeaAsJSON(idea: Idea) {
  const data = JSON.stringify(idea, null, 2);
  const filename = `seedbank-${slugify(idea.title)}.json`;
  downloadFile(data, filename, 'application/json;charset=utf-8');
}

// ── Archive Export ───────────────────────────────────────────────────

/** Full archive shape for JSON export/import. */
export interface SeedbankArchive {
  /** Format version for forward-compatibility */
  seedbankVersion: 1;
  exportedAt: string;
  ideas: Idea[];
  versions: IdeaVersion[];
}

/**
 * Export the entire archive (all ideas + all versions) as JSON.
 */
export async function exportArchiveAsJSON() {
  try {
    const exported = await exportArchive('json');
    const data = typeof exported === 'string' ? exported : JSON.stringify(exported, null, 2);
    const date = formatDate(new Date());
    downloadFile(data, `seedbank-archive-${date}.json`, 'application/json;charset=utf-8');
    return;
  } catch {
    // Fall back to a browser-cache export when the backend is unavailable.
  }

  const ideas = await getAllIdeas();
  const versions = await db.versions.toArray();
  const archive: SeedbankArchive = {
    seedbankVersion: 1,
    exportedAt: new Date().toISOString(),
    ideas,
    versions,
  };

  const data = JSON.stringify(archive, null, 2);
  const date = formatDate(new Date());
  downloadFile(data, `seedbank-archive-${date}.json`, 'application/json;charset=utf-8');
}

/**
 * Export the entire archive as a single concatenated Markdown file.
 * Each idea is separated by a horizontal rule.
 */
export async function exportArchiveAsMarkdown() {
  try {
    const exported = await exportArchive('markdown');
    if (typeof exported === 'string') {
      const date = formatDate(new Date());
      downloadFile(exported, `seedbank-archive-${date}.md`, 'text/markdown;charset=utf-8');
      return;
    }
  } catch {
    // Fall back to local Markdown generation when the backend is unavailable.
  }

  const ideas = await getAllIdeas();

  // Header has no trailing `---` so it merges with the first idea's
  // section after split-on-`---` import; the first idea's `# Title`
  // wins as the parsed title.
  const header = [
    `# Seedbank Archive`,
    '',
    `> Exported ${formatDateTime(new Date())} · ${ideas.length} idea${ideas.length !== 1 ? 's' : ''}`,
    '',
  ].join('\n');

  const body = ideas.map((idea) => ideaToMarkdown(idea)).join('\n---\n\n');

  const date = formatDate(new Date());
  downloadFile(header + body, `seedbank-archive-${date}.md`, 'text/markdown;charset=utf-8');
}
