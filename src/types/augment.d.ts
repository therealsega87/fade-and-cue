import type { TransitionData } from '../data/transition-data.js';
import type { FadeAndCueAPI } from '../api.js';
import type { CueMessage } from '../cue.js';

declare module 'fvtt-types/configuration' {
  interface SettingConfig {
    'fade-and-cue.transitions': TransitionData[];
    'fade-and-cue.cue': CueMessage | Record<string, never>;
    'fade-and-cue.debug': boolean;
    'fade-and-cue.defaultVolume': number;
    'fade-and-cue.sceneDelay': number;
  }

  interface ModuleConfig {
    'fade-and-cue': {
      api: FadeAndCueAPI;
    };
  }
}
