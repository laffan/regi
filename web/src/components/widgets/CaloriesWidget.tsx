import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { MacroBar } from '@/components/Nutrition';
import { QuickInput } from './QuickInput';
import { useLogSavedMeal, useParseLog, useSetDayClosed } from '@/data/hooks';
import { totalKey } from '@/components/WeekStrip';
import { group } from '@/lib/format';
import type { MealItem } from '@/lib/types';
import type { WidgetProps } from './types';

const DEFAULT_TARGET = 2200;

/**
 * Calories, kept simple: say what you ate, then the day's number, what is
 * left, and the macro split. Sending a line goes straight to the Log, where
 * the draft appears as a placeholder while its items are looked up.
 */
export function CaloriesWidget({ compact, today, totals, entries, settings, savedMeals, closures }: WidgetProps) {
  const navigate = useNavigate();
  const parse = useParseLog();
  const quickAdd = useLogSavedMeal();
  const close = useSetDayClosed();

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
        <span className="wg-meta">{closed ? 'day closed' : `${group(target)} a day`}</span>
      </div>

      <QuickInput
        label="Log food"
        inputMode="text"
        ariaLabel="What did you eat?"
        placeholder="turkey sandwich and an apple"
        onSubmit={(text) => {
          parse.mutate(text);
          navigate('/log');
        }}
      >
        <label className="qcheck">
          <input
            type="checkbox"
            checked={closed}
            disabled={close.isPending}
            onChange={(e) => close.mutate({ slug: 'calories', date: today, closed: e.target.checked })}
          />
          Last meal of the day
        </label>
      </QuickInput>

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
          {left >= 0 ? `${group(left)} ${closed ? 'under' : 'left'}` : `${group(-left)} over`}
        </span>
      </div>

      {/* The day's intake, one segment per entry, then the shortfall… */}
      <div className="mealbar" style={compact ? { height: 10 } : undefined}>
        {[...meals].reverse().map((meal) => (
          <span key={meal.id} style={{ flex: Math.max(meal.value ?? 0, 1) }} title={meal.label ?? ''} />
        ))}
        {remaining > 0 ? <span className="rest" style={{ flex: remaining }} /> : null}
      </div>
      {/* …and the macros on the same scale beneath it. */}
      <MacroBar items={items} target={target} />

      {chips.length && !closed ? (
        <div className="chips" style={{ marginTop: 'auto' }}>
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
      ) : null}
    </div>
  );
}
