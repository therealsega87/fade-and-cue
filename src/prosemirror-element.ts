import FadeAndCueProseMirrorMenu from './prosemirror-menu.js';

export const PROSE_MIRROR_TAG = 'fade-and-cue-prose-mirror';

class FadeAndCueProseMirrorElement extends foundry.applications.elements.HTMLProseMirrorElement {
  static override tagName = PROSE_MIRROR_TAG;

  protected override _configurePlugins(): Record<string, any> {
    const plugins = super._configurePlugins();
    plugins.menu = FadeAndCueProseMirrorMenu.build(foundry.prosemirror.defaultSchema);
    return plugins;
  }
}

export function registerProseMirrorElement(): void {
  if (customElements.get(FadeAndCueProseMirrorElement.tagName)) return;
  customElements.define(FadeAndCueProseMirrorElement.tagName, FadeAndCueProseMirrorElement as unknown as CustomElementConstructor);
}
