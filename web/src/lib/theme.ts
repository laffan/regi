// The highlight colour.
//
// One hex value per account (profiles.accent_color). Everything else — the
// pale tint behind a tag, the deeper shade used for text, the colour of text
// sitting on a filled highlight — is derived here or in tokens.css, so a
// swatch is the only thing a person picks.

export const DEFAULT_ACCENT = '#6495ED';

export interface Swatch {
  name: string;
  hex: string;
}

/** The choices in Settings → Appearance. Cornflower is the default. */
export const SWATCHES: Swatch[] = [
  { name: 'Cornflower', hex: '#6495ED' },
  { name: 'Clay', hex: '#C8452A' },
  { name: 'Sage', hex: '#5E8C6A' },
  { name: 'Teal', hex: '#1F8A8A' },
  { name: 'Plum', hex: '#8E4F8A' },
  { name: 'Amber', hex: '#C98A1B' },
  { name: 'Rose', hex: '#D0607A' },
  { name: 'Graphite', hex: '#4A4F57' },
];

const INK = '#2a2320';
const PAPER = '#fbf8f4';
const STORAGE_KEY = 'regi.accent';

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Ink or paper, whichever reads better on a filled highlight. */
export function onAccent(hex: string): string {
  return contrast(hex, INK) >= contrast(hex, PAPER) ? INK : PAPER;
}

export function isHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

/** Sets the colour on the page and remembers it, so the next load starts right. */
export function applyAccent(hex: string | null | undefined): void {
  const value = isHex(hex) ? hex : DEFAULT_ACCENT;
  const root = document.documentElement.style;
  root.setProperty('--color-accent', value);
  root.setProperty('--color-on-accent', onAccent(value));
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Private windows may refuse storage; the profile is still the source.
  }
}

/** Called before the first render, from the last colour this browser saw. */
export function applyStoredAccent(): void {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    stored = null;
  }
  applyAccent(stored);
}
