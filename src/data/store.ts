import { normalizeTransition, type TransitionData } from './transition-data.js';
import { normalizeHexColor } from '../color.js';
import { MODULE_ID } from '../constants.js';
import { debugLog, errorLog } from '../logger.js';
import { refreshSidebarTab } from '../sidebar-tab.js';

const SETTING_KEY = 'transitions';

/**
 * The transition library is a "user" setting of the GM who builds it: world settings are
 * sent to every client, so players could read upcoming transitions from the console.
 */
export function registerTransitionStorage(): void {
  game.settings!.register(MODULE_ID, SETTING_KEY, {
    name: 'Fade & Cue - Transitions',
    scope: 'user',
    config: false,
    type: Array,
    default: [],
    onChange: () => refreshSidebarTab(),
  });
}

/** The stored entries exactly as saved. */
export function readStoredRaw(): Partial<TransitionData>[] {
  const raw = game.settings!.get(MODULE_ID, SETTING_KEY);
  return Array.isArray(raw) ? raw : [];
}

function isTransitionLike(entry: unknown): entry is Partial<TransitionData> & { id: string } {
  return typeof entry === 'object' && entry !== null && typeof (entry as { id?: unknown }).id === 'string';
}

function indexOfId(stored: Partial<TransitionData>[], id: string): number {
  return stored.findIndex((entry) => isTransitionLike(entry) && entry.id === id);
}

async function write(next: unknown[]): Promise<void> {
  await game.settings!.set(MODULE_ID, SETTING_KEY, next as TransitionData[]);
}

/** Every stored transition, normalized. An entry that cannot be read is skipped without affecting the others. */
export function getAllTransitions(): TransitionData[] {
  const stored = readStoredRaw();
  const out: TransitionData[] = [];
  for (const entry of stored) {
    if (!isTransitionLike(entry)) {
      errorLog('Skipped a stored entry without an id');
      continue;
    }
    try {
      out.push(normalizeTransition(entry));
    } catch (err) {
      errorLog('Skipped a stored transition that could not be read', err, { id: entry.id });
    }
  }
  return out;
}

export function getTransition(id: string): TransitionData | undefined {
  return getAllTransitions().find((t) => t.id === id);
}

/** Inserts the transition, or replaces the stored one with the same id. Other entries are untouched. */
export async function saveTransition(data: TransitionData): Promise<void> {
  const stored = readStoredRaw();
  const index = indexOfId(stored, data.id);
  await write(index >= 0 ? stored.map((entry, i) => (i === index ? data : entry)) : [...stored, data]);
  debugLog('Transition saved', { id: data.id, name: data.name, mode: index >= 0 ? 'replaced' : 'added', total: index >= 0 ? stored.length : stored.length + 1 });
}

/** @returns false if no stored entry has this id. */
export async function deleteTransition(id: string): Promise<boolean> {
  const stored = readStoredRaw();
  const index = indexOfId(stored, id);
  if (index < 0) return false;
  await write(stored.filter((_entry, i) => i !== index));
  debugLog('Transition deleted', { id, remaining: stored.length - 1 });
  return true;
}

/** Adds a copy right after the original, with a new id and `nameSuffix` appended to the name. */
export async function duplicateTransition(id: string, nameSuffix: string): Promise<TransitionData | undefined> {
  const original = getTransition(id);
  if (!original) return undefined;
  const stored = readStoredRaw();
  const index = indexOfId(stored, id);
  const copy: TransitionData = {
    ...structuredClone(original),
    id: foundry.utils.randomID(),
    name: `${original.name} ${nameSuffix}`.trim(),
  };
  await write([...stored.slice(0, index + 1), copy, ...stored.slice(index + 1)]);
  debugLog('Transition duplicated', { from: id, to: copy.id, name: copy.name });
  return copy;
}

/** Sets a transition's row color; "" restores the standard row. */
export async function setRowColor(id: string, color: string): Promise<boolean> {
  const transition = getTransition(id);
  if (!transition) return false;
  const rowColor = normalizeHexColor(color);
  await saveTransition({ ...transition, rowColor });
  debugLog('Row color set', { id, rowColor: rowColor || '(default)' });
  return true;
}

/** Removes every stored entry. @returns how many were removed. */
export async function deleteAllTransitions(): Promise<number> {
  const removed = readStoredRaw().length;
  if (removed === 0) return 0;
  await write([]);
  debugLog('All transitions deleted', { removed });
  return removed;
}
