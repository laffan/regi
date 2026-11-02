// How much was eaten.
//
// People say "about a cup", "a handful", "half a banana", "a tablespoon", "a
// red bull" — rarely grams. This module reads those amounts and turns them
// into grams, preferring measured data to guesses and always saying which it
// used:
//
//   stated     the text gave a weight or volume ("170 g", "250 ml", "8 oz")
//   database   a USDA or Open Food Facts portion weight ("1 cup = 245 g",
//              "1 can = 250 ml"), possibly converted between cups and spoons
//   estimate   no measured portion: the AI parser's estimate for this food,
//              or a typical weight for the household measure
//   assumed    nothing to go on: 100 g per item, and the basis says so
//
// Pure functions only, so they can be tested without the network.

export type PortionSource = 'stated' | 'database' | 'estimate' | 'assumed';

export interface Measure {
  /** As the database words it: "1 cup", "1 medium (7\" to 7-7/8\" long)", "1 can". */
  text: string;
  grams: number;
}

export interface ParsedPortion {
  quantity: number | null;
  /** Normalised: cup, tbsp, tsp, g, kg, ml, l, oz, floz, lb, slice, bowl, can, … */
  unit: string | null;
  /** "about", "roughly", "some", "a handful", "a bowl" — an amount nobody weighed. */
  approximate: boolean;
  /** The text with the amount taken off the front: "of yogurt" → "yogurt". */
  rest: string;
}

// ── words ───────────────────────────────────────────────────────────────────

const NUMBER_WORDS: [RegExp, number][] = [
  [/^(?:one and a half|1 and a half|a cup and a half)\b/i, 1.5],
  [/^(?:a half|half(?: of)?(?: an?)?)\b/i, 0.5],
  [/^(?:a quarter|quarter(?: of)?(?: an?)?)\b/i, 0.25],
  [/^(?:a third|third(?: of)?(?: an?)?)\b/i, 1 / 3],
  [/^(?:three quarters|three-quarters)(?: of)?(?: an?)?\b/i, 0.75],
  [/^(?:a couple(?: of)?|couple(?: of)?)\b/i, 2],
  [/^(?:a few|few)\b/i, 3],
  [/^(?:a dozen|dozen)\b/i, 12],
  [/^(?:a|an|one|single)\b/i, 1],
  [/^two\b/i, 2],
  [/^three\b/i, 3],
  [/^four\b/i, 4],
  [/^five\b/i, 5],
  [/^six\b/i, 6],
  [/^seven\b/i, 7],
  [/^eight\b/i, 8],
  [/^nine\b/i, 9],
  [/^ten\b/i, 10],
];

const FRACTION_CHARS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

const APPROX = /^(?:about|around|roughly|approximately|approx\.?|maybe|perhaps|some|a bit of|a little(?: bit of)?|a small amount of|~)\s+/i;

/** Alias → normalised unit. Order matters: longer phrases first. */
const UNIT_ALIASES: [RegExp, string][] = [
  [/^(?:fl\.?\s?oz|fluid ounces?)\b/i, 'floz'],
  [/^(?:tablespoons?|tbsps?|tbs|tbl|tbls)\b\.?/i, 'tbsp'],
  [/^(?:teaspoons?|tsps?)\b\.?/i, 'tsp'],
  [/^(?:cups?|c\.)(?=\s|$)/i, 'cup'],
  [/^(?:kilograms?|kilos?|kg)\b/i, 'kg'],
  [/^(?:grams?|gr|g)\b/i, 'g'],
  [/^(?:millilit(?:re|er)s?|ml)\b/i, 'ml'],
  [/^(?:lit(?:re|er)s?|l)\b/i, 'l'],
  [/^(?:ounces?|oz)\b/i, 'oz'],
  [/^(?:pounds?|lbs?)\b/i, 'lb'],
  [/^(?:slices?)\b/i, 'slice'],
  [/^(?:pieces?|pcs?)\b/i, 'piece'],
  [/^(?:handfuls?)\b/i, 'handful'],
  [/^(?:bowls?|bowlfuls?)\b/i, 'bowl'],
  [/^(?:scoops?)\b/i, 'scoop'],
  [/^(?:spoonfuls?|spoons?)\b/i, 'spoonful'],
  [/^(?:glass(?:es)?)\b/i, 'glass'],
  [/^(?:mugs?)\b/i, 'mug'],
  [/^(?:cans?|tins?)\b/i, 'can'],
  [/^(?:bottles?)\b/i, 'bottle'],
  [/^(?:plates?|platefuls?)\b/i, 'plate'],
  [/^(?:servings?|portions?|helpings?)\b/i, 'serving'],
  [/^(?:bars?)\b/i, 'bar'],
  [/^(?:packets?|packs?|bags?|sachets?)\b/i, 'packet'],
  [/^(?:small)\b/i, 'small'],
  [/^(?:medium)\b/i, 'medium'],
  [/^(?:large|big)\b/i, 'large'],
];

