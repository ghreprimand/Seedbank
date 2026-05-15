import type { Idea, IdeaLink } from './types.js';

export function isGitHubIdeaLink(link: IdeaLink): boolean {
  const label = link.label.trim().toLowerCase();
  const url = link.url.trim().toLowerCase();
  return label === 'github' || url.includes('github.com/');
}

export function duplicateIdeaPayload(original: Idea, id: string, now: Date): Idea {
  return {
    ...original,
    id,
    title: `Copy of ${original.title}`,
    links: original.links.filter((link) => !isGitHubIdeaLink(link)),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    graduatedTo: null,
  };
}
