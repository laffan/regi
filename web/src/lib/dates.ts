// Everything joins on the local calendar day, so date handling stays in one
// place and never touches UTC midnight by accident.

export const DAY_MS = 86_400_000;

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Monday-first, matching the week strip in the designs. */
export function startOfWeek(iso: string): string {
  const d = fromISODate(iso);
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return toISODate(d);
}

export function weekDays(startISO: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(startISO, i));
}

export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((fromISODate(toISO).getTime() - fromISODate(fromISO).getTime()) / DAY_MS);
}

export function rangeOfDays(endISO: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(endISO, i - count + 1));
}

const DOW_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dowShort(iso: string): string {
  return DOW_SHORT[(fromISODate(iso).getDay() + 6) % 7];
}

export function dayNumber(iso: string): number {
  return fromISODate(iso).getDate();
}

export function monthName(iso: string): string {
  return MONTHS[fromISODate(iso).getMonth()];
}

/** "14 Sep" — the form the Coming up list and the Ahead band use. */
export function shortDate(iso: string): string {
  const d = fromISODate(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** "Week of 7 September" */
export function weekLabel(startISO: string): string {
  const d = fromISODate(startISO);
  return `Week of ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function timeOfDay(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** The six months ending with the one that contains `iso`, oldest first. */
export function lastMonths(iso: string, count: number): { year: number; month: number }[] {
  const d = fromISODate(iso);
  const out: { year: number; month: number }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({ year: m.getFullYear(), month: m.getMonth() });
  }
  return out;
}

/** Day cells for a month grid, Monday-first, with leading blanks. */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => toISODate(new Date(year, month, i + 1))),
  ];
}

export function today(): string {
  return toISODate(new Date());
}
