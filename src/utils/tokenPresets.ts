import type { MatrixRow, MatrixTokenType } from '../types';
import { resolveAliasValue } from './tokenResolution';

export interface TokenPresetOption {
  value: string;
  label: string;
  hint?: string;
}

export const TOKEN_PARAMETER_PRESETS: Partial<Record<MatrixTokenType, TokenPresetOption[]>> = {
  textCase: [
    { value: 'none', label: 'none', hint: 'Original casing' },
    { value: 'uppercase', label: 'uppercase', hint: 'ALL CAPS' },
    { value: 'lowercase', label: 'lowercase', hint: 'all lowercase' },
    { value: 'capitalize', label: 'capitalize', hint: 'Title Case' },
  ],
  textDecoration: [
    { value: 'none', label: 'none', hint: 'No decoration' },
    { value: 'underline', label: 'underline', hint: 'Underline' },
    { value: 'strike-through', label: 'strike-through', hint: 'Strikethrough' },
  ],
  fontWeights: [
    { value: '100', label: '100', hint: 'Thin' },
    { value: '200', label: '200', hint: 'Extra Light' },
    { value: '300', label: '300', hint: 'Light' },
    { value: '400', label: '400', hint: 'Regular' },
    { value: '500', label: '500', hint: 'Medium' },
    { value: '600', label: '600', hint: 'Semibold' },
    { value: '700', label: '700', hint: 'Bold' },
    { value: '800', label: '800', hint: 'Extra Bold' },
    { value: '900', label: '900', hint: 'Black' },
  ],
  opacity: [
    { value: '0', label: '0', hint: '0% (Transparent)' },
    { value: '0.1', label: '0.1', hint: '10%' },
    { value: '0.25', label: '0.25', hint: '25%' },
    { value: '0.5', label: '0.5', hint: '50%' },
    { value: '0.75', label: '0.75', hint: '75%' },
    { value: '0.9', label: '0.9', hint: '90%' },
    { value: '1', label: '1', hint: '100% (Opaque)' },
  ],
};

export function getTokenPresets(rowType: MatrixTokenType | undefined): TokenPresetOption[] {
  if (!rowType) return [];
  return TOKEN_PARAMETER_PRESETS[rowType] ?? [];
}

