// The dashed run to the hollow goal marker — "180.0 goal · est. 24 Sep" — is a
// least-squares fit over the smoothed series, not a guess. If the trend does not
// point at the target, there is no estimate and the marker is left off.

import { addDays, daysBetween } from './dates';

export interface Point {
  date: string;
  value: number;
}

/** Trailing mean over `window` days; the weight line is drawn 7-day smoothed. */
export function movingMean(points: Point[], window = 7): Point[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((p, i) => {
    const slice = sorted.slice(Math.max(0, i - window + 1), i + 1);
    const mean = slice.reduce((sum, q) => sum + q.value, 0) / slice.length;
    return { date: p.date, value: mean };
  });
}

export function mean(points: Point[]): number | null {
  if (!points.length) return null;
  return points.reduce((sum, p) => sum + p.value, 0) / points.length;
}

/** Change per week implied by the fit, e.g. the widget's "−0.6 / wk". */
export function weeklyRate(points: Point[]): number | null {
  const fit = linearFit(points);
  return fit ? fit.slopePerDay * 7 : null;
}

export function linearFit(points: Point[]): { slopePerDay: number; intercept: number; from: string } | null {
  if (points.length < 3) return null;
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const from = sorted[0].date;

  const xs = sorted.map((p) => daysBetween(from, p.date));
  const ys = sorted.map((p) => p.value);
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return null;

  const slopePerDay = num / den;
  return { slopePerDay, intercept: meanY - slopePerDay * meanX, from };
}

/**
 * When the current trend reaches `target`, or null if it never does inside
 * `horizonDays`. Direction is taken from the trend itself, so it works for a
 * weight coming down and a page count going up.
 */
export function projectToTarget(
  points: Point[],
  target: number,
  horizonDays = 180,
): { date: string; value: number; days: number } | null {
  const fit = linearFit(points);
  if (!fit || fit.slopePerDay === 0) return null;

  const last = [...points].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  if (!last) return null;

  const lastX = daysBetween(fit.from, last.date);
  const lastFitted = fit.intercept + fit.slopePerDay * lastX;
  const daysNeeded = (target - lastFitted) / fit.slopePerDay;

  if (daysNeeded <= 0 || daysNeeded > horizonDays) return null;

  return {
    date: addDays(last.date, Math.ceil(daysNeeded)),
    value: target,
    days: Math.ceil(daysNeeded),
  };
}

/** Consecutive days ending today (or the last logged day) that met a predicate. */
export function streak(points: Point[], met: (value: number) => boolean): number {
  const sorted = [...points].sort((a, b) => b.date.localeCompare(a.date));
  let count = 0;
  for (const p of sorted) {
    if (!met(p.value)) break;
    count += 1;
  }
  return count;
}
