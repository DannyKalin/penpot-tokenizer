import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type MatrixRow,
  type MatrixTokenType,
  type PenpotThemeMode,
  type PluginToUiMessage,
  type UiToPluginMessage,
} from './types';
import { MatrixCell } from './components/MatrixCell';
import { TokenTypeSelector } from './components/TokenTypeSelector';
import { Sidebar, type SidebarSetItem } from './components/Sidebar';
import { SettingsModal } from './components/SettingsModal';
import {
  BulkMoveModal,
  computeGroupMovedName,
  RenameGroupModal,
  RenameSetModal,
} from './components/BulkMoveModal';
import {
  generateTokenDescription,
  loadAiSettings,
  saveAiSettings,
  type AiSettings,
} from './utils/ai';

const SAMPLE_PREVIEW_ROWS: MatrixRow[] = [
  {
    id: 'color::semantic.backgrounds.primary',
    name: 'semantic.backgrounds.primary',
    type: 'color',
    description: '',
    valuesByMode: { Light: '#ffffff', Dark: '#18181a' },
  },
  {
    id: 'color::semantic.backgrounds.secondary',
    name: 'semantic.backgrounds.secondary',
    type: 'color',
    description: '',
    valuesByMode: { Light: '#f3f4f6', Dark: '#212426' },
  },
  {
    id: 'color::semantic.backgrounds.tertiary',
    name: 'semantic.backgrounds.tertiary',
    type: 'color',
    description: '',
    valuesByMode: { Light: '#e8eaee', Dark: '#2e3434' },
  },
  {
    id: 'color::semantic.text.primary',
    name: 'semantic.text.primary',
    type: 'color',
    description: '',
    valuesByMode: { Light: '#111827', Dark: '#f9fafb' },
  },
  {
    id: 'spacing::spacing.md',
    name: 'spacing.md',
    type: 'spacing',
    description: '',
    valuesByMode: { Light: '16', Dark: '16' },
  },
];

function getTokenFolderPath(name: string): string {
  const trimmed = name.trim();
  const lastDot = trimmed.lastIndexOf('.');
  return lastDot > 0 ? trimmed.slice(0, lastDot) : '';
}

function createBlankRow(
  defaultType: MatrixTokenType = 'color',
  initialName = '',
): MatrixRow {
  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: initialName,
    type: defaultType,
    description: '',
    valuesByMode: {},
  };
}

function validateTokenName(
  rawName: string,
  currentRow: MatrixRow,
  allRows: MatrixRow[],
): string | null {
  const trimmed = rawName.trim();
  if (
    !trimmed ||
    trimmed.startsWith('.') ||
    trimmed.endsWith('.') ||
    trimmed.includes('..') ||
    /\s/.test(trimmed)
  ) {
    return 'Invalid name (not saved)';
  }
  const duplicate = allRows.some(
    (r) => r.id !== currentRow.id && r.type === currentRow.type && r.name.trim() === trimmed,
  );
  if (duplicate) {
    return 'Token already exists (not saved)';
  }
  return null;
}

interface AppProps {
  initialTheme: PenpotThemeMode;
}

interface HistoryEntry {
  undo: () => void;
  redo: () => void;
}

