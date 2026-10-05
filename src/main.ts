import { registerTransitionStorage, getAllTransitions } from './data/store.js';
import { openTransitionEditor } from './apps/transition-config.js';
import { registerCueChannel } from './cue.js';
import { registerModuleSettings } from './settings.js';
import { registerSidebarTab } from './sidebar-tab.js';
import { registerProseMirrorElement } from './prosemirror-element.js';
import { registerDiagnosticsMenu, diagnose } from './apps/diagnostics-app.js';
import { MODULE_ID } from './constants.js';
import { debugLog } from './logger.js';

Hooks.once('init', () => {
  registerModuleSettings();
  registerTransitionStorage();
  registerCueChannel();
  registerProseMirrorElement();
  registerDiagnosticsMenu();
});

// The sidebar reads CONFIG.ui.sidebar.TABS while it is built, between "setup" and "ready".
Hooks.once('setup', () => {
  registerSidebarTab();
});

Hooks.once('ready', () => {
  const mod = game.modules?.get(MODULE_ID);
  if (mod) mod.api = { openEditor: openTransitionEditor, diagnose };

  debugLog('Ready', {
    version: mod?.version ?? '?',
    foundry: game.release?.version ?? '?',
    user: game.user?.name ?? '?',
    isGM: game.user?.isGM ?? false,
    transitions: getAllTransitions().length,
    sidebarTab: !!(CONFIG.ui as unknown as Record<string, unknown>)[MODULE_ID],
    leftToolbar: 'removed',
    cueChannel: 'world setting',
    library: 'user setting',
  });
});
