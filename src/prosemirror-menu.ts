import { debugLog } from './logger.js';
import { isV13 } from './compat.js';
import { askFontSize, askTextColor } from './ui-helpers.js';
import { applySelectionStyle, readSelectionStyle } from './v13-text-style.js';

const EXCLUDED_ITEM_ACTIONS = new Set(['bullet-list', 'number-list', 'horizontal-rule', 'link', 'source-code', 'cancel-html']);

const EXCLUDED_DROPDOWNS = ['format', 'table'];

const TOOLBAR_ORDER_V14 = [
  'quick-strong', 'quick-em', 'quick-underline', 'quick-strikethrough',
  '|',
  'quick-align-left', 'quick-align-center', 'quick-align-right',
  '|',
  'fonts', 'sizes', 'font-color',
  '|',
  'image', 'clear-formatting',
];

const TOOLBAR_ORDER_V13 = TOOLBAR_ORDER_V14.map((key) => (key === 'sizes' ? 'fc-font-size' : key === 'font-color' ? 'fc-font-color' : key));

export function toolbarOrder(): string[] {
  return isV13() ? TOOLBAR_ORDER_V13 : TOOLBAR_ORDER_V14;
}

type MenuItem = InstanceType<typeof foundry.prosemirror.ProseMirrorMenu>['items'][number];
type DropDownEntry = MenuItem & { children?: DropDownEntry[] };
type DropDowns = Record<string, { entries?: DropDownEntry[] } | undefined>;

const ALIGNMENTS: { key: 'left' | 'center' | 'right'; icon: string }[] = [
  { key: 'left', icon: 'fa-solid fa-align-left' },
  { key: 'center', icon: 'fa-solid fa-align-center' },
  { key: 'right', icon: 'fa-solid fa-align-right' },
];

function technicalText(entry: DropDownEntry): string {
  return [entry.action, entry.title, JSON.stringify(entry.attrs ?? {}), entry.icon ?? ''].join(' ').toLowerCase();
}

function leaves(entries: DropDownEntry[]): DropDownEntry[] {
  return entries.flatMap((entry) => (entry.children?.length ? leaves(entry.children) : [entry]));
}

function toolbarKey(li: HTMLElement): string | null {
  const button = li.querySelector<HTMLElement>(':scope > button');
  if (!button) return null;
  if (button.dataset.action) return button.dataset.action;
  if (button.classList.contains('pm-dropdown')) {
    const classes = [...button.classList].filter((c) => c !== 'pm-dropdown' && c !== 'icon');
    return classes[classes.length - 1] ?? null;
  }
  return null;
}

export function readToolbarOrder(menu: HTMLElement): string[] {
  return (Array.from(menu.children) as HTMLElement[])
    .map((li) => (li.classList.contains('fade-and-cue-divider') ? '|' : toolbarKey(li)))
    .filter((key): key is string => key !== null);
}

export function arrangeToolbar(menu: HTMLElement): void {
  menu.querySelectorAll(':scope > li.fade-and-cue-divider').forEach((el) => el.remove());
  const entries = new Map<string, HTMLElement>();
  const rest: HTMLElement[] = [];
  for (const li of Array.from(menu.children) as HTMLElement[]) {
    const key = toolbarKey(li);
    if (key && toolbarOrder().includes(key)) entries.set(key, li);
    else rest.push(li);
  }

  const ordered: HTMLElement[] = [];
  for (const key of toolbarOrder()) {
    if (key !== '|') {
      const li = entries.get(key);
      if (li) ordered.push(li);
      continue;
    }
    const last = ordered[ordered.length - 1];
    if (last && !last.classList.contains('fade-and-cue-divider')) {
      const divider = document.createElement('li');
      divider.className = 'fade-and-cue-divider';
      divider.setAttribute('aria-hidden', 'true');
      ordered.push(divider);
    }
  }
  if (ordered[ordered.length - 1]?.classList.contains('fade-and-cue-divider')) ordered.pop();

  menu.replaceChildren(...ordered, ...rest);
  debugLog('Editor toolbar order', {
    order: ordered.map((li) => (li.classList.contains('fade-and-cue-divider') ? '|' : toolbarKey(li))).join(' '),
    missing: toolbarOrder().filter((key) => key !== '|' && !entries.has(key)).join(' ') || '(none)',
  });
}

const collecting = new WeakSet<object>();

