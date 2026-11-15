export type ColorFormat = 'hex' | 'rgb' | 'hsl' | 'oklch';

export interface RgbaColor {
  r: number; // 0..255
  g: number; // 0..255
  b: number; // 0..255
  a: number; // 0..1
}

export interface HsvaColor {
  h: number; // 0..360
  s: number; // 0..100
  v: number; // 0..100
  a: number; // 0..1
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function round(val: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

export function detectColorFormat(raw: string): ColorFormat {
  const t = raw.trim().toLowerCase();
  if (t.startsWith('rgb')) return 'rgb';
  if (t.startsWith('hsl')) return 'hsl';
  if (t.startsWith('oklch') || t.startsWith('oklab')) return 'oklch';
  return 'hex';
}

export function isRawColorLiteral(raw: string): boolean {
  const t = raw.trim();
  if (!t || t.startsWith('{')) return false;
  return (
    /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(t) ||
    /^(rgb|rgba|hsl|hsla|oklch|oklab)\(/i.test(t)
  );
}

function parseAlpha(token: string | undefined): number {
  if (!token) return 1;
  const trimmed = token.trim();
  if (trimmed.endsWith('%')) {
    return clamp(parseFloat(trimmed) / 100, 0, 1);
  }
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? clamp(n, 0, 1) : 1;
}

function parseHue(token: string): number {
  const t = token.trim().toLowerCase();
  let deg = parseFloat(t);
  if (!Number.isFinite(deg)) return 0;
  if (t.endsWith('rad')) deg = (deg * 180) / Math.PI;
  else if (t.endsWith('grad')) deg = deg * 0.9;
  else if (t.endsWith('turn')) deg = deg * 360;
  return ((deg % 360) + 360) % 360;
}

export function parseColorToRgba(raw: string): RgbaColor | null {
  const t = raw.trim();
  if (!t || t.startsWith('{')) return null;

  // Hex: #RGB, #RGBA, #RRGGBB, #RRGGBBAA
  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(t);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1;
      return { r, g, b, a: round(a, 3) };
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a: round(a, 3) };
  }

  // rgb(...) / rgba(...)
  const rgbMatch = /^rgba?\((.+)\)$/i.exec(t);
  if (rgbMatch) {
    const inner = rgbMatch[1].trim();
    const slashParts = inner.split('/');
    const mainPart = slashParts[0].trim();
    const parts = mainPart.includes(',')
      ? mainPart.split(',').map((s) => s.trim())
      : mainPart.split(/\s+/);
    if (parts.length < 3) return null;

    const parseChannel = (p: string) => {
      if (p.endsWith('%')) return clamp(Math.round((parseFloat(p) / 100) * 255), 0, 255);
      return clamp(Math.round(parseFloat(p)), 0, 255);
    };

    const r = parseChannel(parts[0]);
    const g = parseChannel(parts[1]);
    const b = parseChannel(parts[2]);
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    const a = slashParts[1] !== undefined ? parseAlpha(slashParts[1]) : parseAlpha(parts[3]);
    return { r, g, b, a };
  }

  // hsl(...) / hsla(...)
  const hslMatch = /^hsla?\((.+)\)$/i.exec(t);
  if (hslMatch) {
    const inner = hslMatch[1].trim();
    const slashParts = inner.split('/');
    const mainPart = slashParts[0].trim();
    const parts = mainPart.includes(',')
      ? mainPart.split(',').map((s) => s.trim())
      : mainPart.split(/\s+/);
    if (parts.length < 3) return null;

    const h = parseHue(parts[0]);
    const s = clamp(parseFloat(parts[1]), 0, 100);
    const l = clamp(parseFloat(parts[2]), 0, 100);
    if ([h, s, l].some((n) => Number.isNaN(n))) return null;
    const a = slashParts[1] !== undefined ? parseAlpha(slashParts[1]) : parseAlpha(parts[3]);
    return hslaToRgba(h, s, l, a);
  }

  // oklch(l c h [/ a])
  const oklchMatch = /^oklch\((.+)\)$/i.exec(t);
  if (oklchMatch) {
    const inner = oklchMatch[1].trim();
    const slashParts = inner.split('/');
    const parts = slashParts[0].trim().split(/\s+/);
    if (parts.length < 3) return null;
    const lRaw = parts[0].endsWith('%') ? parseFloat(parts[0]) / 100 : parseFloat(parts[0]);
    const c = parseFloat(parts[1]);
    const h = parseHue(parts[2]);
    if ([lRaw, c, h].some((n) => Number.isNaN(n))) return null;
    const a = slashParts[1] !== undefined ? parseAlpha(slashParts[1]) : 1;
    return oklchToRgba(clamp(lRaw, 0, 1), Math.max(0, c), h, a);
  }

  // oklab(l a b [/ alpha])
  const oklabMatch = /^oklab\((.+)\)$/i.exec(t);
  if (oklabMatch) {
    const inner = oklabMatch[1].trim();
    const slashParts = inner.split('/');
    const parts = slashParts[0].trim().split(/\s+/);
    if (parts.length < 3) return null;
    const lRaw = parts[0].endsWith('%') ? parseFloat(parts[0]) / 100 : parseFloat(parts[0]);
    const aLab = parseFloat(parts[1]);
    const bLab = parseFloat(parts[2]);
    if ([lRaw, aLab, bLab].some((n) => Number.isNaN(n))) return null;
    const alpha = slashParts[1] !== undefined ? parseAlpha(slashParts[1]) : 1;
    return oklabToRgba(clamp(lRaw, 0, 1), aLab, bLab, alpha);
  }

  return null;
}

export function rgbaToHsva({ r, g, b, a }: RgbaColor): HsvaColor {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;
  return { h: round(h, 1), s: round(s, 1), v: round(v, 1), a };
}

export function hsvaToRgba({ h, s, v, a }: HsvaColor): RgbaColor {
  const sn = clamp(s, 0, 100) / 100;
  const vn = clamp(v, 0, 100) / 100;
  const c = vn * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = vn - c;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (h >= 0 && h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
    a: round(clamp(a, 0, 1), 2),
  };
}

function hslaToRgba(h: number, s: number, l: number, a: number): RgbaColor {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
    a: round(clamp(a, 0, 1), 2),
  };
}

