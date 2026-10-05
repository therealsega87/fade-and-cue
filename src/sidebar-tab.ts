import {
  getAllTransitions,
  getTransition,
  deleteTransition,
  deleteAllTransitions,
  duplicateTransition,
  setRowColor,
} from './data/store.js';
import { rowGradient } from './color.js';
import { playTransition } from './player.js';
import { sendTransition } from './cue.js';
import { openTransitionEditor, appIdFor, EDITOR_ID_PREFIX } from './apps/transition-config.js';
import { confirmDestructive, askRowColor } from './ui-helpers.js';
import { exportTransition, importTransitionFromFile } from './io.js';
import { debugLog, errorLog } from './logger.js';
import { contextMenuEntry } from './compat.js';

const { AbstractSidebarTab } = foundry.applications.sidebar;
const { HandlebarsApplicationMixin } = foundry.applications.api;
const { SearchFilter } = foundry.applications.ux;

const TAB_ID = 'fade-and-cue';

function idFromTarget(target: HTMLElement): string | undefined {
  return (target.closest('[data-entry-id]') as HTMLElement | null)?.dataset.entryId;
}

function warnNotFound(): void {
  ui.notifications?.warn(game.i18n!.localize('FADECUE.TransitionNotFound'));
}

/** One entry of the row's right-click menu, run with that row's transition id. */
function menuEntry(labelKey: string, icon: string, action: (id: string) => void | Promise<void>) {
  return contextMenuEntry(`FADECUE.Sidebar.Menu.${labelKey}`, icon, (target) => {
    const id = idFromTarget(target);
    debugLog('Row menu', { action: labelKey, id: id ?? '(none)' });
    if (!id) {
      warnNotFound();
      return;
    }
    Promise.resolve(action(id)).catch((err) => errorLog('Row menu action failed', err, { action: labelKey, id }));
  });
}

/** The row's right-click menu entries, in order. */
export function rowMenuEntries() {
  return [
    menuEntry('Edit', 'fa-solid fa-pen-to-square', editRow),
    menuEntry('Duplicate', 'fa-solid fa-copy', duplicateRow),
    menuEntry('ChangeColor', 'fa-solid fa-palette', recolorRow),
    menuEntry('Export', 'fa-solid fa-file-export', exportRow),
    menuEntry('Delete', 'fa-solid fa-trash', deleteRow),
  ];
}

/** Opens the editor on the given transition's id. */
function editRow(id: string): void {
  openTransitionEditor(id);
}

/** Downloads the transition as a JSON file. */
function exportRow(id: string): void {
  const transition = getTransition(id);
  if (!transition) {
    warnNotFound();
    return;
  }
  exportTransition(transition);
}

/** Adds a copy of the transition right after it in the list. */
async function duplicateRow(id: string): Promise<void> {
  const copy = await duplicateTransition(id, game.i18n!.localize('FADECUE.Sidebar.CopySuffix'));
  if (!copy) warnNotFound();
}

/** Asks for the row's color and applies it; cancelling changes nothing. */
async function recolorRow(id: string): Promise<void> {
  const transition = getTransition(id);
  if (!transition) {
    warnNotFound();
    return;
  }
  const color = await askRowColor(transition.rowColor);
  if (color === null) return;
  await setRowColor(id, color);
}

/**
 * Deletes a transition, after asking. Closes an editor open on it first, so
 * saving that editor afterwards cannot bring the transition back by accident.
 */
async function deleteRow(id: string): Promise<void> {
  const transition = getTransition(id);
  if (!transition) {
    warnNotFound();
    return;
  }
  const confirmed = await confirmDestructive(
    game.i18n!.localize('FADECUE.Directory.DeleteConfirmTitle'),
    `<p>${game.i18n!.format('FADECUE.Sidebar.Menu.DeleteConfirm', { name: transition.name })}</p>`,
  );
  if (!confirmed) return;
  await foundry.applications.instances.get(appIdFor(id))?.close();
  await deleteTransition(id);
}

