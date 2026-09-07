import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { LogButton } from './LogButton';
import { ValueDialog } from '@/components/ValueDialog';
import { useLogSavedMeal, useParseLog } from '@/data/hooks';
import { totalKey } from '@/components/WeekStrip';
import { group } from '@/lib/format';
import type { WidgetProps } from './types';

const DEFAULT_TARGET = 2200;

export function CaloriesWidget({ compact, today, totals, entries, settings, savedMeals }: WidgetProps) {
  const navigate = useNavigate();
  const parse = useParseLog();
  const quickAdd = useLogSavedMeal();
  const [logging, setLogging] = useState(false);

  const target = Number(settings.daily_target ?? DEFAULT_TARGET);
  const day = totals.get(totalKey(today, 'calories'));
  const eaten = day?.value ?? 0;
  const meals = entries.filter((e) => e.module_slug === 'calories');

  const remaining = Math.max(target - eaten, 0);
  const chips = savedMeals.slice(0, compact ? 2 : 3);

  return (
    <div className={compact ? 'wg wg-compact' : 'wg'}>
      <div className="wg-head">
        <Link to="/module/calories" className="kick">
          <Icon name="utensils" />
          Calories
        </Link>
        <span className="wg-meta">{meals.length ? `${meals.length} meals` : 'no meals yet'}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div className="big" style={compact ? { fontSize: 36 } : undefined}>
          {group(eaten)}
        </div>
        <span style={{ fontSize: 12, opacity: 0.6 }}>/ {group(target)}</span>
      </div>

      {/* One segment per meal, in the order they were eaten, then the shortfall. */}
      <div className="mealbar" style={compact ? { height: 10 } : undefined}>
        {[...meals].reverse().map((meal) => (
          <span key={meal.id} style={{ flex: Math.max(meal.value ?? 0, 1) }} title={meal.label ?? ''} />
        ))}
        {remaining > 0 ? <span className="rest" style={{ flex: remaining }} /> : null}
      </div>

      {!compact && meals.length ? (
        <div className="meal-list">
          {[...meals].reverse().map((meal) => (
            <div key={meal.id}>
              <span>{meal.label}</span>
              <b>{group(meal.value ?? 0)}</b>
            </div>
          ))}
        </div>
      ) : null}

      {chips.length ? (
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

      <LogButton label="Log meal" compact={compact} onClick={() => setLogging(true)} />

      {logging ? (
        <ValueDialog
          title="Log meal"
          submitLabel="Parse"
          busy={parse.isPending}
          error={parse.error ? String((parse.error as Error).message ?? parse.error) : null}
          fields={[
            {
              name: 'text',
              label: 'What did you eat? Items are matched against USDA and Open Food Facts, then shown for review.',
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
