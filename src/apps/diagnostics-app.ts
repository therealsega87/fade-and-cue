import { runDiagnostics, runPlaybackTest, formatReport, type Check, type DiagnosticsReport } from '../diagnostics.js';
import { errorLog } from '../logger.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const APP_ID = 'fade-and-cue-diagnostics';

/** Runs the diagnostics when opened and shows the report, with copy, download and playback test. */
export class DiagnosticsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  #report: DiagnosticsReport | null = null;
  #playback: Check[] | null = null;
  #busy = false;

  static override DEFAULT_OPTIONS = {
    id: APP_ID,
    classes: ['fade-and-cue-diagnostics'],
    window: { title: 'FADECUE.Diagnostics.Title', icon: 'fa-solid fa-stethoscope', resizable: true },
    position: { width: 720, height: 640 },
    actions: {
      copy: DiagnosticsApp.#onCopy,
      download: DiagnosticsApp.#onDownload,
      playback: DiagnosticsApp.#onPlayback,
      rerun: DiagnosticsApp.#onRerun,
    },
  };

  static override PARTS = {
    body: { template: 'modules/fade-and-cue/templates/diagnostics.hbs' },
  };

  get text(): string {
    if (!this.#report) return '';
    return formatReport(this.#report, this.#playback ? [{ title: 'Playback test', checks: this.#playback }] : []);
  }

  override async _prepareContext(): Promise<object> {
    if (!this.#report && !this.#busy) await this.#run();
    return { text: this.text, busy: this.#busy, hasPlayback: this.#playback !== null };
  }

  async #run(): Promise<void> {
    this.#busy = true;
    try {
      this.#report = await runDiagnostics();
      this.#playback = null;
      console.log(this.text);
    } catch (err) {
      errorLog('Diagnostics failed', err);
    } finally {
      this.#busy = false;
    }
  }

  static async #onCopy(this: DiagnosticsApp): Promise<void> {
    await game.clipboard!.copyPlainText(this.text);
    ui.notifications?.info(game.i18n!.localize('FADECUE.Diagnostics.Copied'));
  }

  static #onDownload(this: DiagnosticsApp): void {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    foundry.utils.saveDataToFile(this.text, 'text/plain', `fade-and-cue-diagnostics-${stamp}.txt`);
  }

  static async #onPlayback(this: DiagnosticsApp): Promise<void> {
    if (this.#busy) return;
    this.#busy = true;
    try {
      this.#playback = await runPlaybackTest();
      console.log(this.text);
    } catch (err) {
      errorLog('Playback test failed', err);
    } finally {
      this.#busy = false;
    }
    await this.render();
  }

  static async #onRerun(this: DiagnosticsApp): Promise<void> {
    if (this.#busy) return;
    this.#report = null;
    await this.render();
  }
}

/** Opens the diagnostics window, running the checks. */
export function openDiagnostics(): void {
  const existing = foundry.applications.instances.get(APP_ID) as DiagnosticsApp | undefined;
  void (existing ?? new DiagnosticsApp()).render({ force: true });
}

/** Console entry point: opens the window, which runs the checks and prints the report. */
export async function diagnose(): Promise<string> {
  const existing = foundry.applications.instances.get(APP_ID) as DiagnosticsApp | undefined;
  const app = existing ?? new DiagnosticsApp();
  await app.render({ force: true });
  return app.text;
}

/** The "Run diagnostics" button in the module settings, GM only. */
export function registerDiagnosticsMenu(): void {
  game.settings!.registerMenu('fade-and-cue', 'diagnostics', {
    name: 'FADECUE.Settings.Diagnostics.Name',
    label: 'FADECUE.Settings.Diagnostics.Label',
    hint: 'FADECUE.Settings.Diagnostics.Hint',
    icon: 'fa-solid fa-stethoscope',
    type: DiagnosticsApp,
    restricted: true,
  });
}
