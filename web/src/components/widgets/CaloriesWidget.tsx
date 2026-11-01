import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { MacroBar, SourceSummary } from '@/components/Nutrition';
import { LogButton } from './LogButton';
import { ValueDialog } from '@/components/ValueDialog';
import { useLogSavedMeal, useParseLog, useSetDayClosed } from '@/data/hooks';
import { totalKey } from '@/components/WeekStrip';
import { group } from '@/lib/format';
import type { MealItem } from '@/lib/types';
import type { WidgetProps } from './types';

const DEFAULT_TARGET = 2200;

export function CaloriesWidget({ compact, today, totals, entries, settings, savedMeals, closures }: WidgetProps) {
  const navigate = useNavigate();
  const parse = useParseLog();
  const quickAdd = useLogSavedMeal();
  const close = useSetDayClosed();
  const [logging, setLogging] = useState(false);

  const target = Number(settings.daily_target ?? DEFAULT_TARGET);
  const day = totals.get(totalKey(today, 'calories'));
  const eaten = day?.value ?? 0;
  const meals = entries.filter((e) => e.module_slug === 'calories');
  const items = meals.flatMap((m) => (m.items ?? []) as MealItem[]);
  const closed = closures.some((c) => c.module_slug === 'calories' && c.local_date === today);

  const left = target - eaten;
  const remaining = Math.max(left, 0);
  const chips = savedMeals.slice(0, compact ? 2 : 3);

  return (
    <div className={compact ? 'wg wg-compact' : 'wg'}>
      <div className="wg-head">
        <Link to="/module/calories" className="kick">
          <Icon name="utensils" />
          Calories
        </Link>
        <span className="wg-meta">
          {closed ? 'day closed' : meals.length ? `${meals.length} logged` : 'nothing yet'}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div className="big" style={compact ? { fontSize: 36 } : undefined}>
          {group(eaten)}
        </div>
        <span style={{ fontSize: 12, opacity: 0.6 }}>/ {group(target)}</span>
        <span
          className="delta"
          style={{ marginLeft: 'auto', color: left < 0 ? 'var(--color-accent-700)' : 'inherit' }}
          aria-live="polite"
        >
          {left >= 0 ? `${group(left)} left` : `${group(-left)} over`}
        </span>
      </div>

      {/* One segment per entry, in the order eaten, then the shortfall… */}
      <div className="mealbar" style={compact ? { height: 10 } : undefined}>
        {[...meals].reverse().map((meal) => (
          <span key={meal.id} style={{ flex: Math.max(meal.value ?? 0, 1) }} title={meal.label ?? ''} />
        ))}
        {remaining > 0 ? <span className="rest" style={{ flex: remaining }} /> : null}
      </div>
      {/* …and the macros on the same scale beneath it. */}
      <MacroBar items={items} target={target} showKey={!compact} />

      {!compact && meals.length ? (
        <div className="meal-list">
          {[...meals].reverse().map((meal) => (
            <div key={meal.id}>
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meal.label}</span>
                <SourceSummary items={(meal.items ?? []) as MealItem[]} />
              </span>
              <b>{group(meal.value ?? 0)}</b>
            </div>
          ))}
        </div>
      ) : null}

      {chips.length && !closed ? (
        <div style={!compact ? { borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 'auto' } : undefined}>
          {!compact ? (
            <div className="kickn" style={{ marginBottom: 7 }}>
              <Icon name="bookmark" />
              Saved
            </div>
          ) : null}
          <div className="chips">
            {chips.map((meal) => (
              <button
                key={meal.id}
                type="button"
                className="btn btn-secondary chip"
                disabled={quickAdd.isPending}
                onClick={() => quickAdd.mutate(meal.id)}
                title={meal.detail ?? undefined}
              >
                {meal.name} <span>{group(meal.kcal)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="push" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {closed ? (
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Day closed at {group(eaten)} kcal — {left >= 0 ? `${group(left)} under` : `${group(-left)} over`}.
          </div>
        ) : null}
        <button
          type="button"
          className="btn btn-secondary btn-block"
          style={{ marginTop: 0 }}
          aria-pressed={closed}
          disabled={close.isPending || (!closed && meals.length === 0)}
          onClick={() => close.mutate({ slug: 'calories', date: today, closed: !closed })}
          title={
            closed
              ? 'Reopen today if you eat something else'
              : "Mark today's count complete: the number stops being a running total"
          }
        >
          <Icon name={closed ? 'check' : 'flag'} />
          {closed ? 'Day closed — reopen' : 'Last meal of the day'}
        </button>
        <LogButton label="Log food" compact={compact} onClick={() => setLogging(true)} />
      </div>

      {logging ? (
        <ValueDialog
          title="Log food"
          submitLabel="Parse"
          busy={parse.isPending}
          error={parse.error ? String((parse.error as Error).message ?? parse.error) : null}
          fields={[
            {
              name: 'text',
              label:
                'What did you eat? Each item is matched against your sources in order and shown for review, with where every number came from.',
              placeholder: 'turkey sandwich and a bag of chips',
            },
          ]}
          onClose={() => setLogging(false)}
          onSubmit={({ text }) => {
            if (!text.trim()) return;
            parse.mutate(text, {
              onSuccess: () => {
                setLogging(false);
                navigate('/log');
              },
            });
          }}
        />
      ) : null}
    </div>
  );
}