/** Units that are weights or volumes, convertible to grams by arithmetic alone. */
const METRIC_GRAMS: Record<string, number> = { g: 1, kg: 1000, ml: 1, l: 1000, oz: 28.35, floz: 29.57, lb: 453.6 };

/** Household volumes, in cups — for converting between a database's "1 cup" and a spoon. */
const CUPS: Record<string, number> = { cup: 1, tbsp: 1 / 16, tsp: 1 / 48, floz: 1 / 8 };

/**
 * Loose measures, as cups, for when a database has a cup weight but not this
 * measure. These are conventions, not measurements, and are labelled as such.
 */
const LOOSE_CUPS: Record<string, number> = { bowl: 1.5, handful: 1 / 3, glass: 1, mug: 1.25, scoop: 0.5, spoonful: 1 / 16, plate: 2 };

/** Last-resort typical weights (water-like density for liquids). Labelled estimates. */
const TYPICAL_GRAMS: Record<string, number> = {
  cup: 240, tbsp: 15, tsp: 5, glass: 250, mug: 300, can: 330, bottle: 500,
  bowl: 250, handful: 30, scoop: 65, spoonful: 15, slice: 30, plate: 300,
};

/** Units that mean "one of the product as sold" — answered by a serving weight. */
const SERVING_UNITS = new Set(['can', 'bottle', 'serving', 'bar', 'packet']);

/** Units that are vague by nature: the amount is approximate whatever else is said. */
const LOOSE_UNITS = new Set(['handful', 'bowl', 'plate', 'spoonful', 'scoop', 'glass', 'mug']);

export function normaliseUnit(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  for (const [re, unit] of UNIT_ALIASES) if (re.test(s)) return unit;
  return s || null;
}

function leadingNumber(text: string): { value: number; length: number } | null {
  // "1 1/2", "1/2", "1.5", "2", "½", "1½"
  const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)\b/);
  if (mixed) return { value: Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]), length: mixed[0].length };
  const frac = text.match(/^(\d+)\/(\d+)\b/);
  if (frac) return { value: Number(frac[1]) / Number(frac[2]), length: frac[0].length };
  const uni = text.match(/^(\d*)\s*([½¼¾⅓⅔])/);
  if (uni) return { value: (uni[1] ? Number(uni[1]) : 0) + FRACTION_CHARS[uni[2]], length: uni[0].length };
  const dec = text.match(/^(\d+(?:[.,]\d+)?)/);
  if (dec) return { value: Number(dec[1].replace(',', '.')), length: dec[0].length };
  for (const [re, value] of NUMBER_WORDS) {
    const m = text.match(re);
    if (m) return { value, length: m[0].length };
  }
  return null;
}

/**
 * Takes the amount off the front of a phrase.
 *   "about a cup of yogurt"         → 1 cup, approximate, "yogurt"
 *   "a handful of granola"          → 1 handful, approximate, "granola"
 *   "half a banana"                 → 0.5, —, "banana"
 *   "2 tbsp peanut butter"          → 2 tbsp, "peanut butter"
 *   "a red bull"                    → 1, —, "red bull"
 */
