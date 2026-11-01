// Editing something already logged. Every module gets the same sheet — what
// it says, how much, when, a note — and Calories adds its items, each with
// its energy, macros and source.

import { useState } from 'react';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { MealItemsEditor } from './Nutrition';
import {
  useDeleteEntry,
  useDeleteSavedMeal,
  useSavedMeals,
  useSaveCombination,
  useUpdateEntry,
  useUpdateMeal,
} from '@/data/hooks';
import { toISODate } from '@/lib/dates';
import { group } from '@/lib/format';
import { moduleDef } from '@/modules/registry';
import type { Entry, MealItem } from '@/lib/types';

const pad = (n: number) => String(n).padStart(2, '0');

function localParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return { date: toISODate(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

function fromLocal(date: string, time: string): Date | null {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  if (![y, m, d, h, min].every(Number.isFinite)) return null;
  return new Date(y, m - 1, d, h, min, 0, 0);
}

export function EntryEditDialog({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const def = moduleDef(entry.module_slug);
  const isMeal = entry.module_slug === 'calories';
  const isTracker = def.kind === 'activity';

  const updateEntry = useUpdateEntry();
  const updateMeal = useUpdateMeal();
  const remove = useDeleteEntry();

  const start = localParts(entry.occurred_at);
  const [label, setLabel] = useState(entry.label ?? '');
  const [value, setValue] = useState(entry.value == null ? '' : String(entry.value));
  const [note, setNote] = useState(entry.note ?? '');
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const [items, setItems] = useState<MealItem[]>(((entry.items ?? []) as MealItem[]).map((i) => ({ ...i })));
  const [error, setError] = useState<string | null>(null);

  const busy = updateEntry.isPending || updateMeal.isPending || remove.isPending;
  const total = items.reduce((sum, item) => sum + (Number(item.kcal) || 0), 0);

  const save = () => {
    const at = fromLocal(date, time);
    if (!at) {
      setError('Check the date and time.');
      return;
    }
    const done = { onSuccess: onClose, onError: (err: Error) => setError(err.message) };

    if (isMeal) {
      const clean = items.filter((i) => i.name.trim());
      if (clean.some((i) => i.kcal == null)) {
        setError('Every item needs a kcal figure — look it up or set it by hand.');
        return;
      }
      updateMeal.mutate(
        {
          id: entry.id,
          input: {
            label: label.trim() || clean.map((i) => i.name).join(', ') || 'Food',
            items: clean.map(({ id: _id, ...rest }) => rest),
            occurred_at: at.toISOString(),
            local_date: date,
            note: note.trim() || null,
          },
        },
        done,
      );
      return;
    }

    let nextValue: number | null = entry.value;
    if (!isTracker) {
      nextValue = value.trim() === '' ? null : Number(value.replace(',', '.'));
      if (nextValue !== null && (!Number.isFinite(nextValue) || nextValue < 0)) {
        setError('That value is not a number.');
        return;
      }
    }

    // A reading session that names the page it reached moves that page by the
    // same amount, so the book follows the edit.
    let payload = entry.payload;
    if (entry.module_slug === 'reading' && entry.payload.end_page != null && nextValue != null && entry.value != null) {
      payload = { ...entry.payload, end_page: Number(entry.payload.end_page) + (nextValue - entry.value) };
    }

    updateEntry.mutate(
      {
        id: entry.id,
        patch: {
          label: label.trim() || null,
          value: nextValue,
          note: note.trim() || null,
          occurred_at: at.toISOString(),
          local_date: date,
          payload,
        },
      },
      done,
    );
  };

  return (
    <Dialog
      title={`Edit ${def.name.toLowerCase()} entry`}
      onClose={onClose}
      wide={isMeal}
      actions={
        <>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginRight: 'auto' }}
            disabled={busy}
            onClick={() => {
              if (window.confirm('Delete this entry? This cannot be undone.')) {
                remove.mutate(entry.id, { onSuccess: onClose });
              }
            }}
          >
            Delete
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      {error ? <div className="error">{error}</div> : null}

      {!isTracker ? (
        <div className="field">
          <label htmlFor="ee-label">{isMeal ? 'Name' : 'Entry'}</label>
          <input id="ee-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
      ) : null}

      {!isMeal && !isTracker ? (
        <div className="field">
          <label htmlFor="ee-value">
            Value{entry.unit ? ` (${entry.unit})` : ''}
          </label>
          <input
            id="ee-value"
            className="input"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8 }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="ee-date">Day</label>
          <input id="ee-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field" style={{ width: 130 }}>
          <label htmlFor="ee-time">Time</label>
          <input id="ee-time" className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>

      {isMeal ? (
        <div className="field">
          <label>
            Items — {group(total)} kcal. Edit a figure and it is marked as set by hand, with what it was.
          </label>
          <MealItemsEditor items={items} onChange={setItems} />
        </div>
      ) : null}

      {isMeal ? <CombinationsSection entry={entry} items={items} defaultName={label} /> : null}

      <div className="field">
        <label htmlFor="ee-note">Note (optional)</label>
        <input id="ee-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Dialog>
  );
}

/**
 * Saved combinations taken from this entry: the ones already saved, each
 * removable, and a way to save another from some or all of its items.
 */
function CombinationsSection({ entry, items, defaultName }: { entry: Entry; items: MealItem[]; defaultName: string }) {
  const saved = useSavedMeals();
  const remove = useDeleteSavedMeal();
  const [choosing, setChoosing] = useState(false);
  const fromHere = (saved.data ?? []).filter((m) => m.source_entry_id === entry.id);

  return (
    <div className="field">
      <label>Saved combinations</label>
      {fromHere.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
          {fromHere.map((m) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 13 }}>
              <b>{m.name}</b>
              <span style={{ opacity: 0.6, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.detail}
              </span>
              <span style={{ opacity: 0.7 }}>{group(m.kcal)} kcal</span>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: '0 4px' }}
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(`Remove the saved combination “${m.name}”?`)) remove.mutate(m.id);
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 6 }}>None saved from this entry.</div>
      )}
      <button
        type="button"
        className="btn btn-secondary"
        style={{ alignSelf: 'flex-start' }}
        disabled={!items.some((i) => i.name.trim())}
        onClick={() => setChoosing(true)}
      >
        <Icon name="bookmark" />
        Add as Saved Combination
      </button>
      {choosing ? (
        <SaveCombinationDialog
          entryId={entry.id}
          items={items.filter((i) => i.name.trim())}
          defaultName={defaultName}
          onClose={() => setChoosing(false)}
        />
      ) : null}
    </div>
  );
}

