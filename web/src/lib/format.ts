export function group(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function weight(n: number): string {
  return n.toFixed(1);
}

export function signed(n: number, digits = 1): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${Math.abs(n).toFixed(digits)}`;
}

/** How a module's day value reads in a summary line: "1,480", "182.4 lb", "24 pages". */
export function moduleValue(slug: string, value: number | null, unit: string | null): string {
  if (value === null) return 'not logged';
  switch (slug) {
    case 'weight':
      return `${weight(value)} ${unit ?? 'lb'}`;
    case 'calories':
      return group(value);
    case 'reading':
      return `${group(value)} pages`;
    case 'running':
      return `${value.toFixed(1)} ${unit ?? 'mi'}`;
    case 'writing':
      return `${group(value)} words`;
    case 'sleep':
      return `${value.toFixed(1)} h`;
    default:
      // Activity trackers record a day as done.
      return unit === 'done' ? (value > 0 ? 'Done' : 'Not done') : group(value);
  }
}

export function pace(seconds: number, miles: number): string {
  if (!miles) return '—';
  const perMile = seconds / miles;
  const m = Math.floor(perMile / 60);
  const s = Math.round(perMile % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function duration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}
