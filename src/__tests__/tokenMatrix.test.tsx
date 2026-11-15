// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Penpot, Token, TokenSet, TokenTheme, TokenType } from '@penpot/plugin-types';
import { App } from '../App';
import { createTokenBridge } from '../pluginCore';
import type { PluginToUiMessage, UiToPluginMessage } from '../types';

const TOKENS_JSON_PATH = resolve(__dirname, './fixtures/tokens.json');
const MANIFEST_PATH = resolve(__dirname, '../../public/manifest.json');

interface RawTokenNode {
  $value: unknown;
  $type: TokenType;
  $description?: string;
}

function isTokenLeaf(node: unknown): node is RawTokenNode {
  return (
    typeof node === 'object' &&
    node !== null &&
    '$value' in node &&
    '$type' in node
  );
}

function flattenTokens(
  obj: Record<string, unknown>,
  prefix = '',
): { name: string; type: TokenType; value: string; description: string }[] {
  const out: { name: string; type: TokenType; value: string; description: string }[] = [];
  for (const [key, val] of Object.entries(obj)) {
    const nextName = prefix ? `${prefix}.${key}` : key;
    if (isTokenLeaf(val)) {
      out.push({
        name: nextName,
        type: val.$type,
        value: typeof val.$value === 'string' ? val.$value : JSON.stringify(val.$value),
        description: val.$description ?? '',
      });
    } else if (typeof val === 'object' && val !== null) {
      out.push(...flattenTokens(val as Record<string, unknown>, nextName));
    }
  }
  return out;
}

/**
 * Simulates Penpot's token catalog and permission checks (`content:write`).
 */