export function App({ initialTheme }: AppProps) {
  const isInsidePenpot = typeof window !== 'undefined' && window.parent !== window;

  const [theme, setTheme] = useState<PenpotThemeMode>(initialTheme);
  const [modes, setModes] = useState<string[]>(['Light', 'Dark']);
  const [themeNames, setThemeNames] = useState<string[]>(['Light', 'Dark']);
  const [rows, setRows] = useState<MatrixRow[]>(() =>
    isInsidePenpot ? [] : SAMPLE_PREVIEW_ROWS,
  );
  const [editable, setEditable] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSet, setSelectedSet] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const [aiSettings, setAiSettings] = useState<AiSettings>(() => loadAiSettings());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(() => new Set());
  const [bulkMoveMode, setBulkMoveMode] = useState<'set' | 'group' | null>(null);
  const [renamingGroupPath, setRenamingGroupPath] = useState<string | null>(null);
  const [renamingSetName, setRenamingSetName] = useState<string | null>(null);

  const pendingFocusRef = useRef<{ rowId: string; col: number } | null>(null);
  const lastClickedRowIdRef = useRef<string | null>(null);
  const persistedNamesRef = useRef<Map<string, string>>(new Map());
  const undoStackRef = useRef<HistoryEntry[]>([]);
  const redoStackRef = useRef<HistoryEntry[]>([]);

  const syncHistoryState = useCallback(() => {
    setHistoryState({
      canUndo: undoStackRef.current.length > 0,
      canRedo: redoStackRef.current.length > 0,
    });
  }, []);

  const MAX_HISTORY_STEPS = 5;

  const pushHistory = useCallback((entry: HistoryEntry) => {
    undoStackRef.current = [...undoStackRef.current.slice(-(MAX_HISTORY_STEPS - 1)), entry];
    redoStackRef.current = [];
    syncHistoryState();
  }, [syncHistoryState]);

  const handleUndo = useCallback(() => {
    const entry = undoStackRef.current[undoStackRef.current.length - 1];
    if (!entry) return;
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current.slice(-(MAX_HISTORY_STEPS - 1)), entry];
    syncHistoryState();
    entry.undo();
  }, [syncHistoryState]);

  const handleRedo = useCallback(() => {
    const entry = redoStackRef.current[redoStackRef.current.length - 1];
    if (!entry) return;
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current.slice(-(MAX_HISTORY_STEPS - 1)), entry];
    syncHistoryState();
    entry.redo();
  }, [syncHistoryState]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.altKey) return;
      const key = e.key.toLowerCase();
      const isUndo = key === 'z' && !e.shiftKey;
      const isRedo =
        (key === 'z' && e.shiftKey) || (key === 'y' && !e.shiftKey && !e.metaKey);
      if (!isUndo && !isRedo) return;

      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
        const isCell = active.hasAttribute('data-cell-coord');
        const isDirty = active.getAttribute('data-dirty') === 'true';
        if (!isCell || isDirty) {
          return;
        }
      }

      e.preventDefault();
      if (isUndo) handleUndo();
      else handleRedo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  const sendToPlugin = useCallback(
    (msg: UiToPluginMessage) => {
      if (isInsidePenpot) {
        window.parent.postMessage(msg, '*');
      }
    },
    [isInsidePenpot],
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!isInsidePenpot) return;

    const onMessage = (event: MessageEvent<PluginToUiMessage>) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object' || !('type' in msg)) return;

      if (msg.type === 'sync-data') {
        setModes((prevModes) => {
          const merged = [...msg.payload.modes];
          for (const m of prevModes) {
            if (!merged.includes(m)) merged.push(m);
          }
          return merged;
        });
        setThemeNames(msg.payload.themeNames);
        setRows((prevRows) => {
          // Track canonical names currently persisted in Penpot
          const nextMap = new Map<string, string>();
          for (const r of msg.payload.rows) {
            nextMap.set(r.id, r.name);
          }
          persistedNamesRef.current = nextMap;

          // Preserve unsaved draft rows until they are synced back from Penpot
          const syncedKeys = new Set(
            msg.payload.rows.map((r) => `${r.type}::${r.name}`),
          );
          const drafts = prevRows.filter(
            (r) =>
              r.id.startsWith('draft-') &&
              !syncedKeys.has(`${r.type}::${r.name.trim()}`),
          );
          return [...msg.payload.rows, ...drafts];
        });
        setTheme(msg.payload.theme);
        setEditable(msg.payload.editable);
        setErrorMsg(null);
      } else if (msg.type === 'theme-change') {
        setTheme(msg.payload.theme);
      } else if (msg.type === 'error') {
        setErrorMsg(msg.payload.message);
      }
    };

    window.addEventListener('message', onMessage);
    sendToPlugin({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, [isInsidePenpot, sendToPlugin]);

  const sidebarSets: SidebarSetItem[] = useMemo(() => {
    const themeSet = new Set(themeNames.map((t) => t.toLowerCase()));
    const map = new Map<string, boolean>();
    for (const mode of modes) {
      const slashIdx = mode.indexOf('/');
      if (slashIdx > 0) {
        const parent = mode.slice(0, slashIdx);
        map.set(parent, true);
      } else if (!themeSet.has(mode.toLowerCase()) && !map.has(mode)) {
        map.set(mode, false);
      }
    }
    return Array.from(map.entries()).map(([name, isGroup]) => ({ name, isGroup }));
  }, [modes, themeNames]);

  useEffect(() => {
    if (
      sidebarSets.length > 0 &&
      (!selectedSet || !sidebarSets.some((s) => s.name === selectedSet))
    ) {
      setSelectedSet(sidebarSets[0].name);
      setSelectedFolder(null);
    }
  }, [sidebarSets, selectedSet]);

  const handleSelectSet = useCallback((nextSet: string | null) => {
    setSelectedSet(nextSet);
    setSelectedFolder(null);
    setSelectedRowIds(new Set());
    lastClickedRowIdRef.current = null;
  }, []);

  const handleRenameSet = useCallback(
    (oldName: string, nextName: string) => {
      const cleanOld = oldName.trim();
      const cleanNext = nextName.trim();
      if (!cleanOld || !cleanNext || cleanOld === cleanNext) return;

      const mapModeName = (mode: string): string => {
        if (mode === cleanOld) return cleanNext;
        if (mode.startsWith(`${cleanOld}/`)) {
          return `${cleanNext}${mode.slice(cleanOld.length)}`;
        }
        return mode;
      };

      setModes((prev) => prev.map(mapModeName));
      setRows((prev) =>
        prev.map((row) => {
          let changed = false;
          const nextValues: Record<string, string> = {};
          for (const [modeKey, val] of Object.entries(row.valuesByMode)) {
            const mapped = mapModeName(modeKey);
            if (mapped !== modeKey) changed = true;
            nextValues[mapped] = val;
          }
          return changed ? { ...row, valuesByMode: nextValues } : row;
        }),
      );
      const targetSidebarSet = cleanNext.includes('/')
        ? cleanNext.slice(0, cleanNext.indexOf('/'))
        : cleanNext;
      setSelectedSet((prev) => (prev === cleanOld ? targetSidebarSet : prev));

      sendToPlugin({
        type: 'rename-set',
        payload: { oldName: cleanOld, newName: cleanNext },
      });
    },
    [sendToPlugin],
  );

  const displayedModes = useMemo(() => {
    if (!selectedSet) return modes;
    return modes.filter((m) => m === selectedSet || m.startsWith(`${selectedSet}/`));
  }, [modes, selectedSet]);

  const setScopedRows = useMemo(() => {
    if (!selectedSet) return rows;
    return rows.filter((row) => {
      if (row.id.startsWith('draft-')) return true;
      return displayedModes.some((m) => row.valuesByMode[m] !== undefined);
    });
  }, [rows, selectedSet, displayedModes]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return setScopedRows.filter((row) => {
      if (row.id.startsWith('draft-')) return true;
      if (selectedFolder && !row.name.startsWith(`${selectedFolder}.`)) return false;
      if (q && !row.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [setScopedRows, selectedFolder, searchQuery]);

  const groupedSections = useMemo(() => {
    const groups = new Map<string, MatrixRow[]>();
    for (const row of filteredRows) {
      const folder = getTokenFolderPath(row.name) || 'Ungrouped';
      const list = groups.get(folder);
      if (list) {
        list.push(row);
      } else {
        groups.set(folder, [row]);
      }
    }
    let runningIdx = 0;
    return Array.from(groups.entries()).map(([groupPath, items]) => ({
      groupPath,
      items: items.map((row) => ({ row, rowIdx: runningIdx++ })),
    }));
  }, [filteredRows]);

  const focusCell = useCallback((rowIdx: number, colIdx: number) => {
    const el = document.querySelector<HTMLElement>(
      `[data-cell-coord="${rowIdx}:${colIdx}"]`,
    );
    el?.focus();
  }, []);

  useEffect(() => {
    if (pendingFocusRef.current) {
      const { rowId, col } = pendingFocusRef.current;
      let targetIdx = -1;
      for (const section of groupedSections) {
        const match = section.items.find((item) => item.row.id === rowId);
        if (match) {
          targetIdx = match.rowIdx;
          break;
        }
      }
      if (targetIdx >= 0) {
        pendingFocusRef.current = null;
        focusCell(targetIdx, col);
      }
    }
  }, [groupedSections, focusCell]);

  const addBlankRow = useCallback(
    (focusCol = 1) => {
      const prefill = selectedFolder ? `${selectedFolder}.` : '';
      const blank = createBlankRow('color', prefill);
      setRows((prev) => [...prev, blank]);
      pendingFocusRef.current = { rowId: blank.id, col: focusCol };
    },
    [selectedFolder],
  );

  const handleNavigate = useCallback(
    (rowIdx: number, colIdx: number, direction: 'next' | 'prev' | 'down') => {
      const totalCols = 2 + displayedModes.length;
      if (direction === 'next') {
        if (colIdx + 1 < totalCols) {
          focusCell(rowIdx, colIdx + 1);
        } else if (rowIdx + 1 < filteredRows.length) {
          focusCell(rowIdx + 1, 0);
        }
        return;
      }

      if (direction === 'prev') {
        if (colIdx - 1 >= 0) {
          focusCell(rowIdx, colIdx - 1);
        } else if (rowIdx - 1 >= 0) {
          focusCell(rowIdx - 1, totalCols - 1);
        }
        return;
      }

      if (direction === 'down') {
        if (rowIdx + 1 < filteredRows.length) {
          focusCell(rowIdx + 1, colIdx);
        } else if (editable) {
          addBlankRow(colIdx);
        }
      }
    },
    [displayedModes.length, filteredRows.length, focusCell, editable, addBlankRow],
  );

  const getSiblingModes = useCallback(
    (mode: string) => {
      const slashIdx = mode.indexOf('/');
      return slashIdx > 0
        ? modes.filter((m) => m.startsWith(mode.slice(0, slashIdx + 1)))
        : [mode];
    },
    [modes],
  );

  const clearRowError = useCallback((rowId: string) => {
    setRowErrors((prev) => {
      if (!(rowId in prev)) return prev;
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
  }, []);

  const handleCommitName = (row: MatrixRow, newName: string) => {
    const trimmed = newName.trim();
    const validationError = validateTokenName(newName, row, rows);

    // Always keep the user's entered name in the local table
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, name: trimmed } : r)),
    );

    if (validationError) {
      setRowErrors((prev) => ({ ...prev, [row.id]: validationError }));
      return;
    }

    setRowErrors((prev) => {
      if (!(row.id in prev)) return prev;
      const next = { ...prev };
      delete next[row.id];
      return next;
    });

    if (row.id.startsWith('draft-')) {
      // Newly named draft row: push any existing mode values to Penpot
      for (const [mode, val] of Object.entries(row.valuesByMode)) {
        if (val.trim() !== '') {
          sendToPlugin({
            type: 'upsert-cell',
            payload: {
              name: trimmed,
              tokenType: row.type,
              mode,
              value: val,
              siblingModes: getSiblingModes(mode),
              description: row.description,
            },
          });
        }
      }
    } else {
      const persistedName = persistedNamesRef.current.get(row.id) ?? row.name;
      if (trimmed !== persistedName) {
        const applyRename = (fromName: string, toName: string) => {
          setRows((prev) =>
            prev.map((r) =>
              r.id === row.id || (r.name === fromName && r.type === row.type)
                ? { ...r, name: toName }
                : r,
            ),
          );
          sendToPlugin({
            type: 'rename-token',
            payload: {
              oldName: fromName,
              newName: toName,
              tokenType: row.type,
            },
          });
        };
        sendToPlugin({
          type: 'rename-token',
          payload: {
            oldName: persistedName,
            newName: trimmed,
            tokenType: row.type,
          },
        });
        pushHistory({
          undo: () => applyRename(trimmed, persistedName),
          redo: () => applyRename(persistedName, trimmed),
        });
      }
    }
  };

  const handleChangeType = (row: MatrixRow, newType: MatrixTokenType) => {
    if (newType === row.type) return;
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, type: newType } : r)),
    );
    const updatedRow = { ...row, type: newType };
    const validationError = validateTokenName(row.name, updatedRow, rows);
    if (validationError) {
      setRowErrors((prev) => ({ ...prev, [row.id]: validationError }));
      return;
    }
    if (!row.id.startsWith('draft-')) {
      const persistedName = persistedNamesRef.current.get(row.id) ?? row.name;
      const oldType = row.type;
      const applyType = (fromType: MatrixTokenType, toType: MatrixTokenType) => {
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id || (r.name === persistedName && r.type === fromType)
              ? { ...r, type: toType }
              : r,
          ),
        );
        sendToPlugin({
          type: 'change-type',
          payload: {
            name: persistedName,
            oldType: fromType,
            newType: toType,
          },
        });
      };
      sendToPlugin({
        type: 'change-type',
        payload: {
          name: persistedName,
          oldType,
          newType,
        },
      });
      pushHistory({
        undo: () => applyType(newType, oldType),
        redo: () => applyType(oldType, newType),
      });
    }
  };

  const handleCommitModeValue = (row: MatrixRow, mode: string, nextValue: string) => {
    const prevValue = row.valuesByMode[mode] ?? '';
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? {
              ...r,
              valuesByMode: {
                ...r.valuesByMode,
                [mode]: nextValue,
              },
            }
          : r,
      ),
    );

    const validationError = validateTokenName(row.name, row, rows);
    if (validationError) {
      setRowErrors((prev) => ({ ...prev, [row.id]: validationError }));
      return;
    }

    const canonicalName =
      (row.id.startsWith('draft-') ? row.name : persistedNamesRef.current.get(row.id) ?? row.name).trim();

    const applyCell = (val: string) => {
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id || (r.name === canonicalName && r.type === row.type)
            ? {
                ...r,
                valuesByMode: {
                  ...r.valuesByMode,
                  [mode]: val,
                },
              }
            : r,
        ),
      );
      sendToPlugin({
        type: 'upsert-cell',
        payload: {
          name: canonicalName,
          tokenType: row.type,
          mode,
          value: val,
          siblingModes: getSiblingModes(mode),
          description: row.description,
        },
      });
    };

    sendToPlugin({
      type: 'upsert-cell',
      payload: {
        name: canonicalName,
        tokenType: row.type,
        mode,
        value: nextValue,
        siblingModes: getSiblingModes(mode),
        description: row.description,
      },
    });

    if (nextValue !== prevValue) {
      pushHistory({
        undo: () => applyCell(prevValue),
        redo: () => applyCell(nextValue),
      });
    }
  };

  const handleCommitDescription = (row: MatrixRow, nextDescription: string) => {
    const prevDescription = row.description;
    if (nextDescription === prevDescription) return;

    const canonicalName = (
      row.id.startsWith('draft-') ? row.name : persistedNamesRef.current.get(row.id) ?? row.name
    ).trim();

    const applyDescription = (desc: string) => {
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id || (canonicalName && r.name === canonicalName && r.type === row.type)
            ? { ...r, description: desc }
            : r,
        ),
      );
      if (canonicalName) {
        sendToPlugin({
          type: 'set-description',
          payload: {
            name: canonicalName,
            tokenType: row.type,
            description: desc,
          },
        });
      }
    };

    applyDescription(nextDescription);
    pushHistory({
      undo: () => applyDescription(prevDescription),
      redo: () => applyDescription(nextDescription),
    });
  };

  const handleDeleteRow = (row: MatrixRow) => {
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    setRowErrors((prev) => {
      if (!(row.id in prev)) return prev;
      const next = { ...prev };
      delete next[row.id];
      return next;
    });
    if (!row.id.startsWith('draft-')) {
      const persistedName = persistedNamesRef.current.get(row.id) ?? row.name;
      if (persistedName.trim() !== '') {
        const snapshotRow: MatrixRow = {
          ...row,
          name: persistedName,
          valuesByMode: { ...row.valuesByMode },
        };
        sendToPlugin({
          type: 'delete-token',
          payload: {
            name: persistedName,
            tokenType: row.type,
          },
        });
        pushHistory({
          undo: () => {
            setRows((prev) => [...prev, snapshotRow]);
            sendToPlugin({
              type: 'duplicate-token',
              payload: {
                newName: persistedName,
                tokenType: row.type,
                valuesByMode: snapshotRow.valuesByMode,
                description: snapshotRow.description,
              },
            });
          },
          redo: () => {
            setRows((prev) =>
              prev.filter(
                (r) =>
                  r.id !== snapshotRow.id &&
                  !(r.name === persistedName && r.type === row.type),
              ),
            );
            sendToPlugin({
              type: 'delete-token',
              payload: {
                name: persistedName,
                tokenType: row.type,
              },
            });
          },
        });
      }
    }
  };

  const handleDuplicateRow = (row: MatrixRow) => {
    const baseName = row.name.trim() || 'token';
    const copyName = `${baseName}-copy`;
    const duplicated: MatrixRow = {
      id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: copyName,
      type: row.type,
      description: row.description,
      valuesByMode: { ...row.valuesByMode },
    };
    setRows((prev) => [...prev, duplicated]);
    if (row.name.trim() !== '') {
      sendToPlugin({
        type: 'duplicate-token',
        payload: {
          newName: copyName,
          tokenType: row.type,
          valuesByMode: row.valuesByMode,
          description: row.description,
        },
      });
      pushHistory({
        undo: () => {
          setRows((prev) =>
            prev.filter(
              (r) =>
                r.id !== duplicated.id &&
                !(r.name === copyName && r.type === row.type),
            ),
          );
          sendToPlugin({
            type: 'delete-token',
            payload: {
              name: copyName,
              tokenType: row.type,
            },
          });
        },
        redo: () => {
          setRows((prev) => [...prev, duplicated]);
          sendToPlugin({
            type: 'duplicate-token',
            payload: {
              newName: copyName,
              tokenType: row.type,
              valuesByMode: duplicated.valuesByMode,
              description: duplicated.description,
            },
          });
        },
      });
    }
  };

  const selectableVisibleRows = useMemo(
    () =>
      groupedSections
        .flatMap((section) => section.items.map((item) => item.row))
        .filter((r) => !r.id.startsWith('draft-') && r.name.trim() !== ''),
    [groupedSections],
  );

  const selectedRows = useMemo(
    () => setScopedRows.filter((r) => selectedRowIds.has(r.id) && r.name.trim() !== ''),
    [setScopedRows, selectedRowIds],
  );

  const allVisibleSelected =
    selectableVisibleRows.length > 0 &&
    selectableVisibleRows.every((r) => selectedRowIds.has(r.id));

  const availableGroups = useMemo(() => {
    const groups = new Set<string>();
    for (const r of setScopedRows) {
      if (r.id.startsWith('draft-') || !r.name.trim()) continue;
      const folder = getTokenFolderPath(r.name);
      if (folder) groups.add(folder);
    }
    return Array.from(groups).sort((a, b) => a.localeCompare(b));
  }, [setScopedRows]);

  const toggleSelectRow = useCallback(
    (rowId: string, shiftKey: boolean) => {
      setSelectedRowIds((prev) => {
        const next = new Set(prev);
        if (shiftKey && lastClickedRowIdRef.current) {
          const ids = selectableVisibleRows.map((r) => r.id);
          const a = ids.indexOf(lastClickedRowIdRef.current);
          const b = ids.indexOf(rowId);
          if (a !== -1 && b !== -1) {
            const [start, end] = a < b ? [a, b] : [b, a];
            const shouldSelect = !prev.has(rowId);
            for (let i = start; i <= end; i += 1) {
              if (shouldSelect) next.add(ids[i]);
              else next.delete(ids[i]);
            }
            return next;
          }
        }
        if (next.has(rowId)) next.delete(rowId);
        else next.add(rowId);
        return next;
      });
      lastClickedRowIdRef.current = rowId;
    },
    [selectableVisibleRows],
  );

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const r of selectableVisibleRows) next.delete(r.id);
      } else {
        for (const r of selectableVisibleRows) next.add(r.id);
      }
      return next;
    });
  }, [allVisibleSelected, selectableVisibleRows]);

  const handleBulkMoveToSet = useCallback(
    (targetSet: string) => {
      const targetModes = modes.filter(
        (m) => m === targetSet || m.startsWith(`${targetSet}/`),
      );
      if (targetModes.length === 0 || selectedRows.length === 0) return;
      const sourceModes = [...displayedModes];

      setRows((prev) =>
        prev.map((row) => {
          if (!selectedRowIds.has(row.id)) return row;
          const nextValues = { ...row.valuesByMode };
          const fallbackVal =
            sourceModes.map((m) => nextValues[m]?.trim() ?? '').find(Boolean) ??
            Object.values(nextValues).map((v) => v.trim()).find(Boolean) ??
            '';
          for (const tm of targetModes) {
            const suffix = tm.includes('/') ? tm.slice(tm.indexOf('/') + 1).toLowerCase() : '';
            const matchingSource =
              sourceModes.find((sm) => sm === tm) ??
              (suffix
                ? sourceModes.find(
                    (sm) =>
                      sm.includes('/') &&
                      sm.slice(sm.indexOf('/') + 1).toLowerCase() === suffix,
                  )
                : undefined);
            const val = (matchingSource && nextValues[matchingSource]?.trim()) || fallbackVal;
            if (val) nextValues[tm] = val;
          }
          for (const sm of sourceModes) {
            if (!targetModes.includes(sm)) {
              delete nextValues[sm];
            }
          }
          return { ...row, valuesByMode: nextValues };
        }),
      );

      sendToPlugin({
        type: 'move-tokens-to-set',
        payload: {
          tokens: selectedRows.map((r) => ({
            name: r.name,
            tokenType: r.type,
            valuesByMode: r.valuesByMode,
            description: r.description,
          })),
          sourceModes,
          targetModes,
        },
      });
      setSelectedRowIds(new Set());
    },
    [modes, selectedRows, displayedModes, selectedRowIds],
  );

  const handleBulkMoveToGroup = useCallback(
    (targetGroup: string) => {
      if (selectedRows.length === 0) return;
      const renames = selectedRows
        .map((r) => ({
          rowId: r.id,
          oldName: r.name,
          newName: computeGroupMovedName(r.name, targetGroup),
          tokenType: r.type,
        }))
        .filter((item) => item.newName && item.newName !== item.oldName);
      if (renames.length === 0) return;

      const renameById = new Map(renames.map((item) => [item.rowId, item.newName]));
      setRows((prev) =>
        prev.map((row) => {
          const nextName = renameById.get(row.id);
          if (!nextName) return row;
          persistedNamesRef.current.set(row.id, nextName);
          return { ...row, name: nextName };
        }),
      );

      sendToPlugin({
        type: 'move-tokens-to-group',
        payload: {
          renames: renames.map(({ oldName, newName, tokenType }) => ({
            oldName,
            newName,
            tokenType,
          })),
        },
      });
      setSelectedRowIds(new Set());
    },
    [selectedRows],
  );

  const handleRenameGroup = useCallback(
    (oldGroupPath: string, nextGroupPath: string) => {
      const cleanNext = nextGroupPath.trim().replace(/^\.+|\.+$/g, '');
      if (!cleanNext || cleanNext === oldGroupPath) return;

      const prefix = `${oldGroupPath}.`;
      const affected = setScopedRows.filter(
        (r) => !r.id.startsWith('draft-') && r.name.startsWith(prefix),
      );
      if (affected.length === 0) return;

      const renames = affected.map((r) => ({
        rowId: r.id,
        oldName: r.name,
        newName: `${cleanNext}.${r.name.slice(prefix.length)}`,
        tokenType: r.type,
      }));
      const renameById = new Map(renames.map((item) => [item.rowId, item.newName]));

      setRows((prev) =>
        prev.map((row) => {
          const nextName = renameById.get(row.id);
          if (!nextName) return row;
          persistedNamesRef.current.set(row.id, nextName);
          return { ...row, name: nextName };
        }),
      );

      if (selectedFolder === oldGroupPath) {
        setSelectedFolder(cleanNext);
      } else if (selectedFolder && selectedFolder.startsWith(prefix)) {
        setSelectedFolder(`${cleanNext}.${selectedFolder.slice(prefix.length)}`);
      }

      sendToPlugin({
        type: 'move-tokens-to-group',
        payload: {
          renames: renames.map(({ oldName, newName, tokenType }) => ({
            oldName,
            newName,
            tokenType,
          })),
        },
      });
    },
    [setScopedRows, selectedFolder],
  );

  return (
    <div className="matrix-shell">
      <div className="matrix-toolbar">
        <input
          type="search"
          className="matrix-search"
          placeholder="Search tokens by name (e.g. color.bg)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        {!isInsidePenpot && <span className="matrix-badge">Standalone Preview</span>}
        {!editable && <span className="matrix-badge">Read-only</span>}

        <div className="matrix-toolbar-actions">
          <div className="matrix-history-actions">
            <button
              type="button"
              className="matrix-btn"
              onClick={handleUndo}
              disabled={!historyState.canUndo}
              title="Undo (Cmd+Z / Ctrl+Z)"
              aria-label="Undo"
            >
              ↶ Undo
            </button>
            <button
              type="button"
              className="matrix-btn"
              onClick={handleRedo}
              disabled={!historyState.canRedo}
              title="Redo (Cmd+Shift+Z / Ctrl+Shift+Z)"
              aria-label="Redo"
            >
              ↷ Redo
            </button>
          </div>

          <span className="matrix-toolbar-sep" aria-hidden="true" />

          <div className="matrix-actions">
            <button
              type="button"
              className="matrix-btn"
              onClick={() => sendToPlugin({ type: 'refresh' })}
              title="Pull external token changes from Penpot"
            >
              ↻ Sync / Refresh from Penpot
            </button>

            <button
              type="button"
              className="matrix-btn matrix-btn-primary"
              disabled={!editable}
              onClick={() => addBlankRow(1)}
            >
              + Add Token
            </button>

            <button
              type="button"
              className="matrix-btn"
              title="AI Settings"
              aria-label="AI Settings"
              onClick={() => setIsSettingsOpen(true)}
            >
              ⚙
            </button>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="matrix-error" role="alert">
          <span>{errorMsg}</span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Dismiss error"
            onClick={() => setErrorMsg(null)}
          >
            ✕
          </button>
        </div>
      )}

      <div className="matrix-body">
        <Sidebar
          sidebarSets={sidebarSets}
          selectedSet={selectedSet}
          onSelectSet={handleSelectSet}
          setRows={setScopedRows.filter((r) => r.name.trim() !== '')}
          selectedFolder={selectedFolder}
          onSelectFolder={setSelectedFolder}
          editable={editable}
          onRenameGroup={(groupPath) => setRenamingGroupPath(groupPath)}
          onRenameSet={(setName) => setRenamingSetName(setName)}
        />

        <div className="matrix-main-pane">
          {selectedRows.length > 0 && editable && (
            <div className="bulk-action-bar" role="region" aria-label="Bulk actions">
              <span className="bulk-action-count">
                {selectedRows.length} selected
              </span>
              <div className="bulk-action-buttons">
                <button
                  type="button"
                  className="matrix-btn"
                  disabled={sidebarSets.filter((s) => s.name !== selectedSet).length === 0}
                  onClick={() => setBulkMoveMode('set')}
                >
                  Move to Set…
                </button>
                <button
                  type="button"
                  className="matrix-btn"
                  onClick={() => setBulkMoveMode('group')}
                >
                  Move to Group…
                </button>
                <button
                  type="button"
                  className="matrix-btn"
                  onClick={() => setSelectedRowIds(new Set())}
                >
                  Clear
                </button>
              </div>
            </div>
          )}
          <div className="matrix-table-wrap">
            <table className="matrix-table">
            <thead>
              <tr>
                <th className="col-select">
                  <input
                    type="checkbox"
                    aria-label="Select all visible tokens"
                    checked={allVisibleSelected}
                    disabled={!editable || selectableVisibleRows.length === 0}
                    onChange={toggleSelectAllVisible}
                  />
                </th>
                <th className="col-type">Type</th>
                <th className="col-name">Token Name</th>
                {displayedModes.map((mode) => {
                  const colLabel =
                    selectedSet && mode.startsWith(`${selectedSet}/`)
                      ? mode.slice(selectedSet.length + 1)
                      : mode;
                  return (
                    <th key={mode} className="col-mode" title={mode}>
                      {colLabel}
                    </th>
                  );
                })}
                <th className="col-actions" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={4 + displayedModes.length}>
                    <div className="empty-state">
                      No tokens match the current filter. Click <strong>+ Add Token</strong> to
                      create one.
                    </div>
                  </td>
                </tr>
              ) : (
                groupedSections.map((section) => (
                  <FragmentWithGroup
                    key={section.groupPath}
                    groupPath={section.groupPath}
                    showGroupHeader={groupedSections.length > 1}
                    colSpan={4 + displayedModes.length}
                    items={section.items}
                    displayedModes={displayedModes}
                    allRows={rows}
                    rowErrors={rowErrors}
                    selectedRowIds={selectedRowIds}
                    onToggleSelectRow={toggleSelectRow}
                    onClearRowError={clearRowError}
                    editable={editable}
                    onChangeType={handleChangeType}
                    onCommitName={handleCommitName}
                    onCommitModeValue={handleCommitModeValue}
                    onCommitDescription={handleCommitDescription}
                    hasAiKey={Boolean(aiSettings.apiKey.trim())}
                    onOpenSettings={() => setIsSettingsOpen(true)}
                    onGenerateDescription={(row, draft) =>
                      generateTokenDescription({
                        settings: aiSettings,
                        token: row,
                        userDraftDescription: draft,
                        allRows: rows,
                      })
                    }
                    onDuplicate={handleDuplicateRow}
                    onDelete={handleDeleteRow}
                    onRenameGroup={(gp) => setRenamingGroupPath(gp)}
                    onNavigate={handleNavigate}
                  />
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {bulkMoveMode && selectedRows.length > 0 && (
        <BulkMoveModal
          mode={bulkMoveMode}
          selectedRows={selectedRows}
          currentSet={selectedSet}
          availableSets={sidebarSets}
          availableGroups={availableGroups}
          allRows={rows}
          onMoveToSet={handleBulkMoveToSet}
          onMoveToGroup={handleBulkMoveToGroup}
          onClose={() => setBulkMoveMode(null)}
        />
      )}

      {renamingGroupPath && (
        <RenameGroupModal
          groupPath={renamingGroupPath}
          affectedRows={setScopedRows.filter(
            (r) => !r.id.startsWith('draft-') && r.name.startsWith(`${renamingGroupPath}.`),
          )}
          allRows={rows}
          onRename={handleRenameGroup}
          onClose={() => setRenamingGroupPath(null)}
        />
      )}

      {renamingSetName && (
        <RenameSetModal
          setName={renamingSetName}
          existingSetNames={sidebarSets.map((s) => s.name)}
          onRename={handleRenameSet}
          onClose={() => setRenamingSetName(null)}
        />
      )}

      {isSettingsOpen && (
        <SettingsModal
          settings={aiSettings}
          onSave={(next) => {
            setAiSettings(next);
            saveAiSettings(next);
          }}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </div>
  );
}

interface FragmentWithGroupProps {
  groupPath: string;
  showGroupHeader: boolean;
  colSpan: number;
  items: { row: MatrixRow; rowIdx: number }[];
  displayedModes: string[];
  allRows: MatrixRow[];
  rowErrors: Record<string, string>;
  selectedRowIds: Set<string>;
  onToggleSelectRow: (rowId: string, shiftKey: boolean) => void;
  onClearRowError: (rowId: string) => void;
  editable: boolean;
  onChangeType: (row: MatrixRow, nextType: MatrixTokenType) => void;
  onCommitName: (row: MatrixRow, nextName: string) => void;
  onCommitModeValue: (row: MatrixRow, mode: string, nextVal: string) => void;
  onCommitDescription: (row: MatrixRow, nextDescription: string) => void;
  hasAiKey: boolean;
  onOpenSettings: () => void;
  onGenerateDescription: (row: MatrixRow, draft: string) => Promise<string>;
  onDuplicate: (row: MatrixRow) => void;
  onDelete: (row: MatrixRow) => void;
  onRenameGroup: (groupPath: string) => void;
  onNavigate: (rowIdx: number, colIdx: number, dir: 'next' | 'prev' | 'down') => void;
}

function FragmentWithGroup({
  groupPath,
  showGroupHeader,
  colSpan,
  items,
  displayedModes,
  allRows,
  rowErrors,
  selectedRowIds,
  onToggleSelectRow,
  onClearRowError,
  editable,
  onChangeType,
  onCommitName,
  onCommitModeValue,
  onCommitDescription,
  hasAiKey,
  onOpenSettings,
  onGenerateDescription,
  onDuplicate,
  onDelete,
  onRenameGroup,
  onNavigate,
}: FragmentWithGroupProps) {
  const [editingDescRowId, setEditingDescRowId] = useState<string | null>(null);
  const [descDraft, setDescDraft] = useState('');
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [descGenError, setDescGenError] = useState<string | null>(null);

  return (
    <Fragment>
      {showGroupHeader && (
        <tr className="group-header-row">
          <td colSpan={colSpan}>
            <div className="group-header-cell">
              <span className="group-header-title">{groupPath.replaceAll('.', ' / ')}</span>
              {editable && groupPath !== 'Ungrouped' && (
                <button
                  type="button"
                  className="group-rename-btn group-rename-btn-table"
                  aria-label={`Rename group ${groupPath}`}
                  title="Rename group"
                  onClick={() => onRenameGroup(groupPath)}
                >
                  ✎
                </button>
              )}
              <span className="group-header-count">{items.length}</span>
            </div>
          </td>
        </tr>
      )}
      {items.map(({ row, rowIdx }) => {
        const isSelectable = !row.id.startsWith('draft-') && row.name.trim() !== '';
        const isSelected = selectedRowIds.has(row.id);
        return (
        <tr key={row.id} className={isSelected ? 'row-selected' : undefined}>
          <td
            className="col-select"
            onClick={(e) => {
              if (!editable || !isSelectable) return;
              onToggleSelectRow(row.id, e.shiftKey);
            }}
          >
            <input
              type="checkbox"
              aria-label={`Select ${row.name || 'token'}`}
              checked={isSelected}
              disabled={!editable || !isSelectable}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelectRow(row.id, e.shiftKey);
              }}
              onChange={() => {}}
            />
          </td>
          <td className="col-type">
            <TokenTypeSelector
              value={row.type}
              coord={`${rowIdx}:0`}
              disabled={!editable}
              onChange={(nextType) => onChangeType(row, nextType)}
              onNavigate={(dir) => onNavigate(rowIdx, 0, dir)}
            />
          </td>

          <td className="col-name">
            <MatrixCell
              value={row.name}
              placeholder="semantic.backgrounds.primary"
              coord={`${rowIdx}:1`}
              allRows={allRows}
              disabled={!editable}
              error={rowErrors[row.id] ?? null}
              validateOnBlur={row.id.startsWith('draft-')}
              onClearError={() => onClearRowError(row.id)}
              onCommit={(next) => onCommitName(row, next)}
              onNavigate={(dir) => onNavigate(rowIdx, 1, dir)}
            />
          </td>

          {displayedModes.map((mode, modeIdx) => (
            <td key={mode} className="col-mode">
              <MatrixCell
                value={row.valuesByMode[mode] ?? ''}
                placeholder={row.type === 'color' ? '#ffffff or {alias}' : 'value or {alias}'}
                coord={`${rowIdx}:${2 + modeIdx}`}
                isColor={row.type === 'color'}
                allowAliasPicker
                rowType={row.type}
                modeName={mode}
                currentRowName={row.name}
                allRows={allRows}
                availableTargetModes={displayedModes.filter((m) => m !== mode)}
                disabled={!editable}
                onCommit={(next) => onCommitModeValue(row, mode, next)}
                onDuplicateToMode={(targetMode, nextVal) =>
                  onCommitModeValue(row, targetMode, nextVal)
                }
                onNavigate={(dir) => onNavigate(rowIdx, 2 + modeIdx, dir)}
              />
            </td>
          ))}

          <td className="col-actions">
            <div className="row-actions">
              <button
                type="button"
                className={`icon-btn ${row.description.trim() ? 'has-description' : ''}`}
                title={row.description.trim() ? `Description: ${row.description}` : 'Add description'}
                aria-label={
                  row.description.trim()
                    ? `Edit description for ${row.name || 'token'}`
                    : `Add description for ${row.name || 'token'}`
                }
                disabled={!editable}
                onClick={() => {
                  if (editingDescRowId === row.id) {
                    setEditingDescRowId(null);
                  } else {
                    setDescDraft(row.description);
                    setDescGenError(null);
                    setEditingDescRowId(row.id);
                  }
                }}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M3 2.5h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6.5L3.5 14v-2.5H3a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M5 6h6M5 8.5h4"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Duplicate token"
                aria-label={`Duplicate ${row.name || 'token'}`}
                disabled={!editable}
                onClick={() => onDuplicate(row)}
              >
                ⧉
              </button>
              <button
                type="button"
                className="icon-btn danger"
                title="Delete token"
                aria-label={`Delete ${row.name || 'token'}`}
                disabled={!editable}
                onClick={() => onDelete(row)}
              >
                ✕
              </button>
            </div>
            {editingDescRowId === row.id && (
              <div
                className="description-popover"
                role="dialog"
                aria-label={`Description for ${row.name || 'token'}`}
              >
                <textarea
                  className="description-textarea"
                  aria-label="Token description"
                  placeholder="Describe the scenario, component, or behavior for this token..."
                  rows={4}
                  autoFocus
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditingDescRowId(null);
                    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      onCommitDescription(row, descDraft.trim());
                      setEditingDescRowId(null);
                    }
                  }}
                />
                {descGenError && (
                  <div className="description-error">
                    <span>{descGenError}</span>
                    {!hasAiKey && (
                      <button
                        type="button"
                        className="description-settings-link"
                        onClick={() => {
                          setEditingDescRowId(null);
                          onOpenSettings();
                        }}
                      >
                        Open Settings
                      </button>
                    )}
                  </div>
                )}
                <div className="description-popover-actions">
                  <button
                    type="button"
                    className="matrix-btn description-generate-btn"
                    disabled={isGeneratingDesc}
                    title="Generate description and AI instructions from your notes and token metadata"
                    onClick={async () => {
                      if (!hasAiKey) {
                        setDescGenError('Add your AI API key in Settings first.');
                        return;
                      }
                      setDescGenError(null);
                      setIsGeneratingDesc(true);
                      try {
                        const generated = await onGenerateDescription(row, descDraft);
                        setDescDraft(generated);
                        onCommitDescription(row, generated);
                      } catch (err) {
                        setDescGenError(
                          err instanceof Error ? err.message : 'Failed to generate description',
                        );
                      } finally {
                        setIsGeneratingDesc(false);
                      }
                    }}
                  >
                    {isGeneratingDesc ? 'Generating...' : '✨ Generate'}
                  </button>
                  <div className="description-popover-right">
                    <button
                      type="button"
                      className="matrix-btn"
                      onClick={() => setEditingDescRowId(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="matrix-btn matrix-btn-primary"
                      onClick={() => {
                        onCommitDescription(row, descDraft.trim());
                        setEditingDescRowId(null);
                      }}
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}
          </td>
        </tr>
        );
      })}
    </Fragment>
  );
}