/**
 * The Fade & Cue tab in Foundry's sidebar. Header, list and footer are separate parts
 * using Foundry's own directory classes, so Foundry's stylesheet handles layout and
 * showing/hiding the tab, as for its built-in tabs.
 */
class FadeAndCueSidebarTab extends HandlebarsApplicationMixin(AbstractSidebarTab) {
  static tabName = TAB_ID;

  /** The single instance, so the list can be refreshed when the data changes. */
  static #instance: FadeAndCueSidebarTab | null = null;

  static DEFAULT_OPTIONS = {
    // No "id": AbstractSidebarTab derives it from tabName.
    classes: ['directory', 'flexcol', 'fade-and-cue-sidebar-tab'],
    window: {
      title: 'FADECUE.Sidebar.Title',
      icon: 'fa-solid fa-film',
    },
    actions: {
      create: FadeAndCueSidebarTab.#onCreate,
      import: FadeAndCueSidebarTab.#onImport,
      edit: FadeAndCueSidebarTab.#onEdit,
      preview: FadeAndCueSidebarTab.#onPreview,
      broadcast: FadeAndCueSidebarTab.#onBroadcast,
      deleteAll: FadeAndCueSidebarTab.#onDeleteAll,
    },
  };

  static PARTS = {
    header: { template: 'modules/fade-and-cue/templates/sidebar-tab/header.hbs' },
    directory: { template: 'modules/fade-and-cue/templates/sidebar-tab/directory.hbs', scrollable: [''] },
    footer: { template: 'modules/fade-and-cue/templates/sidebar-tab/footer.hbs' },
  };

  #search: InstanceType<typeof SearchFilter> | null = null;
  #searchBound = false;

  constructor(...args: ConstructorParameters<typeof AbstractSidebarTab>) {
    super(...args);
    FadeAndCueSidebarTab.#instance = this;
  }

  /** Re-renders the tab, but only if it is actually showing — never force it into view. */
  static status(): { created: boolean; rendered: boolean } {
    const instance = FadeAndCueSidebarTab.#instance;
    return { created: instance !== null, rendered: instance?.rendered ?? false };
  }

  static refresh(): void {
    if (FadeAndCueSidebarTab.#instance?.rendered) void FadeAndCueSidebarTab.#instance.render();
  }

  override async _prepareContext(options: any) {
    const base = await super._prepareContext(options);
    // Sorted by name.
    const transitions = getAllTransitions()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((t) => ({
        ...t,
        rowBackground: t.rowColor ? rowGradient(t.rowColor) : '',
      }));
    debugLog('Sidebar tab: context prepared', { count: transitions.length });
    return { ...base, transitions, hasStored: transitions.length > 0 };
  }

  override async _onFirstRender(context: any, options: any): Promise<void> {
    await super._onFirstRender(context, options);
    // Foundry's own right-click menu, bound once: it survives later redraws.
    this._createContextMenu(() => rowMenuEntries() as never, '.directory-item[data-entry-id]', { fixed: true, jQuery: false });
  }

  override async _onRender(context: object, options: object): Promise<void> {
    await super._onRender(context, options);
    // The parts were just redrawn, so the search box is a new element: bind again.
    if (this.#searchBound) this.#search?.unbind();
    this.#search = new SearchFilter({
      inputSelector: 'input[name="search"]',
      contentSelector: '.directory-list',
      callback: (_event, query, rgx, content) => this.#filterRows(query, rgx, content),
    });
    this.#search.bind(this.element as unknown as HTMLElement);
    this.#searchBound = true;
  }

