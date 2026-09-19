// Color validation utilities. Used to validate AI-generated color codes
// before they are rendered as CSS colors.

const HEX_RE = /^#?([0-9a-fA-F]{6})$/;
const HEX_RE_3 = /^#?([0-9a-fA-F]{3})$/;

export function isValidHexColor(value: string | undefined | null): value is string {
  if (!value || typeof value !== 'string') return false;
  return HEX_RE.test(value.trim()) || HEX_RE_3.test(value.trim());
}

export function normalizeHex(value: string): string {
  const trimmed = value.trim();
  const m6 = trimmed.match(HEX_RE);
  if (m6) return `#${m6[1].toUpperCase()}`;
  const m3 = trimmed.match(HEX_RE_3);
  if (m3) {
    const [r, g, b] = m3[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return '#CCCCCC';
}

// Compute relative luminance for contrast checks (WCAG).
export function relativeLuminance(hex: string): number {
  const h = normalizeHex(hex).replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const toLin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

// Pick black or white text for a given background hex.
export function readableTextColor(bgHex: string): string {
  return relativeLuminance(bgHex) > 0.45 ? '#1A1A1A' : '#FFFFFF';
}

// ─────────────────────────────────────────
// Color Relationship Engine
// ─────────────────────────────────────────

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const h = normalizeHex(hex).replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hue = 0;
  let sat = 0;
  const light = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    sat = light > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hue = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: hue = ((b - r) / d + 2) / 6; break;
      case b: hue = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: hue * 360, s: sat * 100, l: light * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function complementaryColor(hex: string): string {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h + 180, s, l);
}

export function analogousColors(hex: string): [string, string] {
  const { h, s, l } = hexToHsl(hex);
  return [hslToHex(h + 30, s, l), hslToHex(h - 30, s, l)];
}

export function triadicColors(hex: string): [string, string] {
  const { h, s, l } = hexToHsl(hex);
  return [hslToHex(h + 120, s, l), hslToHex(h + 240, s, l)];
}

export function lighterColor(hex: string, amount = 15): string {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, s, Math.min(100, l + amount));
}

export function darkerColor(hex: string, amount = 15): string {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, s, Math.max(0, l - amount));
}

export function matchingTrimColor(hex: string): string {
  const { h, s, l } = hexToHsl(hex);
  // Trim is typically a lighter, more neutral version
  return hslToHex(h, s * 0.3, Math.min(92, l + 25));
}

export function matchingCeilingColor(hex: string): string {
  const { h, s, l } = hexToHsl(hex);
  // Ceiling is typically a very light, low-saturation version
  return hslToHex(h, s * 0.2, Math.min(95, l + 30));
}

export function coordinatedAccentColor(hex: string): string {
  const { h, s, l } = hexToHsl(hex);
  // Accent uses complementary hue with adjusted saturation
  return hslToHex(h + 180, Math.min(100, s * 1.3), Math.max(35, Math.min(65, l)));
}

export function colorDistanceHex(a: string, b: string): number {
  const ah = normalizeHex(a).replace('#', '');
  const bh = normalizeHex(b).replace('#', '');
  const ar = parseInt(ah.slice(0, 2), 16);
  const ag = parseInt(ah.slice(2, 4), 16);
  const ab = parseInt(ah.slice(4, 6), 16);
  const br = parseInt(bh.slice(0, 2), 16);
  const bg = parseInt(bh.slice(2, 4), 16);
  const bb = parseInt(bh.slice(4, 6), 16);
  return Math.sqrt((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2);
}

export function findClosestColors(targetHex: string, colors: { id: string; hex_code: string }[], limit = 4): string[] {
  return colors
    .filter((c) => c.hex_code.toUpperCase() !== normalizeHex(targetHex).toUpperCase())
    .map((c) => ({ id: c.id, dist: colorDistanceHex(targetHex, c.hex_code) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, limit)
    .map((c) => c.id);
}
