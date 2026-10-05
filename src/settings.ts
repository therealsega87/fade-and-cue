import { MODULE_ID } from './constants.js';

export function getDefaultVolume(): number {
  return game.settings!.get(MODULE_ID, 'defaultVolume') ?? 0.8;
}

export function getSceneDelay(): number {
  return game.settings!.get(MODULE_ID, 'sceneDelay') ?? 500;
}

export function registerModuleSettings(): void {
  game.settings!.register(MODULE_ID, 'debug', {
    name: 'FADECUE.Settings.Debug.Name',
    hint: 'FADECUE.Settings.Debug.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings!.register(MODULE_ID, 'defaultVolume', {
    name: 'FADECUE.Settings.Volume.Name',
    hint: 'FADECUE.Settings.Volume.Hint',
    scope: 'world',
    config: true,
    type: Number,
    range: { min: 0, max: 1, step: 0.05 },
    default: 0.8,
  });

  game.settings!.register(MODULE_ID, 'sceneDelay', {
    name: 'FADECUE.Settings.SceneDelay.Name',
    hint: 'FADECUE.Settings.SceneDelay.Hint',
    scope: 'world',
    config: true,
    type: Number,
    range: { min: 0, max: 3000, step: 100 },
    default: 500,
  });
}