export function isTokenAliasRef(raw: string): boolean {
  const trimmed = raw.trim();
  return /^\{[^{}"]+\}$/.test(trimmed);
}

export interface TypographyFormState {
  fontFamilies: string;
  fontSizes: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
  textCase: string;
  textDecoration: string;
}

export function parseTypographyValue(raw: string): TypographyFormState {
  const empty: TypographyFormState = {
    fontFamilies: '',
    fontSizes: '',
    fontWeight: '',
    lineHeight: '',
    letterSpacing: '',
    textCase: 'none',
    textDecoration: 'none',
  };
  const trimmed = raw.trim();
  if (!trimmed || isTokenAliasRef(trimmed)) return empty;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const ff = parsed.fontFamilies ?? parsed.fontFamily;
    const fontFamilies = Array.isArray(ff)
      ? ff.join(', ')
      : typeof ff === 'string'
        ? ff
        : '';
    const fs = parsed.fontSizes ?? parsed.fontSize;
    return {
      fontFamilies,
      fontSizes: fs !== undefined ? String(fs) : '',
      fontWeight:
        parsed.fontWeight !== undefined
          ? String(parsed.fontWeight)
          : parsed.fontWeights !== undefined
            ? String(parsed.fontWeights)
            : '',
      lineHeight: parsed.lineHeight !== undefined ? String(parsed.lineHeight) : '',
      letterSpacing: parsed.letterSpacing !== undefined ? String(parsed.letterSpacing) : '',
      textCase: typeof parsed.textCase === 'string' ? parsed.textCase : 'none',
      textDecoration:
        typeof parsed.textDecoration === 'string' ? parsed.textDecoration : 'none',
    };
  } catch {
    return empty;
  }
}

export function serializeTypographyValue(form: TypographyFormState): string {
  const obj: Record<string, unknown> = {};
  if (form.fontFamilies.trim()) {
    const ff = form.fontFamilies.trim();
    obj.fontFamilies = isTokenAliasRef(ff)
      ? ff
      : ff.includes(',')
        ? ff
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [ff];
  }
  if (form.fontSizes.trim()) obj.fontSizes = form.fontSizes.trim();
  if (form.fontWeight.trim()) obj.fontWeight = form.fontWeight.trim();
  if (form.lineHeight.trim()) obj.lineHeight = form.lineHeight.trim();
  if (form.letterSpacing.trim()) obj.letterSpacing = form.letterSpacing.trim();
  if (form.textCase.trim() && form.textCase !== 'none') obj.textCase = form.textCase.trim();
  if (form.textDecoration.trim() && form.textDecoration !== 'none') {
    obj.textDecoration = form.textDecoration.trim();
  }
  return JSON.stringify(obj);
}

export interface ShadowLayerState {
  inset: boolean;
  offsetX: string;
  offsetY: string;
  blur: string;
  spread: string;
  color: string;
}

export function createDefaultShadowLayer(): ShadowLayerState {
  return {
    inset: false,
    offsetX: '0',
    offsetY: '4',
    blur: '12',
    spread: '0',
    color: 'rgba(0, 0, 0, 0.25)',
  };
}

export function parseShadowLayers(raw: string): ShadowLayerState[] {
  const trimmed = raw.trim();
  if (!trimmed || isTokenAliasRef(trimmed)) {
    return [createDefaultShadowLayer()];
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    const mapped = arr
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item) => ({
        inset: item.inset === true || item.inset === 'true',
        offsetX: item.offsetX !== undefined ? String(item.offsetX) : '0',
        offsetY: item.offsetY !== undefined ? String(item.offsetY) : '0',
        blur: item.blur !== undefined ? String(item.blur) : '0',
        spread: item.spread !== undefined ? String(item.spread) : '0',
        color: typeof item.color === 'string' && item.color.trim() ? item.color : '#000000',
      }));
    return mapped.length > 0 ? mapped : [createDefaultShadowLayer()];
  } catch {
    return [createDefaultShadowLayer()];
  }
}

export function serializeShadowLayers(layers: ShadowLayerState[]): string {
  const cleaned = layers.map((l) => ({
    inset: l.inset ? 'true' : 'false',
    offsetX: l.offsetX.trim() || '0',
    offsetY: l.offsetY.trim() || '0',
    blur: l.blur.trim() || '0',
    spread: l.spread.trim() || '0',
    color: l.color.trim() || '#000000',
  }));
  return JSON.stringify(cleaned);
}

export function formatCompositeSummary(
  rowType: MatrixTokenType | undefined,
  raw: string,
  modeName?: string,
  allRows?: MatrixRow[],
): string | null {
  const trimmed = raw.trim();
  if (!trimmed || isTokenAliasRef(trimmed)) return null;

  const resolvePart = (val: string): string => {
    if (!val || !allRows) return val;
    return resolveAliasValue(val, modeName, allRows) ?? val;
  };

  if (rowType === 'typography') {
    const t = parseTypographyValue(trimmed);
    const parts = [
      resolvePart(t.fontSizes),
      resolvePart(t.fontWeight),
      resolvePart(t.fontFamilies),
    ].filter(Boolean);
    if (parts.length < 2 && t.lineHeight) {
      parts.push(`lh ${resolvePart(t.lineHeight)}`);
    }
    if (parts.length === 0 && t.letterSpacing) {
      parts.push(`ls ${resolvePart(t.letterSpacing)}`);
    }
    return parts.length > 0 ? parts.join(' · ') : 'Typography';
  }

  if (rowType === 'shadow') {
    const layers = parseShadowLayers(trimmed);
    if (layers.length > 1) {
      return `${layers.length} shadow layers`;
    }
    const l = layers[0];
    return `${l.inset ? 'inset ' : ''}${l.offsetX} ${l.offsetY} ${l.blur} ${l.spread} · ${l.color}`;
  }

  return null;
}
