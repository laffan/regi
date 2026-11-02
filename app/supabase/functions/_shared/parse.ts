import { chatJSON, PARSE_MODEL } from './openai.ts';
import { parsePortion } from './portion.ts';

// One line of text in, typed draft rows out.
//
// GPT-5.6 Sol does the reading when a key is configured; the deterministic
// parser below covers everything else — a missing key, a rate limit, a bad
// JSON day. Either way the rows are drafts: nothing reaches a module until the
// review screen approves it.

export interface ParseContext {
  activeModules: string[];
  weightUnit: 'lb' | 'kg';
  distanceUnit: 'mi' | 'km';
  currentBook: { id: string; title: string; current_page: number; total_pages: number | null } | null;
  savedMeals: { id: string; name: string; kcal: number; items: unknown[] }[];
  /** The user's own yes/no trackers: a row means "did it today". */
  activities: { slug: string; name: string }[];
  now: string;
}

export interface ParsedItem {
  /** As the person would say it, brand included: "Greek yogurt", "Red Bull". */
  name: string;
  /** The amount in their words: "about a cup", "half", "a tablespoon". */
  portion: string | null;
  kcal: number | null;
  /** A plain database description, when it differs from the name. */
  query?: string | null;
  /** A named product's brand, so it is looked up as that product. */
  brand?: string | null;
  quantity?: number | null;
  unit?: string | null;
  /** The parser's estimate of the whole portion's weight, in grams. */
  grams_estimate?: number | null;
  /** An amount nobody weighed: "about", "some", a handful, a bowl. */
  approximate?: boolean;
}

export interface ParsedRow {
  module: string;
  label: string;
  value: number | null;
  unit: string | null;
  occurred_at: string | null;
  note: string | null;
  items: ParsedItem[];
  end_page: number | null;
  book_id: string | null;
  duration_seconds: number | null;
  match_note: string | null;
}

const emptyRow = (module: string): ParsedRow => ({
  module,
  label: '',
  value: null,
  unit: null,
  occurred_at: null,
  note: null,
  items: [],
  end_page: null,
  book_id: null,
  duration_seconds: null,
  match_note: null,
});

// ── deterministic parser ────────────────────────────────────────────────────

const FILLER =
  /^(?:i|had|have|has|ate|eating|for|a|an|the|some|my|and|then|also|just|with|of|today|this|morning|afternoon|evening|tonight|at|breakfast|lunch|dinner|snack)$/i;

function stripSpan(text: string, span: string): string {
  return text.replace(span, ' ');
}

