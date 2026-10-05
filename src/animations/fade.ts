export function animateIn(el: HTMLElement, duration: number): Animation {
  return el.animate([{ opacity: 0 }, { opacity: 1 }], { duration, fill: 'forwards' });
}

export function animateOut(el: HTMLElement, duration: number): Animation {
  return el.animate([{ opacity: 1 }, { opacity: 0 }], { duration, fill: 'forwards' });
}
