// Portions and pricing, without the network.
//
//   deno test app/supabase/functions/_shared/portion_test.ts
//   node app/scripts/test-functions.mjs          (no Deno needed)
//
// USDA, Open Food Facts and OpenAI are replaced by a fake fetch holding a few
// foods. Their numbers are fixtures shaped like the real responses — close to
// the real values, but not to be quoted as nutrition data.

import { fallbackParse, type ParseContext } from './parse.ts';
import { parsePortion, resolveGrams } from './portion.ts';
import { priceItems, type ItemIn, type LookupSource } from './food.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function near(actual: number | null | undefined, expected: number, tol: number, what: string) {
  assert(actual != null && Math.abs(actual - expected) <= tol, `${what}: expected ≈${expected}, got ${actual}`);
}

// ── fixtures ────────────────────────────────────────────────────────────────

// USDA lookups skip themselves without a key; OpenAI must stay off.
Deno.env.set('USDA_FDC_API_KEY', 'test');
Deno.env.delete('OPENAI_API_KEY');

const usda = (description: string, kcal: number, p: number, c: number, f: number, fib: number, measures: [string, number][]) => ({
  fdcId: Math.abs([...description].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7)),
  description,
  dataType: 'Survey (FNDDS)',
  foodNutrients: [
    { nutrientId: 1008, unitName: 'KCAL', value: kcal },
    { nutrientId: 1003, unitName: 'G', value: p },
    { nutrientId: 1005, unitName: 'G', value: c },
    { nutrientId: 1004, unitName: 'G', value: f },
    { nutrientId: 1079, unitName: 'G', value: fib },
  ],
  foodMeasures: measures.map(([text, grams], rank) => ({ disseminationText: text, gramWeight: grams, rank })),
});

const USDA: Record<string, unknown> = {
  yogurt: usda('Yogurt, plain, whole milk', 61, 3.5, 4.7, 3.3, 0, [['1 cup (8 fl oz)', 245], ['1 container (6 oz)', 170]]),
  granola: usda('Granola, homemade', 471, 13.7, 53.9, 24.3, 8.8, [['1 cup', 122], ['Quantity not specified', 61]]),
  'ice cream': usda('Ice cream, regular, vanilla', 207, 3.5, 23.6, 11, 0.7, [['1 cup', 132], ['1 individual cup (3.5 fl oz)', 58]]),
  'chocolate sauce': usda('Chocolate syrup', 279, 2.1, 65.1, 1.1, 2.6, [['1 tablespoon', 19], ['1 cup', 300]]),
  banana: usda('Banana, raw', 89, 1.1, 22.8, 0.3, 2.6, [['1 small (6" to 6-7/8" long)', 101], ['1 medium (7" to 7-7/8" long)', 118], ['1 cup, sliced', 150]]),
  'corn flakes': usda('Corn flakes cereal', 357, 7.5, 84.1, 0.4, 3.3, [['1 cup', 28]]),
};

const OFF = {
  'red bull': {
    code: '9002490100070',
    product_name: 'Red Bull Energy Drink',
    brands: 'Red Bull',
    serving_size: '250 ml',
    serving_quantity: 250,
    nutriments: { 'energy-kcal_100g': 46, proteins_100g: 0, carbohydrates_100g: 11, fat_100g: 0 },
  },
};

const calls: string[] = [];

function key(q: string): string | undefined {
  const s = q.toLowerCase();
  return Object.keys(USDA).find((k) => s.includes(k)) ?? Object.keys(OFF).find((k) => s.includes(k));
}

globalThis.fetch = (async (input: string | URL) => {
  const url = new URL(String(input));
  if (url.host === 'api.nal.usda.gov') {
    const q = url.searchParams.get('query') ?? '';
    calls.push(`usda:${q}:${url.searchParams.get('dataType')}`);
    const k = key(q);
    return new Response(JSON.stringify({ foods: k && USDA[k] ? [USDA[k]] : [] }));
  }
  if (url.host === 'world.openfoodfacts.org') {
    const q = url.searchParams.get('search_terms') ?? '';
    calls.push(`off:${q}`);
    const k = key(q) as keyof typeof OFF | undefined;
    return new Response(JSON.stringify({ products: k && OFF[k] ? [OFF[k]] : [] }));
  }
  throw new Error(`unexpected fetch ${url}`);
}) as typeof fetch;

