import * as fade from './fade.js';
import * as slide from './slide.js';
import * as wipe from './wipe.js';
import type { AnimationType, Direction } from '../data/transition-data.js';

export interface TransitionAnimation {
  animateIn(el: HTMLElement, duration: number, direction?: Direction): Animation;
  animateOut(el: HTMLElement, duration: number, direction?: Direction): Animation;
}

const ANIMATIONS: Record<AnimationType, TransitionAnimation> = { fade, slide, wipe };

export function getAnimation(type: AnimationType): TransitionAnimation {
  return ANIMATIONS[type] ?? ANIMATIONS.fade;
}
