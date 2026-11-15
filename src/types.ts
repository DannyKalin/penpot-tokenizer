import type { TokenType } from '@penpot/plugin-types';

export const TOKEN_TYPE_OPTIONS: readonly { value: TokenType; label: string }[] = [
  { value: 'borderRadius', label: 'Border Radius' },
  { value: 'color', label: 'Color' },
  { value: 'dimension', label: 'Dimensions' },
  { value: 'fontFamilies', label: 'Font Family' },
  { value: 'fontSizes', label: 'Font Size' },
  { value: 'fontWeights', label: 'Font Weight' },
  { value: 'opacity', label: 'Opacity' },
  { value: 'sizing', label: 'Sizing' },
  { value: 'spacing', label: 'Spacing' },
  { value: 'borderWidth', label: 'Stroke Width' },
  { value: 'typography', label: 'Typography' },
  { value: 'letterSpacing', label: 'Letter Spacing' },
  { value: 'number', label: 'Number' },
  { value: 'rotation', label: 'Rotation' },
  { value: 'shadow', label: 'Shadow' },
  { value: 'textCase', label: 'Text Case' },
  { value: 'textDecoration', label: 'Text Decoration' },
] as const;

export type MatrixTokenType = TokenType;

export type FilterCategory = 'All' | 'Color' | 'Spacing' | 'Typography' | 'Other';

export interface MatrixRow {
  id: string;
  name: string;
  type: MatrixTokenType;
  description: string;
  valuesByMode: Record<string, string>;
}

export type PenpotThemeMode = 'light' | 'dark';

export interface MatrixSnapshot {
  modes: string[];
  themeNames: string[];
  rows: MatrixRow[];
  theme: PenpotThemeMode;
  editable: boolean;
}

export type PluginToUiMessage =
  | { type: 'sync-data'; payload: MatrixSnapshot }
  | { type: 'theme-change'; payload: { theme: PenpotThemeMode } }
  | { type: 'error'; payload: { message: string } };

export type UiToPluginMessage =
  | { type: 'ready' }
  | { type: 'refresh' }
  | {
      type: 'upsert-cell';
      payload: {
        name: string;
        tokenType: MatrixTokenType;
        mode: string;
        value: string;
        siblingModes?: string[];
        description?: string;
      };
    }
  | {
      type: 'rename-token';
      payload: {
        oldName: string;
        newName: string;
        tokenType: MatrixTokenType;
      };
    }
  | {
      type: 'change-type';
      payload: {
        name: string;
        oldType: MatrixTokenType;
        newType: MatrixTokenType;
      };
    }
  | {
      type: 'delete-token';
      payload: {
        name: string;
        tokenType: MatrixTokenType;
      };
    }
  | {
      type: 'set-description';
      payload: {
        name: string;
        tokenType: MatrixTokenType;
        description: string;
      };
    }
  | {
      type: 'duplicate-token';
      payload: {
        newName: string;
        tokenType: MatrixTokenType;
        valuesByMode: Record<string, string>;
        description?: string;
      };
    }
  | {
      type: 'rename-set';
      payload: {
        oldName: string;
        newName: string;
      };
    }
  | {
      type: 'move-tokens-to-set';
      payload: {
        tokens: Array<{
          name: string;
          tokenType: MatrixTokenType;
          valuesByMode: Record<string, string>;
          description?: string;
        }>;
        sourceModes: string[];
        targetModes: string[];
      };
    }
  | {
      type: 'move-tokens-to-group';
      payload: {
        renames: Array<{
          oldName: string;
          newName: string;
          tokenType: MatrixTokenType;
        }>;
      };
    };
