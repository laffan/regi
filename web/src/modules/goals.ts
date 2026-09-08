// Goals recur, milestones happen once. Both read the same published series the
// widgets do, so a goal never needs its own bookkeeping.

import { addDays, shortDate, today as todayISO } from '@/lib/dates';
import { group, weight as fmtWeight } from '@/lib/format';
import { mean, projectToTarget, streak, type Point } from '@/lib/projection';
import type { Book, Goal } from '@/lib/types';

export interface GoalReadout {
  goal: Goal;
  /** The line under the title: "6 of 7 days", "Streak 21", "2.4 to go". */
  progress: string;
  accent: boolean;
}

interface Context {
  seriesFor: (slug: string) => Point[];
  /** A module may publish more than one series — "750 words daily" and "30
   *  minutes of pages" are both Writing goals, measured against different
   *  numbers. */
  seriesByName?: (series: string) => Point[];
  books: Book[];
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

  if (goal.kind === 'milestone') {
    // Reading milestones measure the book, not the daily page count.
    if (goal.module_slug === 'reading') {
      const book = ctx.books.find((b) => b.status === 'reading');
      if (book?.total_pages) {
        const left = Math.max(book.total_pages - book.current_page, 0);
        return {
          goal,
          progress: left ? `${group(left)} pages to go` : 'finished',
          accent: left <= 60,
        };
      }
    }

    if (goal.target !== null) {
      const recent = series.slice(-30);
      const current =
        goal.module_slug === 'weight' ? (series.at(-1)?.value ?? null) : mean(recent);

      if (current !== null) {
        const gap = Math.abs(current - goal.target);
        const unit = goal.module_slug === 'weight' ? '' : '';
        const shown =
          goal.module_slug === 'weight'
            ? `${fmtWeight(gap)}${unit} to go`
            : `${group(current)} now — ${group(gap)} to go`;
        return { goal, progress: shown, accent: true };
      }
    }

    return { goal, progress: goal.due_on ? `by ${shortDate(goal.due_on)}` : 'set', accent: true };
  }

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

export interface UpcomingItem {
  date: string;
  label: string;
  moduleSlug: string;
  accent: boolean;
}

/**
 * The "Coming up" list and the calendar's Ahead band: dated goals and
 * milestones still in front of you, plus the projected date a trend meets its
 * milestone.
 */
export function upcoming(goals: Goal[], ctx: Context, limit = 4): UpcomingItem[] {
  const from = ctx.today ?? todayISO();
  const items: UpcomingItem[] = [];

  for (const goal of goals) {
    if (goal.achieved_at) continue;

    // A milestone the trend can be projected onto is listed at its estimated
    // date — the same marker the chart draws — rather than at the date it was
    // written down. One line per goal either way.
    const projected =
      goal.kind === 'milestone' && goal.target !== null
        ? projectToTarget(seriesForGoal(goal, ctx), Number(goal.target))
        : null;

    if (projected) {
      items.push({
        date: projected.date,
        label: `${goal.title}, projected`,
        moduleSlug: goal.module_slug,
        accent: true,
      });
    } else if (goal.due_on && goal.due_on >= from) {
      items.push({
        date: goal.due_on,
        label: goal.cadence === 'weekly' ? `${goal.title}, weekly` : goal.title,
        moduleSlug: goal.module_slug,
        accent: goal.kind === 'milestone',
      });
    }
  }

  const seen = new Set<string>();
  return items
    .filter((item) => {
      const key = `${item.date}|${item.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}

export interface DayFlag {
  label: string;
  /** Already met, so the calendar reads "Reached ·" rather than "Milestone ·". */
  achieved: boolean;
}

/**
 * Dates carrying a goal or milestone: the months grid accents these cells, and
 * the day list tags them. Achieved milestones stay on the day they landed.
 */
export function flaggedDates(goals: Goal[]): Map<string, DayFlag> {
  const flags = new Map<string, DayFlag>();
  for (const goal of goals) {
    if (goal.achieved_at) {
      flags.set(goal.achieved_at.slice(0, 10), { label: goal.title, achieved: true });
    } else if (goal.due_on) {
      flags.set(goal.due_on, { label: goal.title, achieved: false });
    }
  }
  return flags;
}

/** The milestone the day list pins to today: nearest, with how far there is to go. */
export function nearestMilestone(goals: Goal[], ctx: Context): string | null {
  const next = goals
    .filter((g) => g.kind === 'milestone' && !g.achieved_at)
    .sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999'))[0];
  if (!next) return null;

  const readout = readGoal(next, ctx);
  return `${next.title} — ${readout.progress}`;
}