function titleCase(s: string): string {
  const t = s.trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/** "at 18:45", "6:40am", "this morning" → an ISO timestamp on the entry's day. */
function timeIn(text: string, now: Date): { at: string | null; rest: string } {
  const clock = text.match(/\b(?:at\s*)?(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (clock) {
    let hour = Number(clock[1]);
    const minute = Number(clock[2]);
    const meridiem = clock[3]?.toLowerCase();
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    if (hour < 24 && minute < 60) {
      const at = new Date(now);
      at.setHours(hour, minute, 0, 0);
      return { at: at.toISOString(), rest: stripSpan(text, clock[0]) };
    }
  }

  const named: [RegExp, number][] = [
    [/\bthis morning\b/i, 8],
    [/\bat lunch\b|\bmidday\b/i, 12],
    [/\bthis afternoon\b/i, 15],
    [/\bthis evening\b|\btonight\b/i, 19],
    [/\bbefore bed\b/i, 22],
  ];
  for (const [re, hour] of named) {
    const m = text.match(re);
    if (m) {
      const at = new Date(now);
      at.setHours(hour, 0, 0, 0);
      return { at: at.toISOString(), rest: stripSpan(text, m[0]) };
    }
  }

  return { at: null, rest: text };
}

const LEAD_VERBS =
  /^(?:(?:and|then|also|plus)\s+)?(?:i\s+)?(?:just\s+)?(?:ate|had|have|drank|drink|eat|got|grabbed|finished|snacked on)\s+/i;

/**
 * The rule-based reading of food, for when no model is configured: split on
 * commas, "and", "with"; take the amount off the front of each piece ("about a
 * cup of", "half a", "a tablespoon of"); what is left is the food.
 */
function foodItems(text: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  for (const raw of text.split(/,|;|\band\b|\bwith\b|\bplus\b|\s\+\s|&/i)) {
    let chunk = raw
      .replace(/[.!?]+$/, '')
      .trim()
      .replace(/^(?:for (?:breakfast|lunch|dinner|a snack)\s*,?\s*)/i, '')
      .replace(LEAD_VERBS, '')
      .trim();
    if (chunk.length < 2 || FILLER.test(chunk)) continue;

    // "oats 80 g": a trailing weight moves to the front.
    const trail = chunk.match(/^(.*?)\s+(\d+(?:\.\d+)?\s*(?:g|kg|ml|l|oz)\b)$/i);
    if (trail) chunk = `${trail[2]} ${trail[1]}`;

    const p = parsePortion(chunk);
    const name = p.rest
      .replace(/\b(?:the|my|some)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!name || FILLER.test(name)) continue;

    const said = chunk.slice(0, chunk.length - p.rest.length).trim();
    const portion = said.replace(/\s+(?:of|an?)$/i, '').trim() || null;

    items.push({
      name: titleCase(name),
      portion,
      kcal: null,
      query: null,
      brand: null,
      quantity: p.quantity,
      unit: p.unit,
      grams_estimate: null,
      approximate: p.approximate,
    });
    if (items.length >= 8) break;
  }
  return items;
}

export function fallbackParse(raw: string, ctx: ParseContext): ParsedRow[] {
  const now = new Date(ctx.now);
  const active = new Set(ctx.activeModules);
  const rows: ParsedRow[] = [];
  const { at, rest } = timeIn(raw.trim(), now);
  let text = rest;

  // Weight — "182.4", "weighed 182.4", "183 lb".
  if (active.has('weight')) {
    const explicit = text.match(/\b(\d{2,3}(?:\.\d+)?)\s*(lb|lbs|pounds?|kg|kilos?)\b/i);
    const bare = text.trim().match(/^(\d{2,3}(?:\.\d+)?)$/);
    const weighed = text.match(/\bweigh(?:ed|t|s)?\b[^\d]{0,12}(\d{2,3}(?:\.\d+)?)/i);
    const hit = explicit ?? bare ?? weighed;
    if (hit) {
      const unit = explicit
        ? /kg|kilo/i.test(explicit[2]) ? 'kg' : 'lb'
        : ctx.weightUnit;
      rows.push({
        ...emptyRow('weight'),
        label: `${hit[1]} ${unit}`,
        value: Number(hit[1]),
        unit,
        occurred_at: at,
        match_note: 'read as a weigh-in',
      });
      text = stripSpan(text, hit[0]);
    }
  }

  // Reading — pages, or a page you read up to.
  if (active.has('reading')) {
    const upTo = text.match(/\b(?:up to|to|reached|finished at)\s*(?:page|pg\.?|p\.?)\s*(\d+)/i);
    const pages = text.match(/\b(\d+)\s*pages?\b/i) ?? text.match(/\bread\b[^\d]{0,20}(\d+)\b/i);

    if (upTo || pages) {
      const book = ctx.currentBook;
      let value: number | null = pages ? Number(pages[1]) : null;
      let endPage: number | null = upTo ? Number(upTo[1]) : null;

      if (endPage !== null && value === null && book) value = Math.max(endPage - book.current_page, 0);
      if (endPage === null && value !== null && book) endPage = book.current_page + value;

      rows.push({
        ...emptyRow('reading'),
        label: book?.title ?? 'Reading',
        value,
        unit: 'pages',
        occurred_at: at,
        end_page: endPage,
        book_id: book?.id ?? null,
        match_note: book ? 'current book assumed' : 'no book set',
      });
      if (upTo) text = stripSpan(text, upTo[0]);
      if (pages) text = stripSpan(text, pages[0]);
      text = text.replace(/\bread(?:ing)?\b|\bon the porch\b|\bbefore bed\b/gi, ' ');
    }
  }

  // Running — distance, and a pace if a duration came with it.
  if (active.has('running') && /\b(?:ran|run|jog(?:ged|ging)?)\b/i.test(text)) {
    const dist = text.match(/(\d+(?:\.\d+)?)\s*(mi|miles?|km|k)\b/i);
    const dur = text.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
    const seconds = dur
      ? dur[3]
        ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3])
        : Number(dur[1]) * 60 + Number(dur[2])
      : null;

    if (dist) {
      const unit = /km|^k$/i.test(dist[2]) ? 'km' : 'mi';
      rows.push({
        ...emptyRow('running'),
        label: `${dist[1]} ${unit}`,
        value: Number(dist[1]),
        unit,
        occurred_at: at,
        duration_seconds: seconds,
        match_note: seconds ? 'distance and time read' : 'distance read',
      });
      text = stripSpan(text, dist[0]);
      if (dur) text = stripSpan(text, dur[0]);
      text = text.replace(/\b(?:ran|run|jog(?:ged|ging)?)\b/gi, ' ');
    }
  }

  // Writing.
  if (active.has('writing')) {
    const words = text.match(/\b(\d{2,5})\s*words?\b/i);
    if (words) {
      rows.push({
        ...emptyRow('writing'),
        label: `${words[1]} words`,
        value: Number(words[1]),
        unit: 'words',
        occurred_at: at,
        match_note: 'word count read',
      });
      text = stripSpan(text, words[0]);
      text = text.replace(/\b(?:wrote|writing|journal(?:ed|ing)?)\b/gi, ' ');
    }
  }

  // Sleep.
  if (active.has('sleep')) {
    const hours = text.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?)\b/i);
    if (hours && /\bslept|sleep\b/i.test(text)) {
      rows.push({
        ...emptyRow('sleep'),
        label: `${hours[1]} h`,
        value: Number(hours[1]),
        unit: 'h',
        occurred_at: at,
        match_note: 'hours read',
      });
      text = stripSpan(text, hours[0]).replace(/\bslept|sleep\b/gi, ' ');
    }
  }

  // Trackers of the user's own: naming one is saying it was done.
  for (const activity of ctx.activities ?? []) {
    if (!active.has(activity.slug)) continue;
    const re = new RegExp(`\\b${escapeRe(activity.name)}\\b`, 'i');
    if (!re.test(text)) continue;
    rows.push({
      ...emptyRow(activity.slug),
      label: activity.name,
      value: 1,
      unit: 'done',
      occurred_at: at,
      match_note: 'tracker named',
    });
    text = text.replace(re, ' ');
  }

  // A saved meal named outright wins over parsing the words again.
  if (active.has('calories')) {
    const saved = ctx.savedMeals.find((m) => m.name && new RegExp(`\\b${escapeRe(m.name)}\\b`, 'i').test(text));
    if (saved) {
      rows.push({
        ...emptyRow('calories'),
        label: saved.name,
        value: saved.kcal,
        unit: 'kcal',
        occurred_at: at,
        items: (saved.items as ParsedItem[]) ?? [],
        match_note: 'saved meal',
      });
      text = text.replace(new RegExp(escapeRe(saved.name), 'i'), ' ');
    } else {
      const items = foodItems(text);
      if (items.length) {
        rows.push({
          ...emptyRow('calories'),
          label: items.map((i) => i.name).join(', '),
          value: null,
          unit: 'kcal',
          occurred_at: at,
          items,
          match_note: null, // filled in once the items are priced
        });
      }
    }
  }

  return rows;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── GPT-5.6 Sol ─────────────────────────────────────────────────────────────

