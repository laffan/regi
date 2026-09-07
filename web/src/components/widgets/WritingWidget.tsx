import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { LogButton } from './LogButton';
import { ValueDialog } from '@/components/ValueDialog';
import { useLogWords } from '@/data/hooks';
import { totalKey } from '@/components/WeekStrip';
import { group } from '@/lib/format';
import { rangeOfDays } from '@/lib/dates';
import { streak } from '@/lib/projection';
import type { WidgetProps } from './types';

export function WritingWidget({ compact, today, totals, goals, series }: WidgetProps) {
  const log = useLogWords();
  const [logging, setLogging] = useState(false);

  const wordsToday = totals.get(totalKey(today, 'writing'))?.value ?? 0;
  const goal = Number(goals.find((g) => g.module_slug === 'writing' && g.cadence === 'daily')?.target ?? 750);
  const days = rangeOfDays(today, 14);
  const monthTotal = series
    .filter((p) => p.date.slice(0, 7) === today.slice(0, 7))
    .reduce((sum, p) => sum + p.value, 0);

  return (
    <div className={compact ? 'wg wg-compact' : 'wg'}>
      <div className="wg-head">
        <Link to="/module/writing" className="kick">
          <Icon name="pencil" />
          Writing
        </Link>
        <span className="wg-meta">words</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div className="big" style={compact ? { fontSize: 36 } : undefined}>
          {group(wordsToday)}
        </div>
        <span style={{ fontSize: 11.5, opacity: 0.6 }}>of {group(goal)}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(14, 1fr)', gap: 3 }}>
        {days.map((d) => {
          const value = totals.get(totalKey(d, 'writing'))?.value ?? 0;
          return (
            <span
              key={d}
              title={`${d}: ${group(value)} words`}
              style={{
                aspectRatio: '1',
                background:
                  d === today && value
                    ? 'var(--color-accent)'
                    : value
                      ? 'var(--ink)'
                      : 'color-mix(in srgb, var(--ink) 10%, transparent)',
              }}
            />
          );
        })}
      </div>

      <div style={{ fontSize: 11, opacity: 0.55 }}>
        Streak {streak(series, (v) => v > 0)} days · {group(monthTotal)} this month
      </div>

      <LogButton label="Log session" compact={compact} onClick={() => setLogging(true)} />

      {logging ? (
        <ValueDialog
          title="Log session"
          submitLabel="Log"
          busy={log.isPending}
          fields={[{ name: 'words', label: 'Words written', placeholder: '640' }]}
          onClose={() => setLogging(false)}
          onSubmit={({ words }) => {
            const count = Number(words);
            if (!Number.isFinite(count) || count <= 0) return;
            log.mutate(count, { onSuccess: () => setLogging(false) });
          }}
        />
      ) : null}
    </div>
  );
}
