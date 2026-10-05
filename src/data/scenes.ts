export interface SceneOption {
  id: string;
  name: string;
}

export interface SceneFolderGroup {
  folder: string;
  scenes: SceneOption[];
}

/** World scenes grouped by folder, for the "activate scene" select. */
export function getScenesByFolder(): SceneFolderGroup[] {
  const noFolder = game.i18n!.localize('FADECUE.Editor.SceneNoFolder');
  const groups = new Map<string, SceneOption[]>();
  for (const scene of game.scenes?.contents ?? []) {
    const folder = scene.folder?.name ?? noFolder;
    if (!groups.has(folder)) groups.set(folder, []);
    groups.get(folder)!.push({ id: scene.id ?? '', name: scene.name ?? '' });
  }
  return Array.from(groups, ([folder, scenes]) => ({ folder, scenes }));
}
