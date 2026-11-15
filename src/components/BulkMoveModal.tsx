import { useEffect, useMemo, useState } from 'react';
import type { MatrixRow } from '../types';
import type { SidebarSetItem } from './Sidebar';

interface BulkMoveModalProps {
  mode: 'set' | 'group';
  selectedRows: MatrixRow[];
  currentSet: string | null;
  availableSets: SidebarSetItem[];
  availableGroups: string[];
  allRows: MatrixRow[];
  onMoveToSet: (targetSet: string) => void;
  onMoveToGroup: (targetGroup: string) => void;
  onClose: () => void;
}

export function computeGroupMovedName(oldName: string, targetGroup: string): string {
  const leaf = oldName.includes('.') ? oldName.slice(oldName.lastIndexOf('.') + 1) : oldName;
  const cleanGroup = targetGroup.trim().replace(/^\.+|\.+$/g, '');
  return cleanGroup ? `${cleanGroup}.${leaf}` : leaf;
}

export function BulkMoveModal({
  mode,
  selectedRows,
  currentSet,
  availableSets,
  availableGroups,
  allRows,
  onMoveToSet,
  onMoveToGroup,
  onClose,
}: BulkMoveModalProps) {
  const targetSets = useMemo(
    () => availableSets.filter((s) => s.name !== currentSet),
    [availableSets, currentSet],
  );
  const [targetSet, setTargetSet] = useState<string>(targetSets[0]?.name ?? '');
  const [targetGroup, setTargetGroup] = useState<string>('');

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

  const groupValidationError = useMemo(() => {
    if (mode !== 'group') return null;
    const raw = targetGroup.trim();
    if (raw && (/\s/.test(raw) || raw.includes('..') || raw.startsWith('.') || raw.endsWith('.'))) {
      return 'Group path cannot contain spaces, leading/trailing dots, or "..".';
    }
    const selectedIds = new Set(selectedRows.map((r) => r.id));
    const seenNewKeys = new Set<string>();
    for (const row of selectedRows) {
      const nextName = computeGroupMovedName(row.name, raw);
      const key = `${row.type}:${nextName}`;
      if (seenNewKeys.has(key)) {
        return `Multiple selected tokens would collide at "${nextName}".`;
      }
      seenNewKeys.add(key);
      const conflict = allRows.some(
        (r) => !selectedIds.has(r.id) && r.type === row.type && r.name.trim() === nextName,
      );
      if (conflict) {
        return `Token "${nextName}" already exists.`;
      }
    }
    return null;
  }, [mode, targetGroup, selectedRows, allRows]);

  const previewFirst = selectedRows[0];
  const previewNextName =
    mode === 'group' && previewFirst
      ? computeGroupMovedName(previewFirst.name, targetGroup)
      : null;

  return (
    <div
      className="settings-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'set' ? 'Move tokens to set' : 'Move tokens to group'}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="settings-modal-header">
          <div className="settings-modal-title">
            {mode === 'set' ? 'Move Tokens to Set' : 'Move Tokens to Group'}
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close move dialog"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="settings-modal-body">
          <p className="bulk-move-summary">
            Moving <strong>{selectedRows.length}</strong>{' '}
            {selectedRows.length === 1 ? 'token' : 'tokens'}.
          </p>

          {mode === 'set' ? (
            <label className="settings-field">
              <span>Target Set</span>
              <select
                className="settings-select"
                aria-label="Target set"
                value={targetSet}
                onChange={(e) => setTargetSet(e.target.value)}
              >
                {targetSets.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className="settings-field">
                <span>Target Group (updates token name prefix)</span>
                <input
                  type="text"
                  className="settings-input"
                  aria-label="Target group"
                  list="bulk-move-group-options"
                  placeholder="e.g. semantic.brand (empty for root)"
                  value={targetGroup}
                  onChange={(e) => setTargetGroup(e.target.value)}
                  autoFocus
                />
                <datalist id="bulk-move-group-options">
                  {availableGroups.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </label>
              {previewFirst && previewNextName && (
                <div className="bulk-move-preview">
                  <span className="bulk-move-preview-label">Preview:</span>
                  <code>{previewFirst.name}</code>
                  <span>→</span>
                  <code>{previewNextName}</code>
                </div>
              )}
              {groupValidationError && (
                <div className="settings-status error" role="alert">
                  {groupValidationError}
                </div>
              )}
            </>
          )}
        </div>

        <div className="settings-modal-footer">
          <button type="button" className="matrix-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="matrix-btn matrix-btn-primary"
            disabled={
              (mode === 'set' && !targetSet) ||
              (mode === 'group' && Boolean(groupValidationError))
            }
            onClick={() => {
              if (mode === 'set') {
                onMoveToSet(targetSet);
              } else {
                onMoveToGroup(targetGroup);
              }
              onClose();
            }}
          >
            Move Tokens
          </button>
        </div>
      </div>
    </div>
  );
}

interface RenameGroupModalProps {
  groupPath: string;
  affectedRows: MatrixRow[];
  allRows: MatrixRow[];
  onRename: (oldGroupPath: string, nextGroupPath: string) => void;
  onClose: () => void;
}

export function RenameGroupModal({
  groupPath,
  affectedRows,
  allRows,
  onRename,
  onClose,
}: RenameGroupModalProps) {
  const [nextGroup, setNextGroup] = useState(groupPath);

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

  const cleanNext = nextGroup.trim().replace(/^\.+|\.+$/g, '');

  const validationError = useMemo(() => {
    if (!cleanNext) {
      return 'Group name cannot be empty.';
    }
    if (/\s/.test(cleanNext) || cleanNext.includes('..')) {
      return 'Group name cannot contain spaces or "..".';
    }
    if (cleanNext === groupPath) {
      return null;
    }
    const movingIds = new Set(affectedRows.map((r) => r.id));
    for (const row of affectedRows) {
      const suffix = row.name.slice(groupPath.length + 1);
      const nextName = `${cleanNext}.${suffix}`;
      const conflict = allRows.some(
        (r) => !movingIds.has(r.id) && r.type === row.type && r.name.trim() === nextName,
      );
      if (conflict) {
        return `Token "${nextName}" already exists.`;
      }
    }
    return null;
  }, [cleanNext, groupPath, affectedRows, allRows]);

  const previewRow = affectedRows[0];
  const previewNextName =
    previewRow && cleanNext
      ? `${cleanNext}.${previewRow.name.slice(groupPath.length + 1)}`
      : null;

  return (
    <div
      className="settings-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Rename group"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="settings-modal-header">
          <div className="settings-modal-title">Rename Group</div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close rename group dialog"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="settings-modal-body">
          <p className="bulk-move-summary">
            Renaming <strong>{groupPath}</strong> ({affectedRows.length}{' '}
            {affectedRows.length === 1 ? 'token' : 'tokens'}).
          </p>

          <label className="settings-field">
            <span>New Group Name</span>
            <input
              type="text"
              className="settings-input"
              aria-label="New group name"
              value={nextGroup}
              onChange={(e) => setNextGroup(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !validationError && cleanNext && cleanNext !== groupPath) {
                  e.preventDefault();
                  onRename(groupPath, cleanNext);
                  onClose();
                }
              }}
              autoFocus
            />
          </label>

          {previewRow && previewNextName && cleanNext !== groupPath && (
            <div className="bulk-move-preview">
              <span className="bulk-move-preview-label">Preview:</span>
              <code>{previewRow.name}</code>
              <span>→</span>
              <code>{previewNextName}</code>
            </div>
          )}

          {validationError && (
            <div className="settings-status error" role="alert">
              {validationError}
            </div>
          )}
        </div>

        <div className="settings-modal-footer">
          <button type="button" className="matrix-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="matrix-btn matrix-btn-primary"
            disabled={Boolean(validationError) || cleanNext === groupPath}
            onClick={() => {
              onRename(groupPath, cleanNext);
              onClose();
            }}
          >
            Rename Group
          </button>
        </div>
      </div>
    </div>
  );
}

interface RenameSetModalProps {
  setName: string;
  existingSetNames: string[];
  onRename: (oldName: string, nextName: string) => void;
  onClose: () => void;
}

export function RenameSetModal({
  setName,
  existingSetNames,
  onRename,
  onClose,
}: RenameSetModalProps) {
  const [nextName, setNextName] = useState(setName);

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

  const cleanNext = nextName.trim().replace(/^\/+|\/+$/g, '');

  const validationError = useMemo(() => {
    if (!cleanNext) {
      return 'Set name cannot be empty.';
    }
    if (cleanNext.includes('//')) {
      return 'Set name cannot contain "//".';
    }
    if (cleanNext === setName) {
      return null;
    }
    const existingLower = new Set(
      existingSetNames
        .filter((s) => s !== setName)
        .map((s) => s.toLowerCase()),
    );
    if (existingLower.has(cleanNext.toLowerCase())) {
      return `Set "${cleanNext}" already exists.`;
    }
    return null;
  }, [cleanNext, setName, existingSetNames]);

  return (
    <div
      className="settings-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Rename set"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="settings-modal-header">
          <span className="settings-modal-title">Rename set</span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close rename set modal"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="settings-modal-body">
          <p className="bulk-move-summary">
            Rename set <strong>{setName}</strong>
          </p>
          <label className="settings-label">
            <span>New set name (use &quot;/&quot; for set groups)</span>
            <input
              type="text"
              className="settings-input"
              aria-label="New set name"
              value={nextName}
              onChange={(e) => setNextName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !validationError && cleanNext && cleanNext !== setName) {
                  e.preventDefault();
                  onRename(setName, cleanNext);
                  onClose();
                }
              }}
              autoFocus
            />
          </label>

          {validationError && (
            <div className="settings-status error" role="alert">
              {validationError}
            </div>
          )}
        </div>

        <div className="settings-modal-footer">
          <button type="button" className="matrix-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="matrix-btn matrix-btn-primary"
            disabled={Boolean(validationError) || cleanNext === setName}
            onClick={() => {
              onRename(setName, cleanNext);
              onClose();
            }}
          >
            Rename Set
          </button>
        </div>
      </div>
    </div>
  );
}
