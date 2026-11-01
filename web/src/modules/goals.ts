// Goals recur: "under 2,200 daily", "30 pages daily", "20 mi weekly". They read
// the same published series the widgets do, so a goal never needs its own
// bookkeeping.
//
// Milestones and the "Coming up" list are switched off for now. The `goals`
// table still holds milestone rows; the client asks only for kind = 'goal'.

import { addDays, shortDate } from '@/lib/dates';
import { streak, type Point } from '@/lib/projection';
import type { Goal } from '@/lib/types';

export interface GoalReadout {
  goal: Goal;
  /** The line under the title: "6 of 7 days", "streak 21". */
  progress: string;
  accent: boolean;
}

interface Context {
  seriesFor: (slug: string) => Point[];
  /** A module may publish more than one series — "750 words daily" and "30
   *  minutes of pages" are both Writing goals, measured against different
   *  numbers. */
  seriesByName?: (series: string) => Point[];
  today: string;
}

function seriesForGoal(goal: Goal, ctx: Context): Point[] {
  if (goal.series && ctx.seriesByName) {
    const named = ctx.seriesByName(goal.series);
    if (named.length) return named;
  }
  return ctx.seriesFor(goal.module_slug);
}

function meets(value: number, target: number, comparator: Goal['comparator']): boolean {
  switch (comparator) {
    case '<=':
      return value <= target;
    case '>=':
      return value >= target;
    case '=':
      return value === target;
    default:
      return value > 0;
  }
}

export function readGoal(goal: Goal, ctx: Context): GoalReadout {
  const series = seriesForGoal(goal, ctx);

  // Recurring goals with a number: how many of the last seven days met it.
  if (goal.target !== null && goal.cadence === 'daily') {
    const window = series.slice(-7);
    const met = window.filter((p) => meets(p.value, Number(goal.target), goal.comparator)).length;
    return { goal, progress: `${met} of ${window.length || 7} days`, accent: false };
  }

  if (goal.cadence === 'weekly') {
    const next = goal.due_on ?? addDays(ctx.today, 7);
    return { goal, progress: `next ${shortDate(next)}`, accent: false };
  }

  // Recurring goals without a number are about showing up.
  return { goal, progress: `streak ${streak(series, (v) => v > 0)}`, accent: false };
}
