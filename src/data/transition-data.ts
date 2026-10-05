import { normalizeHexColor } from '../color.js';
import { debugLog } from '../logger.js';

export type AnimationType = 'fade' | 'slide' | 'wipe';
export type Direction = 'left' | 'right' | 'up' | 'down';
export type BackgroundType = 'image' | 'video' | 'color';
export type BackgroundSize = 'cover' | 'contain' | 'auto';
export type BackgroundEffect = 'none' | 'fadeOut' | 'softEdges' | 'vignette';

export const BACKGROUND_EFFECTS: BackgroundEffect[] = ['none', 'fadeOut', 'softEdges', 'vignette'];

export interface TransitionData {
  id: string;
  name: string;
  /** Background color of this transition's row in the sidebar list. "" means the standard dark row. */
  rowColor: string;
  animationType: AnimationType;
  /** Used by slide and wipe only. */
  direction?: Direction;
  /** Rich text HTML from the editor, including alignment, color, size and font. */
  content: string;
  background: {
    type: BackgroundType;
    /** Image or video path. Ignored when type is "color". */
    src: string;
    size: BackgroundSize;
    color: string;
    /** 0 to 1. Applies to both the color and the media layer. */
    opacity: number;
    effect: BackgroundEffect;
    /** Video only. */
    loop: boolean;
    /** Video only. */
    muted: boolean;
  };
  audio: {
    /** Empty string means no audio. */
    src: string;
    loop: boolean;
  };
  timing: {
    fadeIn: number;
    hold: number;
    fadeOut: number;
    /** When true and audio is set, hold is derived from the audio duration. */
    autoMatchAudio: boolean;
    /** How long after the screen is covered the "fadeOut" background effect starts. */
    fadeAwayDelay: number;
    /** How long the "fadeOut" background effect takes. */
    fadeAwayDuration: number;
  };
  behavior: {
    sceneId: string | false;
    allowSkip: boolean;
  };
}

export function createDefaultTransition(name: string): TransitionData {
  return {
    id: foundry.utils.randomID(),
    name,
    rowColor: '',
    animationType: 'fade',
    content: '',
    background: {
      type: 'color',
      src: '',
      size: 'cover',
      color: '#ffffff',
      opacity: 1,
      effect: 'none',
      loop: true,
      muted: true,
    },
    audio: { src: '', loop: false },
    timing: { fadeIn: 500, hold: 3000, fadeOut: 500, autoMatchAudio: false, fadeAwayDelay: 500, fadeAwayDuration: 2000 },
    behavior: { sceneId: false, allowSkip: true },
  };
}

/** A finite number from a stored or form value; null, "" and non-numbers count as missing. */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Fills missing fields with defaults and repairs values that would break playback:
 * opacity outside 0–1 or missing, durations negative or missing, unknown effect.
 * Each repair is reported in the debug log.
 */
export function normalizeTransition(raw: Partial<TransitionData>): TransitionData {
  return normalizeWithRepairs(raw).data;
}

/** Same as normalizeTransition, also returning the list of repairs made. */
export function normalizeWithRepairs(raw: Partial<TransitionData>): { data: TransitionData; repairs: string[] } {
  const defaults = createDefaultTransition(raw.name ?? '');
  const merged = foundry.utils.mergeObject(defaults, raw, { inplace: false }) as TransitionData;
  const repairs: string[] = [];

  const opacity = toNumber(merged.background.opacity);
  const fixedOpacity = opacity === null ? 1 : Math.min(1, Math.max(0, opacity));
  if (fixedOpacity !== merged.background.opacity) repairs.push(`opacity ${JSON.stringify(merged.background.opacity)}->${fixedOpacity}`);
  merged.background.opacity = fixedOpacity;

  if (!BACKGROUND_EFFECTS.includes(merged.background.effect)) {
    repairs.push(`effect ${JSON.stringify(merged.background.effect)}->none`);
    merged.background.effect = 'none';
  }

  const durations = ['fadeIn', 'hold', 'fadeOut', 'fadeAwayDelay', 'fadeAwayDuration'] as const;
  for (const key of durations) {
    const value = toNumber(merged.timing[key]);
    const fixed = value !== null && value >= 0 ? value : defaults.timing[key];
    if (fixed !== merged.timing[key]) repairs.push(`${key} ${JSON.stringify(merged.timing[key])}->${fixed}`);
    merged.timing[key] = fixed;
  }

  merged.rowColor = normalizeHexColor(merged.rowColor);

  if (repairs.length) debugLog('Transition repaired', { name: merged.name, repairs: repairs.join('; ') });
  return { data: merged, repairs };
}
