// The pieces every calorie surface shares: the tag saying where a number came
// from, the macro bar, and the item editor used by review and by Edit.

import { useRef, useState } from 'react';
import { lookupFood, lookupFoodText } from '@/data/api';
import { group } from '@/lib/format';
import {
  MACROS,
  macroEnergy,
  markEdited,
  provenance,
  SOURCE_LABEL,
  SOURCE_SHORT,
  sourceLink,
  sourceSummary,
  sumMacros,
  type MacroKey,
} from '@/lib/nutrition';
import type { MealItem } from '@/lib/types';

export function SourceTag({ item, long }: { item: MealItem; long?: boolean }) {
  const href = sourceLink(item);
  const text = long ? SOURCE_LABEL[item.match_source] : SOURCE_SHORT[item.match_source];
  const label = `${text}${long && item.match_ref && item.match_source !== 'openai' ? ` ${item.match_ref}` : ''}`;
  const className = `src src-${item.match_source}`;
  const title = provenance(item);

  return href ? (
    <a className={className} href={href} target="_blank" rel="noreferrer" title={title}>
      {label}
    </a>
  ) : (
    <span className={className} title={title}>
      {label}
    </span>
  );
}

/** "USDA ×2 · OFF" for a whole meal. */
export function SourceSummary({ items }: { items: MealItem[] }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      {sourceSummary(items).map(({ source, count }) => (
        <span key={source} className={`src src-${source}`} title={SOURCE_LABEL[source]}>
          {SOURCE_SHORT[source]}
          {count > 1 ? ` ×${count}` : ''}
        </span>
      ))}
    </span>
  );
}

/**
 * The second rule under the calorie bar: each macro's energy on the same
 * scale as the target, so the two bars line up. Grams in the key beneath.
 */
