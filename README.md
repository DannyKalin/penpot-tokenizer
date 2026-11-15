# Token Mode Matrix — Penpot Plugin

A Figma-style spreadsheet/table interface for creating and editing Penpot design tokens across multiple modes (e.g., **Light**, **Dark**, **Compact**) simultaneously.

## How Modes Map to Penpot

Penpot stores design tokens inside **Token Sets** activated by **Themes** rather than storing multiple mode values on a single token. **Token Mode Matrix** bridges this automatically:

- **Read & Pivot:** Reads `penpot.library.local.tokens.sets` and `themes`, grouping tokens with identical names and types across mode sets into unified spreadsheet rows.
- **Write & Sync:** Editing a cell in a mode column ensures a matching `TokenSet` (`penpot.library.local.tokens.addSet`) and `TokenTheme` (`penpot.library.local.tokens.addTheme` + `theme.addSet`) exist, then creates or updates the token in that set.
- **Rename & Delete:** Renaming or deleting a token row updates or removes that token across all mode sets simultaneously.

## Features

- **Spreadsheet Keyboard Navigation:**
  - `Tab` / `Shift+Tab`: Move horizontally across cells in a row.
  - `Enter`: Commit edit and move down (or add a new blank row if on the last row).
  - `Escape`: Cancel the active edit and restore the original value.
- **Smart Cell Inputs:**
  - Inline color swatch preview for `color` tokens (including resolved `{alias}` references).
  - Type `{` in any cell to open an autocomplete popover listing existing token names for alias references (e.g. `{color.primitive.blue.500}`).
- **Filtering & Sync:**
  - Search tokens by name and filter by category (`All`, `Color`, `Spacing`, `Typography`, `Other`).
  - **+ Add Mode** to create new mode columns on the fly.
  - **Sync / Refresh from Penpot** to pull external changes made in Penpot's native Tokens panel.

## Development Setup

```bash
npm install
npm run dev
```

This starts the Vite dev server on `http://localhost:4400` with CORS enabled.

## Loading the Plugin in Penpot

1. Open your design file in [Penpot](https://design.penpot.app/) (or your self-hosted Penpot instance).
2. Press **`Ctrl+Alt+P`** (or **`Cmd+Option+P`** on macOS) — or open **Plugins → Plugin Manager** from the main menu.
3. Paste the local manifest URL:
   ```
   http://localhost:4400/manifest.json
   ```
4. Click **Install** / **Open**, then launch **Token Mode Matrix** from your Plugins menu.

## Production Build

```bash
npm run build
```

Outputs the compiled UI (`dist/index.html`), sandbox script (`dist/plugin.js`), and `dist/manifest.json`.
