import { createTokenBridge } from './pluginCore';
import type { UiToPluginMessage } from './types';

const bridge = createTokenBridge(penpot);

penpot.ui.open('Token Mode Matrix', `penpot-tokenizer/?theme=${penpot.theme}`, {
  width: 960,
  height: 600,
});

penpot.on('themechange', (theme) => {
  penpot.ui.sendMessage({
    type: 'theme-change',
    payload: { theme: theme === 'light' ? 'light' : 'dark' },
  });
});

penpot.ui.onMessage<UiToPluginMessage>(bridge.handleMessage);
