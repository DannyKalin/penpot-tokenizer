# Token Mode Matrix — Penpot Plugin

A Figma-style spreadsheet/table interface for creating and editing Penpot design tokens across multiple modes simultaneously.

## Loading the Plugin in Penpot

1. Open your design file in [Penpot](https://design.penpot.app/) (or your self-hosted Penpot instance).
2. Press **`Cmd+Option+P`** (macOS) / **`Ctrl+Alt+P`** (Windows/Linux) — or open **Plugins → Plugin Manager** from the main menu.
3. Paste the plugin manifest URL:
   ```text
   https://dannykalin.github.io/penpot-tokenizer/manifest.json
   ```
4. Click **Install** / **Open**, then launch **Token Mode Matrix** from your Plugins menu.

## Features

- **Multi-Mode Spreadsheet Editing:** View and edit token values across all sets and modes side by side.
- **Spreadsheet Keyboard Navigation:** `Tab` / `Shift+Tab` across cells, `Enter` to commit and move down, `Escape` to cancel, and `Cmd+Z` / `Cmd+Shift+Z` (`Ctrl+Z` / `Ctrl+Y`) for Undo/Redo.
- **Smart Inputs & Popovers:**
  - Inline color swatch preview and color picker for `color` tokens (raw values and resolved aliases).
  - Type `{` in any cell for live alias autocomplete and math expression evaluation.
  - Structured popovers for `typography` and `shadow` composite tokens, plus presets for `textDecoration` and `textCase`.
- **Organization & Sync:**
  - Sidebar tree for sets/groups and token folders, with group and set renaming.
  - Bulk select and move tokens between groups or sets.
  - **Sync from Penpot** to pull external changes made in Penpot's native Tokens panel.
- **Optional AI Descriptions:** Bring your own Gemini API key in Settings (stored locally in your browser) to generate token descriptions and usage guidelines.

## License

**All Rights Reserved.** See [LICENSE](./LICENSE). Users with access to the plugin link may install and use the plugin in Penpot, but may not copy, modify, or redistribute the source code without explicit permission.
