import { useMemo, useState } from 'react';
import type { MatrixRow } from '../types';

export interface FolderNode {
  name: string;
  path: string;
  count: number;
  children: FolderNode[];
}

export interface SidebarSetItem {
  name: string;
  isGroup: boolean;
}

interface SidebarProps {
  sidebarSets: SidebarSetItem[];
  selectedSet: string | null;
  onSelectSet: (setName: string | null) => void;
  setRows: MatrixRow[];
  selectedFolder: string | null;
  onSelectFolder: (folderPath: string | null) => void;
  editable?: boolean;
  onRenameGroup?: (groupPath: string) => void;
  onRenameSet?: (setName: string) => void;
}

function buildFolderTree(rows: MatrixRow[]): FolderNode[] {
  interface MutableNode {
    name: string;
    path: string;
    count: number;
    childrenMap: Map<string, MutableNode>;
  }

  const rootMap = new Map<string, MutableNode>();

  for (const row of rows) {
    const trimmed = row.name.trim();
    if (!trimmed) continue;
    const parts = trimmed.split('.');
    // Only segments before the last dot form folders
    if (parts.length <= 1) continue;

    let currentMap = rootMap;
    let currentPath = '';
    for (let i = 0; i < parts.length - 1; i++) {
      const segment = parts[i];
      currentPath = currentPath ? `${currentPath}.${segment}` : segment;
      let node = currentMap.get(segment);
      if (!node) {
        node = {
          name: segment,
          path: currentPath,
          count: 0,
          childrenMap: new Map(),
        };
        currentMap.set(segment, node);
      }
      node.count += 1;
      currentMap = node.childrenMap;
    }
  }

  const toArray = (map: Map<string, MutableNode>): FolderNode[] =>
    Array.from(map.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((n) => ({
        name: n.name,
        path: n.path,
        count: n.count,
        children: toArray(n.childrenMap),
      }));

  return toArray(rootMap);
}

export function Sidebar({
  sidebarSets,
  selectedSet,
  onSelectSet,
  setRows,
  selectedFolder,
  onSelectFolder,
  editable = true,
  onRenameGroup,
  onRenameSet,
}: SidebarProps) {
  const [setsExpanded, setSetsExpanded] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());

  const visibleSets = useMemo(
    () => (setsExpanded || sidebarSets.length <= 5 ? sidebarSets : sidebarSets.slice(0, 5)),
    [sidebarSets, setsExpanded],
  );

  const folderTree = useMemo(() => buildFolderTree(setRows), [setRows]);

  const toggleFolderExpand = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const renderFolder = (node: FolderNode, depth: number) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedFolders.has(node.path);
    const isSelected = selectedFolder === node.path;

    return (
      <div key={node.path} className="tree-branch">
        <div
          className={`sidebar-item ${isSelected ? 'active' : ''}`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onClick={() => onSelectFolder(isSelected ? null : node.path)}
          role="treeitem"
          aria-expanded={hasChildren ? isExpanded : undefined}
          aria-selected={isSelected}
        >
          <button
            type="button"
            className={`tree-chevron ${hasChildren ? '' : 'hidden'}`}
            aria-label={isExpanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) toggleFolderExpand(node.path);
            }}
          >
            {isExpanded ? '▾' : '▸'}
          </button>
          <span className="sidebar-item-icon" aria-hidden="true">
            📁
          </span>
          <span className="sidebar-item-label" title={node.path}>
            {node.name}
          </span>
          {editable && onRenameGroup && (
            <button
              type="button"
              className="group-rename-btn"
              aria-label={`Rename group ${node.path}`}
              title="Rename group"
              onClick={(e) => {
                e.stopPropagation();
                onRenameGroup(node.path);
              }}
            >
              ✎
            </button>
          )}
          <span className="sidebar-count">{node.count}</span>
        </div>

        {hasChildren && isExpanded && (
          <div className="tree-children" role="group">
            {node.children.map((child) => renderFolder(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="matrix-sidebar" aria-label="Token sets and groups">
      <section className="sidebar-section">
        <div className="sidebar-section-header">
          <span>Sets</span>
          <span className="sidebar-count">{sidebarSets.length}</span>
        </div>

        {visibleSets.map((item) => (
          <div
            key={item.name}
            className={`sidebar-item ${selectedSet === item.name ? 'active' : ''}`}
          >
            <button
              type="button"
              className="sidebar-item-btn"
              onClick={() => onSelectSet(item.name)}
            >
              <span className="sidebar-item-icon" aria-hidden="true">
                {item.isGroup ? '📁' : '◈'}
              </span>
              <span className="sidebar-item-label" title={item.name}>
                {item.name}
              </span>
            </button>
            {editable && onRenameSet && (
              <button
                type="button"
                className="group-rename-btn"
                aria-label={`Rename set ${item.name}`}
                title="Rename set"
                onClick={() => onRenameSet(item.name)}
              >
                <span aria-hidden="true">✎</span>
              </button>
            )}
          </div>
        ))}

        {sidebarSets.length > 5 && (
          <button
            type="button"
            className="sidebar-expand-btn"
            onClick={() => setSetsExpanded((prev) => !prev)}
          >
            {setsExpanded ? 'Show less' : `Show ${sidebarSets.length - 5} more...`}
          </button>
        )}
      </section>

      <hr className="sidebar-divider" />

      <section className="sidebar-section sidebar-tree-section">
        <div className="sidebar-section-header">
          <span>Groups</span>
          <span className="sidebar-count">{setRows.length}</span>
        </div>

        <div role="tree" aria-label="Token folder tree">
          <div
            className={`sidebar-item ${selectedFolder === null ? 'active' : ''}`}
            onClick={() => onSelectFolder(null)}
            role="treeitem"
            aria-selected={selectedFolder === null}
          >
            <span className="tree-chevron hidden" />
            <span className="sidebar-item-label">All Tokens</span>
            <span className="sidebar-count">{setRows.length}</span>
          </div>

          {folderTree.map((node) => renderFolder(node, 0))}
        </div>
      </section>
    </aside>
  );
}