function rgbaToHsla({ r, g, b, a }: RgbaColor): { h: number; s: number; l: number; a: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;

  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
    a,
  };
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const clamped = clamp(c, 0, 1);
  return clamped <= 0.0031308
    ? 12.92 * clamped
    : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
}

function oklabToRgba(L: number, a: number, b: number, alpha: number): RgbaColor {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  return {
    r: Math.round(linearToSrgb(rLin) * 255),
    g: Math.round(linearToSrgb(gLin) * 255),
    b: Math.round(linearToSrgb(bLin) * 255),
    a: round(clamp(alpha, 0, 1), 2),
  };
}

function oklchToRgba(L: number, C: number, H: number, alpha: number): RgbaColor {
  const hRad = (H * Math.PI) / 180;
  return oklabToRgba(L, C * Math.cos(hRad), C * Math.sin(hRad), alpha);
}

function rgbaToOklch({ r, g, b, a }: RgbaColor): { l: number; c: number; h: number; a: number } {
  const rl = srgbToLinear(r / 255);
  const gl = srgbToLinear(g / 255);
  const bl = srgbToLinear(b / 255);

  const l = Math.cbrt(0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl);
  const m = Math.cbrt(0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl);
  const s = Math.cbrt(0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl);

  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;

  const C = Math.sqrt(A * A + B * B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;

  return { l: round(L * 100, 1), c: round(C, 3), h: round(H, 1), a };
}

export function formatRgbaColor(rgba: RgbaColor, format: ColorFormat): string {
  const r = clamp(Math.round(rgba.r), 0, 255);
  const g = clamp(Math.round(rgba.g), 0, 255);
  const b = clamp(Math.round(rgba.b), 0, 255);
  const a = round(clamp(rgba.a, 0, 1), 2);

  if (format === 'hex') {
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    const base = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    if (a >= 1) return base;
    return `${base}${toHex(Math.round(a * 255))}`;
  }

  if (format === 'rgb') {
    return a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  if (format === 'hsl') {
    const hsl = rgbaToHsla({ r, g, b, a });
    return a >= 1
      ? `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`
      : `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${a})`;
  }

  const oklch = rgbaToOklch({ r, g, b, a });
  return a >= 1
    ? `oklch(${oklch.l}% ${oklch.c} ${oklch.h})`
    : `oklch(${oklch.l}% ${oklch.c} ${oklch.h} / ${a})`;
}
