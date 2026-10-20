export interface FadeAndCueAPI {
  openEditor(id?: string): void;
  diagnose(): Promise<string>;
}
