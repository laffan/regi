import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { QuickInput } from './QuickInput';
import { useLogSleep } from '@/data/hooks';
import { totalKey } from '@/components/WeekStrip';
import { startOfWeek, weekDays } from '@/lib/dates';
import type { WidgetProps } from './types';

export function SleepWidget({ compact, today, totals, goals }: WidgetProps) {
  const log = useLogSleep();

  const hours = totals.get(totalKey(today, 'sleep'))?.value ?? 0;
  const goal = Number(goals.find((g) => g.module_slug === 'sleep' && g.cadence === 'daily')?.target ?? 8);
  const days = weekDays(startOfWeek(today));

  return (
    <div className={compact ? 'wg wg-compact' : 'wg'}>
      <div className="wg-head">
        <Link to="/module/sleep" className="kick">
          <Icon name="bell" />
          Sleep
        </Link>
        <span className="wg-meta">hours</span>
      </div>

      <QuickInput
        label="Log sleep"
        ariaLabel="Hours slept"
        placeholder="hours slept, e.g. 7.5"
        busy={log.isPending}
        error={log.isError ? (log.error as Error).message : null}
        onSubmit={(text) => {
          const h = Number(text.replace(',', '.').replace(/[^\d.]/g, ''));
          if (!Number.isFinite(h) || h <= 0 || h > 24) return 'Type the hours slept, e.g. 7.5.';
          log.mutate(h);
        }}
      />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div className="big" style={compact ? { fontSize: 36 } : undefined}>
          {hours.toFixed(1)}
        </div>
        <span style={{ fontSize: 11.5, opacity: 0.6 }}>of {goal}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 34 }}>
        {days.map((d) => {
          const value = totals.get(totalKey(d, 'sleep'))?.value ?? 0;
          return (
            <span
              key={d}
              title={`${d}: ${value.toFixed(1)} h`}
              style={{
                flex: 1,
                height: value ? `${Math.min((value / (goal * 1.25)) * 100, 100)}%` : '6%',
                background: value ? 'var(--ink)' : 'color-mix(in srgb, var(--ink) 10%, transparent)',
              }}
            />
          );
        })}
      </div>

    </div>
  );
}
