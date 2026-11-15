import { useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  detectColorFormat,
  formatRgbaColor,
  hsvaToRgba,
  parseColorToRgba,
  rgbaToHsva,
  type ColorFormat,
  type HsvaColor,
} from '../utils/color';

interface ColorPickerPopoverProps {
  value: string;
  onChange: (nextColor: string) => void;
  onClose: () => void;
}

const FORMATS: { id: ColorFormat; label: string }[] = [
  { id: 'hex', label: 'HEX' },
  { id: 'rgb', label: 'RGB' },
  { id: 'hsl', label: 'HSL' },
  { id: 'oklch', label: 'OKLCH' },
];

export function ColorPickerPopover({
  value,
  onChange,
  onClose,
}: ColorPickerPopoverProps) {
  const initialRgba = parseColorToRgba(value) ?? { r: 59, g: 130, b: 246, a: 1 };
  const [hsva, setHsva] = useState<HsvaColor>(() => rgbaToHsva(initialRgba));
  const [format, setFormat] = useState<ColorFormat>(() => detectColorFormat(value));
  const [textValue, setTextValue] = useState<string>(() =>
    parseColorToRgba(value) ? value.trim() : formatRgbaColor(initialRgba, 'hex'),
  );

  const svAreaRef = useRef<HTMLDivElement>(null);
  const draggingSvRef = useRef(false);

  const rgba = hsvaToRgba(hsva);
  const pureHueCss = `hsl(${Math.round(hsva.h)}, 100%, 50%)`;
  const rgbBase = `${rgba.r}, ${rgba.g}, ${rgba.b}`;

  const updateFromHsva = (nextHsva: HsvaColor, nextFormat: ColorFormat = format) => {
    setHsva(nextHsva);
    const formatted = formatRgbaColor(hsvaToRgba(nextHsva), nextFormat);
    setTextValue(formatted);
    onChange(formatted);
  };

  const handleSvPointer = (e: PointerEvent<HTMLDivElement>) => {
    const rect = svAreaRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    updateFromHsva({
      ...hsva,
      s: Math.round(x * 1000) / 10,
      v: Math.round((1 - y) * 1000) / 10,
    });
  };

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

  return (
    <div
      className="color-picker-popover"
      role="dialog"
      aria-label="Color picker"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="color-picker-formats" role="tablist" aria-label="Color format">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={format === f.id}
            className={`color-picker-format-btn ${format === f.id ? 'active' : ''}`}
            onClick={() => {
              setFormat(f.id);
              const formatted = formatRgbaColor(rgba, f.id);
              setTextValue(formatted);
              onChange(formatted);
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div
        ref={svAreaRef}
        className="color-picker-sv"
        style={{ backgroundColor: pureHueCss }}
        onPointerDown={(e) => {
          draggingSvRef.current = true;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          handleSvPointer(e);
        }}
        onPointerMove={(e) => {
          if (!draggingSvRef.current) return;
          handleSvPointer(e);
        }}
        onPointerUp={() => {
          draggingSvRef.current = false;
        }}
      >
        <div className="color-picker-sv-white" />
        <div className="color-picker-sv-black" />
        <div
          className="color-picker-sv-thumb"
          style={{
            left: `${hsva.s}%`,
            top: `${100 - hsva.v}%`,
          }}
        />
      </div>

      <div className="color-picker-sliders">
        <label className="color-picker-slider-row">
          <span className="color-picker-slider-label">H</span>
          <input
            type="range"
            aria-label="Hue"
            className="color-picker-range color-picker-hue"
            min={0}
            max={360}
            value={Math.round(hsva.h)}
            onChange={(e) =>
              updateFromHsva({ ...hsva, h: Number(e.target.value) })
            }
          />
        </label>

        <label className="color-picker-slider-row">
          <span className="color-picker-slider-label">A</span>
          <input
            type="range"
            aria-label="Alpha"
            className="color-picker-range color-picker-alpha"
            min={0}
            max={100}
            value={Math.round(hsva.a * 100)}
            style={{
              background: `linear-gradient(to right, rgba(${rgbBase}, 0), rgba(${rgbBase}, 1))`,
            }}
            onChange={(e) =>
              updateFromHsva({ ...hsva, a: Number(e.target.value) / 100 })
            }
          />
        </label>
      </div>

      <div className="color-picker-footer">
        <input
          type="text"
          aria-label="Color value"
          className="color-picker-input"
          value={textValue}
          onChange={(e) => {
            const next = e.target.value;
            setTextValue(next);
            const parsed = parseColorToRgba(next);
            if (parsed) {
              setHsva(rgbaToHsva(parsed));
              setFormat(detectColorFormat(next));
              onChange(next.trim());
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <button
          type="button"
          className="color-picker-done-btn"
          onClick={onClose}
        >
          Done
        </button>
      </div>
    </div>
  );
}