export function MacroBar({ items, target, showKey = true }: { items: MealItem[]; target: number; showKey?: boolean }) {
  const totals = sumMacros(items);
  const energy = macroEnergy(totals.grams);
  const scale = Math.max(target, Object.values(energy).reduce((a, b) => a + b, 0), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        className="macrobar"
        role="img"
        aria-label={MACROS.map((m) => `${m.label} ${group(totals.grams[m.key])} g`).join(', ')}
      >
        {MACROS.map((m) =>
          energy[m.key] > 0 ? (
            <span
              key={m.key}
              className={m.className}
              style={{ width: `${(energy[m.key] / scale) * 100}%` }}
              title={`${m.label} ${group(totals.grams[m.key])} g`}
            />
          ) : null,
        )}
      </div>
      {showKey ? (
        <div className="macro-key">
          {MACROS.map((m) => (
            <span key={m.key}>
              <i className={m.className} />
              {m.label} <b>{group(totals.grams[m.key])} g</b>
            </span>
          ))}
          {totals.of > 0 && totals.known < totals.of ? (
            <span style={{ opacity: 0.6 }}>
              macros for {totals.known} of {totals.of} items
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const num = (v: string): number | null => {
  if (v.trim() === '') return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Item lines with their energy, macros and source. Changing a priced figure
 * turns it into one set by hand and records what it was; "Look up" prices
 * the line again from the sources.
 */
export function MealItemsEditor({
  items,
  onChange,
  allowAdd = true,
}: {
  items: MealItem[];
  onChange: (items: MealItem[]) => void;
  allowAdd?: boolean;
}) {
  const [looking, setLooking] = useState<number | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [addText, setAddText] = useState('');
  const [adding, setAdding] = useState<string[]>([]);
  // Lookups finish after the user may have edited other lines; append to
  // what the list is then, not what it was when the lookup started.
  const latest = useRef(items);
  latest.current = items;

  const addFromText = async () => {
    const text = addText.trim();
    if (!text) return;
    setAddText('');
    setLookupError(null);
    setAdding((list) => [...list, text]);
    try {
      const found = await lookupFoodText(text);
      if (!found.items.length) setLookupError(`No food recognised in “${text}”.`);
      else onChange([...latest.current, ...found.items]);
    } catch (err) {
      setLookupError((err as Error).message);
    } finally {
      setAdding((list) => {
        const i = list.indexOf(text);
        return i < 0 ? list : [...list.slice(0, i), ...list.slice(i + 1)];
      });
    }
  };

  const patch = (index: number, change: Partial<MealItem>, numeric = false) => {
    onChange(
      items.map((item, i) => {
        if (i !== index) return item;
        const next = { ...item, ...change };
        return numeric ? markEdited(item, next) : next;
      }),
    );
  };

  const lookup = async (index: number) => {
    const item = items[index];
    setLooking(index);
    setLookupError(null);
    try {
      const found = await lookupFood(item.name, item.portion);
      if (!found.item) setLookupError(`No source knows “${item.name}” — set it by hand.`);
      else onChange(items.map((it, i) => (i === index ? { ...found.item!, name: it.name, portion: it.portion } : it)));
    } catch (err) {
      setLookupError((err as Error).message);
    } finally {
      setLooking(null);
    }
  };

  return (
    <div>
      {items.map((item, index) => (
        <div className="item-edit" key={item.id ?? index}>
          <div className="draft-row">
            <input
              className="input"
              style={{ flex: 1 }}
              aria-label="Food"
              value={item.name}
              onChange={(e) => patch(index, { name: e.target.value })}
            />
            <input
              className="input portion"
              aria-label="Portion"
              placeholder="portion"
              value={item.portion ?? ''}
              onChange={(e) => patch(index, { portion: e.target.value || null })}
            />
            <input
              className="input kcal"
              aria-label="kcal"
              inputMode="decimal"
              placeholder="kcal"
              value={item.kcal ?? ''}
              onChange={(e) => patch(index, { kcal: num(e.target.value) }, true)}
            />
          </div>
          <div className="macro-inputs">
            {MACROS.map((m) => (
              <label key={m.key}>
                {m.label} g
                <input
                  className="input"
                  inputMode="decimal"
                  placeholder="—"
                  value={item[m.key as MacroKey] ?? ''}
                  onChange={(e) => patch(index, { [m.key]: num(e.target.value) }, true)}
                />
              </label>
            ))}
          </div>
          <div className="item-src">
            <SourceTag item={item} long />
            {item.matched_name ? <span style={{ opacity: 0.7 }}>“{item.matched_name}”</span> : null}
            {item.basis ? <span style={{ opacity: 0.6 }}>{item.basis}</span> : null}
            {item.kcal == null ? <span className="tag tag-outline">No match — set by hand</span> : null}
            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 2 }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: 11, padding: '0 4px' }}
                disabled={looking !== null || !item.name.trim()}
                onClick={() => void lookup(index)}
              >
                {looking === index ? 'Looking…' : 'Look up'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: 11, padding: '0 4px' }}
                onClick={() => onChange(items.filter((_, i) => i !== index))}
              >
                remove
              </button>
            </span>
          </div>
        </div>
      ))}
      {/* A line being looked up shows where it will land. */}
      {adding.map((text, i) => (
        <div className="item-edit" key={`adding-${i}`} aria-busy="true">
          <div style={{ fontSize: 12.5, opacity: 0.7 }}>Looking up “{text}”…</div>
          <div className="skeleton" style={{ width: '70%' }} />
        </div>
      ))}
      {lookupError ? <div className="error">{lookupError}</div> : null}
      {allowAdd ? (
        <>
          {/* The same reading the Log input gets, limited to food. */}
          <form
            className="qinput"
            style={{ marginTop: 10 }}
            onSubmit={(e) => {
              e.preventDefault();
              void addFromText();
            }}
          >
            <input
              className="input"
              aria-label="Add food to this meal"
              placeholder="a slice of toast and butter"
              value={addText}
              onChange={(e) => setAddText(e.target.value)}
            />
            <button type="submit" className="btn btn-primary" disabled={!addText.trim()}>
              Add Item
            </button>
          </form>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ fontSize: 12, paddingLeft: 0, marginTop: 4 }}
            onClick={() =>
              onChange([...items, { name: '', portion: null, kcal: null, match_source: 'manual', match_ref: null }])
            }
          >
            + Manually Add Item
          </button>
        </>
      ) : null}
    </div>
  );
}
