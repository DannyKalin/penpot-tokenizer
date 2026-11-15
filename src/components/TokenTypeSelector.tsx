import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { TOKEN_TYPE_OPTIONS, type MatrixTokenType } from '../types';

export function TokenTypeIcon({ type }: { type: MatrixTokenType }) {
  switch (type) {
    case 'color':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M8 2.2C8 2.2 3.5 7.1 3.5 10.1a4.5 4.5 0 0 0 9 0C12.5 7.1 8 2.2 8 2.2Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <circle cx="8" cy="10.2" r="1.6" fill="currentColor" />
        </svg>
      );
    case 'borderRadius':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M3.5 12.5V7.5a4 4 0 0 1 4-4h5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'dimension':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M2.5 5.5v5M13.5 5.5v5M3 8h10M5.2 6.2 3 8l2.2 1.8M10.8 6.2 13 8l-2.2 1.8"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'spacing':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M3 3v10M13 3v10M5.5 8h5M7 6.5 5.5 8 7 9.5M9 6.5 10.5 8 9 9.5"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'sizing':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect
            x="2.8"
            y="2.8"
            width="10.4"
            height="10.4"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.25"
          />
          <path
            d="M6 10 10 6M7.5 6H10v2.5"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'opacity':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="5.2" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8 2.8a5.2 5.2 0 0 1 0 10.4V2.8Z" fill="currentColor" />
        </svg>
      );
    case 'borderWidth':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M2.5 4h11" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
          <path d="M2.5 8h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M2.5 12h11" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
        </svg>
      );
    case 'fontFamilies':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M3.5 12.5 6.2 4h.6l2.7 8.5M4.4 9.8h4.2M10.5 12.5V8.3c0-1 .7-1.6 1.7-1.6.5 0 .9.2 1.3.5"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'fontSizes':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M2.5 4.2h7M6 4.2v8.3M9.5 7.5h4M11.5 7.5v5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'fontWeights':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M4.5 3.5h4a2.2 2.2 0 0 1 0 4.4h-4V3.5Zm0 4.4h4.5a2.3 2.3 0 0 1 0 4.6H4.5V7.9Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'typography':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M3 4h10M8 4v8.5M5.5 12.5h5"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'letterSpacing':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M2.5 3.5v9M13.5 3.5v9M5.5 11.2 8 4.8l2.5 6.4M6.3 9.2h3.4"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'number':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M6 3 4.8 13M11.2 3 10 13M3 6.2h10M2.5 10h10"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'rotation':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M12.5 12.5H3.5l6.8-8.2"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M6.8 8.6a4.5 4.5 0 0 1 2.2 3.9"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'shadow':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect
            x="2.8"
            y="2.8"
            width="7.8"
            height="7.8"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.25"
          />
          <path
            d="M6.5 13.2h5.2a1.5 1.5 0 0 0 1.5-1.5V6.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'textCase':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M2.5 11.5 5 4.5h.5l2.5 7M3.3 9.3h3.9M12.8 11.5V8.6a1.7 1.7 0 0 0-3-.9M12.8 9.8a1.6 1.6 0 1 1-3.1.2 1.6 1.6 0 0 1 3.1-.2Z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'textDecoration':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M5 3.5v4a3 3 0 0 0 6 0v-4M3.5 13h9"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

interface TokenTypeSelectorProps {
  value: MatrixTokenType;
  coord: string;
  disabled?: boolean;
  onChange: (nextType: MatrixTokenType) => void;
  onNavigate: (direction: 'next' | 'prev' | 'down') => void;
}

export function TokenTypeSelector({
  value,
  coord,
  disabled = false,
  onChange,
  onNavigate,
}: TokenTypeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [floatingStyle, setFloatingStyle] = useState<CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const currentOption =
    TOKEN_TYPE_OPTIONS.find((opt) => opt.value === value) ?? TOKEN_TYPE_OPTIONS[0];

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !listRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) {
      setFloatingStyle(null);
      return;
    }
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const estimatedHeight = 220;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openAbove = spaceBelow < estimatedHeight && rect.top > spaceBelow;
      const maxLeft = Math.max(8, window.innerWidth - 190 - 8);
      setFloatingStyle({
        left: Math.max(8, Math.min(rect.left, maxLeft)),
        minWidth: 168,
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
  }, [isOpen]);

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Tab') {
      setIsOpen(false);
      e.preventDefault();
      onNavigate(e.shiftKey ? 'prev' : 'next');
    } else if (e.key === 'Enter' && !isOpen) {
      e.preventDefault();
      onNavigate('down');
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="type-icon-trigger"
        data-cell-coord={coord}
        title={currentOption.label}
        aria-label={`Token type: ${currentOption.label}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
      >
        <TokenTypeIcon type={value} />
        <span className="type-trigger-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={listRef}
            className="composite-floating-layer"
            style={floatingStyle ?? { visibility: 'hidden' }}
          >
            <div className="alias-popover type-dropdown-list" role="listbox" aria-label="Token types">
              {TOKEN_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={opt.value === value}
                  className={`alias-option type-dropdown-option ${opt.value === value ? 'selected' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                >
                  <span className="type-dropdown-icon">
                    <TokenTypeIcon type={opt.value} />
                  </span>
                  <span className="alias-option-name">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
