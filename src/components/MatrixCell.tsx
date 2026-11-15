import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { MatrixRow, MatrixTokenType } from '../types';
import { AliasPopover, type AliasSuggestion } from './AliasPopover';
import { ColorPickerPopover } from './ColorPickerPopover';
import { ShadowPopover, TypographyPopover } from './CompositeTokenPopovers';
import {
  formatCompositeSummary,
  getTokenPresets,
  isTokenAliasRef,
  parseShadowLayers,
} from '../utils/tokenPresets';
import { pickTargetValueForMode, resolveAliasValue } from '../utils/tokenResolution';

interface MatrixCellProps {
  value: string;
  placeholder?: string;
  coord: string;
  isColor?: boolean;
  allowAliasPicker?: boolean;
  rowType?: MatrixTokenType;
  modeName?: string;
  currentRowName?: string;
  allRows: MatrixRow[];
  availableTargetModes?: string[];
  disabled?: boolean;
  error?: string | null;
  validateOnBlur?: boolean;
  onClearError?: () => void;
  onCommit: (nextValue: string) => void;
  onDuplicateToMode?: (targetMode: string, nextValue: string) => void;
  onNavigate: (direction: 'next' | 'prev' | 'down') => void;
}

function resolveColorPreview(
  rawValue: string,
  modeName: string | undefined,
  allRows: MatrixRow[],
): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const resolved = isTokenAliasRef(trimmed)
    ? resolveAliasValue(trimmed, modeName, allRows)
    : trimmed;

  if (!resolved) return null;

  if (
    /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(resolved) ||
    /^(rgb|rgba|hsl|hsla|oklch|oklab)\(/i.test(resolved)
  ) {
    return resolved;
  }

  return null;
}

function resolveShadowColorPreview(
  rawValue: string,
  modeName: string | undefined,
  allRows: MatrixRow[],
): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const resolvedShadow = isTokenAliasRef(trimmed)
    ? resolveAliasValue(trimmed, modeName, allRows)
    : trimmed;
  if (!resolvedShadow) return null;

  const shadowTrimmed = resolvedShadow.trim();
  if (
    isTokenAliasRef(shadowTrimmed) ||
    (!shadowTrimmed.startsWith('{') && !shadowTrimmed.startsWith('['))
  ) {
    return null;
  }

  const layers = parseShadowLayers(shadowTrimmed);
  const firstColor = layers[0]?.color;
  if (!firstColor) return null;
  return resolveColorPreview(firstColor, modeName, allRows);
}

