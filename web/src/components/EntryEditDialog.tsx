// Editing something already logged. Every module gets the same sheet — what
// it says, how much, when, a note — and Calories adds its items, each with
// its energy, macros and source.

import { useState } from 'react';
import { Dialog } from './Dialog';
import { MealItemsEditor } from './Nutrition';
import { useDeleteEntry, useUpdateEntry, useUpdateMeal } from '@/data/hooks';
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

      <div className="field">
        <label htmlFor="ee-note">Note (optional)</label>
        <input id="ee-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Dialog>
  );
}