// A cache that never has anything and accepts everything.
const chain: any = new Proxy(() => chain, {
  get: (_t, prop) => (prop === 'then' ? undefined : prop === 'maybeSingle' ? async () => ({ data: null }) : chain),
  apply: () => chain,
});
const db = { from: () => chain } as never;

const ORDER: LookupSource[] = ['usda', 'off'];

const ctx: ParseContext = {
  activeModules: ['calories'],
  weightUnit: 'lb',
  distanceUnit: 'mi',
  currentBook: null,
  savedMeals: [],
  activities: [],
  now: '2026-11-02T18:00:00Z',
};

const items = (text: string) => fallbackParse(text, ctx).flatMap((r) => r.items) as ItemIn[];

// ── reading amounts ─────────────────────────────────────────────────────────

Deno.test('amounts are read off the front of a phrase', () => {
  const a = parsePortion('about a cup of yogurt');
  assert(a.quantity === 1 && a.unit === 'cup' && a.approximate && a.rest === 'yogurt', JSON.stringify(a));
  const b = parsePortion('a handful of granola');
  assert(b.quantity === 1 && b.unit === 'handful' && b.approximate && b.rest === 'granola', JSON.stringify(b));
  const c = parsePortion('half a banana');
  assert(c.quantity === 0.5 && c.unit === null && c.rest === 'banana', JSON.stringify(c));
  const d = parsePortion('a tablespoon of chocolate sauce');
  assert(d.quantity === 1 && d.unit === 'tbsp' && !d.approximate && d.rest === 'chocolate sauce', JSON.stringify(d));
  const e = parsePortion('1 1/2 cups oats');
  assert(e.quantity === 1.5 && e.unit === 'cup' && e.rest === 'oats', JSON.stringify(e));
  const f = parsePortion('a red bull');
  assert(f.quantity === 1 && f.unit === null && f.rest === 'red bull', JSON.stringify(f));
  const g = parsePortion('200 g chicken');
  assert(g.quantity === 200 && g.unit === 'g' && g.rest === 'chicken', JSON.stringify(g));
});

Deno.test('a stated weight beats everything', () => {
  const r = resolveGrams({ portion: '170 g' }, { measures: [{ text: '1 cup', grams: 245 }], servingGrams: null, sourceName: 'USDA' });
  assert(r?.source === 'stated' && r.grams === 170, JSON.stringify(r));
});

// ── the three sentences, without a model ────────────────────────────────────

Deno.test('"about a cup of yogurt with a handful of granola" — rule-based', async () => {
  const parsed = items('I ate about a cup of yogurt with a handful of granola');
  assert(parsed.length === 2, `two items, got ${JSON.stringify(parsed)}`);
  const [yogurt, granola] = await priceItems(db, parsed, ORDER);

  assert(yogurt.portion_source === 'database', `yogurt from USDA's cup: ${yogurt.basis}`);
  near(yogurt.grams, 245, 1, 'a cup of yogurt (g)');
  near(yogurt.kcal, 149, 1, 'a cup of yogurt (kcal)');
  assert(/about/.test(yogurt.basis ?? ''), `"about" kept in the basis: ${yogurt.basis}`);

  // No model: a handful is taken as ⅓ cup of USDA's cup weight — an estimate, said so.
  assert(granola.portion_source === 'estimate', `granola is an estimate: ${granola.basis}`);
  near(granola.grams, 40.7, 0.5, 'a handful of granola (g)');
  assert(/handful/.test(granola.basis ?? ''), granola.basis ?? '');
});

