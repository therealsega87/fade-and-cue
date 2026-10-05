import FadeAndCueProseMirrorMenu from './prosemirror-menu.js';

export const PROSE_MIRROR_TAG = 'fade-and-cue-prose-mirror';

/** Foundry's `<prose-mirror>` element under its own tag, with the module's toolbar. */
class FadeAndCueProseMirrorElement extends foundry.applications.elements.HTMLProseMirrorElement {
  static override tagName = PROSE_MIRROR_TAG;

  // The base method's plugin type is not reachable from outside its class.
  protected override _configurePlugins(): Record<string, any> {
    const plugins = super._configurePlugins();
    plugins.menu = FadeAndCueProseMirrorMenu.build(foundry.prosemirror.defaultSchema);
    return plugins;
  }
}

export function registerProseMirrorElement(): void {
  if (customElements.get(FadeAndCueProseMirrorElement.tagName)) return;
  // The base class declares a protected constructor, which TypeScript does not accept
  // as a CustomElementConstructor; at runtime it is an ordinary constructor.
  customElements.define(FadeAndCueProseMirrorElement.tagName, FadeAndCueProseMirrorElement as unknown as CustomElementConstructor);
}
