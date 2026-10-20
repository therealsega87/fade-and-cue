import type { Direction } from '../data/transition-data.js';

interface ClipSet {
  hidden: string;
  shown: string;
  exit: string;
}

const CLIP: Record<Direction, ClipSet> = {
  left: { hidden: 'inset(0 100% 0 0)', shown: 'inset(0 0 0 0)', exit: 'inset(0 0 0 100%)' },
  right: { hidden: 'inset(0 0 0 100%)', shown: 'inset(0 0 0 0)', exit: 'inset(0 100% 0 0)' },
  up: { hidden: 'inset(100% 0 0 0)', shown: 'inset(0 0 0 0)', exit: 'inset(0 0 100% 0)' },
  down: { hidden: 'inset(0 0 100% 0)', shown: 'inset(0 0 0 0)', exit: 'inset(100% 0 0 0)' },
};

export function animateIn(el: HTMLElement, duration: number, direction: Direction = 'left'): Animation {
  const clip = CLIP[direction];
  return el.animate([{ clipPath: clip.hidden }, { clipPath: clip.shown }], {
    duration,
    fill: 'forwards',
    easing: 'ease-in-out',
  });
}

export function animateOut(el: HTMLElement, duration: number, direction: Direction = 'left'): Animation {
  const clip = CLIP[direction];
  return el.animate([{ clipPath: clip.shown }, { clipPath: clip.exit }], {
    duration,
    fill: 'forwards',
    easing: 'ease-in-out',
  });
}
