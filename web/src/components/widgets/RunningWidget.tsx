import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { QuickInput } from './QuickInput';
import { useLogRun } from '@/data/hooks';
import { totalKey } from '@/components/WeekStrip';
import { duration, pace } from '@/lib/format';
import { startOfWeek, weekDays } from '@/lib/dates';
import type { WidgetProps } from './types';

export function RunningWidget({ compact, today, totals, goals, entries, profile }: WidgetProps) {
  const log = useLogRun();

  const days = weekDays(startOfWeek(today));
  const week = days.map((d) => totals.get(totalKey(d, 'running'))?.value ?? 0);
  const done = week.reduce((sum, v) => sum + v, 0);
  const goal = Number(goals.find((g) => g.module_slug === 'running' && g.cadence === 'weekly')?.target ?? 20);
  const max = Math.max(...week, 1);

  const lastRun = entries.find((e) => e.module_slug === 'running');
  const lastSeconds = Number(lastRun?.payload?.duration_s ?? 0);

  return (
    <div className={compact ? 'wg wg-compact' : 'wg'}>
      <div className="wg-head">
        <Link to="/module/running" className="kick">
          <Icon name="run" />
          Running
        </Link>
        <span className="wg-meta">this week</span>
      </div>

      <QuickInput
        label="Log run"
        inputMode="text"
        ariaLabel={`Distance in ${profile.distance_unit}, and optionally a time`}
        placeholder={`5.1 ${profile.distance_unit} in 44:20`}
        busy={log.isPending}
        error={log.isError ? (log.error as Error).message : null}
        onSubmit={(text) => {
          // "5.1", "5.1 mi", "5.1 44:20", "5.1 in 1:02:10" — the distance first,
          // a clock-style time anywhere after it.
          const time = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
          const rest = time ? text.replace(time[0], ' ') : text;
          const distance = Number(rest.replace(',', '.').match(/\d+(?:\.\d+)?/)?.[0]);
          if (!Number.isFinite(distance) || distance <= 0) return `Type a distance, e.g. 5.1 or 5.1 in 44:20.`;
          const seconds = time
            ? time[3]
              ? Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3])
              : Number(time[1]) * 60 + Number(time[2])
            : null;
          log.mutate({ miles: distance, unit: profile.distance_unit, seconds });
        }}
      />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div className="big" style={compact ? { fontSize: 36 } : undefined}>
          {done.toFixed(1)}
        </div>
        <span style={{ fontSize: 11.5, opacity: 0.6 }}>
          of {goal} {profile.distance_unit}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 38 }}>
        {days.map((d, i) => (
          <span
            key={d}
            title={`${d}: ${week[i].toFixed(1)} ${profile.distance_unit}`}
            style={{
              flex: 1,
              height: week[i] ? `${Math.max((week[i] / max) * 100, 8)}%` : '6%',
              background: d === today && week[i] ? 'var(--color-accent)' : week[i] ? 'var(--ink)' : 'color-mix(in srgb, var(--ink) 10%, transparent)',
            }}
          />
        ))}
      </div>

      {lastRun ? (
        <div style={{ fontSize: 11, opacity: 0.55 }}>
          Last: {(lastRun.value ?? 0).toFixed(1)} {lastRun.unit ?? profile.distance_unit}
          {lastSeconds ? ` · ${duration(lastSeconds)} pace ${pace(lastSeconds, lastRun.value ?? 0)}` : ''}
        </div>
      ) : null}

    </div>
  );
}
