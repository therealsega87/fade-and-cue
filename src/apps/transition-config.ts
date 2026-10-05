import { createDefaultTransition, normalizeTransition, type TransitionData } from '../data/transition-data.js';
import { saveTransition, getTransition } from '../data/store.js';
import { getScenesByFolder } from '../data/scenes.js';
import { playTransition } from '../player.js';
import { getSceneDelay } from '../settings.js';
import { debugLog } from '../logger.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TAB_IDS = ['animation', 'text', 'background', 'timing'];

export const EDITOR_ID_PREFIX = 'fade-and-cue-transition-config-';

/** Window id of the editor for one transition. */
export function appIdFor(transitionId: string): string {
  return `${EDITOR_ID_PREFIX}${transitionId}`;
}

/** Tabbed editor for a single transition. */
export class TransitionConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  transition: TransitionData;

  constructor(transition: TransitionData) {
    super({ id: appIdFor(transition.id) });
    this.transition = transition;
  }

  static override DEFAULT_OPTIONS = {
    tag: 'form',
    classes: ['fade-and-cue-editor'],
    window: {
      title: 'FADECUE.Editor.Title',
      icon: 'fa-solid fa-film',
    },
    position: { width: 750 },
    actions: {
      preview: TransitionConfig.#onPreview,
      openScenes: TransitionConfig.#onOpenScenes,
    },
    form: {
      handler: TransitionConfig.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true,
    },
  };

  static override PARTS = {
    header: { template: 'modules/fade-and-cue/templates/tabs/header.hbs' },
    tabs: { template: 'templates/generic/tab-navigation.hbs' },
    animation: { template: 'modules/fade-and-cue/templates/tabs/animation.hbs', scrollable: [''] },
    text: { template: 'modules/fade-and-cue/templates/tabs/text.hbs', scrollable: [''] },
    background: { template: 'modules/fade-and-cue/templates/tabs/background.hbs', scrollable: [''] },
    timing: { template: 'modules/fade-and-cue/templates/tabs/timing.hbs', scrollable: [''] },
    footer: { template: 'modules/fade-and-cue/templates/tabs/footer.hbs' },
  };

  static override TABS = {
    primary: {
      tabs: [
        { id: 'animation', icon: 'fa-solid fa-film', cssClass: '' },
        { id: 'text', icon: 'fa-solid fa-font', cssClass: '' },
        { id: 'background', icon: 'fa-solid fa-image', cssClass: '' },
        { id: 'timing', icon: 'fa-solid fa-clock', cssClass: '' },
      ],
      labelPrefix: 'FADECUE.Tabs',
      initial: 'animation',
    },
  };

  override async _prepareContext(): Promise<object> {
    const t = (key: string) => game.i18n!.localize(`FADECUE.${key}`);

    return {
      transition: this.transition,
      animationTypes: {
        fade: t('AnimationType.Fade'),
        slide: t('AnimationType.Slide'),
        wipe: t('AnimationType.Wipe'),
      },
      directions: {
        left: t('Direction.Left'),
        right: t('Direction.Right'),
        up: t('Direction.Up'),
        down: t('Direction.Down'),
      },
      backgroundTypes: {
        color: t('BackgroundType.Color'),
        image: t('BackgroundType.Image'),
        video: t('BackgroundType.Video'),
      },
      backgroundEffects: {
        none: t('BackgroundEffect.None'),
        fadeOut: t('BackgroundEffect.FadeOut'),
        softEdges: t('BackgroundEffect.SoftEdges'),
        vignette: t('BackgroundEffect.Vignette'),
      },
      backgroundSizes: {
        cover: t('BackgroundSize.Cover'),
        contain: t('BackgroundSize.Contain'),
        auto: t('BackgroundSize.Auto'),
      },
      sceneGroups: getScenesByFolder(),
      tabs: this._prepareTabs('primary'),
    };
  }

  override async _preparePartContext(partId: string, context: Record<string, any>): Promise<Record<string, any>> {
    if (TAB_IDS.includes(partId)) context.tab = context.tabs[partId];
    return context;
  }

  override async _onRender(context: object, options: object): Promise<void> {
    await super._onRender(context, options);
    const form = this.element as unknown as HTMLFormElement;
    this.#bindVisibility(form);

    const sceneSelect = form.querySelector('select[name="behavior.sceneId"]') as HTMLSelectElement | null;
    if (sceneSelect) sceneSelect.value = this.transition.behavior.sceneId || '';

    this.#bindSceneWarning(form);
    this.#bindSceneDelayWarning(form);
  }

  /** Shows or hides fields that only apply to some option values. */
  #bindVisibility(form: HTMLFormElement): void {
    const toggleOn = (trigger: HTMLSelectElement | HTMLInputElement | null, update: () => void) => {
      if (!trigger) return;
      update();
      trigger.addEventListener('change', update);
    };
    const setHidden = (selector: string, hidden: boolean) => {
      form.querySelectorAll(selector).forEach((el) => el.classList.toggle('fade-and-cue-hidden', hidden));
    };

    const typeSelect = form.querySelector('select[name="animationType"]') as HTMLSelectElement | null;
    toggleOn(typeSelect, () => {
      const type = typeSelect!.value;
      setHidden('.fade-and-cue-direction', type !== 'slide' && type !== 'wipe');
    });

    const bgTypeSelect = form.querySelector('select[name="background.type"]') as HTMLSelectElement | null;
    toggleOn(bgTypeSelect, () => {
      const type = bgTypeSelect!.value;
      setHidden('.fade-and-cue-bg-color', type !== 'color');
      setHidden('.fade-and-cue-bg-media', type === 'color');
      setHidden('.fade-and-cue-bg-video', type !== 'video');
    });

    const effectSelect = form.querySelector('select[name="background.effect"]') as HTMLSelectElement | null;
    toggleOn(effectSelect, () => setHidden('.fade-and-cue-fadeaway', effectSelect!.value !== 'fadeOut'));

    const autoMatch = form.querySelector('input[name="timing.autoMatchAudio"]') as HTMLInputElement | null;
    toggleOn(autoMatch, () => setHidden('.fade-and-cue-hold', autoMatch!.checked));
  }

  /** Warns when a see-through background is combined with a scene change: players would see the map change. */
  #bindSceneWarning(form: HTMLFormElement): void {
    const scene = form.querySelector('select[name="behavior.sceneId"]') as HTMLSelectElement | null;
    const effect = form.querySelector('select[name="background.effect"]') as HTMLSelectElement | null;
    const opacity = form.querySelector('range-picker[name="background.opacity"]') as HTMLElement & { value?: string } | null;
    if (!scene || !effect || !opacity) return;

    const update = () => {
      const seeThrough = Number(opacity.value) < 1 || effect.value !== 'none';
      const hidden = !(seeThrough && scene.value);
      form.querySelectorAll('.fade-and-cue-scene-warning').forEach((el) => el.classList.toggle('fade-and-cue-hidden', hidden));
    };

    for (const el of [scene, effect, opacity]) {
      el.addEventListener('change', update);
      el.addEventListener('input', update);
    }
    update();
  }

  /**
   * Warns when the scene change delay (a module setting) is longer than the hold time:
   * the transition would leave before the scene changes and players would see the switch.
   * Not shown when the hold follows the audio length, which is only known while playing.
   */
  #bindSceneDelayWarning(form: HTMLFormElement): void {
    const scene = form.querySelector<HTMLSelectElement>('select[name="behavior.sceneId"]');
    const hold = form.querySelector<HTMLInputElement>('input[name="timing.hold"]');
    const autoMatch = form.querySelector<HTMLInputElement>('input[name="timing.autoMatchAudio"]');
    const warnings = form.querySelectorAll<HTMLElement>('.fade-and-cue-delay-warning');
    if (!scene || !hold || !autoMatch) return;

    const delay = getSceneDelay();
    let lastShown: boolean | null = null;
    const update = () => {
      const show = !!scene.value && !autoMatch.checked && delay > Number(hold.value || 0);
      warnings.forEach((el) => el.classList.toggle('fade-and-cue-hidden', !show));
      if (show !== lastShown) {
        lastShown = show;
        debugLog('Scene delay warning', { shown: show, delay, hold: hold.value, scene: scene.value || '(none)', autoMatchAudio: autoMatch.checked });
      }
    };
    for (const el of [scene, hold, autoMatch]) {
      el.addEventListener('change', update);
      el.addEventListener('input', update);
    }
    update();
  }

  /** The form's current values as a normalized TransitionData, for both Preview and Save. */
  #readFormData(): TransitionData {
    const formData = new foundry.applications.ux.FormDataExtended(this.element as unknown as HTMLFormElement);
    const expanded = foundry.utils.expandObject(formData.object);
    const updated = foundry.utils.mergeObject(this.transition, expanded, { inplace: false }) as TransitionData;
    updated.behavior.sceneId = updated.behavior.sceneId || false;
    return normalizeTransition(updated);
  }

  static #onPreview(this: TransitionConfig): void {
    debugLog('Editor preview', { id: this.transition.id });
    playTransition(this.#readFormData());
  }

  static #onOpenScenes(this: TransitionConfig): void {
    debugLog('Open scenes tab');
    ui.sidebar?.changeTab('scenes', 'primary');
  }

  static async #onSubmit(this: TransitionConfig): Promise<void> {
    const updated = this.#readFormData();
    await saveTransition(updated);
    ui.notifications?.info(game.i18n!.format('FADECUE.Editor.SavedNotification', { name: updated.name }));
  }
}

/** Opens the editor for a saved transition, or for a new one when no id is given. */
export function openTransitionEditor(id?: string): void {
  if (id) {
    const existing = foundry.applications.instances.get(appIdFor(id));
    if (existing) {
      void existing.render({ force: true });
      return;
    }
  }
  const transition = (id ? getTransition(id) : undefined) ?? createDefaultTransition(game.i18n!.localize('FADECUE.DefaultTransitionName'));
  void new TransitionConfig(transition).render({ force: true });
}
