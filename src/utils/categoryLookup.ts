/**
 * Shared helpers for resolving YNAB category groups and categories by id or
 * name. Name matching is case-insensitive: exact match first, then partial
 * (substring) match — mirroring the behavior already used by
 * SetCategoryGoalsTool. Deleted groups/categories are ignored.
 */
import * as ynab from "ynab";

export interface ResolvedCategory {
  category: ynab.Category;
  group: ynab.CategoryGroupWithCategories;
}

/**
 * Resolve a category group by id (exact) or name (exact, then partial).
 * @returns the matching group, or null if none matches.
 */
export function findCategoryGroup(
  groups: ynab.CategoryGroupWithCategories[],
  opts: { id?: string; name?: string }
): ynab.CategoryGroupWithCategories | null {
  const active = groups.filter((g) => !g.deleted);

  if (opts.id) {
    return active.find((g) => g.id === opts.id) ?? null;
  }

  if (opts.name) {
    const q = opts.name.toLowerCase();
    return (
      active.find((g) => g.name.toLowerCase() === q) ??
      active.find((g) => g.name.toLowerCase().includes(q)) ??
      null
    );
  }

  return null;
}

/**
 * Resolve a category by id (exact) or name (exact, then partial) across all
 * non-deleted groups.
 * @returns the category with its containing group, or null if none matches.
 */
export function findCategory(
  groups: ynab.CategoryGroupWithCategories[],
  opts: { id?: string; name?: string }
): ResolvedCategory | null {
  const pairs: ResolvedCategory[] = [];
  for (const group of groups) {
    if (group.deleted) continue;
    for (const category of group.categories) {
      if (category.deleted) continue;
      pairs.push({ category, group });
    }
  }

  if (opts.id) {
    return pairs.find((p) => p.category.id === opts.id) ?? null;
  }

  if (opts.name) {
    const q = opts.name.toLowerCase();
    return (
      pairs.find((p) => p.category.name.toLowerCase() === q) ??
      pairs.find((p) => p.category.name.toLowerCase().includes(q)) ??
      null
    );
  }

  return null;
}
