import type {
  Penpot,
  Token,
  TokenCatalog,
  TokenSet,
  TokenTheme,
  TokenType,
} from '@penpot/plugin-types';
import type {
  MatrixRow,
  MatrixSnapshot,
  MatrixTokenType,
  PenpotThemeMode,
  PluginToUiMessage,
  UiToPluginMessage,
} from './types';
import { isTokenAliasRef } from './utils/tokenPresets';

const DEFAULT_MODES = ['Light', 'Dark'];
const MODES_THEME_GROUP = 'Modes';

function toPenpotTokenType(type: MatrixTokenType): TokenType {
  return type;
}

function fromPenpotTokenType(type: TokenType): MatrixTokenType {
  return type;
}

function stringifyTokenValue(value: Token['value']): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === 'string')) {
      return value.join(', ');
    }
    return JSON.stringify(value);
  }
  return JSON.stringify(value);
}

function findSetByName(catalog: TokenCatalog, modeName: string): TokenSet | undefined {
  return (
    catalog.sets.find((s) => s.name === modeName) ??
    catalog.sets.find((s) => s.name.toLowerCase() === modeName.toLowerCase())
  );
}

function findThemeByName(catalog: TokenCatalog, modeName: string): TokenTheme | undefined {
  return (
    catalog.themes.find((t) => t.name === modeName) ??
    catalog.themes.find((t) => t.name.toLowerCase() === modeName.toLowerCase())
  );
}

function ensureModeSetAndTheme(
  catalog: TokenCatalog,
  modeName: string,
): { set: TokenSet } {
  const slashIdx = modeName.indexOf('/');
  if (slashIdx > 0) {
    const parentName = modeName.slice(0, slashIdx);
    const existingParent = findSetByName(catalog, parentName);
    if (existingParent) {
      existingParent.name = `${existingParent.name}/${existingParent.name}`;
    }
  }

  const existingSet = findSetByName(catalog, modeName);
  if (existingSet) {
    return { set: existingSet };
  }

  const set = catalog.addSet({ name: modeName, active: true });
  if (modeName.includes('/')) {
    const themeName = modeName.slice(modeName.indexOf('/') + 1);
    let theme = findThemeByName(catalog, themeName);
    if (!theme) {
      theme = catalog.addTheme({ group: MODES_THEME_GROUP, name: themeName });
    }

    const alreadyLinked = theme.activeSets.some((s) => s.id === set.id);
    if (!alreadyLinked) {
      theme.addSet(set);
    }
  }

  return { set };
}

function findTokenInSet(
  set: TokenSet,
  name: string,
  matrixType: MatrixTokenType,
): Token | undefined {
  const penpotType = toPenpotTokenType(matrixType);
  return set.tokens.find((t) => t.name === name && t.type === penpotType);
}

function parseTokenValueForPenpot(
  tokenType: MatrixTokenType,
  value: string,
): Token['value'] {
  const trimmed = value.trim();
  if (isTokenAliasRef(trimmed)) {
    return trimmed;
  }
  if (tokenType === 'fontFamilies') {
    if (trimmed.includes(',')) {
      return trimmed
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return trimmed;
  }
  if (tokenType === 'shadow') {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      return arr.map((item) => {
        const rec = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
        return {
          color: typeof rec.color === 'string' ? rec.color : String(rec.color ?? '#000000'),
          inset: typeof rec.inset === 'boolean' ? String(rec.inset) : String(rec.inset ?? 'false'),
          offsetX: rec.offsetX !== undefined ? String(rec.offsetX) : '0',
          offsetY: rec.offsetY !== undefined ? String(rec.offsetY) : '0',
          spread: rec.spread !== undefined ? String(rec.spread) : '0',
          blur: rec.blur !== undefined ? String(rec.blur) : '0',
        };
      }) as Token['value'];
    } catch {
      throw new Error('Invalid shadow JSON value.');
    }
  }
  if (tokenType === 'typography') {
    try {
      return JSON.parse(trimmed) as Token['value'];
    } catch {
      throw new Error('Invalid typography JSON value.');
    }
  }
  return trimmed;
}

function setTokenValue(token: Token, value: string): void {
  token.value = parseTokenValueForPenpot(fromPenpotTokenType(token.type), value) as never;
}

