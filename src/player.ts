import { getAnimation } from './animations/engine.js';
import { getDefaultVolume } from './settings.js';
import { debugLog, errorLog } from './logger.js';
import type { TransitionData, BackgroundSize, BackgroundEffect } from './data/transition-data.js';

const OBJECT_FIT: Record<BackgroundSize, string> = {
  cover: 'cover',
  contain: 'contain',
  auto: 'none',
};

const EFFECT_CLASS: Partial<Record<BackgroundEffect, string>> = {
  softEdges: 'is-soft-edges',
  vignette: 'is-vignette',
};

const AUDIO_PRELOAD_TIMEOUT_MS = 4000;

export interface PlayOptions {
  cueId?: string;
  onCovered?: () => void;
  onUserClosed?: () => void;
  onEnded?: (reason: 'finished' | 'replaced') => void;
}

let activeOverlay: { cueId: string | undefined; cancel: () => void; finish: () => void } | null = null;

export function stopActiveTransition(cueId: string): void {
  const activeId = activeOverlay?.cueId ?? null;
  const matched = activeOverlay !== null && activeId === cueId;
  debugLog('Stop requested', { cueId, active: activeId ?? '(none)', matched }, { player: true });
  if (matched) activeOverlay!.finish();
}

function resolveUrl(src: string): string {
  return /^(https?:|data:|blob:)/i.test(src) ? src : foundry.utils.getRoute(src);
}

function createMediaElement(tag: 'img' | 'video', size: BackgroundSize): HTMLImageElement | HTMLVideoElement {
  const el = document.createElement(tag);
  el.className = 'fade-and-cue-media';
  Object.assign(el.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    objectFit: OBJECT_FIT[size] ?? 'cover',
  });
  return el;
}

function revealWhenLoaded(el: HTMLElement, loadEvent: string, kind: string, startedAt: number): void {
  el.addEventListener(
    loadEvent,
    () => {
      el.classList.add('is-ready');
      debugLog('Media ready', { kind, ms: Math.round(performance.now() - startedAt) }, { player: true });
    },
    { once: true },
  );
  el.addEventListener('error', () => errorLog('Media failed to load', undefined, { kind }), { once: true });
}

function buildBackgroundElement(data: TransitionData, startedAt: number): HTMLElement | null {
  const { background } = data;
  if (!background.src || background.type === 'color') return null;

  const url = resolveUrl(background.src);
  debugLog('Media url', { kind: background.type, src: background.src, url });

  if (background.type === 'image') {
    const img = createMediaElement('img', background.size) as HTMLImageElement;
    revealWhenLoaded(img, 'load', 'image', startedAt);
    img.src = url;
    return img;
  }

  const video = createMediaElement('video', background.size) as HTMLVideoElement;
  video.autoplay = true;
  video.loop = background.loop;
  video.muted = background.muted;
  video.playsInline = true;
  revealWhenLoaded(video, 'loadeddata', 'video', startedAt);
  video.src = url;
  return video;
}

async function preloadAudio(src: string): Promise<void> {
  if (!src) return;
  const startedAt = performance.now();
  let outcome = 'timed out';

  const preload = foundry.audio.AudioHelper.preloadSound(src)
    .then(() => {
      outcome = 'ready';
    })
    .catch(() => {
      outcome = 'errored';
    });
  const timedOut = new Promise<void>((resolve) => window.setTimeout(resolve, AUDIO_PRELOAD_TIMEOUT_MS));

  await Promise.race([preload, timedOut]);
  debugLog('Audio preload finished', { outcome, ms: Math.round(performance.now() - startedAt) }, { player: true });
}

type FoundrySound = foundry.audio.Sound;

async function startAudio(data: TransitionData): Promise<FoundrySound | null> {
  if (!data.audio.src) return null;
  try {
    const sound = await foundry.audio.AudioHelper.play(
      { src: data.audio.src, channel: 'music', volume: getDefaultVolume(), loop: data.audio.loop },
      false,
    );
    debugLog('Audio started', { channel: 'music', volume: getDefaultVolume(), loop: data.audio.loop, durationMs: sound?.duration ? Math.round(sound.duration * 1000) : 'unknown' }, { player: true });
    return sound ?? null;
  } catch (err) {
    errorLog('Audio could not be played', err);
    return null;
  }
}

