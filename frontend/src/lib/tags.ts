/**
 * Local per-list tag filtering helpers (ui-ux-design.md §9.2). Filtering is
 * always AND — an active filter row of "#raku #blue" narrows to rows carrying
 * *both* — and is computed client-side over whatever the list already holds (no
 * global cross-entity tag browser in V1).
 */

/** True if `tags` contains every tag in `filter` (an empty filter matches all). */
export function matchesTags(tags: string[] | undefined, filter: string[]): boolean {
  if (filter.length === 0) return true
  const have = tags ?? []
  return filter.every((t) => have.includes(t))
}

/** Distinct, sorted tags across a set of rows — the options a filter bar offers. */
export function collectTags(rows: Array<{ tags?: string[] }>): string[] {
  const set = new Set<string>()
  for (const row of rows) for (const tag of row.tags ?? []) set.add(tag)
  return [...set].sort()
}
