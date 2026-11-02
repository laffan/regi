// Calories: macros, and saying where every number came from.

import type { FoodSource, Macros, MealItem } from './types';

export const MACROS = [
  { key: 'protein_g', label: 'Protein', short: 'P', className: 'macro-protein', kcalPerGram: 4 },
  { key: 'carbs_g', label: 'Carbs', short: 'C', className: 'macro-carbs', kcalPerGram: 4 },
  { key: 'fiber_g', label: 'Fiber', short: 'Fib', className: 'macro-fiber', kcalPerGram: 2 },
  { key: 'fat_g', label: 'Fat', short: 'F', className: 'macro-fat', kcalPerGram: 9 },
] as const;

export type MacroKey = (typeof MACROS)[number]['key'];

export interface MacroTotals {
  grams: Record<MacroKey, number>;
  /** Items carrying at least one macro value, of all items. */
  known: number;
  of: number;
}

export function sumMacros(items: Partial<Macros>[]): MacroTotals {
  const grams = { protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 };
  let known = 0;
  for (const item of items) {
    let any = false;
    for (const { key } of MACROS) {
      const v = item[key];
      if (v != null && Number.isFinite(Number(v))) {
        grams[key] += Number(v);
        any = true;
      }
    }
    if (any) known++;
  }
  return { grams, known, of: items.length };
}

/**
 * Energy per macro, for drawing the macro bar on the calorie bar's scale.
 * Carbohydrate on labels includes fibre, so the carbs segment is net of it
 * and fibre is drawn at its own, lower energy (≈2 kcal/g) — otherwise the
 * fibre would be counted twice.
 */
export function macroEnergy(grams: Record<MacroKey, number>): Record<MacroKey, number> {
  const fiber = grams.fiber_g;
  return {
    protein_g: grams.protein_g * 4,
    carbs_g: Math.max(grams.carbs_g - fiber, 0) * 4,
    fiber_g: fiber * 2,
    fat_g: grams.fat_g * 9,
  };
}

// ── provenance ──────────────────────────────────────────────────────────────

export const SOURCE_LABEL: Record<FoodSource, string> = {
  usda: 'USDA',
  off: 'Open Food Facts',
  openai: 'OpenAI estimate',
  manual: 'Set by hand',
  saved: 'Saved meal',
};

export const SOURCE_SHORT: Record<FoodSource, string> = {
  usda: 'USDA',
  off: 'OFF',
  openai: 'AI est.',
  manual: 'by hand',
  saved: 'saved',
};

/** The record behind a number, where there is one to open. */
export function sourceLink(item: Pick<MealItem, 'match_source' | 'match_ref'>): string | null {
  if (!item.match_ref) return null;
  if (item.match_source === 'usda') return `https://fdc.nal.usda.gov/food-details/${encodeURIComponent(item.match_ref)}/nutrients`;
  if (item.match_source === 'off') return `https://world.openfoodfacts.org/product/${encodeURIComponent(item.match_ref)}`;
  return null;
}

/** One line saying where an item's number came from, for a title or a caption. */
export function provenance(item: MealItem): string {
  const parts = [SOURCE_LABEL[item.match_source] ?? item.match_source];
  if (item.match_source === 'usda' && item.match_ref) parts[0] += ` #${item.match_ref}`;
  if (item.match_source === 'openai' && item.match_ref) parts[0] += ` (${item.match_ref})`;
  if (item.matched_name) parts.push(`matched “${item.matched_name}”`);
  if (item.basis) parts.push(item.basis);
  return parts.join(' · ');
}

const PORTION_NOTE: Record<string, string> = {
  stated: 'as stated',
  database: 'measured portion',
  estimate: 'estimated',
  assumed: 'assumed',
};

/** "245 g · measured portion", "≈ 30 g · estimated" — the weight and how sure it is. */
export function portionWeight(item: Pick<MealItem, 'grams' | 'portion_source'>): { text: string; note: string; sure: boolean } | null {
  if (item.grams == null) return null;
  const sure = item.portion_source === 'stated' || item.portion_source === 'database';
  const g = item.grams >= 10 ? Math.round(item.grams) : Math.round(item.grams * 10) / 10;
  return {
    text: `${sure ? '' : '≈ '}${g} g`,
    note: PORTION_NOTE[item.portion_source ?? ''] ?? '',
    sure,
  };
}

/** "USDA ×2 · OFF ×1" — a meal's sources at a glance. */
export function sourceSummary(items: MealItem[]): { source: FoodSource; count: number }[] {
  const counts = new Map<FoodSource, number>();
  for (const item of items) counts.set(item.match_source, (counts.get(item.match_source) ?? 0) + 1);
  return [...counts.entries()].map(([source, count]) => ({ source, count }));
}

/**
 * Editing a priced number makes it the person's, and the item says so —
 * keeping what it was before, so the history of the figure is not lost.
 */
export function markEdited(before: MealItem, after: MealItem): MealItem {
  if (before.match_source === 'manual') return after;
  const was = `${SOURCE_LABEL[before.match_source]}${before.match_ref ? ` ${before.match_ref}` : ''}: ${
    before.kcal ?? '—'
  } kcal`;
  return { ...after, match_source: 'manual', basis: `edited by hand (was ${was})` };
}