  /** Shows the rows whose name matches the query and hides the others. */
  #filterRows(query: string, rgx: RegExp, content: HTMLElement | null): void {
    const root = content ?? (this.element as unknown as HTMLElement);
    root.querySelectorAll<HTMLElement>('.directory-item').forEach((row) => {
      const name = row.querySelector('.entry-name')?.textContent ?? '';
      const match = !query || SearchFilter.testQuery(rgx, name);
      // '' gives the display value back to the stylesheet; a hardcoded value would override it.
      row.style.display = match ? '' : 'none';
    });
  }



  static #onCreate(this: FadeAndCueSidebarTab): void {
    openTransitionEditor();
  }

  static async #onImport(this: FadeAndCueSidebarTab): Promise<void> {
    await importTransitionFromFile();
  }

  static #onEdit(this: FadeAndCueSidebarTab, _event: Event, target: HTMLElement): void {
    const id = idFromTarget(target);
    if (id) openTransitionEditor(id);
    else warnNotFound();
  }

  static #onPreview(this: FadeAndCueSidebarTab, event: Event, target: HTMLElement): void {
    event.stopPropagation();
    const data = getTransition(idFromTarget(target) ?? '');
    if (data) playTransition(data);
    else warnNotFound();
  }

  static #onBroadcast(this: FadeAndCueSidebarTab, event: Event, target: HTMLElement): void {
    event.stopPropagation();
    const data = getTransition(idFromTarget(target) ?? '');
    if (data) void sendTransition(data);
    else warnNotFound();
  }

  /** Deletes every transition after asking, closing any open editor first. */
  static async #onDeleteAll(this: FadeAndCueSidebarTab): Promise<void> {
    const count = getAllTransitions().length;
    if (count === 0) return;
    const confirmed = await confirmDestructive(
      game.i18n!.localize('FADECUE.Sidebar.DeleteAll.Title'),
      `<p>${game.i18n!.format('FADECUE.Sidebar.DeleteAll.ConfirmBody', { count: String(count) })}</p>`,
    );
    debugLog('Delete all', { confirmed, count });
    if (!confirmed) return;

    let closedEditors = 0;
    for (const [id, app] of foundry.applications.instances) {
      if (id.startsWith(EDITOR_ID_PREFIX)) {
        await app.close();
        closedEditors++;
      }
    }
    const removed = await deleteAllTransitions();
    debugLog('Delete all done', { removed, closedEditors });
    ui.notifications?.info(game.i18n!.localize('FADECUE.Sidebar.DeleteAll.Done'));
  }
}

/**
 * Inserts an entry into a sidebar TABS record right after another tab (by
 * id), without disturbing the relative order of everything else.
 */
function insertAfter<T>(tabs: Record<string, T>, id: string, config: T, afterId: string): Record<string, T> {
  const entries = Object.entries(tabs).filter(([key]) => key !== id) as [string, T][];
  const index = entries.findIndex(([key]) => key === afterId);
  const at = index >= 0 ? index + 1 : entries.length;
  entries.splice(at, 0, [id, config]);
  return Object.fromEntries(entries);
}

/** Registers the Fade & Cue sidebar tab, right after "scenes". */
export function registerSidebarTab(): void {
  try {
    // fvtt-types does not model third-party sidebar tabs on CONFIG.ui yet.
    const tabs = CONFIG.ui.sidebar.TABS as unknown as Record<string, unknown>;
    const tabConfig = {
      tooltip: 'FADECUE.Sidebar.Tooltip',
      icon: 'fa-solid fa-film',
      gmOnly: true,
    };

    CONFIG.ui.sidebar.TABS = insertAfter(tabs, TAB_ID, tabConfig, 'scenes') as typeof CONFIG.ui.sidebar.TABS;
    (CONFIG.ui as unknown as Record<string, unknown>)[TAB_ID] = FadeAndCueSidebarTab;

    debugLog('Sidebar tab registered', { id: TAB_ID, after: 'scenes' });
  } catch (err) {
    errorLog('Failed to register the sidebar tab. Fade & Cue will not have a sidebar entry this session.', err);
  }
}

/** Whether the tab has been created and drawn, for the diagnostics report. */
export function sidebarTabStatus(): { created: boolean; rendered: boolean } {
  return FadeAndCueSidebarTab.status();
}

/** Re-renders the sidebar tab's list, e.g. after a transition is saved elsewhere. */
export function refreshSidebarTab(): void {
  FadeAndCueSidebarTab.refresh();
}