export function createTokenBridge(penpotApi: Penpot) {
  let snapshotTimer: ReturnType<typeof setTimeout> | null = null;

  function postToUi(message: PluginToUiMessage): void {
    penpotApi.ui.sendMessage(message);
  }

  function getThemeMode(): PenpotThemeMode {
    return penpotApi.theme === 'light' ? 'light' : 'dark';
  }

  function readMatrixSnapshot(): MatrixSnapshot {
    const catalog = penpotApi.library.local.tokens;
    const theme = getThemeMode();

    if (!catalog) {
      return {
        modes: [...DEFAULT_MODES],
        themeNames: [...DEFAULT_MODES],
        rows: [],
        theme,
        editable: false,
      };
    }

    const sets = catalog.sets;
    const modes = sets.length > 0 ? sets.map((s) => s.name) : [...DEFAULT_MODES];
    const themeNames =
      sets.length > 0 ? catalog.themes.map((t) => t.name) : [...DEFAULT_MODES];

    const rowMap = new Map<string, MatrixRow>();

    for (const set of sets) {
      for (const token of set.tokens) {
        const matrixType = fromPenpotTokenType(token.type);
        const key = `${matrixType}::${token.name}`;
        let row = rowMap.get(key);
        if (!row) {
          row = {
            id: key,
            name: token.name,
            type: matrixType,
            description: token.description ?? '',
            valuesByMode: {},
          };
          rowMap.set(key, row);
        }
        if (!row.description && token.description) {
          row.description = token.description;
        }
        row.valuesByMode[set.name] = stringifyTokenValue(token.value);
      }
    }

    const rows = Array.from(rowMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    return {
      modes,
      themeNames,
      rows,
      theme,
      editable: catalog.isEditableTokens,
    };
  }

  function sendSnapshot(): void {
    postToUi({
      type: 'sync-data',
      payload: readMatrixSnapshot(),
    });
  }

  function scheduleSnapshot(delayMs = 120): void {
    if (snapshotTimer !== null) {
      clearTimeout(snapshotTimer);
    }
    snapshotTimer = setTimeout(() => {
      snapshotTimer = null;
      sendSnapshot();
    }, delayMs);
  }

  function getEditableCatalog(): TokenCatalog | null {
    const catalog = penpotApi.library.local.tokens;
    if (!catalog || !catalog.isEditableTokens) {
      postToUi({
        type: 'error',
        payload: {
          message: 'Local tokens are read-only or unavailable in this file.',
        },
      });
      return null;
    }
    return catalog;
  }

  function handleMessage(msg: UiToPluginMessage): void {
    try {
      switch (msg.type) {
        case 'ready':
        case 'refresh': {
          sendSnapshot();
          return;
        }

        case 'rename-set': {
          const catalog = getEditableCatalog();
          if (!catalog) return;
          const oldName = msg.payload.oldName.trim();
          const newName = msg.payload.newName.trim();
          if (!oldName || !newName || oldName === newName) return;

          const belongsToOld = (name: string) =>
            name === oldName || name.startsWith(`${oldName}/`);
          const conflicts = catalog.sets.some(
            (s) =>
              !belongsToOld(s.name) &&
              (s.name === newName ||
                s.name.startsWith(`${newName}/`) ||
                newName.startsWith(`${s.name}/`)),
          );
          if (conflicts) {
            postToUi({
              type: 'error',
              payload: { message: `Set "${newName}" already exists.` },
            });
            sendSnapshot();
            return;
          }

          for (const set of catalog.sets) {
            if (set.name === oldName) {
              set.name = newName;
            } else if (set.name.startsWith(`${oldName}/`)) {
              set.name = `${newName}${set.name.slice(oldName.length)}`;
            }
          }
          sendSnapshot();
          return;
        }

        case 'upsert-cell': {
          const catalog = getEditableCatalog();
          if (!catalog) return;
          const { name, tokenType, mode, value, siblingModes, description } = msg.payload;
          const trimmedName = name.trim();
          if (!trimmedName) return;

          const { set } = ensureModeSetAndTheme(catalog, mode);
          const existing = findTokenInSet(set, trimmedName, tokenType);
          const trimmedValue = value.trim();

          if (trimmedValue === '') {
            if (existing) {
              existing.remove();
            }
          } else if (existing) {
            const prevDesc = existing.description;
            setTokenValue(existing, trimmedValue);
            if (description && description !== prevDesc) {
              existing.description = description;
            }
          } else {
            const parsedValue = parseTokenValueForPenpot(tokenType, trimmedValue);
            const created = set.addToken({
              type: toPenpotTokenType(tokenType),
              name: trimmedName,
              value: parsedValue as never,
            });
            if (!created) {
              postToUi({
                type: 'error',
                payload: {
                  message: `Penpot could not add "${trimmedName}" with value "${trimmedValue}" in "${mode}". Check token value/alias validity and "content:write" permission.`,
                },
              });
              scheduleSnapshot();
              return;
            }
            if (description) {
              created.description = description;
            }

            if (siblingModes && siblingModes.length > 1) {
              for (const sibMode of siblingModes) {
                if (sibMode === mode) continue;
                const sibSet = findSetByName(catalog, sibMode);
                if (sibSet && !findTokenInSet(sibSet, trimmedName, tokenType)) {
                  const sibCreated = sibSet.addToken({
                    type: toPenpotTokenType(tokenType),
                    name: trimmedName,
                    value: parsedValue as never,
                  });
                  if (sibCreated && description) {
                    sibCreated.description = description;
                  }
                }
              }
            }
          }

          scheduleSnapshot();
          return;
        }

        case 'rename-token': {
          const catalog = getEditableCatalog();
          if (!catalog) return;
          const { oldName, newName, tokenType } = msg.payload;
          const trimmedNew = newName.trim();
          if (!trimmedNew || trimmedNew === oldName) {
            sendSnapshot();
            return;
          }

          for (const set of catalog.sets) {
            const token = findTokenInSet(set, oldName, tokenType);
            if (token) {
              token.name = trimmedNew;
            }
          }
          scheduleSnapshot();
          return;
        }

        case 'set-description': {
          const catalog = getEditableCatalog();
          if (!catalog) return;
          const { name, tokenType, description } = msg.payload;
          const trimmedName = name.trim();
          if (!trimmedName) return;

          for (const set of catalog.sets) {
            const token = findTokenInSet(set, trimmedName, tokenType);
            if (token) {
              token.description = description;
            }
          }
          scheduleSnapshot();
          return;
        }

        case 'change-type': {
          const catalog = getEditableCatalog();
          if (!catalog) return;
          const { name, oldType, newType } = msg.payload;
          if (oldType === newType) return;

          const newPenpotType = toPenpotTokenType(newType);
          for (const set of catalog.sets) {
            const token = findTokenInSet(set, name, oldType);
            if (token) {
              const val = stringifyTokenValue(token.value);
              const desc = token.description;
              token.remove();
              const recreated = set.addToken({
                type: newPenpotType,
                name,
                value: val,
              });
              if (recreated && desc) {
                recreated.description = desc;
              }
            }
          }
          scheduleSnapshot();
          return;
        }

        case 'delete-token': {
          const catalog = getEditableCatalog();
          if (!catalog) return;
          const { name, tokenType } = msg.payload;
          for (const set of catalog.sets) {
            const token = findTokenInSet(set, name, tokenType);
            if (token) {
              token.remove();
            }
          }
          scheduleSnapshot();
          return;
        }

        case 'duplicate-token': {
          const catalog = getEditableCatalog();
          if (!catalog) return;
          const { newName, tokenType, valuesByMode, description } = msg.payload;
          const penpotType = toPenpotTokenType(tokenType);

          for (const [mode, val] of Object.entries(valuesByMode)) {
            const trimmedVal = val.trim();
            if (!trimmedVal) continue;
            const { set } = ensureModeSetAndTheme(catalog, mode);
            const created = set.addToken({
              type: penpotType,
              name: newName,
              value: parseTokenValueForPenpot(tokenType, trimmedVal) as never,
            });
            if (created && description) {
              created.description = description;
            }
          }
          scheduleSnapshot();
          return;
        }

        case 'move-tokens-to-set': {
          const catalog = getEditableCatalog();
          if (!catalog) return;
          const { tokens, sourceModes, targetModes } = msg.payload;
          if (targetModes.length === 0) return;

          for (const item of tokens) {
            const trimmedName = item.name.trim();
            if (!trimmedName) continue;
            const penpotType = toPenpotTokenType(item.tokenType);
            const fallbackVal =
              sourceModes
                .map((m) => item.valuesByMode[m]?.trim() ?? '')
                .find(Boolean) ??
              Object.values(item.valuesByMode)
                .map((v) => v.trim())
                .find(Boolean) ??
              '';

            for (const targetMode of targetModes) {
              const suffix = targetMode.includes('/')
                ? targetMode.slice(targetMode.indexOf('/') + 1).toLowerCase()
                : '';
              const matchingSource =
                sourceModes.find((sm) => sm === targetMode) ??
                (suffix
                  ? sourceModes.find(
                      (sm) =>
                        sm.includes('/') &&
                        sm.slice(sm.indexOf('/') + 1).toLowerCase() === suffix,
                    )
                  : undefined);
              const val =
                (matchingSource && item.valuesByMode[matchingSource]?.trim()) ||
                fallbackVal;
              if (!val) continue;

              const { set } = ensureModeSetAndTheme(catalog, targetMode);
              const existing = findTokenInSet(set, trimmedName, item.tokenType);
              if (existing) {
                setTokenValue(existing, val);
                if (item.description) {
                  existing.description = item.description;
                }
              } else {
                const created = set.addToken({
                  type: penpotType,
                  name: trimmedName,
                  value: parseTokenValueForPenpot(item.tokenType, val) as never,
                });
                if (created && item.description) {
                  created.description = item.description;
                }
              }
            }

            for (const sourceMode of sourceModes) {
              if (targetModes.includes(sourceMode)) continue;
              const sourceSet = findSetByName(catalog, sourceMode);
              if (!sourceSet) continue;
              const existing = findTokenInSet(sourceSet, trimmedName, item.tokenType);
              if (existing) {
                existing.remove();
              }
            }
          }

          scheduleSnapshot();
          return;
        }

        case 'move-tokens-to-group': {
          const catalog = getEditableCatalog();
          if (!catalog) return;
          const { renames } = msg.payload;
          for (const { oldName, newName, tokenType } of renames) {
            const trimmedNew = newName.trim();
            if (!trimmedNew || trimmedNew === oldName) continue;
            for (const set of catalog.sets) {
              if (findTokenInSet(set, trimmedNew, tokenType)) continue;
              const token = findTokenInSet(set, oldName, tokenType);
              if (token) {
                token.name = trimmedNew;
              }
            }
          }
          scheduleSnapshot();
          return;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      postToUi({
        type: 'error',
        payload: { message },
      });
    }
  }

  return {
    readMatrixSnapshot,
    sendSnapshot,
    handleMessage,
  };
}
