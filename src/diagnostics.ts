import { MODULE_ID, MODULE_TITLE } from './constants.js';
import { getRecentErrors } from './logger.js';
import { readStoredRaw } from './data/store.js';
import { createDefaultTransition, normalizeWithRepairs, type TransitionData } from './data/transition-data.js';
import { assetExists } from './io.js';
import { playTransition } from './player.js';
import { sidebarTabStatus } from './sidebar-tab.js';
import { PROSE_MIRROR_TAG } from './prosemirror-element.js';
import { toolbarOrder, readToolbarOrder } from './prosemirror-menu.js';
import { foundryGeneration, isV13 } from './compat.js';
import { rowMenuEntries } from './sidebar-tab.js';
import { readReceivedTransition } from './cue.js';

export type CheckStatus = 'OK' | 'WARN' | 'ERROR' | 'INFO';

export interface Check {
  status: CheckStatus;
  text: string;
}

const EDITOR_TIMEOUT_MS = 3000;
const AUDIO_TIMEOUT_MS = 4000;
const PLAYBACK_TIMEOUT_MS = 10000;
const ROLE_NAMES: Record<number, string> = { 1: 'Player', 2: 'Trusted', 3: 'Assistant GM', 4: 'Gamemaster' };

/** First 8 characters of an id: enough to identify a transition without revealing its name. */
function shortId(id: unknown): string {
  return typeof id === 'string' ? id.slice(0, 8) : '(no id)';
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

type Loose = Record<string, any>;

function isFn(value: unknown): boolean {
  return typeof value === 'function';
}

/** Every Foundry API the module relies on, checked for presence in the running version. */
function compatibilityChecks(): Check[] {
  const f = foundry as unknown as Loose;
  const g = game as unknown as Loose;
  const proseMirrorElement = f.applications?.elements?.HTMLProseMirrorElement;
  const menuClass = f.prosemirror?.ProseMirrorMenu;
  const libraryScope = (game.settings!.settings.get(`${MODULE_ID}.transitions`) as Loose | undefined)?.scope;

  const apis: [string, boolean][] = [
    ['Sidebar tabs (CONFIG.ui.sidebar.TABS)', typeof (CONFIG as Loose).ui?.sidebar?.TABS === 'object'],
    ['Sidebar tab base class', isFn(f.applications?.sidebar?.AbstractSidebarTab)],
    ['Application framework (ApplicationV2, Handlebars)', isFn(f.applications?.api?.ApplicationV2) && isFn(f.applications?.api?.HandlebarsApplicationMixin)],
    ['Dialogs (DialogV2 confirm/wait)', isFn(f.applications?.api?.DialogV2?.confirm) && isFn(f.applications?.api?.DialogV2?.wait)],
    ['Search filter', isFn(f.applications?.ux?.SearchFilter?.testQuery)],
    ['Form reading (FormDataExtended)', isFn(f.applications?.ux?.FormDataExtended)],
    ['Text editor element (plugins hook)', isFn(proseMirrorElement?.prototype?._configurePlugins)],
    ['Editor toolbar class (menu items, dropdowns, scopes)', isFn(menuClass?.prototype?._getMenuItems) && isFn(menuClass?.prototype?._getDropDownMenus) && !!menuClass?._MENU_ITEM_SCOPES],
    ['Editor commands (toggleMark)', isFn(f.prosemirror?.commands?.toggleMark)],
    ['Audio (play, preload)', isFn(f.audio?.AudioHelper?.play) && isFn(f.audio?.AudioHelper?.preloadSound)],
    ['Utilities (cleanHTML, getRoute, escapeHTML, randomID, saveDataToFile)', ['cleanHTML', 'getRoute', 'escapeHTML', 'randomID', 'saveDataToFile'].every((k) => isFn(f.utils?.[k]))],
    ['Clipboard', isFn(g.clipboard?.copyPlainText)],
    ['Sidebar tab switching (changeTab)', isFn((ui as Loose).sidebar?.changeTab)],
    ['Chat messages', isFn((globalThis as Loose).ChatMessage?.create)],
    ['Scene activation', isFn(g.scenes?.documentClass?.prototype?.activate)],
    ['Private library (user-scoped setting)', libraryScope === 'user'],
  ];

  const checks: Check[] = [
    { status: 'INFO', text: `Code path: ${isV13() ? 'v13' : 'v14'} (Foundry generation ${foundryGeneration()})` },
    ...apis.map(([label, ok]): Check => ({ status: ok ? 'OK' : 'ERROR', text: `${label}: ${ok ? 'available' : 'MISSING'}` })),
  ];

  const entries = rowMenuEntries() as Loose[];
  const usable = entries.filter((e) => {
    const key = e.label ?? e.name;
    const action = e.onClick ?? e.callback;
    return typeof key === 'string' && game.i18n!.has(key) && isFn(action);
  });
  checks.push({
    status: usable.length === entries.length ? 'OK' : 'ERROR',
    text: `Right-click menu: ${usable.length}/${entries.length} entries with text and action (${isV13() ? 'name/callback' : 'label/onClick'})`,
  });
  return checks;
}

function environmentChecks(): Check[] {
  const mod = game.modules?.get(MODULE_ID);
  const role = game.user?.role ?? 0;
  return [
    {
      status: 'INFO',
      text: `Foundry ${game.release?.version ?? '?'} · ${game.system?.id ?? '?'} ${game.system?.version ?? '?'} · ${MODULE_TITLE} ${mod?.version ?? '?'}`,
    },
    { status: 'INFO', text: `Browser: ${navigator.userAgent}` },
    { status: 'INFO', text: `Window: ${window.innerWidth}x${window.innerHeight} · Language: ${game.i18n?.lang ?? '?'}` },
    { status: game.user?.isGM ? 'OK' : 'WARN', text: `User role: ${ROLE_NAMES[role] ?? role}` },
    { status: 'INFO', text: `Debug logging: ${game.settings!.get(MODULE_ID, 'debug') ? 'on' : 'off'}` },
  ];
}

function moduleChecks(): Check[] {
  const active = (game.modules?.contents ?? []).filter((m) => m.active && m.id !== MODULE_ID);
  const list = active.map((m) => `${m.id} ${m.version ?? ''}`.trim()).sort();
  return [
    { status: 'INFO', text: `Other active modules: ${active.length}` },
    ...list.map((entry): Check => ({ status: 'INFO', text: `  ${entry}` })),
  ];
}

function settingsChecks(): Check[] {
  const checks: Check[] = [];
  const stored = readStoredRaw();
  checks.push({ status: 'OK', text: `Library readable: ${stored.length} stored entries` });

  const canWrite = game.user?.can('SETTINGS_MODIFY') ?? false;
  checks.push({
    status: canWrite ? 'OK' : 'ERROR',
    text: canWrite ? 'This user can send transitions' : 'This user cannot send transitions (no permission to modify world settings)',
  });

  const cueRegistered = game.settings!.settings.has(`${MODULE_ID}.cue`);
  checks.push({ status: cueRegistered ? 'OK' : 'ERROR', text: `Send channel registered: ${cueRegistered}` });
  return checks;
}

function interfaceChecks(): Check[] {
  const checks: Check[] = [];
  const tabs = Object.keys(CONFIG.ui.sidebar.TABS as unknown as Record<string, unknown>);
  const index = tabs.indexOf(MODULE_ID);
  const after = index > 0 ? tabs[index - 1] : '(none)';
  if (index < 0) checks.push({ status: 'ERROR', text: 'Sidebar tab not registered' });
  else checks.push({ status: after === 'scenes' ? 'OK' : 'WARN', text: `Sidebar tab registered, after "${after}"` });

  const status = sidebarTabStatus();
  checks.push({ status: status.created ? 'OK' : 'ERROR', text: `Sidebar tab created: ${status.created}, drawn: ${status.rendered}` });

  const element = !!customElements.get(PROSE_MIRROR_TAG);
  checks.push({ status: element ? 'OK' : 'ERROR', text: `Text editor element registered: ${element}` });
  return checks;
}

/** Builds a hidden editor, reads its toolbar, then removes it. */
async function editorCheck(): Promise<Check[]> {
  const host = document.createElement('div');
  Object.assign(host.style, { position: 'fixed', left: '-10000px', top: '0', width: '750px', visibility: 'hidden' });
  const editor = document.createElement(PROSE_MIRROR_TAG);
  editor.setAttribute('name', 'diagnostics');
  host.appendChild(editor);
  document.body.appendChild(host);

  try {
    let menu: HTMLElement | null = null;
    const deadline = performance.now() + EDITOR_TIMEOUT_MS;
    while (performance.now() < deadline) {
      menu = editor.querySelector<HTMLElement>('menu.editor-menu');
      if (menu && menu.children.length > 1) break;
      await wait(50);
    }
    if (!menu) return [{ status: 'ERROR', text: 'Editor toolbar: not drawn within 3 s' }];

    const order = readToolbarOrder(menu);
    const expected = toolbarOrder().join(' ');
    const actual = order.join(' ');
    return [
      {
        status: actual === expected ? 'OK' : 'ERROR',
        text: actual === expected ? `Editor toolbar: ${order.filter((k) => k !== '|').length} buttons, order correct` : `Editor toolbar order differs. Expected: ${expected} · Found: ${actual}`,
      },
    ];
  } catch (err) {
    return [{ status: 'ERROR', text: `Editor toolbar: could not build a test editor (${err instanceof Error ? err.message : String(err)})` }];
  } finally {
    host.remove();
  }
}

async function transitionChecks(): Promise<Check[]> {
  const checks: Check[] = [];
  const stored = readStoredRaw();
  if (stored.length === 0) return [{ status: 'INFO', text: 'No transitions stored' }];

  for (const entry of stored) {
    const id = shortId((entry as { id?: unknown })?.id);
    if (typeof entry !== 'object' || entry === null || typeof (entry as { id?: unknown }).id !== 'string') {
      checks.push({ status: 'ERROR', text: `Transition ${id}: unreadable entry, skipped` });
      continue;
    }

    let data: TransitionData;
    let repairs: string[];
    try {
      ({ data, repairs } = normalizeWithRepairs(entry));
    } catch (err) {
      checks.push({ status: 'ERROR', text: `Transition ${id}: cannot be read (${err instanceof Error ? err.message : String(err)})` });
      continue;
    }

    const problems: string[] = [];
    if (repairs.length) problems.push(`repaired values: ${repairs.map((r) => r.split(' ')[0]).join(', ')}`);
    if (data.behavior.sceneId && !game.scenes?.get(data.behavior.sceneId)) problems.push('linked scene no longer exists');
    if (data.background.type !== 'color' && data.background.src && !(await assetExists(data.background.src))) {
      problems.push(`${data.background.type} file not found`);
    }
    if (data.audio.src && !(await assetExists(data.audio.src))) problems.push('audio file not found');

    const features = [
      data.animationType,
      data.background.type,
      data.audio.src ? 'audio' : null,
      data.behavior.sceneId ? 'scene' : null,
    ].filter(Boolean);
    checks.push({
      status: problems.length ? 'WARN' : 'OK',
      text: `Transition ${id} (${features.join(', ')})${problems.length ? `: ${problems.join('; ')}` : ''}`,
    });
  }
  return checks;
}

async function audioChecks(): Promise<Check[]> {
  const checks: Check[] = [];
  const locked = game.audio?.locked ?? false;
  checks.push({
    status: locked ? 'WARN' : 'OK',
    text: locked ? 'Browser audio is locked until the user clicks somewhere on the page' : 'Browser audio unlocked',
  });

  const music = Number(game.settings!.get('core', 'globalPlaylistVolume'));
  checks.push({
    status: music > 0 ? 'OK' : 'WARN',
    text: music > 0 ? `Music volume: ${Math.round(music * 100)}%` : 'Music volume is 0: transition audio will not be heard',
  });

  const withAudio = readStoredRaw().find((entry) => typeof entry?.audio?.src === 'string' && entry.audio.src);
  if (!withAudio?.audio?.src) {
    checks.push({ status: 'INFO', text: 'Audio preload: no transition with audio to test' });
    return checks;
  }
  const started = performance.now();
  const outcome = await Promise.race([
    foundry.audio.AudioHelper.preloadSound(withAudio.audio.src).then(
      () => 'ready',
      () => 'failed',
    ),
    wait(AUDIO_TIMEOUT_MS).then(() => 'timed out'),
  ]);
  checks.push({
    status: outcome === 'ready' ? 'OK' : 'WARN',
    text: `Audio preload of transition ${shortId(withAudio.id)}: ${outcome} in ${Math.round(performance.now() - started)} ms`,
  });
  return checks;
}

function errorChecks(): Check[] {
  const errors = getRecentErrors();
  if (errors.length === 0) return [{ status: 'OK', text: 'No module errors this session' }];
  return [
    { status: 'WARN', text: `Module errors this session: ${errors.length}` },
    ...errors.map((line): Check => ({ status: 'INFO', text: `  ${line}` })),
  ];
}

export interface DiagnosticsReport {
  createdAt: Date;
  sections: { title: string; checks: Check[] }[];
}

/** Runs every check. Reads and tests only: nothing is saved, sent or changed. */
export async function runDiagnostics(): Promise<DiagnosticsReport> {
  return {
    createdAt: new Date(),
    sections: [
      { title: 'Environment', checks: environmentChecks() },
      { title: 'Compatibility', checks: compatibilityChecks() },
      { title: 'Modules', checks: moduleChecks() },
      { title: 'Settings', checks: settingsChecks() },
      { title: 'Interface', checks: [...interfaceChecks(), ...(await editorCheck())] },
      { title: 'Transitions', checks: await transitionChecks() },
      { title: 'Audio', checks: await audioChecks() },
      { title: 'Errors', checks: errorChecks() },
    ],
  };
}

/** Plays a built-in sample transition on this screen only and checks each phase. */
export async function runPlaybackTest(): Promise<Check[]> {
  const sample = createDefaultTransition('Diagnostics test');
  sample.content = '<p>Fade &amp; Cue — playback test</p>';
  sample.background.color = '#000000';
  sample.timing = { ...sample.timing, fadeIn: 500, hold: 1500, fadeOut: 500 };
  const expectedMs = 2500;

  const started = performance.now();
  let coveredAt: number | null = null;
  const received = readReceivedTransition(JSON.parse(JSON.stringify(sample)), 'diagnostics');
  if (!received) return [{ status: 'ERROR', text: 'Playback: sample could not pass the receive path' }];
  const ended = new Promise<{ reason: string; at: number }>((resolve) => {
    playTransition(received, {
      onCovered: () => {
        coveredAt = performance.now() - started;
      },
      onEnded: (reason) => resolve({ reason, at: performance.now() - started }),
    });
  });
  const result = await Promise.race([ended, wait(PLAYBACK_TIMEOUT_MS).then(() => null)]);

  if (!result) return [{ status: 'ERROR', text: `Playback: did not end within ${PLAYBACK_TIMEOUT_MS / 1000} s` }];
  const checks: Check[] = [
    {
      status: coveredAt !== null ? 'OK' : 'ERROR',
      text: coveredAt !== null ? `Playback: screen covered at ${Math.round(coveredAt)} ms` : 'Playback: screen never covered',
    },
  ];
  const drift = Math.abs(result.at - expectedMs);
  checks.push({
    status: result.reason !== 'finished' ? 'WARN' : drift <= 1500 ? 'OK' : 'WARN',
    text: `Playback: ${result.reason} at ${Math.round(result.at)} ms (expected about ${expectedMs} ms)`,
  });
  return checks;
}

/** The report as plain text, ready to paste into a bug report. */
export function formatReport(report: DiagnosticsReport, extra: { title: string; checks: Check[] }[] = []): string {
  const sections = [...report.sections, ...extra];
  const all = sections.flatMap((s) => s.checks);
  const count = (status: CheckStatus) => all.filter((c) => c.status === status).length;
  const lines = [
    `${MODULE_TITLE} diagnostics — ${report.createdAt.toISOString().replace('T', ' ').slice(0, 16)} UTC`,
    `Summary: ${count('OK')} OK, ${count('WARN')} warnings, ${count('ERROR')} errors`,
  ];
  for (const section of sections) {
    lines.push('', `== ${section.title} ==`);
    for (const check of section.checks) {
      lines.push(check.status === 'INFO' ? `       ${check.text}` : `[${check.status.padEnd(5)}] ${check.text}`);
    }
  }
  return lines.join('\n');
}
