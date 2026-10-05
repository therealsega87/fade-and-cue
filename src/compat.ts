/** Foundry's major version; anything older than 14 uses the v13 code paths below. */
export function foundryGeneration(): number {
  return game.release?.generation ?? 14;
}

export function isV13(): boolean {
  return foundryGeneration() < 14;
}

/**
 * A context menu entry in the shape the running Foundry expects: `name`/`callback`
 * on v13, `label`/`onClick` on v14 (where the v13 fields are deprecated).
 */
export function contextMenuEntry(labelKey: string, icon: string, run: (target: HTMLElement) => void) {
  const iconHtml = `<i class="${icon}"></i>`;
  if (isV13()) return { name: labelKey, icon: iconHtml, callback: run };
  return { label: labelKey, icon: iconHtml, onClick: (_event: Event, target: HTMLElement) => run(target) };
}
