import { normalizeTransition, type TransitionData } from './data/transition-data.js';
import { saveTransition, getAllTransitions } from './data/store.js';
import { debugLog, errorLog } from './logger.js';

/** Bumped only if the shape of the exported file itself changes (not the transition's own fields). */
const SCHEMA_VERSION = 1;

interface ExportedFile {
  fcSchemaVersion: number;
  exportedAt: string;
  exportSource: { world?: string; coreVersion?: string };
  transition: TransitionData;
}

/** Downloads one transition as a JSON file, named the way Foundry names its own document exports. */
export function exportTransition(data: TransitionData): void {
  const file: ExportedFile = {
    fcSchemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    exportSource: { world: game.world?.id, coreVersion: game.release?.version },
    transition: data,
  };
  const filename = ['fvtt', 'fade-and-cue-transition', data.name.slugify()].filter(Boolean).join('-');
  foundry.utils.saveDataToFile(JSON.stringify(file, null, 2), 'text/json', `${filename}.json`);
  debugLog('Transition exported', { id: data.id, filename });
}

/** Opens the browser's own file picker and resolves with the chosen file, or null if cancelled. */
function pickJsonFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    document.body.appendChild(input);
    // A cancelled picker fires no event, so the promise stays pending.
    input.addEventListener(
      'change',
      () => {
        resolve(input.files?.[0] ?? null);
        input.remove();
      },
      { once: true },
    );
    input.click();
  });
}

/** `name`, or "name (1)", "name (2)", ... — whichever is the first not already in use. */
function uniqueTransitionName(name: string): string {
  const taken = new Set(getAllTransitions().map((t) => t.name));
  if (!taken.has(name)) return name;
  let n = 1;
  while (taken.has(`${name} (${n})`)) n++;
  return `${name} (${n})`;
}

/** True if a path Foundry serves (an image, video or audio source) actually exists here. */
export async function assetExists(path: string): Promise<boolean> {
  if (!path) return true;
  try {
    const response = await fetch(foundry.utils.getRoute(path), { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

/** Posts a GM-only chat message listing which kinds of file (image, video, audio) are missing. */
async function warnMissingAssets(name: string, missingLabels: string[]): Promise<void> {
  if (missingLabels.length === 0) return;
  const list = missingLabels.map((label) => `<li>${foundry.utils.escapeHTML(label)}</li>`).join('');
  const content = `<p>${game.i18n!.format('FADECUE.Io.MissingAssetsIntro', { name })}</p><ul>${list}</ul>`;
  await ChatMessage.create({
    content,
    whisper: ChatMessage.getWhisperRecipients('GM').map((u) => u.id),
  });
}

/**
 * Asks for a JSON file and saves it as a new transition with a fresh id. Missing media
 * files do not stop the import; they are listed in a GM-only chat message.
 * @returns the imported transition, or null if cancelled or the file is unusable.
 */
export async function importTransitionFromFile(): Promise<TransitionData | null> {
  const file = await pickJsonFile();
  if (!file) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch (err) {
    errorLog('Import failed: not valid JSON', err);
    ui.notifications?.error(game.i18n!.localize('FADECUE.Io.InvalidFile'));
    return null;
  }

  // Accept both the export envelope and a bare transition object.
  const raw = (parsed as Partial<ExportedFile>)?.transition ?? (parsed as Partial<TransitionData>);
  if (!raw || typeof raw !== 'object' || typeof (raw as { name?: unknown }).name !== 'string') {
    errorLog('Import failed: not a transition', parsed);
    ui.notifications?.error(game.i18n!.localize('FADECUE.Io.InvalidFile'));
    return null;
  }

  const normalized = normalizeTransition(raw);
  const imported: TransitionData = {
    ...normalized,
    id: foundry.utils.randomID(),
    name: uniqueTransitionName(normalized.name),
  };
  await saveTransition(imported);
  debugLog('Transition imported', { id: imported.id, name: imported.name });

  const checks: { label: string; path: string }[] = [];
  if (imported.background.src) {
    const kind = imported.background.type === 'video' ? 'Video' : 'Image';
    checks.push({ label: game.i18n!.localize(`FADECUE.Io.Kind${kind}`), path: imported.background.src });
  }
  if (imported.audio.src) {
    checks.push({ label: game.i18n!.localize('FADECUE.Io.KindAudio'), path: imported.audio.src });
  }

  const missing: string[] = [];
  for (const check of checks) {
    if (!(await assetExists(check.path))) missing.push(check.label);
  }
  await warnMissingAssets(imported.name, missing);
  if (missing.length > 0) {
    ui.notifications?.warn(game.i18n!.format('FADECUE.Io.ImportedWithWarning', { name: imported.name }));
  } else {
    ui.notifications?.info(game.i18n!.format('FADECUE.Io.ImportedOk', { name: imported.name }));
  }

  return imported;
}
