import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { LogButton } from './LogButton';
import { ValueDialog } from '@/components/ValueDialog';
import { useLogRun } from '@/data/hooks';
import { totalKey } from '@/components/WeekStrip';
import { duration, pace } from '@/lib/format';
import { startOfWeek, weekDays } from '@/lib/dates';
import type { WidgetProps } from './types';

export function RunningWidget({ compact, today, totals, goals, entries, profile }: WidgetProps) {
  const log = useLogRun();
  const [logging, setLogging] = useState(false);

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

      <LogButton label="Log run" compact={compact} onClick={() => setLogging(true)} />

      {logging ? (
        <ValueDialog
          title="Log run"
          submitLabel="Log"
          busy={log.isPending}
          fields={[
            { name: 'distance', label: `Distance (${profile.distance_unit})`, placeholder: '5.1' },
            { name: 'time', label: 'Time (mm:ss or h:mm:ss, optional)', placeholder: '44:20' },
          ]}
          onClose={() => setLogging(false)}
          onSubmit={({ distance, time }) => {
            const miles = Number(distance);
            if (!Number.isFinite(miles) || miles <= 0) return;

            const parts = time.split(':').map(Number).filter((n) => Number.isFinite(n));
            const seconds =
              parts.length === 3
                ? parts[0] * 3600 + parts[1] * 60 + parts[2]
                : parts.length === 2
                  ? parts[0] * 60 + parts[1]
                  : null;

            log.mutate(
              { miles, unit: profile.distance_unit, seconds },
              { onSuccess: () => setLogging(false) },
            );
          }}
        />
      ) : null}
    </div>
  );
}