export function parsePortion(phrase: string): ParsedPortion {
  let text = phrase.trim();
  let approximate = false;

  for (let i = 0; i < 2; i++) {
    const m = text.match(APPROX);
    if (m) {
      approximate = true;
      text = text.slice(m[0].length);
    }
  }

  let quantity: number | null = null;
  const n = leadingNumber(text);
  if (n) {
    quantity = n.value;
    text = text.slice(n.length).trim();
    // "a half cup", "half a cup", "1 and a half"
    const again = text.match(/^(?:a\s+)?half\b/i);
    if (again && quantity === 1) {
      quantity = 0.5;
      text = text.slice(again[0].length).trim();
    } else if (/^(?:and a half)\b/i.test(text)) {
      quantity += 0.5;
      text = text.replace(/^and a half\b/i, '').trim();
    }
    text = text.replace(/^(?:a|an)\s+/i, '');
  }

  let unit: string | null = null;
  for (const [re, u] of UNIT_ALIASES) {
    const m = text.match(re);
    if (m) {
      unit = u;
      text = text.slice(m[0].length).trim();
      break;
    }
  }
  // "-ish" after a number: "200ish g"
  if (/^ish\b/i.test(text)) {
    approximate = true;
    text = text.replace(/^ish\b/i, '').trim();
  }
  text = text.replace(/^(?:of|o')\s+/i, '');

  if (unit && LOOSE_UNITS.has(unit)) approximate = true;
  if (unit && quantity === null) quantity = 1;

  return { quantity, unit, approximate, rest: text.trim() };
}

// ── matching a database's portions ──────────────────────────────────────────

function measureUnit(text: string): string | null {
  const body = text.replace(/^\s*[\d./\s½¼¾⅓⅔]+/, '').trim();
  return normaliseUnit(body);
}

/** The database portion that answers "1 <unit>", best first. */
export function findMeasure(measures: Measure[], unit: string | null): Measure | null {
  const usable = measures.filter((m) => m.grams > 0 && !/quantity not specified/i.test(m.text));
  if (!usable.length) return null;

  if (unit) {
    const same = usable.filter((m) => measureUnit(m.text) === unit);
    if (same.length) {
      // "1 cup" before "1 cup, crushed" before "1 cup (8 fl oz)".
      return same.sort((a, b) => a.text.length - b.text.length)[0];
    }
    return null;
  }

  // A count with no unit — "a banana", "two eggs": the medium one, else the
  // first portion that is a thing rather than a volume or weight.
  const counted = usable.filter((m) => {
    const u = measureUnit(m.text);
    return !u || !(u in CUPS || u in METRIC_GRAMS);
  });
  return (
    counted.find((m) => /\bmedium\b/i.test(m.text)) ??
    counted.find((m) => /^\s*1\s/.test(m.text)) ??
    counted[0] ??
    null
  );
}

/** A volume measure ("1 cup", "1 tbsp") and its grams-per-cup, for converting between spoons and cups. */
export function gramsPerCup(measures: Measure[]): { perCup: number; from: Measure } | null {
  for (const unit of ['cup', 'tbsp', 'tsp', 'floz']) {
    const m = findMeasure(measures, unit);
    if (m) {
      const count = leadingNumber(m.text)?.value ?? 1;
      return { perCup: m.grams / (count * CUPS[unit]), from: m };
    }
  }
  return null;
}

// ── the answer ──────────────────────────────────────────────────────────────

export interface PortionIn {
  /** The words as said: "about a cup". */
  portion: string | null;
  quantity?: number | null;
  unit?: string | null;
  /** The AI parser's estimate of the whole portion's weight, when it gave one. */
  grams_estimate?: number | null;
  approximate?: boolean;
}

export interface PortionFacts {
  /** Database portions: USDA foodMeasures, or an Open Food Facts serving. */
  measures: Measure[];
  /** One serving as sold (Open Food Facts serving_quantity, USDA branded servingSize). */
  servingGrams: number | null;
  sourceName: string;
}

export interface Grams {
  grams: number;
  source: PortionSource;
  /** How the weight was reached, for the item's basis line. */
  how: string;
}

const fmt = (n: number) => (Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1));
const qty = (n: number) =>
  n === 0.5 ? '½' : n === 0.25 ? '¼' : n === 0.75 ? '¾' : Math.abs(n - 1 / 3) < 0.01 ? '⅓' : fmt(n);

/**
 * The weight of what was eaten, from the best evidence available. Null only
 * when there is nothing — no stated amount, no portion data, no estimate — and
 * the caller falls back to a per-serving figure or an assumed 100 g.
 */
export function resolveGrams(item: PortionIn, facts: PortionFacts | null): Grams | null {
  const parsed = item.portion ? parsePortion(item.portion) : null;
  const unit = normaliseUnit(item.unit) ?? parsed?.unit ?? null;
  const quantity = item.quantity ?? parsed?.quantity ?? 1;
  const about = item.approximate || parsed?.approximate ? 'about ' : '';
  const said = item.portion?.trim() || `${qty(quantity)}${unit ? ` ${unit}` : ''}`;

  // 1. A weight or volume in the text.
  if (unit && unit in METRIC_GRAMS) {
    const grams = quantity * METRIC_GRAMS[unit];
    return { grams, source: 'stated', how: `${about}${fmt(grams)} g as stated` };
  }

  if (facts) {
    // 2. The database's own portion for this measure.
    if (unit) {
      const m = findMeasure(facts.measures, unit);
      if (m) {
        const grams = quantity * m.grams;
        return {
          grams,
          source: 'database',
          how: `${about}${qty(quantity)} × ${facts.sourceName} “${m.text}” (${fmt(m.grams)} g) = ${fmt(grams)} g`,
        };
      }
    }

    // 3. A spoon or cup the database knows by another volume.
    if (unit && unit in CUPS) {
      const pc = gramsPerCup(facts.measures);
      if (pc) {
        const grams = quantity * CUPS[unit] * pc.perCup;
        return {
          grams,
          source: 'database',
          how: `${about}${qty(quantity)} ${unit} from ${facts.sourceName} “${pc.from.text}” (${fmt(pc.from.grams)} g) = ${fmt(grams)} g`,
        };
      }
    }

    // 4. One of the product as sold: a can, a bar, a serving — or "a red bull".
    if (facts.servingGrams && (!unit || SERVING_UNITS.has(unit))) {
      const countMeasure = !unit ? findMeasure(facts.measures, null) : null;
      if (!countMeasure) {
        const grams = quantity * facts.servingGrams;
        return {
          grams,
          source: 'database',
          how: `${about}${qty(quantity)} × ${facts.sourceName} serving (${fmt(facts.servingGrams)} g) = ${fmt(grams)} g`,
        };
      }
    }

    // 5. A count — "half a banana" — against the database's medium one.
    if (!unit || ['small', 'medium', 'large', 'slice', 'piece'].includes(unit)) {
      const m = findMeasure(facts.measures, unit === 'piece' ? null : unit);
      if (m) {
        const grams = quantity * m.grams;
        return {
          grams,
          source: 'database',
          how: `${about}${qty(quantity)} × ${facts.sourceName} “${m.text}” (${fmt(m.grams)} g) = ${fmt(grams)} g`,
        };
      }
    }
  }

  // 6. The parser's estimate for this food in this amount.
  if (item.grams_estimate != null && item.grams_estimate > 0) {
    return {
      grams: item.grams_estimate,
      source: 'estimate',
      how: `≈ ${fmt(item.grams_estimate)} g for “${said}” (portion estimated by the parser)`,
    };
  }

  // 7. A loose measure the database can size through its cup weight.
  if (facts && unit && unit in LOOSE_CUPS) {
    const pc = gramsPerCup(facts.measures);
    if (pc) {
      const grams = quantity * LOOSE_CUPS[unit] * pc.perCup;
      return {
        grams,
        source: 'estimate',
        how: `≈ ${fmt(grams)} g: a ${unit} taken as ${qty(LOOSE_CUPS[unit])} cup, ${facts.sourceName} “${pc.from.text}” = ${fmt(pc.from.grams)} g`,
      };
    }
  }

  // 8. A typical weight for the measure.
  if (unit && unit in TYPICAL_GRAMS) {
    const grams = quantity * TYPICAL_GRAMS[unit];
    return { grams, source: 'estimate', how: `≈ ${fmt(grams)} g (a typical ${unit}${quantity !== 1 ? ` × ${qty(quantity)}` : ''})` };
  }

  return null;
}