function schemaFor(modules: string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['rows'],
    properties: {
      rows: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['module', 'label', 'value', 'unit', 'time', 'note', 'items', 'end_page', 'duration_seconds'],
          properties: {
            module: { type: 'string', enum: modules },
            label: { type: 'string' },
            value: { type: ['number', 'null'] },
            unit: { type: ['string', 'null'] },
            time: { type: ['string', 'null'], description: 'HH:MM in the user\'s day, or null for now' },
            note: { type: ['string', 'null'] },
            items: {
              type: 'array',
              description: 'Calories rows only: one entry per food. Leave kcal null unless the text states it.',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'brand', 'query', 'portion', 'quantity', 'unit', 'approximate', 'grams_estimate', 'kcal'],
                properties: {
                  name: { type: 'string', description: 'The food as the person would say it, brand included: "Greek yogurt", "Red Bull".' },
                  brand: { type: ['string', 'null'], description: 'Only for a named or unmistakable product ("red bull" → "Red Bull"); otherwise null.' },
                  query: { type: 'string', description: 'A plain description to search a nutrition database: "yogurt, plain, whole milk", "chocolate syrup", "energy drink".' },
                  portion: { type: ['string', 'null'], description: 'The amount in the person\'s words: "about a cup", "half", "a tablespoon", "a bowl".' },
                  quantity: { type: ['number', 'null'], description: 'How many of the unit: half → 0.5, a/an → 1, two → 2.' },
                  unit: {
                    type: ['string', 'null'],
                    description: 'cup, tbsp, tsp, g, ml, oz, fl oz, slice, piece, bowl, handful, scoop, glass, mug, can, bottle, bar, packet, serving — or null for a count of whole items ("a banana").',
                  },
                  approximate: { type: 'boolean', description: 'True when the amount was not measured: "about", "some", a handful, a bowl.' },
                  grams_estimate: { type: ['number', 'null'], description: 'Your best estimate of the weight in grams of the whole portion as eaten.' },
                  kcal: { type: ['number', 'null'] },
                },
              },
            },
            end_page: { type: ['integer', 'null'], description: 'Reading rows: the page reached, if stated.' },
            duration_seconds: { type: ['integer', 'null'], description: 'Running rows: elapsed time, if stated.' },
          },
        },
      },
    },
  };
}

