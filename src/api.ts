/** Available as game.modules.get('fade-and-cue').api */
export interface FadeAndCueAPI {
  openEditor(id?: string): void;
  /** Runs the diagnostics, prints the report to the console and opens it in a window. */
  diagnose(): Promise<string>;
}
