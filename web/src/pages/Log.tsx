// 1d — text in, parse, review, approve.
//
// The log is module-agnostic: one line goes to the server, comes back as typed
// draft rows, and nothing reaches a module until the review column is approved.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { EntryEditDialog } from '@/components/EntryEditDialog';
import { MacroBar, MacroLine, MealItemsEditor, SourceSummary } from '@/components/Nutrition';
import { VoiceButton } from '@/components/VoiceButton';
import {
  useApproveDraft,
  useBooks,
  useDeleteDraftRow,
  useDiscardDraft,
  useEntries,
  useParseLog,
  useModules,
  useParsing,
  usePendingDrafts,
  useUpdateDraftRow,
} from '@/data/hooks';
import { addDays, dowShort, monthName, timeOfDay, today as todayISO } from '@/lib/dates';
import { group, moduleValue } from '@/lib/format';
import { moduleDef } from '@/modules/registry';
import type { DraftRow, Entry, MealItem } from '@/lib/types';
import type { PendingDraft } from '@/data/api';

const HISTORY_DAYS = 14;

export function LogPage() {
  const today = todayISO();
  const entries = useEntries(addDays(today, -(HISTORY_DAYS - 1)), today);
  const drafts = usePendingDrafts();
  const parsing = useParsing();
  const modules = useModules();

  const parse = useParseLog();
  const approve = useApproveDraft();
  const discard = useDiscardDraft();

  const [text, setText] = useState('');
  const [editing, setEditing] = useState<Entry | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  // Arriving from the dashboard's meal bar: show that entry, marked.
  const [params, setParams] = useSearchParams();
  const target = params.get('entry');
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    if (!target || !entries.data) return;
    if (!entries.data.some((e) => e.id === target)) return;
    setFilter('all');
    setFlash(target);
    requestAnimationFrame(() =>
      document.getElementById(`entry-${target}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
    );
    setParams({}, { replace: true });
  }, [target, entries.data, setParams]);
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 2500);
    return () => window.clearTimeout(t);
  }, [flash]);

  // Every module with something in the fortnight, plus the active ones.
  const filterOptions = useMemo(() => {
    const slugs = new Set<string>((modules.data ?? []).filter((m) => m.active).map((m) => m.slug));
    for (const entry of entries.data ?? []) slugs.add(entry.module_slug);
    return [...slugs].map((slug) => moduleDef(slug));
  }, [modules.data, entries.data]);

  const byDay = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const entry of entries.data ?? []) {
      if (filter !== 'all' && entry.module_slug !== filter) continue;
      const list = map.get(entry.local_date) ?? [];
      list.push(entry);
      map.set(entry.local_date, list);
    }
    // Today always heads the list, even before anything is logged, so the
    // filter has somewhere to sit.
    if (!map.has(today)) map.set(today, []);
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries.data, filter, today]);

  // Sending clears the line at once; the line's progress shows in the review
  // column as a placeholder draft, not on this button.
  const submit = () => {
    const value = text.trim();
    if (!value) return;
    parse.mutate(value);
    setText('');
  };

  return (
    <div className="log-split">
      <div className="log-main">
        <div className="log-input">
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
              disabled={!text.trim()}
            >
              Input
            </button>
          </div>
          <div style={{ fontSize: 11, opacity: 0.5, marginTop: 6 }}>
            One line, any modules — typed or spoken. Parsed on the server, then shown for review.
          </div>
        </div>
        <div style={{ flex: 1, padding: '20px 20px 24px' }}>
          {entries.isLoading ? <div className="spinner">Loading entries…</div> : null}

          {byDay.map(([date, list], index) => (
            <div key={date} style={index ? { marginTop: 18, paddingTop: 12, borderTop: '1px solid var(--line)' } : undefined}>
              <div className="row-between">
                <h4 style={{ margin: 0 }}>
                  {date === today ? 'Today' : `${dowShort(date)} ${Number(date.slice(8))} ${monthName(date)}`}
                </h4>
                {index === 0 ? (
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span style={{ opacity: 0.6 }}>Show</span>
                    <select
                      className="input"
                      style={{ width: 'auto', minHeight: 32, padding: '4px 8px', fontSize: 13 }}
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      aria-label="Filter the log by module"
                    >
                      <option value="all">All modules</option>
                      {filterOptions.map((def) => (
                        <option key={def.slug} value={def.slug}>
                          {def.name}
                        </option>
                      ))}
                    </select>
                  </label>
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
                  {list.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ opacity: 0.5, fontSize: 13 }}>
                        {filter === 'all' ? 'Nothing yet today.' : `No ${moduleDef(filter).name.toLowerCase()} today.`}
                      </td>
                    </tr>
                  ) : null}
                  {list.map((entry) => {
                    const def = moduleDef(entry.module_slug);
                    return (
                      <tr key={entry.id} id={`entry-${entry.id}`} className={flash === entry.id ? 'log-row flash' : 'log-row'}>
                        <td style={{ opacity: 0.6 }}>{timeOfDay(entry.occurred_at)}</td>
                        <td>
                          {entry.label}
                          {entry.module_slug === 'calories' && entry.items?.length ? (
                            <span style={{ marginLeft: 8 }}>
                              <SourceSummary items={entry.items as MealItem[]} />
                            </span>
                          ) : null}
                          {entry.module_slug === 'calories' && entry.items?.length ? (
                            <div style={{ fontSize: 11.5, marginTop: 2 }}>
                              <MacroLine items={entry.items as MealItem[]} />
                            </div>
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
                          {entry.module_slug === 'calories' ? (
                            <>
                              {group(entry.value ?? 0)} kcal
                              {entry.items?.length ? (
                                <div style={{ marginTop: 4 }}>
                                  <MacroBar items={entry.items as MealItem[]} target={entry.value ?? 0} height={3} showKey={false} />
                                </div>
                              ) : null}
                            </>
                          ) : (
                            moduleValue(entry.module_slug, entry.value, entry.unit)
                          )}
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

          {!entries.isLoading && (entries.data ?? []).length === 0 ? (
            <div className="empty">Nothing logged yet. Write a line below and it will be parsed for review.</div>
          ) : null}
        </div>

      </div>

      <ReviewColumn
        drafts={drafts.data ?? []}
        pending={parsing.pending}
        failed={parsing.failed}
        busy={approve.isPending || discard.isPending}
        onApprove={async (ids) => {
          for (const id of ids) await approve.mutateAsync(id);
        }}
        onDiscard={async (ids) => {
          for (const id of ids) await discard.mutateAsync(id);
        }}
        onRetry={(line) => setText(line)}
      />

      {editing ? <EntryEditDialog entry={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function ReviewColumn({
  drafts,
  pending,
  failed,
  busy,
  onApprove,
  onDiscard,
  onRetry,
}: {
  drafts: PendingDraft[];
  /** Lines sent and still being read and priced. */
  pending: string[];
  failed: { text: string; error: string }[];
  busy: boolean;
  onApprove: (draftIds: string[]) => Promise<void>;
  onDiscard: (draftIds: string[]) => Promise<void>;
  onRetry: (line: string) => void;
}) {
  const update = useUpdateDraftRow();
  const remove = useDeleteDraftRow();
  const books = useBooks();

  const rows = drafts.flatMap((d) => d.rows);
  const ids = drafts.map((d) => d.draft.id);
  const nothing = rows.length === 0 && pending.length === 0 && failed.length === 0;
  const locally = drafts.some((d) => d.draft.parser === 'fallback');

  if (nothing) {
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
            {pending.length ? <span style={{ opacity: 0.5 }}> · {pending.length} on the way</span> : null}
          </h4>
        </div>
        {rows.length ? <span className="tag tag-outline">{locally ? 'parsed locally' : 'parsed'}</span> : null}
      </div>

      {/* Decide first, then read the detail below. */}
      {rows.length ? (
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1, justifyContent: 'flex-start', minHeight: 44 }}
            disabled={busy}
            onClick={() => void onApprove(ids)}
          >
            Approve {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ minHeight: 44 }}
            disabled={busy}
            onClick={() => void onDiscard(ids)}
          >
            Discard
          </button>
        </div>
      ) : null}

      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
        {failed.map((f, i) => (
          <div className="error" key={`failed-${i}`}>
            Could not read “{f.text}” — {f.error}{' '}
            <button type="button" className="btn btn-ghost" style={{ padding: '0 4px', fontSize: 12 }} onClick={() => onRetry(f.text)}>
              put it back in the input
            </button>
          </div>
        ))}

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

        {/* A line still being read and priced: its draft, before it has rows. */}
        {pending.map((line, i) => (
          <div className="draft draft-pending" key={`pending-${i}`} aria-busy="true">
            <div className="draft-head">
              <span className="tag tag-neutral">Reading the line…</span>
              <span className="draft-note">looking up sources</span>
            </div>
            <div style={{ fontSize: 13 }}>“{line}”</div>
            <div className="skeleton" style={{ width: '82%' }} />
            <div className="skeleton" style={{ width: '58%' }} />
          </div>
        ))}
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
