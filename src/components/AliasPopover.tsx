import type { MatrixTokenType } from '../types';

export interface AliasSuggestion {
  name: string;
  type: MatrixTokenType;
  swatchColor?: string | null;
  previewText?: string | null;
}

interface AliasPopoverProps {
  suggestions: AliasSuggestion[];
  activeIndex: number;
  onSelect: (name: string) => void;
}

export function AliasPopover({ suggestions, activeIndex, onSelect }: AliasPopoverProps) {
  if (suggestions.length === 0) {
    return (
      <div className="alias-popover" role="listbox" aria-label="Token alias suggestions">
        <div className="empty-state" style={{ padding: '8px' }}>
          No matching tokens
        </div>
      </div>
    );
  }

  return (
    <div className="alias-popover" role="listbox" aria-label="Token alias suggestions">
      {suggestions.map((item, idx) => (
        <button
          key={`${item.type}::${item.name}`}
          type="button"
          role="option"
          aria-selected={idx === activeIndex}
          className={`alias-option ${idx === activeIndex ? 'selected' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(item.name);
          }}
        >
          <span className="alias-option-main">
            {item.swatchColor && (
              <span
                className="alias-swatch"
                style={{ backgroundColor: item.swatchColor }}
              />
            )}
            <span className="alias-option-name">{`{${item.name}}`}</span>
          </span>
          <span className="alias-option-type">
            {item.previewText ? `${item.previewText} · ${item.type}` : item.type}
          </span>
        </button>
      ))}
    </div>
  );
}
