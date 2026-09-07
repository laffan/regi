import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { LogButton } from './LogButton';
import { useLogWeight } from '@/data/hooks';
import { totalKey } from '@/components/WeekStrip';
import { movingMean, weeklyRate } from '@/lib/projection';
import { signed, weight as fmtWeight } from '@/lib/format';
import { timeOfDay } from '@/lib/dates';
import type { WidgetProps } from './types';

const TICKS = 13;
const RANGE = 0.6; // the scrubber spans ±0.6 either side of the last reading

/** Weight, set by dragging rather than typed at a keypad. */
export function WeightWidget({ compact, today, totals, entries, series, profile }: WidgetProps) {
  const log = useLogWeight();
  const trackRef = useRef<HTMLDivElement>(null);

  const todayTotal = totals.get(totalKey(today, 'weight'));
  const lastLogged = todayTotal?.value ?? series.at(-1)?.value ?? 180;
  const [pending, setPending] = useState<number | null>(null);

  const value = pending ?? lastLogged;
  const lo = Math.round((lastLogged - RANGE) * 10) / 10;
  const hi = Math.round((lastLogged + RANGE) * 10) / 10;

  const rate = useMemo(() => weeklyRate(movingMean(series, 7).slice(-21)), [series]);
  const loggedAt = entries.find((e) => e.module_slug === 'weight')?.occurred_at;

  const setFromPointer = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const fraction = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    setPending(Math.round((lo + fraction * (hi - lo)) * 10) / 10);
  };

  const activeTick = Math.round(((value - lo) / (hi - lo || 1)) * (TICKS - 1));

  return (
    <div className={compact ? 'wg wg-compact' : 'wg'}>
      <div className="wg-head">
        <Link to="/module/weight" className="kick">
          <Icon name="scale" />
          Weight
        </Link>
        <span className="wg-meta">{loggedAt ? timeOfDay(loggedAt) : profile.weight_unit}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div className="big" style={compact ? { fontSize: 36 } : undefined}>
          {fmtWeight(value)}
        </div>
        {!compact ? <span style={{ fontSize: 12, opacity: 0.6 }}>{profile.weight_unit}</span> : null}
        {rate !== null ? (
          <span className="delta" style={{ marginLeft: 'auto' }}>
            {signed(rate)} / wk
          </span>
        ) : null}
      </div>

      <div
        className="scrub"
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Weight"
        aria-valuemin={lo}
        aria-valuemax={hi}
        aria-valuenow={value}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          setFromPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) setFromPointer(e.clientX);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setPending(Math.max(Math.round((value - 0.1) * 10) / 10, lo));
          if (e.key === 'ArrowRight') setPending(Math.min(Math.round((value + 0.1) * 10) / 10, hi));
        }}
      >
        <div className="scrub-ticks" style={compact ? { height: 22 } : undefined}>
          {Array.from({ length: TICKS }, (_, i) => (
            <span
              key={i}
              className={i === activeTick ? 'tick here' : 'tick'}
              style={{
                height: i === activeTick ? (compact ? 22 : 26) : i % 3 === 1 ? 16 : 10,
              }}
            />
          ))}
        </div>
        {!compact ? (
          <div className="scrub-scale">
            <span>{fmtWeight(lo)}</span>
            <span>drag to set</span>
            <span>{fmtWeight(hi)}</span>
          </div>
        ) : null}
      </div>

      <LogButton
        label="Log weight"
        compact={compact}
        busy={log.isPending}
        onClick={() => {
          log.mutate(
            { value, unit: profile.weight_unit },
            { onSuccess: () => setPending(null) },
          );
        }}
      />
    </div>
  );
}