class FadeAndCueProseMirrorMenu extends foundry.prosemirror.ProseMirrorMenu {
  protected override _getMenuItems(): InstanceType<typeof foundry.prosemirror.ProseMirrorMenu>['items'] {
    const { schema } = this;
    const { toggleMark } = foundry.prosemirror.commands;
    const BOTH = FadeAndCueProseMirrorMenu._MENU_ITEM_SCOPES.BOTH;

    const items = super._getMenuItems().filter((item) => !EXCLUDED_ITEM_ACTIONS.has(item.action));
    if (collecting.has(this)) return items;

    const markItem = (markName: 'strong' | 'em' | 'underline' | 'strikethrough', titleKey: string, icon: string): MenuItem => ({
      action: `quick-${markName}`,
      title: game.i18n!.localize(titleKey),
      icon: `<i class="${icon}"></i>`,
      mark: schema.marks[markName],
      cmd: toggleMark(schema.marks[markName]),
      scope: BOTH,
    });

    const quick = [
      markItem('strong', 'FADECUE.Editor.Bold', 'fa-solid fa-bold'),
      markItem('em', 'FADECUE.Editor.Italic', 'fa-solid fa-italic'),
      markItem('underline', 'FADECUE.Editor.Underline', 'fa-solid fa-underline'),
      markItem('strikethrough', 'FADECUE.Editor.Strikethrough', 'fa-solid fa-strikethrough'),
      ...this._alignmentButtons(),
      ...(isV13() ? this._v13StyleButtons() : []),
    ];
    debugLog('Editor toolbar', {
      foundryItems: items.map((item) => item.action).join(' '),
      quickButtons: quick.map((item) => item.action).join(' '),
    });
    return [...items, ...quick];
  }

  protected _alignmentButtons(): MenuItem[] {
    collecting.add(this);
    let dropdowns: DropDowns;
    try {
      dropdowns = super._getDropDownMenus() as DropDowns;
    } finally {
      collecting.delete(this);
    }
    const formatEntries = dropdowns.format?.entries ?? [];
    const alignGroup = formatEntries.find((entry) => entry.children?.length && technicalText(entry).includes('align'));
    const candidates = leaves(alignGroup?.children ?? formatEntries);

    const buttons: MenuItem[] = [];
    for (const { key, icon } of ALIGNMENTS) {
      const found = candidates.find((entry) => {
        const text = technicalText(entry);
        return text.includes(key) && !text.includes('justify');
      });
      if (found) {
        buttons.push({
          ...found,
          action: `quick-align-${key}`,
          icon: `<i class="${icon}"></i>`,
          scope: FadeAndCueProseMirrorMenu._MENU_ITEM_SCOPES.BOTH,
          weight: undefined,
        });
      }
    }

    if (buttons.length < ALIGNMENTS.length) {
      debugLog('Alignment buttons not all found', {
        found: buttons.map((b) => b.action),
        candidates: candidates.map((entry) => technicalText(entry)),
      });
    }
    return buttons;
  }

  protected override _getDropDownMenus(): ReturnType<InstanceType<typeof foundry.prosemirror.ProseMirrorMenu>['_getDropDownMenus']> {
    const dropdowns = super._getDropDownMenus();
    const loose = dropdowns as unknown as DropDowns;
    for (const key of EXCLUDED_DROPDOWNS) delete loose[key];
    debugLog('Editor dropdowns', { dropdowns: Object.keys(loose).join(' ') });
    return dropdowns;
  }

  protected _v13StyleButtons(): MenuItem[] {
    const BOTH = FadeAndCueProseMirrorMenu._MENU_ITEM_SCOPES.BOTH;
    const run = async (property: 'color' | 'font-size') => {
      const view = (this as unknown as { view: Parameters<typeof applySelectionStyle>[0] }).view;
      if (view.state.selection.empty) {
        ui.notifications?.info(game.i18n!.localize('FADECUE.Editor.SelectTextFirst'));
        return;
      }
      const current = readSelectionStyle(view, property);
      const value = property === 'color' ? await askTextColor(current) : await askFontSize(current);
      if (value === null) return;
      const applied = applySelectionStyle(view, property, value);
      debugLog('Text style applied', { property, value: value || '(removed)', applied });
    };
    return [
      {
        action: 'fc-font-size',
        title: game.i18n!.localize('FADECUE.Editor.FontSize'),
        icon: '<i class="fa-solid fa-text-height"></i>',
        scope: BOTH,
        cmd: () => {
          void run('font-size');
          return true;
        },
      },
      {
        action: 'fc-font-color',
        title: game.i18n!.localize('FADECUE.Editor.FontColor'),
        icon: '<i class="fa-solid fa-palette"></i>',
        scope: BOTH,
        cmd: () => {
          void run('color');
          return true;
        },
      },
    ];
  }

  protected override _onResize(): void {}

  override render(): this {
    super.render();
    const menu = document.getElementById(this.id);
    if (menu) arrangeToolbar(menu);
    return this;
  }
}

export default FadeAndCueProseMirrorMenu;
