import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { QuickInput } from './QuickInput';
import { useLogWeight } from '@/data/hooks';
import { totalKey } from '@/components/WeekStrip';
import { movingMean, weeklyRate } from '@/lib/projection';
import { signed, weight as fmtWeight } from '@/lib/format';
import { timeOfDay } from '@/lib/dates';
import type { WidgetProps } from './types';

/** Weight: type the reading, then the last one and the trend beneath. */
export function WeightWidget({ compact, today, isToday, when, totals, entries, series, profile }: WidgetProps) {
  const log = useLogWeight();

  const todayTotal = totals.get(totalKey(today, 'weight'));
  const last = todayTotal?.value ?? series.at(-1)?.value ?? null;
  const rate = useMemo(() => weeklyRate(movingMean(series, 7).slice(-21)), [series]);
  const loggedAt = entries.find((e) => e.module_slug === 'weight')?.occurred_at;
  const unit = profile.weight_unit;

  return (
    <div className={compact ? 'wg wg-compact' : 'wg'}>
      <div className="wg-head">
        <Link to="/module/weight" className="kick">
          <Icon name="scale" />
          Weight
        </Link>
        <span className="wg-meta">{loggedAt ? `logged ${timeOfDay(loggedAt)}` : isToday ? 'not logged today' : 'not logged that day'}</span>
      </div>

      <QuickInput
        label="Log weight"
        ariaLabel={`Weight in ${unit}`}
        placeholder={last !== null ? `${fmtWeight(last)} ${unit}` : `weight in ${unit}`}
        busy={log.isPending}
        error={log.isError ? (log.error as Error).message : null}
        onSubmit={(text) => {
          const value = Number(text.replace(',', '.').replace(/[^\d.]/g, ''));
          const [lo, hi] = unit === 'kg' ? [20, 350] : [40, 800];
          if (!Number.isFinite(value) || value === 0) return 'Type a weight, e.g. 182.4.';
          if (value < lo || value > hi) return `That reads as ${value} ${unit} — check the number.`;
          log.mutate({ value: Math.round(value * 10) / 10, unit, when });
        }}
      />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div className="big" style={compact ? { fontSize: 36 } : undefined}>
          {last !== null ? fmtWeight(last) : '—'}
        </div>
        <span style={{ fontSize: 12, opacity: 0.6 }}>{unit}</span>
        {rate !== null ? (
          <span className="delta" style={{ marginLeft: 'auto' }}>
            {signed(rate)} / wk
          </span>
        ) : null}
      </div>
      <div className="qnote">{todayTotal ? (isToday ? 'today' : 'that day') : last !== null ? 'last reading' : 'no readings yet'}</div>
    </div>
  );
}
