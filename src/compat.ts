export function foundryGeneration(): number {
  return game.release?.generation ?? 14;
}

export function isV13(): boolean {
  return foundryGeneration() < 14;
}

export function contextMenuEntry(labelKey: string, icon: string, run: (target: HTMLElement) => void) {
  const iconHtml = `<i class="${icon}"></i>`;
  if (isV13()) return { name: labelKey, icon: iconHtml, callback: run };
  return { label: labelKey, icon: iconHtml, onClick: (_event: Event, target: HTMLElement) => run(target) };
}
