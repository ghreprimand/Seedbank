import type { Idea } from '../../shared/types.js';
import type { IdeaInput } from './domain.js';
import type { Category, IdeaLink, Stage } from '../../shared/types.js';
import { CATEGORIES, CATEGORY_LABELS, STAGES, STAGE_LABELS } from '../../shared/types.js';

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0] ?? date.toISOString();
}

function labelFor<T extends string>(labels: Record<T, string>, value: T): string {
  return labels[value] ?? value;
}

function linksToMarkdown(links: IdeaLink[]): string {
  return links.map((link) => `- [${link.label || link.url}](${link.url})`).join('\n');
}

export function ideaToMarkdown(idea: Idea): string {
  const lines: string[] = [
    `# ${idea.title || 'Untitled Idea'}`,
    '',
    `> **Stage:** ${labelFor(STAGE_LABELS, idea.stage)}`,
    `> **Category:** ${labelFor(CATEGORY_LABELS, idea.category)}`,
  ];

  if (idea.tags.length) lines.push(`> **Tags:** ${idea.tags.join(', ')}`);
  if (idea.moodLabels.length) lines.push(`> **Mood:** ${idea.moodLabels.join(', ')}`);
  lines.push(`> **Excitement:** ${idea.excitementScore}`);
  lines.push(`> **Jam Suitability:** ${idea.jamScore}`);
  lines.push(`> **Planted:** ${formatDate(idea.createdAt)}`);
  lines.push(`> **Last tended:** ${formatDate(idea.updatedAt)}`);
  lines.push('');

  const sections: Array<[string, string]> = [
    ['Pitch', idea.pitch],
    ['Notes', idea.fullNotes],
    ['Hook / 30-Second Demo', idea.hook],
    ['Why It Might Work', idea.whyItMightWork],
    ['Risks & Blockers', idea.risks],
    ['Tech Stack', idea.techStack],
    ['Links & References', linksToMarkdown(idea.links)],
  ];

  for (const [heading, body] of sections) {
    if (!body.trim()) continue;
    lines.push(`## ${heading}`, '', body.trim(), '');
  }

  lines.push(`<!-- seedbank-id: ${idea.id} -->`, '');
  return lines.join('\n');
}

export function archiveToMarkdown(ideas: Idea[]): string {
  const header = [
    '# Seedbank Archive',
    '',
    `> Exported ${new Date().toISOString()} - ${ideas.length} ideas`,
    '',
  ].join('\n');

  return header + ideas.map(ideaToMarkdown).join('\n---\n\n');
}

function parseStage(value: string): Stage | undefined {
  const normalized = value.toLowerCase().replace(/^[^a-z]+/, '').trim().replace(/\s+/g, '-');
  return STAGES.find((stage) => stage === normalized || stage.replace('-', '') === normalized.replace('-', ''));
}

function parseCategory(value: string): Category | undefined {
  const normalized = value.toLowerCase().replace(/\s+/g, '-');
  return CATEGORIES.find((category) => category === normalized || CATEGORY_LABELS[category].toLowerCase().replace(/\s+/g, '-') === normalized);
}

function sectionName(line: string): string | undefined {
  const match = line.match(/^##\s+(.+)$/);
  return match?.[1]?.trim().toLowerCase();
}

export function parseMarkdownIdea(markdown: string): IdeaInput {
  const idea: IdeaInput = {
    tags: [],
    moodLabels: [],
    links: [],
    images: [],
    relatedIdeaIds: [],
  };
  const sections: Record<string, string[]> = {};
  let current = '';

  for (const line of markdown.split('\n')) {
    const idMatch = line.match(/<!--\s*seedbank-id:\s*([^\s]+)\s*-->/);
    if (idMatch?.[1]) {
      idea.id = idMatch[1];
      continue;
    }

    const titleMatch = line.match(/^#\s+(.+)$/);
    if (titleMatch?.[1] && titleMatch[1].trim().toLowerCase() !== 'seedbank archive') {
      idea.title = titleMatch[1].trim();
      current = '';
      continue;
    }

    const nextSection = sectionName(line);
    if (nextSection) {
      current = nextSection;
      sections[current] = [];
      continue;
    }

    const metaMatch = line.match(/^>\s+\*\*(.+?):\*\*\s*(.+)$/);
    if (metaMatch?.[1] && metaMatch[2]) {
      const key = metaMatch[1].trim().toLowerCase();
      const value = metaMatch[2].trim();
      if (key === 'stage') idea.stage = parseStage(value);
      if (key === 'category') idea.category = parseCategory(value);
      if (key === 'tags') idea.tags = value.split(',').map((tag) => tag.trim()).filter(Boolean);
      if (key === 'mood') idea.moodLabels = value.split(',').map((tag) => tag.trim()).filter(Boolean);
      continue;
    }

    if (current) sections[current]?.push(line);
  }

  idea.pitch = sections.pitch?.join('\n').trim() ?? idea.pitch;
  idea.fullNotes = sections.notes?.join('\n').trim() ?? idea.fullNotes;
  idea.hook = sections['hook / 30-second demo']?.join('\n').trim() ?? idea.hook;
  idea.whyItMightWork = sections['why it might work']?.join('\n').trim() ?? idea.whyItMightWork;
  idea.risks = sections['risks & blockers']?.join('\n').trim() ?? idea.risks;
  idea.techStack = sections['tech stack']?.join('\n').trim() ?? idea.techStack;

  const linkLines = sections['links & references'] ?? [];
  idea.links = linkLines.flatMap((line) => {
    const match = line.match(/^-\s+\[([^\]]*)\]\(([^)]+)\)/);
    return match?.[2] ? [{ label: match[1] || match[2], url: match[2] }] : [];
  });

  return idea;
}

export function parseMarkdownArchive(markdown: string): IdeaInput[] {
  return markdown
    .split(/\n---\n/g)
    .map((section) => parseMarkdownIdea(section))
    .filter((idea) => Boolean(idea.title || idea.pitch || idea.fullNotes));
}
