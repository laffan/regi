// 1d — text in, parse, review, approve.
//
// The log is module-agnostic: one line goes to the server, comes back as typed
// draft rows, and nothing reaches a module until the review column is approved.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { EntryEditDialog } from '@/components/EntryEditDialog';
import { MealItemsEditor, SourceSummary } from '@/components/Nutrition';
import { VoiceButton } from '@/components/VoiceButton';
import {
  useApproveDraft,
  useBooks,
  useDeleteDraftRow,
  useDiscardDraft,
  useEntries,
  useParseLog,
  usePendingDraft,
  useUpdateDraftRow,
} from '@/data/hooks';
import { addDays, dowShort, monthName, timeOfDay, today as todayISO } from '@/lib/dates';
import { group, moduleValue } from '@/lib/format';
import { moduleDef } from '@/modules/registry';
import type { DraftRow, Entry, MealItem } from '@/lib/types';

const HISTORY_DAYS = 14;

export function LogPage() {
  const today = todayISO();
  const entries = useEntries(addDays(today, -(HISTORY_DAYS - 1)), today);
  const draft = usePendingDraft();

  const parse = useParseLog();
  const approve = useApproveDraft();
  const discard = useDiscardDraft();

  const [text, setText] = useState('');
  const [editing, setEditing] = useState<Entry | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const entry of entries.data ?? []) {
      const list = map.get(entry.local_date) ?? [];
      list.push(entry);
      map.set(entry.local_date, list);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries.data]);

  const weekCount = (entries.data ?? []).filter((e) => e.local_date >= addDays(today, -6)).length;

  const submit = () => {
    const value = text.trim();
    if (!value || parse.isPending) return;
    parse.mutate(value, { onSuccess: () => setText('') });
  };

  return (
    <div className="log-split">
      <div className="log-main">
        <div style={{ flex: 1, padding: '20px 20px 0' }}>
          {entries.isLoading ? <div className="spinner">Loading entries…</div> : null}

          {byDay.map(([date, list], index) => (
            <div key={date} style={index ? { marginTop: 18, paddingTop: 12, borderTop: '1px solid var(--line)' } : undefined}>
              <div className="row-between">
                <h4 style={{ margin: 0 }}>
                  {date === today ? 'Today' : `${dowShort(date)} ${Number(date.slice(8))} ${monthName(date)}`}
                </h4>
                {index === 0 ? (
                  <span style={{ fontSize: 11.5, opacity: 0.55 }}>{weekCount} entries this week</span>
                ) : null}
              </div>

              {/* Fixed widths so every day's table lines up with the one above,
                  header row or not. */}
              <table className="table" style={{ marginTop: 8, tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 70 }} />
                  <col />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 100 }} />
                  <col style={{ width: 64 }} />
                </colgroup>
                {index === 0 ? (
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Entry</th>
                      <th>Module</th>
                      <th style={{ textAlign: 'right' }}>Value</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                ) : null}
                <tbody>
                  {list.map((entry) => {
                    const def = moduleDef(entry.module_slug);
                    return (
                      <tr key={entry.id} className="log-row">
                        <td style={{ opacity: 0.6 }}>{timeOfDay(entry.occurred_at)}</td>
                        <td>
                          {entry.label}
                          {entry.module_slug === 'calories' && entry.items?.length ? (
                            <span style={{ marginLeft: 8 }}>
                              <SourceSummary items={entry.items as MealItem[]} />
                            </span>
                          ) : null}
                          {entry.note ? (
                            <div style={{ fontSize: 11.5, opacity: 0.55 }}>{entry.note}</div>
                          ) : null}
                        </td>
                        <td>
                          <span className="tag tag-neutral">
                            <Icon name={def.icon} />
                            {def.name}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 800 }}>
                          {entry.module_slug === 'calories'
                            ? `${group(entry.value ?? 0)} kcal`
                            : moduleValue(entry.module_slug, entry.value, entry.unit)}
                        </td>
                        <td style={{ textAlign: 'right', padding: '0 4px' }}>
                          <button
                            type="button"
                            className="btn btn-ghost row-edit"
                            style={{ fontSize: 12 }}
                            onClick={() => setEditing(entry)}
                            aria-label={`Edit ${entry.label ?? def.name}`}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}

          {!entries.isLoading && byDay.length === 0 ? (
            <div className="empty">Nothing logged yet. Write a line below and it will be parsed for review.</div>
          ) : null}
        </div>

        <div className="log-input">
          {parse.isError ? (
            <div className="error" style={{ marginBottom: 8 }}>
              {(parse.error as Error).message}
            </div>
          ) : null}
          <div className="log-input-row">
            <input
              ref={inputRef}
              className="input"
              style={{ minHeight: 44 }}
              value={text}
              placeholder="grilled chicken salad and an iced tea, read 18 pages"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
            />
            <VoiceButton
              disabled={parse.isPending}
              onText={(spoken) => {
                setText((current) => (current.trim() ? `${current.trim()} ${spoken}` : spoken));
                inputRef.current?.focus();
              }}
            />
            <button
              type="button"
              className="btn btn-primary"
              style={{ minHeight: 44, paddingInline: 20 }}
              onClick={submit}
              disabled={parse.isPending}
            >
              {parse.isPending ? 'Parsing…' : 'Input'}
            </button>
          </div>
          <div style={{ fontSize: 11, opacity: 0.5, marginTop: 6 }}>
            One line, any modules — typed or spoken. Parsed on the server, then shown for review.
          </div>
        </div>
      </div>

      <ReviewColumn
        rows={draft.data?.rows ?? []}
        draftId={draft.data?.draft.id ?? null}
        parser={draft.data?.draft.parser ?? null}
        busy={approve.isPending || discard.isPending}
        onApprove={(id) => approve.mutate(id)}
        onDiscard={(id) => discard.mutate(id)}
      />

      {editing ? <EntryEditDialog entry={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function ReviewColumn({
  rows,
  draftId,
  parser,
  busy,
  onApprove,
  onDiscard,
}: {
  rows: DraftRow[];
  draftId: string | null;
  parser: string | null;
  busy: boolean;
  onApprove: (draftId: string) => void;
  onDiscard: (draftId: string) => void;
}) {
  const update = useUpdateDraftRow();
  const remove = useDeleteDraftRow();
  const books = useBooks();

  if (!draftId || rows.length === 0) {
    return (
      <div className="review">
        <div className="review-head">
          <div>
            <div className="kick">Review</div>
            <h4 style={{ margin: '4px 0 0' }}>Nothing waiting</h4>
          </div>
        </div>
        <div className="empty">
          Anything you write below lands here first, as rows you can correct before they reach a module.
        </div>
      </div>
    );
  }

  return (
    <div className="review">
      <div className="review-head">
        <div>
          <div className="kick">Review</div>
          <h4 style={{ margin: '4px 0 0' }}>
            {rows.length} draft {rows.length === 1 ? 'entry' : 'entries'}
          </h4>
        </div>
        <span className="tag tag-outline">{parser === 'fallback' ? 'parsed locally' : 'parsed'}</span>
      </div>

      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
        {rows.map((row) => (
          <DraftCard
            key={row.id}
            row={row}
            bookLabel={
              row.module_slug === 'reading'
                ? (() => {
                    const book = books.data?.find((b) => b.id === row.payload.book_id);
                    const end = row.payload.end_page;
                    return book && end ? `Takes you to p. ${group(end)} of ${group(book.total_pages ?? 0)}` : null;
                  })()
                : null
            }
            onPatch={(patch) => update.mutate({ id: row.id, patch })}
            onRemove={() => remove.mutate(row.id)}
          />
        ))}
      </div>

      <div style={{ padding: '14px 18px', borderTop: '1px solid var(--line)', display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: 1, justifyContent: 'flex-start', minHeight: 44 }}
          disabled={busy}
          onClick={() => onApprove(draftId)}
        >
          Approve {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ minHeight: 44 }}
          disabled={busy}
          onClick={() => onDiscard(draftId)}
        >
          Discard
        </button>
      </div>
    </div>
  );
}

function DraftCard({
  row,
  bookLabel,
  onPatch,
  onRemove,
}: {
  row: DraftRow;
  bookLabel: string | null;
  onPatch: (patch: Partial<DraftRow>) => void;
  onRemove: () => void;
}) {
  const def = moduleDef(row.module_slug);
  const items = (row.payload.items ?? []) as MealItem[];

  // Edits are held here and saved a moment after typing stops, so the draft
  // is not rewritten on every keystroke.
  const [draftItems, setDraftItems] = useState<MealItem[]>(items);
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) return;
    const timer = window.setTimeout(() => {
      dirty.current = false;
      const total = draftItems.reduce((sum, item) => sum + (Number(item.kcal) || 0), 0);
      onPatch({
        payload: { ...row.payload, items: draftItems },
        value: draftItems.some((i) => i.kcal != null) ? total : null,
      });
    }, 600);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftItems]);

  const setItems = (next: MealItem[]) => {
    dirty.current = true;
    setDraftItems(next);
  };

  // Leaving the card (say, for Approve) saves at once rather than waiting.
  const flush = () => {
    if (!dirty.current) return;
    dirty.current = false;
    const total = draftItems.reduce((sum, item) => sum + (Number(item.kcal) || 0), 0);
    onPatch({ payload: { ...row.payload, items: draftItems }, value: draftItems.some((i) => i.kcal != null) ? total : null });
  };

  return (
    <div className="draft" onBlur={flush}>
      <div className="draft-head">
        <span className="tag tag-accent">
          <Icon name={def.icon} />
          {def.name}
        </span>
        <span className="draft-note">
          {row.match_note}
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: '0 0 0 8px', fontSize: 11 }}
            onClick={onRemove}
          >
            remove
          </button>
        </span>
      </div>

      {row.module_slug === 'calories' ? (
        <MealItemsEditor items={draftItems} onChange={setItems} />
      ) : (
        <div className="draft-row">
          <input
            className="input"
            style={{ flex: 1 }}
            defaultValue={row.label ?? ''}
            onBlur={(e) => onPatch({ label: e.target.value })}
          />
          <input
            className="input kcal"
            defaultValue={row.value ?? ''}
            onBlur={(e) => onPatch({ value: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </div>
      )}

      {bookLabel ? <div style={{ fontSize: 11.5, opacity: 0.6 }}>{bookLabel}</div> : null}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11.5, opacity: 0.6 }}>
        <span>Time</span>
        <input
          className="input"
          style={{ width: 80, minHeight: 30 }}
          defaultValue={timeOfDay(row.occurred_at)}
          onBlur={(e) => {
            const [h, m] = e.target.value.split(':').map(Number);
            if (!Number.isFinite(h) || !Number.isFinite(m)) return;
            const at = new Date(row.occurred_at);
            at.setHours(h, m, 0, 0);
            onPatch({ occurred_at: at.toISOString() });
          }}
        />
      </div>
    </div>
  );
}
