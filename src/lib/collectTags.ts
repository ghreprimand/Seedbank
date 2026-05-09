/** Collect and de-duplicate tags from a list of tag-bearing items. */

/** Returns the unique, alphabetically sorted set of tags across the given items. */
export function collectTags(items: { tags: string[] }[]): string[] {
  const tagSet = new Set<string>();
  for (const item of items) {
    for (const t of item.tags) tagSet.add(t);
  }
  return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
}
