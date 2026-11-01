import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { LogButton } from './LogButton';
import { useLogWeight } from '@/data/hooks';
import { totalKey } from '@/components/WeekStrip';
import { movingMean, weeklyRate } from '@/lib/projection';
import { signed, weight as fmtWeight } from '@/lib/format';
import { timeOfDay } from '@/lib/dates';
import type { WidgetProps } from './types';

/** Weight, typed into one large field. The last reading sits in it as a hint. */
export function WeightWidget({ compact, today, totals, entries, series, profile }: WidgetProps) {
  const log = useLogWeight();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const todayTotal = totals.get(totalKey(today, 'weight'));
  const last = todayTotal?.value ?? series.at(-1)?.value ?? null;
  const rate = useMemo(() => weeklyRate(movingMean(series, 7).slice(-21)), [series]);
  const loggedAt = entries.find((e) => e.module_slug === 'weight')?.occurred_at;
  const unit = profile.weight_unit;

  const submit = () => {
    const value = Number(text.replace(',', '.'));
    const [lo, hi] = unit === 'kg' ? [20, 350] : [40, 800];
    if (!text.trim() || !Number.isFinite(value)) {
      setError('Type a weight first.');
      return;
    }
    if (value < lo || value > hi) {
      setError(`That reads as ${value} ${unit} — check the number.`);
      return;
    }
    setError(null);
    log.mutate({ value: Math.round(value * 10) / 10, unit }, { onSuccess: () => setText('') });
  };

  return (
    <div className={compact ? 'wg wg-compact' : 'wg'}>
      <div className="wg-head">
        <Link to="/module/weight" className="kick">
          <Icon name="scale" />
          Weight
        </Link>
        <span className="wg-meta">{loggedAt ? `logged ${timeOfDay(loggedAt)}` : 'not logged today'}</span>
      </div>

      <label className="wfield" htmlFor="weight-input">
        <input
          id="weight-input"
          type="number"
          inputMode="decimal"
          step="0.1"
          aria-label={`Weight in ${unit}`}
          placeholder={last !== null ? fmtWeight(last) : '0.0'}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <span className="unit">{unit}</span>
      </label>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11.5 }}>
        <span style={{ opacity: 0.6 }}>
          {last !== null ? `Last ${fmtWeight(last)} ${unit}` : 'No readings yet'}
        </span>
        {rate !== null ? (
          <span className="delta" style={{ marginLeft: 'auto' }}>
            {signed(rate)} / wk
          </span>
        ) : null}
      </div>

      {error ? <div className="error">{error}</div> : null}

      <LogButton label="Log weight" compact={compact} busy={log.isPending} onClick={submit} />
    </div>
  );
}