Deno.test('"a bowl of ice cream with a tablespoon of chocolate sauce" — rule-based', async () => {
  const parsed = items('I ate a bowl of ice cream with a tablespoon of chocolate sauce');
  assert(parsed.length === 2, JSON.stringify(parsed));
  const [ice, sauce] = await priceItems(db, parsed, ORDER);
  assert(ice.portion_source === 'estimate', ice.basis ?? '');
  near(ice.grams, 198, 1, 'a bowl of ice cream as 1½ cups (g)');
  assert(sauce.portion_source === 'database', sauce.basis ?? '');
  near(sauce.grams, 19, 0.5, 'a tablespoon of chocolate sauce (g)');
  near(sauce.kcal, 53, 1, 'a tablespoon of chocolate sauce (kcal)');
});

Deno.test('"half a banana, a bowl of corn flakes and a red bull" — rule-based', async () => {
  const parsed = items('I ate half a bananna, a bowl of corn flakes and a red bull');
  assert(parsed.length === 3, JSON.stringify(parsed));
  const [banana, flakes, bull] = await priceItems(db, parsed.map((p, i) => (i === 0 ? { ...p, name: 'Banana' } : p)), ORDER);
  assert(banana.portion_source === 'database', banana.basis ?? '');
  near(banana.grams, 59, 0.5, 'half a medium banana (g)');
  near(flakes.grams, 42, 0.5, 'a bowl of corn flakes as 1½ cups (g)');
  // Without a model there is no brand to recognise; Red Bull is priced from
  // whichever database knows it, by its serving.
  assert(bull.kcal !== null, 'red bull priced');
});

// ── the same sentences, as the model reads them ─────────────────────────────

Deno.test('model-read items: estimates fill in where databases have no portion', async () => {
  calls.length = 0;
  const modelItems: ItemIn[] = [
    { name: 'Granola', query: 'granola', portion: 'a handful', quantity: 1, unit: 'handful', approximate: true, grams_estimate: 30 },
    { name: 'Ice cream', query: 'ice cream, vanilla', portion: 'a bowl', quantity: 1, unit: 'bowl', approximate: true, grams_estimate: 130 },
    { name: 'Banana', query: 'banana, raw', portion: 'half', quantity: 0.5, unit: null, approximate: false, grams_estimate: 60 },
    { name: 'Corn flakes', query: 'corn flakes', portion: 'a bowl', quantity: 1, unit: 'bowl', approximate: true, grams_estimate: 30 },
    { name: 'Red Bull', brand: 'Red Bull', query: 'energy drink', portion: 'a can', quantity: 1, unit: 'can', approximate: false, grams_estimate: 250 },
  ];
  const [granola, ice, banana, flakes, bull] = await priceItems(db, modelItems, ORDER);

  // The model's food-aware estimate beats a generic "handful" or "bowl".
  near(granola.grams, 30, 0.1, 'handful of granola uses the estimate');
  assert(granola.portion_source === 'estimate' && /estimated/.test(granola.basis ?? ''), granola.basis ?? '');
  near(ice.grams, 130, 0.1, 'bowl of ice cream uses the estimate');
  near(flakes.grams, 30, 0.1, 'bowl of corn flakes uses the estimate');

  // Measured data still beats the estimate where the database has the portion.
  assert(banana.portion_source === 'database', banana.basis ?? '');
  near(banana.grams, 59, 0.5, 'half a banana from USDA medium');

  // A brand goes to the product database first, and its can is its serving.
  const first = calls.find((c) => c.includes('red bull') || c.includes('Red Bull'));
  assert(first?.startsWith('off:'), `Red Bull looked up in Open Food Facts first: ${calls.join(' | ')}`);
  assert(bull.match_source === 'off' && bull.portion_source === 'database', bull.basis ?? '');
  near(bull.grams, 250, 0.1, 'a can of Red Bull (g/ml)');
  near(bull.kcal, 115, 1, 'a can of Red Bull (kcal)');

  // Generic foods ask USDA's survey database, which carries household portions.
  assert(calls.some((c) => c.startsWith('usda:granola:Survey (FNDDS)')), calls.join(' | '));
});