function systemPrompt(ctx: ParseContext): string {
  const book = ctx.currentBook
    ? `Current book: "${ctx.currentBook.title}", on page ${ctx.currentBook.current_page}${
        ctx.currentBook.total_pages ? ` of ${ctx.currentBook.total_pages}` : ''
      }. A reading entry with no book named is this one.`
    : 'No book in progress; a reading entry may leave the book unset.';

  const saved = ctx.savedMeals.length
    ? `Saved meals the user may name directly: ${ctx.savedMeals.map((m) => `"${m.name}" (${m.kcal} kcal)`).join(', ')}.`
    : 'No saved meals.';

  return [
    'You turn one line of a habit-tracking log into structured rows.',
    `Active modules, and the only ones you may use: ${ctx.activeModules.join(', ')}.`,
    'Emit a row only for what the text actually says. Do not invent a row for every module.',
    'Split food into individual items: "a bowl of ice cream with a tablespoon of chocolate sauce" is two items. Do not add foods that were not said (no milk with cereal unless mentioned).',
    'Never guess a calorie count: leave kcal null unless the text gives a number — the server prices items against USDA FoodData Central and Open Food Facts afterwards.',
    'For each food, record the amount exactly as said (portion), as a number and unit (quantity, unit), whether it was approximate, and your best estimate of its weight in grams (grams_estimate) — always give one. Typical weights: a cup of yogurt ≈ 245 g, a handful of granola ≈ 30 g, a bowl of ice cream ≈ 130 g, a tablespoon of chocolate sauce ≈ 20 g, half a banana ≈ 60 g, a bowl of corn flakes ≈ 30 g dry, a can of Red Bull ≈ 250 ml.',
    'Mark a brand only when the person names a product or a product name is unmistakable ("a red bull" → brand "Red Bull", query "energy drink"); "corn flakes" alone is generic.',
    ctx.activities?.length
      ? `Yes/no trackers the user made, by module id: ${ctx.activities
          .map((a) => `${a.slug} = "${a.name}"`)
          .join(', ')}. When the text says one was done, emit a row for it with value 1, unit "done" and the tracker's name as the label.`
      : '',
    `Weight is in ${ctx.weightUnit}, distance in ${ctx.distanceUnit}, unless the text says otherwise.`,
    'A bare number on its own is a weigh-in.',
    book,
    saved,
    `The entry is being written at ${ctx.now}.`,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function parseWithOpenAI(raw: string, ctx: ParseContext): Promise<ParsedRow[]> {
  const parsed = await chatJSON<{ rows?: Record<string, any>[] }>({
    model: PARSE_MODEL,
    name: 'log_rows',
    schema: schemaFor(ctx.activeModules),
    system: systemPrompt(ctx),
    user: raw,
  });
  const now = new Date(ctx.now);

  return (parsed.rows ?? [])
    .filter((row) => ctx.activeModules.includes(String(row.module)))
    .map((row) => {
      let occurredAt: string | null = null;
      if (typeof row.time === 'string' && /^\d{1,2}:\d{2}$/.test(row.time)) {
        const [h, m] = row.time.split(':').map(Number);
        const at = new Date(now);
        at.setHours(h, m, 0, 0);
        occurredAt = at.toISOString();
      }

      const isReading = row.module === 'reading';
      return {
        ...emptyRow(String(row.module)),
        label: String(row.label ?? ''),
        value: row.value == null ? null : Number(row.value),
        unit: row.unit ?? null,
        occurred_at: occurredAt,
        note: row.note ?? null,
        items: Array.isArray(row.items)
          ? row.items.map((i: Record<string, any>) => {
              const num = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
              return {
                name: String(i.name ?? ''),
                portion: i.portion ?? null,
                kcal: num(i.kcal),
                query: i.query ? String(i.query) : null,
                brand: i.brand ? String(i.brand) : null,
                quantity: num(i.quantity),
                unit: i.unit ? String(i.unit) : null,
                grams_estimate: num(i.grams_estimate),
                approximate: Boolean(i.approximate),
              };
            })
          : [],
        end_page: row.end_page == null ? null : Number(row.end_page),
        book_id: isReading ? ctx.currentBook?.id ?? null : null,
        duration_seconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
        match_note: isReading && ctx.currentBook ? 'current book assumed' : null,
      } as ParsedRow;
    });
}