export function MatrixCell({
  value,
  placeholder,
  coord,
  isColor = false,
  allowAliasPicker = false,
  rowType,
  modeName,
  currentRowName,
  allRows,
  availableTargetModes = [],
  disabled = false,
  error = null,
  validateOnBlur = false,
  onClearError,
  onCommit,
  onDuplicateToMode,
  onNavigate,
}: MatrixCellProps) {
  const [draft, setDraft] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isCompositeOpen, setIsCompositeOpen] = useState(false);
  const [aliasIndex, setAliasIndex] = useState(0);
  const [aliasDismissed, setAliasDismissed] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const floatingRef = useRef<HTMLDivElement>(null);
  const skipBlurCommitRef = useRef(false);
  const latestDraftRef = useRef(draft);
  const [floatingStyle, setFloatingStyle] = useState<CSSProperties | null>(null);
  latestDraftRef.current = draft;

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const closeColorPickerAndCommit = () => {
    setIsColorPickerOpen(false);
    const trimmed = latestDraftRef.current.trim();
    if (trimmed !== value.trim()) {
      onCommit(trimmed);
    }
  };

  useEffect(() => {
    if (!isColorPickerOpen && !isCompositeOpen) return;
    const handleOutsideMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!wrapRef.current?.contains(target) && !floatingRef.current?.contains(target)) {
        if (isColorPickerOpen) closeColorPickerAndCommit();
        if (isCompositeOpen) setIsCompositeOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideMouseDown);
    return () => document.removeEventListener('mousedown', handleOutsideMouseDown);
  }, [isColorPickerOpen, isCompositeOpen, value]);

  const presets = useMemo(
    () => (allowAliasPicker ? getTokenPresets(rowType) : []),
    [allowAliasPicker, rowType],
  );

  const isCompositeType =
    allowAliasPicker && (rowType === 'typography' || rowType === 'shadow');
  const isCompositeMode = isCompositeType && !isTokenAliasRef(draft);
  const compositeSummary = isCompositeMode
    ? formatCompositeSummary(rowType, draft, modeName, allRows)
    : null;

  const availableTokens = useMemo(
    () =>
      allRows.filter(
        (r) =>
          r.name.trim() !== '' &&
          r.name !== currentRowName &&
          (!rowType || r.type === rowType),
      ),
    [allRows, currentRowName, rowType],
  );

  const searchQuery = useMemo(() => {
    if (!allowAliasPicker || !isFocused || aliasDismissed) return null;
    const trimmed = draft.trim();
    if (!trimmed) return null;

    const openBraceIdx = draft.lastIndexOf('{');
    if (openBraceIdx !== -1) {
      const afterBrace = draft.slice(openBraceIdx + 1);
      if (!afterBrace.includes('}')) {
        return afterBrace.toLowerCase();
      }
      // Already filled alias like `{gray.400}` -> show matching group tokens (`gray.`)
      const closedMatch = /^\{(.+)\}$/.exec(trimmed);
      if (closedMatch) {
        const inner = closedMatch[1].trim();
        const dotIdx = inner.lastIndexOf('.');
        return (dotIdx > 0 ? inner.slice(0, dotIdx + 1) : inner).toLowerCase();
      }
      return null;
    }

    // Preset-driven types (textCase, textDecoration, fontWeights, opacity) show parameter presets instead of aliases unless '{' is typed
    if (presets.length > 0) {
      return null;
    }

    // Skip alias search for literal hex colors, CSS color functions, or numeric values
    if (
      trimmed.startsWith('#') ||
      /^(rgb|rgba|hsl|hsla|oklch|oklab)\(/i.test(trimmed) ||
      /^-?\d+(\.\d+)?(px|rem|em|%|deg|ms|s)?$/i.test(trimmed)
    ) {
      return null;
    }

    return trimmed.toLowerCase();
  }, [allowAliasPicker, draft, isFocused, aliasDismissed, presets.length]);

  const showPresetPopover =
    presets.length > 0 &&
    isFocused &&
    !aliasDismissed &&
    !isPickerOpen &&
    !isColorPickerOpen &&
    !draft.includes('{');

  const filteredPresets = useMemo(() => {
    if (!showPresetPopover) return [];
    const trimmed = draft.trim().toLowerCase();
    if (!trimmed || presets.some((p) => p.value.toLowerCase() === trimmed)) {
      return presets;
    }
    const matches = presets.filter(
      (p) =>
        p.value.toLowerCase().includes(trimmed) ||
        (p.hint?.toLowerCase().includes(trimmed) ?? false),
    );
    return matches.length > 0 ? matches : presets;
  }, [showPresetPopover, draft, presets]);

  const hasUnclosedBrace = useMemo(() => {
    const openBraceIdx = draft.lastIndexOf('{');
    return openBraceIdx !== -1 && !draft.slice(openBraceIdx + 1).includes('}');
  }, [draft]);

  const suggestions: AliasSuggestion[] = useMemo(() => {
    if (searchQuery === null && !isPickerOpen) return [];
    const query = searchQuery ?? '';
    return availableTokens
      .filter((r) => (query ? r.name.toLowerCase().includes(query) : true))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 20)
      .map((r) => ({
        name: r.name,
        type: r.type,
        swatchColor:
          r.type === 'color'
            ? resolveColorPreview(pickTargetValueForMode(r, modeName), modeName, allRows)
            : null,
      }));
  }, [searchQuery, isPickerOpen, availableTokens, modeName, allRows]);

  const showPopover =
    isPickerOpen || (searchQuery !== null && (hasUnclosedBrace || suggestions.length > 0));

  useEffect(() => {
    setAliasIndex(0);
  }, [searchQuery, isPickerOpen]);

  const insertAlias = (tokenName: string) => {
    let next: string;
    if (hasUnclosedBrace) {
      const openBraceIdx = draft.lastIndexOf('{');
      const prefix = openBraceIdx >= 0 ? draft.slice(0, openBraceIdx) : draft;
      next = `${prefix}{${tokenName}}`;
    } else {
      next = `{${tokenName}}`;
    }
    setDraft(next);
    setAliasDismissed(true);
    setIsPickerOpen(false);
    onCommit(next);
    inputRef.current?.focus();
  };

  const commitIfChanged = () => {
    if (draft !== value || error || validateOnBlur) {
      onCommit(draft);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (showPopover && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAliasIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAliasIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertAlias(suggestions[aliasIndex].name);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setAliasDismissed(true);
        setIsPickerOpen(false);
        return;
      }
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      skipBlurCommitRef.current = true;
      setDraft(value);
      setAliasDismissed(true);
      setIsPickerOpen(false);
      inputRef.current?.blur();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      commitIfChanged();
      onNavigate('down');
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      commitIfChanged();
      onNavigate(e.shiftKey ? 'prev' : 'next');
    }
  };

  const swatchColor = isColor
    ? resolveColorPreview(draft, modeName, allRows)
    : rowType === 'shadow'
      ? resolveShadowColorPreview(draft, modeName, allRows)
      : null;
  const canPickColor = isColor && !disabled;
  const resolvedAlias = useMemo(() => {
    if (isCompositeMode) return null;
    return resolveAliasValue(draft, modeName, allRows);
  }, [draft, isCompositeMode, modeName, allRows]);

  const showFloatingPresets = showPresetPopover && !showPopover;
  const showFloatingAliases = showPopover && !isColorPickerOpen;
  const showFloatingColorPicker = isColorPickerOpen && canPickColor;
  const hasFloating = showFloatingPresets || showFloatingAliases || showFloatingColorPicker;

  useLayoutEffect(() => {
    if (!hasFloating || !wrapRef.current) {
      setFloatingStyle(null);
      return;
    }
    const updatePosition = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const estimatedHeight = showFloatingColorPicker ? 260 : 185;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openAbove = spaceBelow < estimatedHeight && rect.top > spaceBelow;
      const minW = showFloatingColorPicker ? 236 : Math.max(rect.width, 210);
      const maxLeft = Math.max(8, window.innerWidth - minW - 8);
      setFloatingStyle({
        left: Math.max(8, Math.min(rect.left, maxLeft)),
        minWidth: rect.width,
        maxHeight: Math.max(140, window.innerHeight - 16),
        ...(openAbove
          ? { bottom: Math.max(8, window.innerHeight - rect.top + 4) }
          : { top: Math.max(8, rect.bottom + 4) }),
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [hasFloating, showFloatingColorPicker]);

  return (
    <div
      ref={wrapRef}
      className={`cell-input-wrap ${error ? 'cell-error' : ''}`}
      title={error ?? undefined}
    >
      {(isColor || (rowType === 'shadow' && swatchColor)) &&
        (canPickColor ? (
          <button
            type="button"
            className="color-swatch color-swatch-btn"
            aria-label="Open color picker"
            title={swatchColor ? `Pick color (${swatchColor})` : 'Open color picker'}
            onMouseDown={(e) => {
              e.preventDefault();
              onClearError?.();
              setIsPickerOpen(false);
              setAliasDismissed(true);
              if (isColorPickerOpen) {
                closeColorPickerAndCommit();
              } else {
                setIsColorPickerOpen(true);
              }
            }}
          >
            {swatchColor && (
              <span className="color-swatch-fill" style={{ backgroundColor: swatchColor }} />
            )}
          </button>
        ) : (
          <span className="color-swatch" title={swatchColor ?? 'No color preview'}>
            {swatchColor && (
              <span className="color-swatch-fill" style={{ backgroundColor: swatchColor }} />
            )}
          </span>
        ))}
      {isCompositeMode ? (
        <button
          type="button"
          className="composite-cell-btn"
          data-cell-coord={coord}
          disabled={disabled}
          onClick={() => {
            setIsPickerOpen(false);
            setIsCompositeOpen((prev) => !prev);
          }}
        >
          <span className={compositeSummary ? 'composite-summary' : 'composite-placeholder'}>
            {compositeSummary ??
              (rowType === 'typography' ? 'Configure typography...' : 'Configure shadow...')}
          </span>
        </button>
      ) : (
        <input
          ref={inputRef}
          type="text"
          className="cell-input"
          data-cell-coord={coord}
          data-dirty={draft !== value ? 'true' : 'false'}
          value={draft}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          onChange={(e) => {
            setAliasDismissed(false);
            setIsPickerOpen(false);
            setIsColorPickerOpen(false);
            setDraft(e.target.value);
          }}
          onFocus={(e) => {
            setIsFocused(true);
            setAliasDismissed(false);
            setIsColorPickerOpen(false);
            if (error) {
              onClearError?.();
            }
            if (e.currentTarget.value.endsWith('.')) {
              const len = e.currentTarget.value.length;
              requestAnimationFrame(() => {
                e.target.setSelectionRange(len, len);
              });
            }
          }}
          onBlur={() => {
            setIsFocused(false);
            setIsPickerOpen(false);
            if (skipBlurCommitRef.current) {
              skipBlurCommitRef.current = false;
              return;
            }
            commitIfChanged();
          }}
          onKeyDown={handleKeyDown}
        />
      )}
      {error && (
        <span
          className="cell-error-pill"
          role="status"
          title={error}
          onMouseDown={(e) => {
            e.preventDefault();
            onClearError?.();
            inputRef.current?.focus();
          }}
        >
          {error}
        </span>
      )}
      {!isColor && resolvedAlias && (
        <span className="alias-resolved-badge" title={`Resolves to ${resolvedAlias}`}>
          {resolvedAlias}
        </span>
      )}
      {allowAliasPicker && !disabled && availableTokens.length > 0 && (
        <button
          type="button"
          className="alias-trigger-btn"
          title="Pick token alias"
          aria-label="Pick token alias"
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
            setIsPickerOpen((prev) => !prev);
          }}
        >
          ▾
        </button>
      )}
      {hasFloating &&
        createPortal(
          <div
            ref={floatingRef}
            className="composite-floating-layer"
            style={floatingStyle ?? { visibility: 'hidden' }}
          >
            {showFloatingPresets && (
              <div
                className="alias-popover"
                role="listbox"
                aria-label="Token parameter options"
                onMouseDown={(e) => e.preventDefault()}
              >
                {filteredPresets.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    role="option"
                    aria-selected={draft.trim() === preset.value}
                    className={`alias-option ${draft.trim() === preset.value ? 'selected' : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      skipBlurCommitRef.current = true;
                      setDraft(preset.value);
                      setAliasDismissed(true);
                      onCommit(preset.value);
                    }}
                  >
                    <span className="alias-option-name">{preset.label}</span>
                    {preset.hint && <span className="alias-option-type">{preset.hint}</span>}
                  </button>
                ))}
              </div>
            )}
            {showFloatingAliases && (
              <AliasPopover
                suggestions={suggestions}
                activeIndex={aliasIndex}
                onSelect={insertAlias}
              />
            )}
            {showFloatingColorPicker && (
              <ColorPickerPopover
                value={swatchColor ?? draft}
                onChange={(nextColor) => {
                  latestDraftRef.current = nextColor;
                  setDraft(nextColor);
                }}
                onClose={closeColorPickerAndCommit}
              />
            )}
          </div>,
          document.body,
        )}
      {isCompositeOpen && rowType === 'typography' && (
        <TypographyPopover
          value={draft}
          tokenName={currentRowName}
          allRows={allRows}
          modeName={modeName}
          availableTargetModes={availableTargetModes}
          onDuplicateToMode={onDuplicateToMode}
          onApply={(json) => {
            setDraft(json);
            onCommit(json);
          }}
          onClose={() => setIsCompositeOpen(false)}
        />
      )}
      {isCompositeOpen && rowType === 'shadow' && (
        <ShadowPopover
          value={draft}
          tokenName={currentRowName}
          allRows={allRows}
          modeName={modeName}
          availableTargetModes={availableTargetModes}
          onDuplicateToMode={onDuplicateToMode}
          onApply={(json) => {
            setDraft(json);
            onCommit(json);
          }}
          onClose={() => setIsCompositeOpen(false)}
        />
      )}
    </div>
  );
}
