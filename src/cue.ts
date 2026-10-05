import { normalizeTransition, type TransitionData } from './data/transition-data.js';
import { playTransition, stopActiveTransition } from './player.js';
import { getSceneDelay } from './settings.js';
import { MODULE_ID } from './constants.js';
import { debugLog, errorLog } from './logger.js';

const SETTING_KEY = 'cue';

/**
 * A message to every connected client, carried by a world setting. Only users allowed
 * to modify world settings (by default the GM and Assistant GM) can write it, and the
 * server enforces that — unlike a socket message, whose sender cannot be verified.
 */
export interface CueMessage {
  kind: 'play' | 'stop';
  cueId: string;
  senderId: string;
  data?: TransitionData;
}

function isCueMessage(value: unknown): value is CueMessage {
  const v = value as Partial<CueMessage> | null;
  return !!v && (v.kind === 'play' || v.kind === 'stop') && typeof v.cueId === 'string' && typeof v.senderId === 'string';
}

function senderLabel(senderId: string): string {
  const user = game.users?.get(senderId);
  return user ? `${user.name} (isGM=${user.isGM})` : `unknown user ${senderId}`;
}

/** Activates the transition's linked scene once its delay has passed. Run by the sender only. */
function scheduleSceneActivation(data: TransitionData): void {
  const sceneId = data.behavior.sceneId;
  if (!sceneId) return;
  const delay = getSceneDelay();
  debugLog('Scene change scheduled', { sceneId, delay, hold: data.timing.hold });
  window.setTimeout(() => {
    debugLog('Activating scene', { sceneId });
    void game.scenes?.get(sceneId)?.activate();
  }, delay);
}

async function writeCue(message: CueMessage): Promise<boolean> {
  try {
    await game.settings!.set(MODULE_ID, SETTING_KEY, message);
    debugLog('Cue sent', { kind: message.kind, cueId: message.cueId, transition: message.data?.name ?? '-' });
    return true;
  } catch (err) {
    errorLog('Cue rejected: this user cannot modify world settings', err, { kind: message.kind });
    return false;
  }
}

/** Validates transition data received from another client; null if it cannot be read. */
export function readReceivedTransition(raw: unknown, cueId: string): TransitionData | null {
  try {
    return normalizeTransition((raw ?? {}) as Partial<TransitionData>);
  } catch (err) {
    errorLog('Cue ignored: transition data could not be read', err, { cueId });
    return null;
  }
}

function onCueChanged(value: unknown): void {
  if (!isCueMessage(value)) return;
  const self = value.senderId === game.userId;
  debugLog('Cue received', { kind: value.kind, cueId: value.cueId, from: senderLabel(value.senderId), self }, { player: true });

  if (value.kind === 'stop') {
    if (!self) stopActiveTransition(value.cueId);
    return;
  }

  const data = readReceivedTransition(value.data, value.cueId);
  if (!data) return;

  if (!self) {
    playTransition(data, { cueId: value.cueId });
    return;
  }

  // The sender also runs the scene change, and closing early stops it for everyone.
  playTransition(data, {
    cueId: value.cueId,
    onCovered: () => scheduleSceneActivation(data),
    onUserClosed: () => void writeCue({ kind: 'stop', cueId: value.cueId, senderId: game.userId! }),
  });
}

export function registerCueChannel(): void {
  game.settings!.register(MODULE_ID, SETTING_KEY, {
    name: 'Fade & Cue - Cue',
    scope: 'world',
    config: false,
    type: Object,
    default: {},
    onChange: (value: unknown) => onCueChanged(value),
  });
}

/** Sends a transition to every connected client, this one included. GM only. */
export async function sendTransition(data: TransitionData): Promise<void> {
  if (!game.user?.isGM) {
    ui.notifications?.warn(game.i18n!.localize('FADECUE.GMOnly'));
    return;
  }
  await writeCue({ kind: 'play', cueId: foundry.utils.randomID(), senderId: game.userId!, data });
}