export function playTransition(data: TransitionData, options: PlayOptions = {}): void {
  const { cueId, onCovered, onUserClosed, onEnded } = options;
  activeOverlay?.cancel();
  activeOverlay = null;

  const startedAt = performance.now();
  const canSkip = data.behavior.allowSkip || (game.user?.isGM ?? false);
  debugLog('Transition started', { title: data.name }, { player: true });
  debugLog('Playing transition', { cueId: cueId ?? '(preview)', animation: data.animationType, canSkip, blocksInput: true }, { player: true });

  const overlay = document.createElement('div');
  overlay.id = 'fade-and-cue-overlay';
  overlay.style.pointerEvents = 'auto';
  overlay.style.opacity = '0';

  const backdrop = document.createElement('div');
  backdrop.className = 'fade-and-cue-backdrop';
  backdrop.style.backgroundColor = data.background.color;
  backdrop.style.opacity = String(data.background.opacity);
  const effectClass = EFFECT_CLASS[data.background.effect];
  if (effectClass) backdrop.classList.add(effectClass);

  const backgroundEl = buildBackgroundElement(data, startedAt);
  if (backgroundEl) backdrop.appendChild(backgroundEl);
  overlay.appendChild(backdrop);

  const textEl = document.createElement('div');
  textEl.className = 'fade-and-cue-text';
  textEl.innerHTML = foundry.utils.cleanHTML(data.content);
  for (const block of textEl.querySelectorAll<HTMLElement>('p, h1, h2, h3, h4, h5, h6')) {
    if (!block.style.textAlign) block.style.textAlign = 'left';
  }
  overlay.appendChild(textEl);

  let skipButton: HTMLButtonElement | null = null;
  if (canSkip) {
    skipButton = document.createElement('button');
    skipButton.type = 'button';
    skipButton.className = 'fade-and-cue-skip';
    skipButton.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    overlay.appendChild(skipButton);
  }

  document.body.appendChild(overlay);

  let audio: FoundrySound | null = null;
  const { fadeIn, fadeOut } = data.timing;
  const animation = getAnimation(data.animationType);

  let covered = false;
  let finished = false;
  let holdTimeout: number | undefined;

  const markCovered = () => {
    if (covered) return;
    covered = true;
    debugLog('Screen covered', { ms: Math.round(performance.now() - startedAt) }, { player: true });
    onCovered?.();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    debugLog('Escape pressed', { canSkip }, { player: true });
    if (canSkip) userClose();
  };

  const cleanUp = () => {
    if (holdTimeout !== undefined) window.clearTimeout(holdTimeout);
    document.removeEventListener('keydown', onKeyDown, true);
    overlay.remove();
    if (audio) void audio.stop();
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    markCovered();
    cleanUp();
    if (activeOverlay?.finish === finish) activeOverlay = null;
    debugLog('Transition ended', { ms: Math.round(performance.now() - startedAt) }, { player: true });
    onEnded?.('finished');
  };

  const userClose = () => {
    if (finished) return;
    debugLog('Closed by user', {}, { player: true });
    onUserClosed?.();
    finish();
  };

  const cancel = () => {
    if (finished) return;
    finished = true;
    cleanUp();
    debugLog('Transition replaced', {}, { player: true });
    onEnded?.('replaced');
  };

  activeOverlay = { cueId, cancel, finish };

  document.addEventListener('keydown', onKeyDown, true);
  skipButton?.addEventListener('click', userClose);

  const scheduleExit = async () => {
    let hold = data.timing.hold;

    if (data.timing.autoMatchAudio && audio?.duration) {
      hold = Math.max(0, audio.duration * 1000 - fadeIn - fadeOut);
    }

    const fadeAway = data.background.effect === 'fadeOut';
    if (fadeAway) hold = Math.max(hold, data.timing.fadeAwayDelay + data.timing.fadeAwayDuration);

    debugLog('Hold time', { hold }, { player: true });
    if (finished) return;

    if (fadeAway) {
      backdrop.animate([{ opacity: data.background.opacity }, { opacity: 0 }], {
        delay: data.timing.fadeAwayDelay,
        duration: data.timing.fadeAwayDuration,
        fill: 'forwards',
        easing: 'ease-in-out',
      });
    }

    holdTimeout = window.setTimeout(() => {
      if (finished) return;
      const exit = animation.animateOut(overlay, fadeOut, data.direction);
      exit.onfinish = finish;
    }, hold);
  };

  void (async () => {
    await preloadAudio(data.audio.src);
    if (finished) return;

    audio = await startAudio(data);
    if (finished) {
      if (audio) void audio.stop();
      return;
    }

    overlay.style.opacity = '1';
    debugLog('Starting entrance animation', { ms: Math.round(performance.now() - startedAt) }, { player: true });

    const enter = animation.animateIn(overlay, fadeIn, data.direction);
    enter.onfinish = () => {
      markCovered();
      void scheduleExit();
    };
  })();
}
