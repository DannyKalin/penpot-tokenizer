import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import type { MatrixRow, MatrixTokenType } from '../types';
import { AliasPopover, type AliasSuggestion } from './AliasPopover';
import { ColorPickerPopover } from './ColorPickerPopover';
import { resolveAliasValue } from '../utils/tokenResolution';
import {
  createDefaultShadowLayer,
  parseShadowLayers,
  parseTypographyValue,
  serializeShadowLayers,
  serializeTypographyValue,
  TOKEN_PARAMETER_PRESETS,
  type ShadowLayerState,
  type TokenPresetOption,
  type TypographyFormState,
} from '../utils/tokenPresets';

const ModalPortalContext = createContext<HTMLElement | null>(null);

interface CompositeParamInputProps {
  label: string;
  value: string;
  placeholder?: string;
  allRows: MatrixRow[];
  modeName?: string;
  allowedTypes: MatrixTokenType[];
  presets?: TokenPresetOption[];
  isColor?: boolean;
  onChange: (next: string) => void;
}

function resolvePreviewSwatch(
  raw: string,
  modeName: string | undefined,
  allRows: MatrixRow[],
  depth = 0,
): string | null {
  const t = raw.trim();
  if (!t || depth > 4) return null;
  const aliasMatch = /^\{(.+)\}$/.exec(t);
  if (aliasMatch) {
    const target = allRows.find((r) => r.name === aliasMatch[1].trim());
    if (!target) return null;
    const nextVal =
      (modeName && target.valuesByMode[modeName]) ||
      Object.values(target.valuesByMode).find((v) => v.trim() !== '') ||
      '';
    return resolvePreviewSwatch(nextVal, modeName, allRows, depth + 1);
  }
  if (
    /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(t) ||
    /^(rgb|rgba|hsl|hsla|oklch|oklab)\(/i.test(t)
  ) {
    return t;
  }
  return null;
}

function CompositeParamInput({
  label,
  value,
  placeholder,
  allRows,
  modeName,
  allowedTypes,
  presets,
  isColor = false,
  onChange,
}: CompositeParamInputProps) {
  const modalContainer = useContext(ModalPortalContext);
  const wrapRef = useRef<HTMLDivElement>(null);
  const floatingRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [floatingStyle, setFloatingStyle] = useState<CSSProperties | null>(null);

  const matchingTokens = useMemo(() => {
    const typeSet = new Set(allowedTypes);
    return allRows
      .filter((r) => r.name.trim() !== '' && typeSet.has(r.type))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allRows, allowedTypes]);

  const query = useMemo(() => {
    if (!isFocused && !isPickerOpen) return null;
    const trimmed = value.trim();
    const openIdx = value.lastIndexOf('{');
    if (openIdx !== -1) {
      const after = value.slice(openIdx + 1);
      if (!after.includes('}')) return after.toLowerCase();
      const closed = /^\{(.+)\}$/.exec(trimmed);
      if (closed) {
        const inner = closed[1].trim();
        const dotIdx = inner.lastIndexOf('.');
        return (dotIdx > 0 ? inner.slice(0, dotIdx + 1) : inner).toLowerCase();
      }
      return isPickerOpen ? '' : null;
    }
    if (isPickerOpen) return '';
    if (
      !trimmed ||
      trimmed.startsWith('#') ||
      /^(rgb|rgba|hsl|hsla|oklch|oklab)\(/i.test(trimmed) ||
      /^-?\d+(\.\d+)?(px|rem|em|%|deg|ms|s)?$/i.test(trimmed) ||
      presets?.some((p) => p.value.toLowerCase() === trimmed.toLowerCase())
    ) {
      return null;
    }
    return trimmed.toLowerCase();
  }, [isFocused, isPickerOpen, value, presets]);

  const suggestions: AliasSuggestion[] = useMemo(() => {
    if (query === null) return [];
    return matchingTokens
      .filter((r) => (query ? r.name.toLowerCase().includes(query) : true))
      .slice(0, 15)
      .map((r) => {
        const previewRaw =
          (modeName && r.valuesByMode[modeName]) ||
          Object.values(r.valuesByMode).find((v) => v.trim() !== '') ||
          '';
        const resolvedPreview =
          r.type === 'color'
            ? null
            : resolveAliasValue(previewRaw, modeName, allRows) ?? (previewRaw.trim() || null);
        return {
          name: r.name,
          type: r.type,
          swatchColor:
            r.type === 'color'
              ? resolvePreviewSwatch(previewRaw, modeName, allRows)
              : null,
          previewText: resolvedPreview,
        };
      });
  }, [query, matchingTokens, modeName, allRows]);

  const showAliases =
    !isColorPickerOpen && (isPickerOpen || query !== null) && suggestions.length > 0;
  const showPresets =
    !isColorPickerOpen &&
    Boolean(presets?.length) &&
    isFocused &&
    !isPickerOpen &&
    !value.includes('{') &&
    !showAliases;
  const swatchColor = isColor ? resolvePreviewSwatch(value, modeName, allRows) : null;
  const resolvedBadge = !isColor ? resolveAliasValue(value, modeName, allRows) : null;
  const hasFloating = showAliases || showPresets || isColorPickerOpen;

  useEffect(() => {
    if (!isColorPickerOpen) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        wrapRef.current?.contains(target) ||
        floatingRef.current?.contains(target)
      ) {
        return;
      }
      setIsColorPickerOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isColorPickerOpen]);

  useLayoutEffect(() => {
    if (!hasFloating || !wrapRef.current) {
      setFloatingStyle(null);
      return;
    }
    const updatePosition = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const estimatedHeight = isColorPickerOpen ? 260 : 185;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openAbove = spaceBelow < estimatedHeight && rect.top > spaceBelow;
      const maxLeft = Math.max(8, window.innerWidth - Math.max(rect.width, 236) - 8);
      setFloatingStyle({
        left: Math.min(rect.left, maxLeft),
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
  }, [hasFloating, isColorPickerOpen]);

  return (
    <div ref={wrapRef} className="composite-param-wrap">
      <div className="composite-param-input-row">
        {isColor && (
          <button
            type="button"
            className="color-swatch color-swatch-btn"
            aria-label={`Pick color for ${label}`}
            title="Pick color"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setIsPickerOpen(false);
              setIsFocused(false);
              setIsColorPickerOpen((prev) => !prev);
            }}
          >
            <span
              className="color-swatch-fill"
              style={swatchColor ? { backgroundColor: swatchColor } : undefined}
            />
          </button>
        )}
        <input
          type="text"
          aria-label={label}
          placeholder={placeholder}
          value={value}
          onFocus={() => {
            setIsColorPickerOpen(false);
            setIsFocused(true);
          }}
          onBlur={() => {
            setIsFocused(false);
            setIsPickerOpen(false);
          }}
          onChange={(e) => {
            setIsPickerOpen(false);
            setIsColorPickerOpen(false);
            setActiveIndex(0);
            onChange(e.target.value);
          }}
          onKeyDown={(e) => {
            if (showAliases) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((i) => (i + 1) % suggestions.length);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                onChange(`{${suggestions[activeIndex].name}}`);
                setIsPickerOpen(false);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setIsPickerOpen(false);
              }
            }
          }}
        />
        {resolvedBadge && (
          <span className="alias-resolved-badge" title={`Resolves to ${resolvedBadge}`}>
            {resolvedBadge}
          </span>
        )}
        {matchingTokens.length > 0 && (
          <button
            type="button"
            className="alias-trigger-btn"
            aria-label={`Pick alias for ${label}`}
            title={`Pick alias for ${label}`}
            tabIndex={-1}
            onMouseDown={(e) => {
              e.preventDefault();
              setIsColorPickerOpen(false);
              setIsPickerOpen((prev) => !prev);
            }}
          >
            ▾
          </button>
        )}
      </div>

      {hasFloating &&
        createPortal(
          <div
            ref={floatingRef}
            className="composite-floating-layer"
            style={floatingStyle ?? { visibility: 'hidden' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {showAliases && (
              <AliasPopover
                suggestions={suggestions}
                activeIndex={activeIndex}
                onSelect={(tokenName) => {
                  onChange(`{${tokenName}}`);
                  setIsPickerOpen(false);
                }}
              />
            )}

            {showPresets && presets && (
              <div
                className="alias-popover"
                role="listbox"
                aria-label={`${label} options`}
                onMouseDown={(e) => e.preventDefault()}
              >
                {presets.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    role="option"
                    aria-selected={value.trim() === preset.value}
                    className={`alias-option ${value.trim() === preset.value ? 'selected' : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange(preset.value);
                      setIsFocused(false);
                    }}
                  >
                    <span className="alias-option-name">{preset.label}</span>
                    {preset.hint && <span className="alias-option-type">{preset.hint}</span>}
                  </button>
                ))}
              </div>
            )}

            {isColorPickerOpen && (
              <ColorPickerPopover
                value={swatchColor ?? value}
                onChange={(nextColor) => onChange(nextColor)}
                onClose={() => setIsColorPickerOpen(false)}
              />
            )}
          </div>,
          modalContainer ?? document.body,
        )}
    </div>
  );
}

function formatShortMode(mode: string): string {
  const slashIdx = mode.indexOf('/');
  return slashIdx > 0 ? mode.slice(slashIdx + 1) : mode;
}

interface DuplicateToModeBarProps {
  availableTargetModes: string[];
  onDuplicate: (targetModes: string[]) => void;
}

function DuplicateToModeBar({
  availableTargetModes,
  onDuplicate,
}: DuplicateToModeBarProps) {
  const [selectedTarget, setSelectedTarget] = useState<string>(
    availableTargetModes[0] ?? '',
  );
  const [copiedNotice, setCopiedNotice] = useState(false);

  if (availableTargetModes.length === 0) return null;

  const triggerCopy = (targets: string[]) => {
    onDuplicate(targets);
    setCopiedNotice(true);
    setTimeout(() => setCopiedNotice(false), 1500);
  };

  if (availableTargetModes.length === 1) {
    const target = availableTargetModes[0];
    return (
      <button
        type="button"
        className="matrix-btn"
        onClick={() => triggerCopy([target])}
      >
        {copiedNotice ? 'Copied!' : `Duplicate to ${formatShortMode(target)}`}
      </button>
    );
  }

  return (
    <div className="composite-duplicate-group">
      <select
        className="composite-mode-select"
        aria-label="Target mode to duplicate"
        value={selectedTarget}
        onChange={(e) => setSelectedTarget(e.target.value)}
      >
        {availableTargetModes.map((m) => (
          <option key={m} value={m}>
            {formatShortMode(m)}
          </option>
        ))}
        <option value="__all__">All other modes</option>
      </select>
      <button
        type="button"
        className="matrix-btn"
        onClick={() =>
          triggerCopy(
            selectedTarget === '__all__' ? availableTargetModes : [selectedTarget],
          )
        }
      >
        {copiedNotice ? 'Copied!' : 'Duplicate to mode'}
      </button>
    </div>
  );
}

interface TypographyPopoverProps {
  value: string;
  tokenName?: string;
  allRows: MatrixRow[];
  modeName?: string;
  availableTargetModes?: string[];
  onDuplicateToMode?: (targetMode: string, serializedJson: string) => void;
  onApply: (serializedJson: string) => void;
  onClose: () => void;
}

export function TypographyPopover({
  value,
  tokenName,
  allRows,
  modeName,
  availableTargetModes = [],
  onDuplicateToMode,
  onApply,
  onClose,
}: TypographyPopoverProps) {
  const [modalEl, setModalEl] = useState<HTMLDivElement | null>(null);
  const [form, setForm] = useState<TypographyFormState>(() =>
    parseTypographyValue(value),
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const update = (key: keyof TypographyFormState, val: string) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  };

  return (
    <div
      className="settings-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={setModalEl}
        className="composite-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Typography token editor"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <ModalPortalContext.Provider value={modalEl}>
        <div className="composite-popover-header">
          <div>
            <div className="composite-popover-title">Typography</div>
            {(tokenName || modeName) && (
              <div className="composite-modal-subtitle">
                {[tokenName, modeName ? formatShortMode(modeName) : '']
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            )}
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close typography editor"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="composite-grid">
          <div className="composite-field composite-field-full">
            <span>Font Family</span>
            <CompositeParamInput
              label="Font Family"
              placeholder="Inter, sans-serif or {font.sans}"
              value={form.fontFamilies}
              allRows={allRows}
              modeName={modeName}
              allowedTypes={['fontFamilies']}
              onChange={(val) => update('fontFamilies', val)}
            />
          </div>

          <div className="composite-field">
            <span>Size</span>
            <CompositeParamInput
              label="Font Size"
              placeholder="16 or {fontSize.md}"
              value={form.fontSizes}
              allRows={allRows}
              modeName={modeName}
              allowedTypes={['fontSizes', 'dimension', 'number']}
              onChange={(val) => update('fontSizes', val)}
            />
          </div>

          <div className="composite-field">
            <span>Weight</span>
            <CompositeParamInput
              label="Font Weight"
              placeholder="400 or {weight.bold}"
              value={form.fontWeight}
              allRows={allRows}
              modeName={modeName}
              allowedTypes={['fontWeights']}
              presets={TOKEN_PARAMETER_PRESETS.fontWeights}
              onChange={(val) => update('fontWeight', val)}
            />
          </div>

          <div className="composite-field">
            <span>Line Height</span>
            <CompositeParamInput
              label="Line Height"
              placeholder="1.5 or {lineHeight.md}"
              value={form.lineHeight}
              allRows={allRows}
              modeName={modeName}
              allowedTypes={['number', 'dimension']}
              onChange={(val) => update('lineHeight', val)}
            />
          </div>

          <div className="composite-field">
            <span>Letter Spacing</span>
            <CompositeParamInput
              label="Letter Spacing"
              placeholder="0 or {tracking.tight}"
              value={form.letterSpacing}
              allRows={allRows}
              modeName={modeName}
              allowedTypes={['letterSpacing', 'dimension', 'number']}
              onChange={(val) => update('letterSpacing', val)}
            />
          </div>

          <div className="composite-field">
            <span>Text Case</span>
            <CompositeParamInput
              label="Text Case"
              placeholder="none or {textCase.*}"
              value={form.textCase}
              allRows={allRows}
              modeName={modeName}
              allowedTypes={['textCase']}
              presets={TOKEN_PARAMETER_PRESETS.textCase}
              onChange={(val) => update('textCase', val)}
            />
          </div>

          <div className="composite-field">
            <span>Decoration</span>
            <CompositeParamInput
              label="Text Decoration"
              placeholder="none or {textDecoration.*}"
              value={form.textDecoration}
              allRows={allRows}
              modeName={modeName}
              allowedTypes={['textDecoration']}
              presets={TOKEN_PARAMETER_PRESETS.textDecoration}
              onChange={(val) => update('textDecoration', val)}
            />
          </div>
        </div>

        <div className="composite-modal-footer">
          <div className="composite-modal-footer-left">
            {onDuplicateToMode && (
              <DuplicateToModeBar
                availableTargetModes={availableTargetModes}
                onDuplicate={(targets) => {
                  const serialized = serializeTypographyValue(form);
                  for (const t of targets) {
                    onDuplicateToMode(t, serialized);
                  }
                }}
              />
            )}
          </div>
          <div className="composite-popover-actions">
            <button type="button" className="matrix-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="matrix-btn matrix-btn-primary"
              onClick={() => {
                onApply(serializeTypographyValue(form));
                onClose();
              }}
            >
              Apply
            </button>
          </div>
        </div>
        </ModalPortalContext.Provider>
      </div>
    </div>
  );
}

interface ShadowPopoverProps {
  value: string;
  tokenName?: string;
  allRows: MatrixRow[];
  modeName?: string;
  availableTargetModes?: string[];
  onDuplicateToMode?: (targetMode: string, serializedJson: string) => void;
  onApply: (serializedJson: string) => void;
  onClose: () => void;
}

export function ShadowPopover({
  value,
  tokenName,
  allRows,
  modeName,
  availableTargetModes = [],
  onDuplicateToMode,
  onApply,
  onClose,
}: ShadowPopoverProps) {
  const [modalEl, setModalEl] = useState<HTMLDivElement | null>(null);
  const [layers, setLayers] = useState<ShadowLayerState[]>(() =>
    parseShadowLayers(value),
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const updateLayer = (
    idx: number,
    patch: Partial<ShadowLayerState>,
  ) => {
    setLayers((prev) =>
      prev.map((layer, i) => (i === idx ? { ...layer, ...patch } : layer)),
    );
  };

  return (
    <div
      className="settings-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={setModalEl}
        className="composite-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Shadow token editor"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <ModalPortalContext.Provider value={modalEl}>
        <div className="composite-popover-header">
          <div>
            <div className="composite-popover-title">Shadow</div>
            {(tokenName || modeName) && (
              <div className="composite-modal-subtitle">
                {[tokenName, modeName ? formatShortMode(modeName) : '']
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            )}
          </div>
          <div className="composite-modal-header-actions">
            <button
              type="button"
              className="matrix-btn"
              onClick={() =>
                setLayers((prev) => [...prev, createDefaultShadowLayer()])
              }
            >
              + Layer
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Close shadow editor"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="shadow-layers-list">
          {layers.map((layer, idx) => (
            <div key={idx} className="shadow-layer-card">
              <div className="shadow-layer-top">
                <div className="shadow-type-toggle" role="group" aria-label={`Shadow ${idx + 1} type`}>
                  <button
                    type="button"
                    className={`shadow-toggle-btn ${!layer.inset ? 'active' : ''}`}
                    onClick={() => updateLayer(idx, { inset: false })}
                  >
                    Drop
                  </button>
                  <button
                    type="button"
                    className={`shadow-toggle-btn ${layer.inset ? 'active' : ''}`}
                    onClick={() => updateLayer(idx, { inset: true })}
                  >
                    Inset
                  </button>
                </div>
                {layers.length > 1 && (
                  <button
                    type="button"
                    className="icon-btn danger"
                    aria-label={`Remove shadow layer ${idx + 1}`}
                    onClick={() =>
                      setLayers((prev) => prev.filter((_, i) => i !== idx))
                    }
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="composite-grid composite-grid-4">
                <div className="composite-field">
                  <span>X</span>
                  <CompositeParamInput
                    label={`Layer ${idx + 1} X`}
                    value={layer.offsetX}
                    allRows={allRows}
                    modeName={modeName}
                    allowedTypes={['dimension', 'spacing', 'sizing', 'number']}
                    onChange={(val) => updateLayer(idx, { offsetX: val })}
                  />
                </div>
                <div className="composite-field">
                  <span>Y</span>
                  <CompositeParamInput
                    label={`Layer ${idx + 1} Y`}
                    value={layer.offsetY}
                    allRows={allRows}
                    modeName={modeName}
                    allowedTypes={['dimension', 'spacing', 'sizing', 'number']}
                    onChange={(val) => updateLayer(idx, { offsetY: val })}
                  />
                </div>
                <div className="composite-field">
                  <span>Blur</span>
                  <CompositeParamInput
                    label={`Layer ${idx + 1} Blur`}
                    value={layer.blur}
                    allRows={allRows}
                    modeName={modeName}
                    allowedTypes={['dimension', 'spacing', 'sizing', 'number']}
                    onChange={(val) => updateLayer(idx, { blur: val })}
                  />
                </div>
                <div className="composite-field">
                  <span>Spread</span>
                  <CompositeParamInput
                    label={`Layer ${idx + 1} Spread`}
                    value={layer.spread}
                    allRows={allRows}
                    modeName={modeName}
                    allowedTypes={['dimension', 'spacing', 'sizing', 'number']}
                    onChange={(val) => updateLayer(idx, { spread: val })}
                  />
                </div>
              </div>

              <div className="composite-field composite-field-full">
                <span>Color</span>
                <CompositeParamInput
                  label={`Layer ${idx + 1} Color`}
                  placeholder="rgba(0,0,0,0.25) or {shadow.color}"
                  value={layer.color}
                  allRows={allRows}
                  modeName={modeName}
                  allowedTypes={['color']}
                  isColor
                  onChange={(val) => updateLayer(idx, { color: val })}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="composite-modal-footer">
          <div className="composite-modal-footer-left">
            {onDuplicateToMode && (
              <DuplicateToModeBar
                availableTargetModes={availableTargetModes}
                onDuplicate={(targets) => {
                  const serialized = serializeShadowLayers(layers);
                  for (const t of targets) {
                    onDuplicateToMode(t, serialized);
                  }
                }}
              />
            )}
          </div>
          <div className="composite-popover-actions">
            <button type="button" className="matrix-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="matrix-btn matrix-btn-primary"
              onClick={() => {
                onApply(serializeShadowLayers(layers));
                onClose();
              }}
            >
              Apply
            </button>
          </div>
        </div>
        </ModalPortalContext.Provider>
      </div>
    </div>
  );
}