/** Name it, and keep the items that belong in it. */
function SaveCombinationDialog({
  entryId,
  items,
  defaultName,
  onClose,
}: {
  entryId: string;
  items: MealItem[];
  defaultName: string;
  onClose: () => void;
}) {
  const save = useSaveCombination();
  const [name, setName] = useState(defaultName);
  const [kept, setKept] = useState<boolean[]>(items.map(() => true));
  const [error, setError] = useState<string | null>(null);
  const chosen = items.filter((_, i) => kept[i]);
  const total = chosen.reduce((sum, i) => sum + (Number(i.kcal) || 0), 0);

  const submit = () => {
    if (!name.trim()) return setError('Give it a name.');
    if (!chosen.length) return setError('Keep at least one item.');
    save.mutate(
      { name: name.trim(), items: chosen, sourceEntryId: entryId },
      { onSuccess: onClose, onError: (err) => setError((err as Error).message) },
    );
  };

  return (
    <Dialog
      title="Add as Saved Combination"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : `Save · ${group(total)} kcal`}
          </button>
        </>
      }
    >
      {error ? <div className="error">{error}</div> : null}
      <div className="field">
        <label htmlFor="combo-name">Name</label>
        <input id="combo-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label>Items in this combination</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((item, i) => (
            <label key={item.id ?? i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
              <input
                type="checkbox"
                checked={kept[i]}
                onChange={(e) => setKept((k) => k.map((v, j) => (j === i ? e.target.checked : v)))}
              />
              <span style={{ flex: 1 }}>
                {item.name}
                {item.portion ? <span style={{ opacity: 0.55 }}> · {item.portion}</span> : null}
              </span>
              <span style={{ opacity: 0.7 }}>{item.kcal == null ? '—' : `${group(item.kcal)} kcal`}</span>
            </label>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 11.5, opacity: 0.6 }}>
        Saved as the items stand in the editor, sources and macros included.
      </div>
    </Dialog>
  );
}
