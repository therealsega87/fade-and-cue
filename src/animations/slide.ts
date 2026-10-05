import type { Direction } from '../data/transition-data.js';

/** The overlay slides in from one edge and slides back out the same way. */
const OFFSETS: Record<Direction, string> = {
  left: 'translateX(-100%)',
  right: 'translateX(100%)',
  up: 'translateY(-100%)',
  down: 'translateY(100%)',
};

export function animateIn(el: HTMLElement, duration: number, direction: Direction = 'left'): Animation {
  return el.animate([{ transform: OFFSETS[direction] }, { transform: 'translate(0, 0)' }], {
    duration,
    fill: 'forwards',
    easing: 'ease-out',
  });
}

export function animateOut(el: HTMLElement, duration: number, direction: Direction = 'left'): Animation {
  return el.animate([{ transform: 'translate(0, 0)' }, { transform: OFFSETS[direction] }], {
    duration,
    fill: 'forwards',
    easing: 'ease-in',
  });
}