function createMockPenpotFromExport(permissions: string[]) {
  const hasContentWrite = permissions.includes('content:write');
  const hasContentRead = permissions.includes('content:read');

  const raw = JSON.parse(readFileSync(TOKENS_JSON_PATH, 'utf8')) as Record<string, unknown>;
  const tokenSetOrder =
    ((raw.$metadata as { tokenSetOrder?: string[] } | undefined)?.tokenSetOrder) ?? [];
  const rawThemes =
    (raw.$themes as { id: string; name: string; group: string; selectedTokenSets: Record<string, string> }[]) ?? [];

  const sets: TokenSet[] = [];
  const themes: TokenTheme[] = [];

  const makeToken = (
    setTokens: Token[],
    attrs: { id?: string; type: TokenType; name: string; value: Token['value']; description?: string },
  ): Token => {
    let name = attrs.name;
    let value: Token['value'] = attrs.value;
    let description = attrs.description ?? '';

    const tokenObj = {
      id: attrs.id ?? `tok-${Math.random().toString(36).slice(2, 9)}`,
      type: attrs.type,
      get name() {
        return name;
      },
      set name(next: string) {
        if (!hasContentWrite) return;
        name = next;
      },
      get value() {
        return value;
      },
      set value(next: Token['value']) {
        if (!hasContentWrite) return;
        value = next;
      },
      get description() {
        return description;
      },
      set description(next: string) {
        if (!hasContentWrite) return;
        description = next;
      },
      get resolvedValue() {
        return value;
      },
      get resolvedValueString() {
        return String(value);
      },
      duplicate() {
        if (!hasContentWrite) return null as unknown as Token;
        const copy = makeToken(setTokens, {
          type: attrs.type,
          name: `${name}.copy`,
          value,
          description,
        });
        setTokens.push(copy);
        return copy;
      },
      remove() {
        if (!hasContentWrite) return;
        const idx = setTokens.indexOf(tokenObj);
        if (idx >= 0) setTokens.splice(idx, 1);
      },
      applyToShapes() {},
      applyToSelected() {},
    } as unknown as Token;

    return tokenObj;
  };

  const makeSet = (setName: string, active = true): TokenSet => {
    const tokens: Token[] = [];
    const setObj: TokenSet = {
      id: `set-${setName}`,
      name: setName,
      active,
      get tokens() {
        return [...tokens].sort((a, b) => a.name.localeCompare(b.name));
      },
      get tokensByType() {
        return [];
      },
      toggleActive() {
        setObj.active = !setObj.active;
      },
      getTokenById(id: string) {
        return tokens.find((t) => t.id === id);
      },
      addToken({ type, name, value }) {
        // Mirrors Penpot tokens.cljs returning nil without content:write
        if (!hasContentWrite) {
          return null as unknown as Token;
        }
        const created = makeToken(tokens, { type, name, value: value as Token['value'] });
        tokens.push(created);
        return created;
      },
      duplicate() {
        return makeSet(`${setName}.copy`, active);
      },
      remove() {
        const idx = sets.indexOf(setObj);
        if (idx >= 0) sets.splice(idx, 1);
      },
    };
    return setObj;
  };

  // Seed initial tokens cleanly
  for (const setName of tokenSetOrder) {
    const tokens: Token[] = [];
    const setObj: TokenSet = {
      id: `set-${setName}`,
      name: setName,
      active: true,
      get tokens() {
        return [...tokens].sort((a, b) => a.name.localeCompare(b.name));
      },
      get tokensByType() {
        return [];
      },
      toggleActive() {
        setObj.active = !setObj.active;
      },
      getTokenById(id: string) {
        return tokens.find((t) => t.id === id);
      },
      addToken({ type, name, value }) {
        if (!hasContentWrite) {
          return null as unknown as Token;
        }
        const created = makeToken(tokens, { type, name, value: value as Token['value'] });
        tokens.push(created);
        return created;
      },
      duplicate() {
        return makeSet(`${setName}.copy`, true);
      },
      remove() {
        const idx = sets.indexOf(setObj);
        if (idx >= 0) sets.splice(idx, 1);
      },
    };
    const setData = raw[setName] as Record<string, unknown> | undefined;
    if (setData) {
      for (const leaf of flattenTokens(setData)) {
        tokens.push(makeToken(tokens, leaf));
      }
    }
    sets.push(setObj);
  }

  for (const t of rawThemes) {
    const linked = Object.keys(t.selectedTokenSets ?? {})
      .map((name) => sets.find((s) => s.name === name))
      .filter((s): s is TokenSet => Boolean(s));
    const themeObj: TokenTheme = {
      id: t.id,
      externalId: undefined,
      group: t.group,
      name: t.name,
      active: false,
      toggleActive() {
        themeObj.active = !themeObj.active;
      },
      get activeSets() {
        return linked;
      },
      addSet(tokenSet) {
        if (!hasContentWrite) return;
        const found =
          typeof tokenSet === 'string'
            ? sets.find((s) => s.id === tokenSet)
            : tokenSet;
        if (found && !linked.includes(found)) linked.push(found);
      },
      removeSet(tokenSet) {
        if (!hasContentWrite) return;
        const id = typeof tokenSet === 'string' ? tokenSet : tokenSet.id;
        const idx = linked.findIndex((s) => s.id === id);
        if (idx >= 0) linked.splice(idx, 1);
      },
      duplicate() {
        return themeObj;
      },
      remove() {},
    };
    themes.push(themeObj);
  }

  let uiHandler: ((msg: UiToPluginMessage) => void) | null = null;
  const sentMessages: PluginToUiMessage[] = [];

  const mockPenpot = {
    theme: 'dark',
    ui: {
      open: vi.fn(),
      size: { width: 960, height: 600 },
      resize: vi.fn(),
      sendMessage: (msg: PluginToUiMessage) => {
        sentMessages.push(msg);
        window.dispatchEvent(new MessageEvent('message', { data: msg }));
      },
      onMessage: <T,>(cb: (msg: T) => void) => {
        uiHandler = cb as unknown as (msg: UiToPluginMessage) => void;
      },
    },
    on: vi.fn(() => {
      if (!hasContentRead) {
        throw new Error("Plugin doesn't have 'content:read' permission");
      }
    }),
    library: {
      local: {
        tokens: {
          isEditableTokens: true,
          get sets() {
            return sets;
          },
          get themes() {
            return themes;
          },
          addSet({ name, active = false }: { name: string; active?: boolean }) {
            if (!hasContentWrite) return null as unknown as TokenSet;
            const created = makeSet(name, active);
            sets.push(created);
            return created;
          },
          addTheme({ group, name }: { group: string; name: string }) {
            const created: TokenTheme = {
              id: `theme-${name}`,
              externalId: undefined,
              group,
              name,
              active: false,
              toggleActive() {},
              activeSets: [],
              addSet() {},
              removeSet() {},
              duplicate() {
                return created;
              },
              remove() {},
            };
            themes.push(created);
            return created;
          },
          getSetById(id: string) {
            return sets.find((s) => s.id === id);
          },
          getThemeById(id: string) {
            return themes.find((t) => t.id === id);
          },
        },
      },
    },
  } as unknown as Penpot;

  return {
    mockPenpot,
    sets,
    sentMessages,
    deliverFromUi: (msg: UiToPluginMessage) => uiHandler?.(msg),
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Token Mode Matrix with New File 3 tokens.json', () => {
  it('manifest.json declares content:read, content:write, library:read, and library:write', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
      permissions: string[];
    };
    expect(manifest.permissions).toContain('content:read');
    expect(manifest.permissions).toContain('content:write');
    expect(manifest.permissions).toContain('library:read');
    expect(manifest.permissions).toContain('library:write');
  });

  it('adds semantic.text.accent {blue.400} for pr/dark from the table and persists it', async () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
      permissions: string[];
    };
    const { mockPenpot, sets, deliverFromUi } = createMockPenpotFromExport(
      manifest.permissions,
    );
    const bridge = createTokenBridge(mockPenpot);
    mockPenpot.ui.onMessage(bridge.handleMessage);

    // Simulate iframe parent.postMessage forwarding UI -> Penpot plugin
    const postSpy = vi.fn((msg: UiToPluginMessage) => {
      deliverFromUi(msg);
    });
    const fakeParent = { postMessage: postSpy } as unknown as Window;
    vi.spyOn(window, 'parent', 'get').mockReturnValue(fakeParent);

    render(<App initialTheme="dark" />);

    const sidebar = screen.getByLabelText('Token sets and groups');

    // Wait for initial sync-data to populate the table and sidebar
    await waitFor(() => {
      expect(within(sidebar).getByText('pr')).toBeTruthy();
      expect(within(sidebar).getByText('primitives')).toBeTruthy();
    });

    // Themes Light and Dark must NOT appear in the Sets sidebar section
    expect(within(sidebar).queryByText('Light')).toBeNull();
    expect(within(sidebar).queryByText('Dark')).toBeNull();

    // Select the "pr" grouped set in the sidebar
    fireEvent.click(within(sidebar).getByText('pr'));

    // Find the semantic.text.accent row
    const nameInput = await screen.findByDisplayValue('semantic.text.accent');
    const row = nameInput.closest('tr')!;
    const modeCells = row.querySelectorAll('td.col-mode');
    const lightInput = modeCells[0].querySelector('input')!;
    const darkInput = modeCells[1].querySelector('input')!;

    expect(lightInput.value).toBe('{blue.500}');
    expect(darkInput.value).toBe('');

    // Open the alias picker dropdown on the dark cell
    const pickerBtn = within(modeCells[1] as HTMLElement).getByLabelText('Pick token alias');
    fireEvent.mouseDown(pickerBtn);

    // Dropdown should show only color tokens (e.g. {blue.400}), never spacing/fontWeights
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).queryByText('{spacing.1x}')).toBeNull();
    expect(within(listbox).queryByText('{fontWeight.bold}')).toBeNull();

    const blue400Option = within(listbox).getByText('{blue.400}');
    fireEvent.mouseDown(blue400Option);

    // Wait past scheduleSnapshot(120) so sync-data round-trip completes
    await new Promise((r) => setTimeout(r, 200));

    // Verify no error alert was shown
    expect(screen.queryByRole('alert')).toBeNull();

    // Verify UI still displays {blue.400} after sync-data round-trip
    expect(darkInput.value).toBe('{blue.400}');

    // Verify Penpot's pr/dark TokenSet now actually contains semantic.text.accent = {blue.400}
    const prDarkSet = sets.find((s) => s.name === 'pr/dark')!;
    const addedToken = prDarkSet.tokens.find((t) => t.name === 'semantic.text.accent');
    expect(addedToken).toBeDefined();
    expect(addedToken?.type).toBe('color');
    expect(addedToken?.value).toBe('{blue.400}');
  });

  it('creates a brand-new token in both pr/light and pr/dark when added from the table', async () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
      permissions: string[];
    };
    const { mockPenpot, sets, deliverFromUi } = createMockPenpotFromExport(
      manifest.permissions,
    );
    const bridge = createTokenBridge(mockPenpot);
    mockPenpot.ui.onMessage(bridge.handleMessage);

    const fakeParent = {
      postMessage: (msg: UiToPluginMessage) => deliverFromUi(msg),
    } as unknown as Window;
    vi.spyOn(window, 'parent', 'get').mockReturnValue(fakeParent);

    render(<App initialTheme="dark" />);

    const sidebar = await screen.findByLabelText('Token sets and groups');
    await waitFor(() => expect(within(sidebar).getByText('pr')).toBeTruthy());
    fireEvent.click(within(sidebar).getByText('pr'));

    // Click "+ Add Token"
    fireEvent.click(screen.getByText('+ Add Token'));

    // Find the new blank row at the bottom
    const blankNameInputs = screen.getAllByPlaceholderText('semantic.backgrounds.primary');
    const newNameInput = blankNameInputs[blankNameInputs.length - 1] as HTMLInputElement;
    fireEvent.change(newNameInput, { target: { value: 'semantic.text.brand' } });
    fireEvent.blur(newNameInput);

    // Row must remain visible after committing its name
    const committedNameInput = await screen.findByDisplayValue('semantic.text.brand');
    const newRow = committedNameInput.closest('tr')!;
    const newCells = newRow.querySelectorAll('td.col-mode');
    const lightInput = newCells[0].querySelector('input')!;

    fireEvent.change(lightInput, { target: { value: '{blue.500}' } });
    fireEvent.blur(lightInput);

    await new Promise((r) => setTimeout(r, 200));

    expect(screen.queryByRole('alert')).toBeNull();
    const prLight = sets.find((s) => s.name === 'pr/light')!;
    const prDark = sets.find((s) => s.name === 'pr/dark')!;
    expect(prLight.tokens.find((t) => t.name === 'semantic.text.brand')?.value).toBe('{blue.500}');
    expect(prDark.tokens.find((t) => t.name === 'semantic.text.brand')?.value).toBe('{blue.500}');
  });

  it('prefills opened folder prefix on + Add Token and blocks duplicate/invalid names with red alert state', async () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
      permissions: string[];
    };
    const { mockPenpot, sets, deliverFromUi } = createMockPenpotFromExport(
      manifest.permissions,
    );
    const bridge = createTokenBridge(mockPenpot);
    mockPenpot.ui.onMessage(bridge.handleMessage);

    const fakeParent = {
      postMessage: (msg: UiToPluginMessage) => deliverFromUi(msg),
    } as unknown as Window;
    vi.spyOn(window, 'parent', 'get').mockReturnValue(fakeParent);

    render(<App initialTheme="dark" />);

    const sidebar = await screen.findByLabelText('Token sets and groups');
    await waitFor(() => expect(within(sidebar).getByText('pr')).toBeTruthy());
    fireEvent.click(within(sidebar).getByText('pr'));

    // Expand semantic -> select text folder
    const semanticItem = within(sidebar).getByText('semantic').closest('[role="treeitem"]')!;
    fireEvent.click(within(semanticItem as HTMLElement).getByLabelText('Expand semantic'));
    fireEvent.click(within(sidebar).getByText('text'));

    // Click "+ Add Token" -> should prefill "semantic.text." and focus the name input
    fireEvent.click(screen.getByText('+ Add Token'));
    const prefilledInput = (await screen.findByDisplayValue(
      'semantic.text.',
    )) as HTMLInputElement;
    expect(document.activeElement).toBe(prefilledInput);

    // Committing trailing dot "semantic.text." shows invalid name alert and does not save
    fireEvent.blur(prefilledInput);
    expect(prefilledInput.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Invalid name (not saved)')).toBeTruthy();

    // Entering an existing token name "semantic.text.primary" shows duplicate alert and does not save
    fireEvent.change(prefilledInput, { target: { value: 'semantic.text.primary' } });
    fireEvent.blur(prefilledInput);
    expect(prefilledInput.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Token already exists (not saved)')).toBeTruthy();

    const prLight = sets.find((s) => s.name === 'pr/light')!;
    expect(prLight.tokens.filter((t) => t.name === 'semantic.text.primary')).toHaveLength(1);
  });

  it('offers live alias search when typing without braces and sibling aliases when focusing an existing alias', async () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
      permissions: string[];
    };
    const { mockPenpot, sets, deliverFromUi } = createMockPenpotFromExport(
      manifest.permissions,
    );
    const bridge = createTokenBridge(mockPenpot);
    mockPenpot.ui.onMessage(bridge.handleMessage);

    const fakeParent = {
      postMessage: (msg: UiToPluginMessage) => deliverFromUi(msg),
    } as unknown as Window;
    vi.spyOn(window, 'parent', 'get').mockReturnValue(fakeParent);

    render(<App initialTheme="dark" />);

    const sidebar = await screen.findByLabelText('Token sets and groups');
    await waitFor(() => expect(within(sidebar).getByText('pr')).toBeTruthy());
    fireEvent.click(within(sidebar).getByText('pr'));

    // 1. Focusing an existing "{blue.500}" cell immediately offers sibling "{blue.*}" tokens
    const accentLightInput = screen.getByDisplayValue('{blue.500}') as HTMLInputElement;
    fireEvent.focus(accentLightInput);

    const listbox1 = await screen.findByRole('listbox');
    expect(within(listbox1).getByText('{blue.400}')).toBeTruthy();
    fireEvent.blur(accentLightInput);

    // 2. Typing "blue" (without "{") in a mode value cell searches matching tokens and inserts "{blue.400}" on click
    const primaryRow = screen.getByDisplayValue('semantic.text.primary').closest('tr')!;
    const primaryLightInput = primaryRow.querySelectorAll('td.col-mode')[0].querySelector('input')! as HTMLInputElement;
    fireEvent.focus(primaryLightInput);
    fireEvent.change(primaryLightInput, { target: { value: 'blue' } });

    const listbox2 = await screen.findByRole('listbox');
    const blue400Option = within(listbox2).getByText('{blue.400}');
    fireEvent.mouseDown(blue400Option);

    await new Promise((r) => setTimeout(r, 200));

    expect(primaryLightInput.value).toBe('{blue.400}');
    const prLight = sets.find((s) => s.name === 'pr/light')!;
    expect(prLight.tokens.find((t) => t.name === 'semantic.text.primary')?.value).toBe('{blue.400}');
  });

  it('opens color picker on swatch click for both alias and raw colors, overriding alias when a color is picked', async () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
      permissions: string[];
    };
    const { mockPenpot, sets, deliverFromUi } = createMockPenpotFromExport(
      manifest.permissions,
    );
    const bridge = createTokenBridge(mockPenpot);
    mockPenpot.ui.onMessage(bridge.handleMessage);

    const fakeParent = {
      postMessage: (msg: UiToPluginMessage) => deliverFromUi(msg),
    } as unknown as Window;
    vi.spyOn(window, 'parent', 'get').mockReturnValue(fakeParent);

    render(<App initialTheme="dark" />);

    const sidebar = await screen.findByLabelText('Token sets and groups');
    await waitFor(() => expect(within(sidebar).getByText('pr')).toBeTruthy());

    // 1. In "pr", clicking the swatch on an alias cell ("{blue.500}") opens the color picker and overrides the alias
    fireEvent.click(within(sidebar).getByText('pr'));
    const accentRow = screen.getByDisplayValue('semantic.text.accent').closest('tr')!;
    const accentLightCell = accentRow.querySelectorAll('td.col-mode')[0] as HTMLElement;
    const aliasSwatchBtn = within(accentLightCell).getByRole('button', { name: 'Open color picker' });

    fireEvent.mouseDown(aliasSwatchBtn);
    const aliasDialog = await screen.findByRole('dialog', { name: 'Color picker' });
    fireEvent.click(within(aliasDialog).getByRole('tab', { name: 'RGB' }));
    const aliasColorInput = within(aliasDialog).getByLabelText('Color value') as HTMLInputElement;
    const overriddenRgb = aliasColorInput.value;
    expect(overriddenRgb).toMatch(/^rgb\(/);
    fireEvent.click(within(aliasDialog).getByRole('button', { name: 'Done' }));

    await new Promise((r) => setTimeout(r, 200));
    const prLight = sets.find((s) => s.name === 'pr/light')!;
    expect(prLight.tokens.find((t) => t.name === 'semantic.text.accent')?.value).toBe(overriddenRgb);

    // 2. Switch to "primitives" where raw hex colors live (e.g. blue.100 = #b2d6fb)
    fireEvent.click(within(sidebar).getByText('primitives'));
    const blue100Row = (await screen.findByDisplayValue('blue.100')).closest('tr')!;
    const blue100Cell = blue100Row.querySelectorAll('td.col-mode')[0] as HTMLElement;
    const swatchBtn = within(blue100Cell).getByRole('button', { name: 'Open color picker' });

    fireEvent.mouseDown(swatchBtn);
    const dialog = await screen.findByRole('dialog', { name: 'Color picker' });

    // Switch to RGB, then reduce Alpha to 50% -> produces rgba(...)
    fireEvent.click(within(dialog).getByRole('tab', { name: 'RGB' }));
    const alphaSlider = within(dialog).getByLabelText('Alpha');
    fireEvent.change(alphaSlider, { target: { value: '50' } });

    const colorInput = within(dialog).getByLabelText('Color value') as HTMLInputElement;
    expect(colorInput.value).toMatch(/^rgba\(\d+,\s*\d+,\s*\d+,\s*0\.5\)$/);

    // Switch to HSL and OKLCH tabs to verify all formats work
    fireEvent.click(within(dialog).getByRole('tab', { name: 'HSL' }));
    expect(colorInput.value).toMatch(/^hsla\(/);

    fireEvent.click(within(dialog).getByRole('tab', { name: 'OKLCH' }));
    expect(colorInput.value).toMatch(/^oklch\(/);

    // Switch back to RGB (keeps rgba with 0.5 alpha) and click Done to commit
    fireEvent.click(within(dialog).getByRole('tab', { name: 'RGB' }));
    const expectedRgba = colorInput.value;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));

    await new Promise((r) => setTimeout(r, 200));

    const primitives = sets.find((s) => s.name === 'primitives')!;
    expect(primitives.tokens.find((t) => t.name === 'blue.100')?.value).toBe(expectedRgba);
  });

  it('supports Undo on Ctrl+Z / Cmd+Z and Redo on Cmd+Shift+Z', async () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
      permissions: string[];
    };
    const { mockPenpot, sets, deliverFromUi } = createMockPenpotFromExport(
      manifest.permissions,
    );
    const bridge = createTokenBridge(mockPenpot);
    mockPenpot.ui.onMessage(bridge.handleMessage);

    const fakeParent = {
      postMessage: (msg: UiToPluginMessage) => deliverFromUi(msg),
    } as unknown as Window;
    vi.spyOn(window, 'parent', 'get').mockReturnValue(fakeParent);

    render(<App initialTheme="dark" />);

    const sidebar = await screen.findByLabelText('Token sets and groups');
    await waitFor(() => expect(within(sidebar).getByText('pr')).toBeTruthy());
    fireEvent.click(within(sidebar).getByText('pr'));

    const accentRow = screen.getByDisplayValue('semantic.text.accent').closest('tr')!;
    const accentDarkInput = accentRow.querySelectorAll('td.col-mode')[1].querySelector('input')! as HTMLInputElement;
    expect(accentDarkInput.value).toBe('');

    const undoBtn = screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement;
    const redoBtn = screen.getByRole('button', { name: 'Redo' }) as HTMLButtonElement;
    expect(undoBtn.disabled).toBe(true);
    expect(redoBtn.disabled).toBe(true);

    // Commit a change to {blue.700}
    fireEvent.focus(accentDarkInput);
    fireEvent.change(accentDarkInput, { target: { value: '{blue.700}' } });
    fireEvent.blur(accentDarkInput);

    await new Promise((r) => setTimeout(r, 200));
    const prDark = sets.find((s) => s.name === 'pr/dark')!;
    expect(prDark.tokens.find((t) => t.name === 'semantic.text.accent')?.value).toBe('{blue.700}');
    expect(undoBtn.disabled).toBe(false);

    // Undo with Cmd+Z -> removes/restores back to ''
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    await new Promise((r) => setTimeout(r, 200));
    expect(prDark.tokens.find((t) => t.name === 'semantic.text.accent')).toBeUndefined();
    expect(accentDarkInput.value).toBe('');
    expect(redoBtn.disabled).toBe(false);

    // Redo with toolbar Redo button -> restores {blue.700}
    fireEvent.click(redoBtn);
    await new Promise((r) => setTimeout(r, 200));
    expect(prDark.tokens.find((t) => t.name === 'semantic.text.accent')?.value).toBe('{blue.700}');
    expect(accentDarkInput.value).toBe('{blue.700}');

    // Undo with toolbar Undo button -> restores ''
    fireEvent.click(undoBtn);
    await new Promise((r) => setTimeout(r, 200));
    expect(prDark.tokens.find((t) => t.name === 'semantic.text.accent')).toBeUndefined();
  });

  it('adds and persists a token description via the icon-only button', async () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
      permissions: string[];
    };
    const { mockPenpot, sets, deliverFromUi } = createMockPenpotFromExport(
      manifest.permissions,
    );
    const bridge = createTokenBridge(mockPenpot);
    mockPenpot.ui.onMessage(bridge.handleMessage);

    const fakeParent = {
      postMessage: (msg: UiToPluginMessage) => deliverFromUi(msg),
    } as unknown as Window;
    vi.spyOn(window, 'parent', 'get').mockReturnValue(fakeParent);

    render(<App initialTheme="dark" />);

    const sidebar = await screen.findByLabelText('Token sets and groups');
    await waitFor(() => expect(within(sidebar).getByText('pr')).toBeTruthy());
    fireEvent.click(within(sidebar).getByText('pr'));

    const prLight = sets.find((s) => s.name === 'pr/light')!;
    const prevDesc = prLight.tokens.find((t) => t.name === 'semantic.text.accent')?.description ?? '';

    const descBtn = screen.getByRole('button', {
      name: /description for semantic\.text\.accent/i,
    });
    fireEvent.click(descBtn);

    const dialog = await screen.findByRole('dialog', {
      name: 'Description for semantic.text.accent',
    });
    const textarea = within(dialog).getByLabelText('Token description');
    fireEvent.change(textarea, {
      target: { value: 'Accent text color for interactive links' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await new Promise((r) => setTimeout(r, 200));

    expect(
      prLight.tokens.find((t) => t.name === 'semantic.text.accent')?.description,
    ).toBe('Accent text color for interactive links');

    const editDescBtn = screen.getByRole('button', {
      name: 'Edit description for semantic.text.accent',
    });
    expect(editDescBtn.className).toContain('has-description');

    // Undo reverts description
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await new Promise((r) => setTimeout(r, 200));
    expect(
      prLight.tokens.find((t) => t.name === 'semantic.text.accent')?.description ?? '',
    ).toBe(prevDesc);
  });

  it('configures AI settings without prefilled key and generates scenario-grounded description + AI instructions', async () => {
    window.localStorage.clear();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'Description: Accent text color for inline links and interactive callouts.\nAI Instructions: Use only on neutral surfaces; pair with underline or focus ring for accessibility.',
                },
              ],
            },
          },
        ],
      }),
    } as Response);

    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
      permissions: string[];
    };
    const { mockPenpot, sets, deliverFromUi } = createMockPenpotFromExport(
      manifest.permissions,
    );
    const bridge = createTokenBridge(mockPenpot);
    mockPenpot.ui.onMessage(bridge.handleMessage);

    const fakeParent = {
      postMessage: (msg: UiToPluginMessage) => deliverFromUi(msg),
    } as unknown as Window;
    vi.spyOn(window, 'parent', 'get').mockReturnValue(fakeParent);

    render(<App initialTheme="dark" />);

    const sidebar = await screen.findByLabelText('Token sets and groups');
    await waitFor(() => expect(within(sidebar).getByText('pr')).toBeTruthy());
    fireEvent.click(within(sidebar).getByText('pr'));

    // 1. Clicking Generate without an API key prompts to open Settings
    const descBtn = screen.getByRole('button', {
      name: /description for semantic\.text\.accent/i,
    });
    fireEvent.click(descBtn);
    const popover = await screen.findByRole('dialog', {
      name: 'Description for semantic.text.accent',
    });
    fireEvent.click(within(popover).getByRole('button', { name: /Generate/i }));
    expect(within(popover).getByText(/Add your AI API key in Settings first/i)).toBeTruthy();

    fireEvent.click(within(popover).getByRole('button', { name: 'Open Settings' }));

    // 2. Settings modal opens with empty API key; operator enters key and picks Gemini 3.6 Flash
    const settingsDialog = await screen.findByRole('dialog', { name: 'Plugin AI Settings' });
    const keyInput = within(settingsDialog).getByPlaceholderText(/Enter your Gemini API key/i) as HTMLInputElement;
    expect(keyInput.value).toBe('');

    fireEvent.change(within(settingsDialog).getByLabelText('Model'), {
      target: { value: 'gemini-3.6-flash' },
    });

    // Test invalid key first, then valid key before saving
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'API key not valid.' } }),
    } as Response);
    fireEvent.change(keyInput, { target: { value: 'bad-key' } });
    fireEvent.click(within(settingsDialog).getByRole('button', { name: 'Test Key' }));
    const invalidStatus = await within(settingsDialog).findByRole('status');
    expect(invalidStatus.textContent).toContain('API key not valid.');

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ name: 'models/gemini-3.6-flash' }),
    } as Response);
    fireEvent.change(keyInput, { target: { value: 'test-operator-key' } });
    fireEvent.click(within(settingsDialog).getByRole('button', { name: 'Test Key' }));
    const validStatus = await within(settingsDialog).findByRole('status');
    expect(validStatus.textContent).toContain('API key is valid and ready.');

    fireEvent.click(within(settingsDialog).getByRole('button', { name: 'Save Settings' }));

    // 3. Reopen description popover, write scenario notes, generate, and save
    fireEvent.click(descBtn);
    const popover2 = await screen.findByRole('dialog', {
      name: 'Description for semantic.text.accent',
    });
    const textarea = within(popover2).getByLabelText('Token description') as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: 'inline links and interactive callouts' },
    });
    fireEvent.click(within(popover2).getByRole('button', { name: /Generate/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [reqUrl, reqInit] = fetchMock.mock.calls[2];
    expect(String(reqUrl)).toContain('gemini-3.6-flash:generateContent');
    expect((reqInit?.headers as Record<string, string>)['x-goog-api-key']).toBe('test-operator-key');
    expect(String(reqInit?.body)).toContain('inline links and interactive callouts');

    await waitFor(() => expect(textarea.value).toContain('AI Instructions:'));
    // Generated description is pushed to Penpot immediately on Generate
    await new Promise((r) => setTimeout(r, 200));
    const prLight = sets.find((s) => s.name === 'pr/light')!;
    expect(
      prLight.tokens.find((t) => t.name === 'semantic.text.accent')?.description,
    ).toContain('AI Instructions:');

    fireEvent.click(within(popover2).getByRole('button', { name: 'Save' }));

    fetchMock.mockRestore();
  });

  it('offers parameter presets for textDecoration/textCase and structured editors for typography/shadow', async () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
      permissions: string[];
    };
    const { mockPenpot, sets, deliverFromUi } = createMockPenpotFromExport(
      manifest.permissions,
    );
    const bridge = createTokenBridge(mockPenpot);
    mockPenpot.ui.onMessage(bridge.handleMessage);

    const fakeParent = {
      postMessage: (msg: UiToPluginMessage) => deliverFromUi(msg),
    } as unknown as Window;
    vi.spyOn(window, 'parent', 'get').mockReturnValue(fakeParent);

    render(<App initialTheme="dark" />);

    const sidebar = await screen.findByLabelText('Token sets and groups');
    await waitFor(() => expect(within(sidebar).getByText('pr')).toBeTruthy());
    fireEvent.click(within(sidebar).getByText('pr'));

    const selectTokenType = async (targetRow: HTMLElement, label: string) => {
      const trigger = targetRow.querySelector('.type-icon-trigger') as HTMLButtonElement;
      fireEvent.click(trigger);
      const typeListbox = await screen.findByRole('listbox', { name: 'Token types' });
      fireEvent.mouseDown(within(typeListbox).getByRole('option', { name: label }));
    };

    // 1. Add a textDecoration token and focus its light cell -> shows parameter presets (not aliases)
    fireEvent.click(screen.getByText('+ Add Token'));
    const blankInputs = screen.getAllByPlaceholderText('semantic.backgrounds.primary');
    const nameInput = blankInputs[blankInputs.length - 1] as HTMLInputElement;
    const row = nameInput.closest('tr')!;
    await selectTokenType(row, 'Text Decoration');
    fireEvent.change(nameInput, { target: { value: 'semantic.text.linkDecoration' } });
    fireEvent.blur(nameInput);

    const decRow = (await screen.findByDisplayValue('semantic.text.linkDecoration')).closest('tr')!;
    const decLightInput = decRow.querySelectorAll('td.col-mode')[0].querySelector('input')!;
    fireEvent.focus(decLightInput);

    const presetListbox = await screen.findByRole('listbox', { name: 'Token parameter options' });
    expect(within(presetListbox).getByText('underline')).toBeTruthy();
    expect(within(presetListbox).getByText('strike-through')).toBeTruthy();
    fireEvent.mouseDown(within(presetListbox).getByText('underline'));

    await new Promise((r) => setTimeout(r, 200));
    const prLight = sets.find((s) => s.name === 'pr/light')!;
    expect(
      prLight.tokens.find((t) => t.name === 'semantic.text.linkDecoration')?.value,
    ).toBe('underline');

    // 2. Add a typography token and edit via the Typography popover
    fireEvent.click(screen.getByText('+ Add Token'));
    const blankInputs2 = screen.getAllByPlaceholderText('semantic.backgrounds.primary');
    const nameInput2 = blankInputs2[blankInputs2.length - 1] as HTMLInputElement;
    const row2 = nameInput2.closest('tr')!;
    await selectTokenType(row2, 'Typography');
    fireEvent.change(nameInput2, { target: { value: 'semantic.heading.h1' } });
    fireEvent.blur(nameInput2);

    const typoRow = (await screen.findByDisplayValue('semantic.heading.h1')).closest('tr')!;
    const typoTrigger = within(typoRow.querySelectorAll('td.col-mode')[0] as HTMLElement).getByRole('button', {
      name: /Configure typography/i,
    });
    fireEvent.click(typoTrigger);

    const typoDialog = await screen.findByRole('dialog', { name: 'Typography token editor' });
    fireEvent.change(within(typoDialog).getByLabelText('Font Family'), {
      target: { value: 'Inter' },
    });
    fireEvent.change(within(typoDialog).getByLabelText('Font Size'), {
      target: { value: '32' },
    });
    fireEvent.change(within(typoDialog).getByLabelText('Font Weight'), {
      target: { value: '700' },
    });
    fireEvent.click(within(typoDialog).getByRole('button', { name: 'Apply' }));

    await new Promise((r) => setTimeout(r, 200));
    const rawSaved = prLight.tokens.find((t) => t.name === 'semantic.heading.h1')?.value;
    expect(typeof rawSaved).toBe('object');
    expect(rawSaved).toMatchObject({
      fontFamilies: ['Inter'],
      fontSizes: '32',
      fontWeight: '700',
    });
    const updatedTypoRow = (await screen.findByDisplayValue('semantic.heading.h1')).closest('tr')!;
    expect(
      within(updatedTypoRow.querySelectorAll('td.col-mode')[0] as HTMLElement).getByRole('button', {
        name: '32 · 700 · Inter',
      }),
    ).toBeTruthy();

    // 3. Add a shadow token and pick a {blue.500} alias for Layer 1 Color
    fireEvent.click(screen.getByText('+ Add Token'));
    const blankInputs3 = screen.getAllByPlaceholderText('semantic.backgrounds.primary');
    const nameInput3 = blankInputs3[blankInputs3.length - 1] as HTMLInputElement;
    const row3 = nameInput3.closest('tr')!;
    await selectTokenType(row3, 'Shadow');
    fireEvent.change(nameInput3, { target: { value: 'semantic.shadow.focus' } });
    fireEvent.blur(nameInput3);

    const shadowRow = (await screen.findByDisplayValue('semantic.shadow.focus')).closest('tr')!;
    const shadowTrigger = within(shadowRow.querySelectorAll('td.col-mode')[0] as HTMLElement).getByRole('button', {
      name: /Configure shadow/i,
    });
    fireEvent.click(shadowTrigger);

    const shadowDialog = await screen.findByRole('dialog', { name: 'Shadow token editor' });
    // Verify color swatch + color picker work inside the Shadow modal and float outside scroll container
    const colorSwatchBtn = within(shadowDialog).getByRole('button', {
      name: 'Pick color for Layer 1 Color',
    });
    fireEvent.click(colorSwatchBtn);
    const colorPickerDialog = await within(shadowDialog).findByRole('dialog', {
      name: 'Color picker',
    });
    expect(colorPickerDialog.closest('.shadow-layers-list')).toBeNull();
    expect(colorPickerDialog.closest('.composite-floating-layer')).toBeTruthy();

    const colorAliasBtn = within(shadowDialog).getByRole('button', {
      name: 'Pick alias for Layer 1 Color',
    });
    fireEvent.mouseDown(colorAliasBtn);
    const aliasListbox = await within(shadowDialog).findByRole('listbox', {
      name: 'Token alias suggestions',
    });
    expect(aliasListbox.closest('.shadow-layers-list')).toBeNull();
    fireEvent.mouseDown(within(aliasListbox).getByText('{blue.500}'));

    // Duplicate shadow parameters to the other mode in `pr` (`dark`)
    fireEvent.click(within(shadowDialog).getByRole('button', { name: /Duplicate to dark/i }));
    fireEvent.click(within(shadowDialog).getByRole('button', { name: 'Apply' }));

    await new Promise((r) => setTimeout(r, 200));
    const rawShadow = prLight.tokens.find((t) => t.name === 'semantic.shadow.focus')?.value;
    expect(Array.isArray(rawShadow)).toBe(true);
    expect((rawShadow as unknown as Array<Record<string, unknown>>)[0]).toMatchObject({
      inset: 'false',
      color: '{blue.500}',
    });
    const updatedShadowRow = (await screen.findByDisplayValue('semantic.shadow.focus')).closest(
      'tr',
    )!;
    expect(
      within(updatedShadowRow.querySelectorAll('td.col-mode')[0] as HTMLElement).getByRole('button', {
        name: '0 4 12 0 · {blue.500}',
      }),
    ).toBeTruthy();
    expect(
      updatedShadowRow.querySelectorAll('td.col-mode')[0].querySelector('.color-swatch-fill'),
    ).toBeTruthy();

    const prDark = sets.find((s) => s.name === 'pr/dark')!;
    const rawShadowDark = prDark.tokens.find((t) => t.name === 'semantic.shadow.focus')?.value;
    expect(Array.isArray(rawShadowDark)).toBe(true);
    expect((rawShadowDark as unknown as Array<Record<string, unknown>>)[0].color).toBe('{blue.500}');

    // 4. Switch to `primitives` (single mode) and verify duplicate-to-mode button is hidden
    fireEvent.click(screen.getByRole('button', { name: /^primitives$/i }));
    fireEvent.click(screen.getByText('+ Add Token'));
    const blankInputs4 = screen.getAllByPlaceholderText('semantic.backgrounds.primary');
    const nameInput4 = blankInputs4[blankInputs4.length - 1] as HTMLInputElement;
    const row4 = nameInput4.closest('tr')!;
    await selectTokenType(row4, 'Shadow');
    fireEvent.change(nameInput4, { target: { value: 'shadow.base' } });
    fireEvent.blur(nameInput4);

    const primShadowRow = (await screen.findByDisplayValue('shadow.base')).closest('tr')!;
    const primShadowTrigger = primShadowRow
      .querySelectorAll('td.col-mode')[0]
      .querySelector('button.composite-cell-btn') as HTMLButtonElement;
    fireEvent.click(primShadowTrigger);

    const primShadowDialog = await screen.findByRole('dialog', { name: 'Shadow token editor' });
    expect(within(primShadowDialog).queryByRole('button', { name: /Duplicate to/i })).toBeNull();
  });

  it('resolves multi-hop aliases and math expressions to calculated numeric values', async () => {
    const { resolveAliasValue } = await import('../utils/tokenResolution');
    const rows: Parameters<typeof resolveAliasValue>[2] = [
      {
        id: '1',
        name: 'baseScale',
        type: 'spacing' as const,
        description: '',
        valuesByMode: { desktop: '4', mobile: '2' },
      },
      {
        id: '2',
        name: 'spacing.3x',
        type: 'spacing' as const,
        description: '',
        valuesByMode: { desktop: '{baseScale} * 3', mobile: '{baseScale} * 3' },
      },
      {
        id: '3',
        name: 'appshell.paddings',
        type: 'spacing' as const,
        description: '',
        valuesByMode: { desktop: '{spacing.3x}', mobile: '{spacing.3x}' },
      },
      {
        id: '4',
        name: 'spacing.nested',
        type: 'spacing' as const,
        description: '',
        valuesByMode: { desktop: '{appshell.paddings} + 4', mobile: '{appshell.paddings}' },
      },
      {
        id: '5',
        name: 'cycle.a',
        type: 'number' as const,
        description: '',
        valuesByMode: { desktop: '{cycle.b}' },
      },
      {
        id: '6',
        name: 'cycle.b',
        type: 'number' as const,
        description: '',
        valuesByMode: { desktop: '{cycle.a}' },
      },
      {
        id: '7',
        name: 'color.base',
        type: 'color' as const,
        description: '',
        valuesByMode: { desktop: '#3b82f6' },
      },
      {
        id: '8',
        name: 'color.semantic',
        type: 'color' as const,
        description: '',
        valuesByMode: { desktop: '{color.base}' },
      },
    ];

    expect(resolveAliasValue('{spacing.3x}', 'desktop', rows)).toBe('12');
    expect(resolveAliasValue('{spacing.3x}', 'mobile', rows)).toBe('6');
    expect(resolveAliasValue('{spacing.nested}', 'desktop', rows)).toBe('16');
    expect(resolveAliasValue('4 * 3', 'desktop', rows)).toBe('12');
    expect(resolveAliasValue('{cycle.a}', 'desktop', rows)).toBeNull();
    expect(resolveAliasValue('{color.semantic}', 'desktop', rows)).toBe('#3b82f6');
  });

  it('supports bulk selecting tokens and moving them to another group or set', async () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
      permissions: string[];
    };
    const { mockPenpot, sets, deliverFromUi } = createMockPenpotFromExport(
      manifest.permissions,
    );
    const bridge = createTokenBridge(mockPenpot);
    mockPenpot.ui.onMessage(bridge.handleMessage);

    const fakeParent = {
      postMessage: (msg: UiToPluginMessage) => deliverFromUi(msg),
    } as unknown as Window;
    vi.spyOn(window, 'parent', 'get').mockReturnValue(fakeParent);

    render(<App initialTheme="dark" />);

    const sidebar = await screen.findByLabelText('Token sets and groups');
    await waitFor(() => expect(within(sidebar).getByText('pr')).toBeTruthy());
    fireEvent.click(within(sidebar).getByText('pr'));

    // 1. Shift+click range selection: click first, hold Shift + click last -> selects range
    const cbAccent = await screen.findByRole('checkbox', {
      name: 'Select semantic.text.accent',
    });
    const cbPrimary = screen.getByRole('checkbox', {
      name: 'Select semantic.text.primary',
    });
    const cbSecondary = screen.getByRole('checkbox', {
      name: 'Select semantic.text.secondary',
    });
    fireEvent.click(cbAccent);
    fireEvent.click(cbSecondary, { shiftKey: true });

    const rangeBar = await screen.findByRole('region', { name: 'Bulk actions' });
    expect((cbAccent as HTMLInputElement).checked).toBe(true);
    expect((cbPrimary as HTMLInputElement).checked).toBe(true);
    expect((cbSecondary as HTMLInputElement).checked).toBe(true);

    // Clear and select 2 tokens individually for move test
    fireEvent.click(within(rangeBar).getByRole('button', { name: 'Clear' }));
    fireEvent.click(cbPrimary);
    fireEvent.click(cbSecondary);

    const bulkBar = await screen.findByRole('region', { name: 'Bulk actions' });
    expect(within(bulkBar).getByText('2 selected')).toBeTruthy();

    // 2. Move selected tokens to a new group `semantic.copy` -> automatically renames them
    fireEvent.click(within(bulkBar).getByRole('button', { name: 'Move to Group…' }));
    const groupDialog = await screen.findByRole('dialog', { name: 'Move tokens to group' });
    const groupInput = within(groupDialog).getByLabelText('Target group');
    fireEvent.change(groupInput, { target: { value: 'semantic.copy' } });
    expect(within(groupDialog).getByText('semantic.copy.primary')).toBeTruthy();
    fireEvent.click(within(groupDialog).getByRole('button', { name: 'Move Tokens' }));

    await new Promise((r) => setTimeout(r, 200));
    const prLight = sets.find((s) => s.name === 'pr/light')!;
    const prDark = sets.find((s) => s.name === 'pr/dark')!;
    expect(prLight.tokens.find((t) => t.name === 'semantic.copy.primary')).toBeTruthy();
    expect(prDark.tokens.find((t) => t.name === 'semantic.copy.secondary')).toBeTruthy();
    expect(prLight.tokens.find((t) => t.name === 'semantic.text.primary')).toBeUndefined();

    // 3. Select semantic.copy.primary and move it to `primitives` set
    const cbCopyPrimary = await screen.findByRole('checkbox', {
      name: 'Select semantic.copy.primary',
    });
    fireEvent.click(cbCopyPrimary);
    const bulkBar2 = await screen.findByRole('region', { name: 'Bulk actions' });
    fireEvent.click(within(bulkBar2).getByRole('button', { name: 'Move to Set…' }));

    const setDialog = await screen.findByRole('dialog', { name: 'Move tokens to set' });
    fireEvent.change(within(setDialog).getByLabelText('Target set'), {
      target: { value: 'primitives' },
    });
    fireEvent.click(within(setDialog).getByRole('button', { name: 'Move Tokens' }));

    await new Promise((r) => setTimeout(r, 200));
    const primitives = sets.find((s) => s.name === 'primitives')!;
    expect(primitives.tokens.find((t) => t.name === 'semantic.copy.primary')).toBeTruthy();
    expect(prLight.tokens.find((t) => t.name === 'semantic.copy.primary')).toBeUndefined();
    expect(prDark.tokens.find((t) => t.name === 'semantic.copy.primary')).toBeUndefined();
  });

  it('renames a group from both the sidebar tree and the table group header', async () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
      permissions: string[];
    };
    const { mockPenpot, sets, deliverFromUi } = createMockPenpotFromExport(
      manifest.permissions,
    );
    const bridge = createTokenBridge(mockPenpot);
    mockPenpot.ui.onMessage(bridge.handleMessage);

    const fakeParent = {
      postMessage: (msg: UiToPluginMessage) => deliverFromUi(msg),
    } as unknown as Window;
    vi.spyOn(window, 'parent', 'get').mockReturnValue(fakeParent);

    render(<App initialTheme="dark" />);

    const sidebar = await screen.findByLabelText('Token sets and groups');
    await waitFor(() => expect(within(sidebar).getByText('pr')).toBeTruthy());
    fireEvent.click(within(sidebar).getByText('pr'));

    // 1. Rename group `semantic.text` from the table group header
    const table = screen.getByRole('table');
    const tableRenameBtn = await within(table).findByRole('button', {
      name: 'Rename group semantic.text',
    });
    fireEvent.click(tableRenameBtn);

    const renameDialog1 = await screen.findByRole('dialog', { name: 'Rename group' });
    fireEvent.change(within(renameDialog1).getByLabelText('New group name'), {
      target: { value: 'semantic.typography' },
    });
    fireEvent.click(within(renameDialog1).getByRole('button', { name: 'Rename Group' }));

    await new Promise((r) => setTimeout(r, 200));
    const prLight = sets.find((s) => s.name === 'pr/light')!;
    expect(prLight.tokens.find((t) => t.name === 'semantic.typography.primary')).toBeTruthy();
    expect(prLight.tokens.find((t) => t.name === 'semantic.text.primary')).toBeUndefined();

    // 2. Rename top-level group `semantic` from the sidebar
    const sidebarRenameBtn = within(sidebar).getByRole('button', {
      name: 'Rename group semantic',
    });
    fireEvent.click(sidebarRenameBtn);

    const renameDialog2 = await screen.findByRole('dialog', { name: 'Rename group' });
    fireEvent.change(within(renameDialog2).getByLabelText('New group name'), {
      target: { value: 'ui' },
    });
    fireEvent.click(within(renameDialog2).getByRole('button', { name: 'Rename Group' }));

    await new Promise((r) => setTimeout(r, 200));
    expect(prLight.tokens.find((t) => t.name === 'ui.typography.primary')).toBeTruthy();
    expect(prLight.tokens.find((t) => t.name === 'semantic.typography.primary')).toBeUndefined();
  });

  it('renames a set from the sidebar', async () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
      permissions: string[];
    };
    const { mockPenpot, sets, deliverFromUi } = createMockPenpotFromExport(
      manifest.permissions,
    );
    const bridge = createTokenBridge(mockPenpot);
    mockPenpot.ui.onMessage(bridge.handleMessage);

    const fakeParent = {
      postMessage: (msg: UiToPluginMessage) => deliverFromUi(msg),
    } as unknown as Window;
    vi.spyOn(window, 'parent', 'get').mockReturnValue(fakeParent);

    render(<App initialTheme="dark" />);

    const sidebar = await screen.findByLabelText('Token sets and groups');
    await waitFor(() => expect(within(sidebar).getByText('pr')).toBeTruthy());

    fireEvent.click(within(sidebar).getByRole('button', { name: 'Rename set pr' }));

    const renameDialog = await screen.findByRole('dialog', { name: 'Rename set' });
    fireEvent.change(within(renameDialog).getByLabelText('New set name'), {
      target: { value: 'product' },
    });
    fireEvent.click(within(renameDialog).getByRole('button', { name: 'Rename Set' }));

    await new Promise((r) => setTimeout(r, 200));
    expect(sets.find((s) => s.name === 'product/light')).toBeTruthy();
    expect(sets.find((s) => s.name === 'product/dark')).toBeTruthy();
    expect(sets.find((s) => s.name === 'pr/light')).toBeUndefined();
    expect(within(sidebar).getByRole('button', { name: /^product$/i })).toBeTruthy();

    // Rename standalone set `primitives` into a set group using `/`
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Rename set primitives' }));
    const renameDialog2 = await screen.findByRole('dialog', { name: 'Rename set' });
    fireEvent.change(within(renameDialog2).getByLabelText(/New set name/i), {
      target: { value: 'foundations/primitives' },
    });
    fireEvent.click(within(renameDialog2).getByRole('button', { name: 'Rename Set' }));

    await new Promise((r) => setTimeout(r, 200));
    expect(sets.find((s) => s.name === 'foundations/primitives')).toBeTruthy();
    expect(sets.find((s) => s.name === 'primitives')).toBeUndefined();
    expect(within(sidebar).getByRole('button', { name: /^foundations$/i })).toBeTruthy();
  });

  it('stress-tests 500 tokens, deep alias chains, and circular references without hanging', async () => {
    const { resolveAliasValue } = await import('../utils/tokenResolution');
    const modes = ['theme/light', 'theme/dark', 'theme/compact', 'theme/highContrast'];
    const stressRows = Array.from({ length: 500 }, (_, i) => {
      const name = `scale.step.${i}`;
      const value = i === 0 ? '4' : i < 25 ? `{scale.step.${i - 1}} + 2` : `${i * 2}`;
      return {
        id: `row-${i}`,
        name,
        type: 'spacing' as TokenType,
        description: '',
        valuesByMode: Object.fromEntries(modes.map((m) => [m, value])),
      };
    });
    // Add circular alias pair to verify cycle guard
    stressRows.push(
      {
        id: 'cycle-a',
        name: 'cycle.a',
        type: 'spacing' as TokenType,
        description: '',
        valuesByMode: { 'theme/light': '{cycle.b}' },
      },
      {
        id: 'cycle-b',
        name: 'cycle.b',
        type: 'spacing' as TokenType,
        description: '',
        valuesByMode: { 'theme/light': '{cycle.a}' },
      },
    );

    const start = performance.now();
    const resolvedTen = resolveAliasValue('{scale.step.10}', 'theme/light', stressRows);
    const resolvedTooDeep = resolveAliasValue('{scale.step.20}', 'theme/light', stressRows);
    const resolvedCycle = resolveAliasValue('{cycle.a}', 'theme/light', stressRows);
    const elapsed = performance.now() - start;

    expect(resolvedTen).toBe('24');
    expect(resolvedTooDeep).toBeNull();
    expect(resolvedCycle).toBeNull();
    expect(elapsed).toBeLessThan(1000);
  });
});
