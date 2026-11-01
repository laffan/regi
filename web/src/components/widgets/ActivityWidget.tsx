import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { useSetActivityDone } from '@/data/hooks';
import { totalKey } from '@/components/WeekStrip';
import { rangeOfDays } from '@/lib/dates';
import { moduleDef } from '@/modules/registry';
import type { WidgetProps } from './types';

/**
 * A tracker someone made for themselves. No numbers, no settings: one switch
 * for today — "I did!" or "Not today" — and the last fortnight beneath it.
 */
export function ActivityWidget({ slug, compact, today, isToday, totals }: WidgetProps) {
  const def = moduleDef(slug);
  const toggle = useSetActivityDone();

  const doneOn = (date: string) => (totals.get(totalKey(date, slug))?.value ?? 0) > 0;
  const done = toggle.isPending ? Boolean(toggle.variables?.done) : doneOn(today);
  const days = rangeOfDays(today, 14);

  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (doneOn(days[i])) streak++;
    else if (days[i] !== today) break;
  }
  const count = days.filter(doneOn).length;

  return (
    <div className={compact ? 'wg wg-compact' : 'wg'}>
      <div className="wg-head">
        <Link to={`/module/${slug}`} className="kick">
          <Icon name={def.icon} />
          {def.name}
        </Link>
        <span className="wg-meta">{count} of 14 days</span>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={done}
        aria-label={`${def.name} ${isToday ? 'today' : 'that day'}`}
        className="switch"
        disabled={toggle.isPending}
        onClick={() => toggle.mutate({ slug, name: def.name, date: today, done: !done })}
      >
        <span className="yes">I did!</span>
        <span className="no">Not today</span>
      </button>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div className="big" style={compact ? { fontSize: 36 } : undefined}>
          {streak}
        </div>
        <span style={{ fontSize: 11.5, opacity: 0.6 }}>day{streak === 1 ? '' : 's'} running</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(14, 1fr)', gap: 3 }}>
        {days.map((date) => (
          <span
            key={date}
            title={`${date}: ${doneOn(date) ? 'done' : 'not done'}`}
            style={{
              aspectRatio: '1',
              background: doneOn(date)
                ? date === today
                  ? 'var(--color-accent)'
                  : 'var(--ink)'
                : 'color-mix(in srgb, var(--ink) 10%, transparent)',
            }}
          />
        ))}
      </div>

      {toggle.isError ? <div className="error">{(toggle.error as Error).message}</div> : null}
    </div>
  );
}
