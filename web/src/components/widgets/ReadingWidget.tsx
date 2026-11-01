import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { QuickInput } from './QuickInput';
import { useLogPages } from '@/data/hooks';
import { totalKey } from '@/components/WeekStrip';
import { group } from '@/lib/format';
import type { WidgetProps } from './types';

export function ReadingWidget({ compact, today, isToday, when, totals, goals, books }: WidgetProps) {
  const log = useLogPages();

  const book = books.find((b) => b.status === 'reading') ?? null;
  const pagesToday = totals.get(totalKey(today, 'reading'))?.value ?? 0;
  const dailyGoal = goals.find((g) => g.module_slug === 'reading' && g.cadence === 'daily')?.target ?? 30;
  const progress = book?.total_pages ? Math.min(book.current_page / book.total_pages, 1) : 0;

  const coverSize = compact ? { width: 44, height: 64 } : { width: 52, height: 76 };

  return (
    <div className={compact ? 'wg wg-compact' : 'wg'}>
      <Link to="/module/reading" className="kick">
        <Icon name="book-open" />
        Reading
      </Link>

      <QuickInput
        label="Log pages"
        inputMode="numeric"
        ariaLabel={book ? `Pages read of ${book.title}` : 'Pages read'}
        placeholder={book ? `pages of ${book.title}` : 'pages read'}
        busy={log.isPending}
        error={log.isError ? (log.error as Error).message : null}
        onSubmit={(text) => {
          const count = Number(text.replace(/[^\d.]/g, ''));
          if (!Number.isFinite(count) || count <= 0) return 'Type how many pages, e.g. 24.';
          log.mutate({ pages: Math.round(count), book, when });
        }}
      />

      {book ? (
        <>
          <div style={{ display: 'flex', gap: 12 }}>
            {book.cover_url ? (
              <img className="cover grayscale" src={book.cover_url} alt="" style={coverSize} />
            ) : (
              <div className="cover grayscale" style={coverSize}>
                {book.title.slice(0, 18)}
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ font: "800 14px/1.2 'Archivo'" }}>{book.title}</div>
              {book.author ? (
                <div style={{ fontSize: 11.5, opacity: 0.6, marginTop: 2 }}>{book.author}</div>
              ) : null}
              <div style={{ fontSize: 11.5, opacity: 0.6, marginTop: 8 }}>
                p. {group(book.current_page)}
                {book.total_pages ? ` of ${group(book.total_pages)}` : ''}
              </div>
            </div>
          </div>

          {book.total_pages ? (
            <div className="bar">
              <span style={{ width: `${progress * 100}%` }} />
            </div>
          ) : null}
        </>
      ) : (
        <div style={{ fontSize: 12.5, opacity: 0.6 }}>No book in progress — add one from the module.</div>
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <div style={{ font: "800 22px 'Archivo'" }}>{group(pagesToday)}</div>
        <span style={{ fontSize: 11.5, opacity: 0.6 }}>of {group(Number(dailyGoal))} pages {isToday ? 'today' : 'that day'}</span>
      </div>

    </div>
  );
}
