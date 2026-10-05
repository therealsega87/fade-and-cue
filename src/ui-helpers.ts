/**
 * Confirmation dialog for destructive actions (delete, delete all, ...).
 * "No" is always the default button (the one Enter triggers), so an
 * accidental keypress never deletes data.
 */
export async function confirmDestructive(title: string, bodyHtml: string): Promise<boolean> {
  const result = await foundry.applications.api.DialogV2.confirm({
    window: { title },
    content: bodyHtml,
    yes: { default: false },
    no: { default: true },
  });
  return result === true;
}

/** Makes text safe to drop into an HTML string: escapes & < >. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Asks for a text color (v13 editor). @returns "#rrggbb", "" to remove, or null if cancelled. */
export async function askTextColor(current: string): Promise<string | null> {
  const t = (key: string) => game.i18n!.localize(`FADECUE.${key}`);
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: t('Editor.FontColor') },
    content: `<div class="form-group"><label>${escapeHtml(t('Editor.FontColor'))}</label>
      <div class="form-fields"><color-picker name="color" value="${current || '#000000'}"></color-picker></div></div>`,
    buttons: [
      {
        action: 'apply',
        label: t('Sidebar.Menu.ColorApply'),
        icon: 'fa-solid fa-check',
        default: true,
        callback: (_event: unknown, button: { form: HTMLFormElement | null }) =>
          button.form?.querySelector<HTMLInputElement>('[name="color"]')?.value ?? '',
      },
      { action: 'reset', label: t('Sidebar.Menu.ColorReset'), icon: 'fa-solid fa-rotate-left', callback: () => '' },
      { action: 'cancel', label: t('Sidebar.Menu.Cancel'), icon: 'fa-solid fa-xmark', callback: () => null },
    ],
    rejectClose: false,
  });
  return typeof result === 'string' ? result : null;
}

/** Asks for a font size in pixels (v13 editor). @returns e.g. "32px", "" to remove, or null if cancelled. */
export async function askFontSize(current: string): Promise<string | null> {
  const t = (key: string) => game.i18n!.localize(`FADECUE.${key}`);
  const value = parseInt(current, 10) || 48;
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: t('Editor.FontSize') },
    content: `<div class="form-group"><label>${escapeHtml(t('Editor.FontSizeLabel'))}</label>
      <div class="form-fields"><input type="number" name="size" value="${value}" min="6" max="400" step="1"></div></div>`,
    buttons: [
      {
        action: 'apply',
        label: t('Sidebar.Menu.ColorApply'),
        icon: 'fa-solid fa-check',
        default: true,
        callback: (_event: unknown, button: { form: HTMLFormElement | null }) => {
          const n = Number(button.form?.querySelector<HTMLInputElement>('[name="size"]')?.value);
          return Number.isFinite(n) && n > 0 ? `${Math.round(n)}px` : null;
        },
      },
      { action: 'reset', label: t('Sidebar.Menu.ColorReset'), icon: 'fa-solid fa-rotate-left', callback: () => '' },
      { action: 'cancel', label: t('Sidebar.Menu.Cancel'), icon: 'fa-solid fa-xmark', callback: () => null },
    ],
    rejectClose: false,
  });
  return typeof result === 'string' ? result : null;
}

/**
 * Asks for a row's background color with Foundry's own color-picker element.
 * @param current The row's current color ("" for none).
 * @returns a "#rrggbb" to set, "" to go back to the standard dark row, or
 *   null if the dialog was cancelled or closed without a choice.
 */
export async function askRowColor(current: string): Promise<string | null> {
  const DEFAULT_START = '#0b0a13';
  const start = current || DEFAULT_START;
  const t = (key: string) => game.i18n!.localize(`FADECUE.${key}`);

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: t('Sidebar.Menu.ColorTitle') },
    content: `<div class="form-group"><label>${escapeHtml(t('Sidebar.Menu.ColorLabel'))}</label>
      <div class="form-fields"><color-picker name="color" value="${start}"></color-picker></div></div>`,
    buttons: [
      {
        action: 'apply',
        label: t('Sidebar.Menu.ColorApply'),
        icon: 'fa-solid fa-check',
        default: true,
        callback: (_event: unknown, button: { form: HTMLFormElement | null }) => {
          const field = button.form?.querySelector<HTMLInputElement>('[name="color"]');
          return field?.value ?? '';
        },
      },
      { action: 'reset', label: t('Sidebar.Menu.ColorReset'), icon: 'fa-solid fa-rotate-left', callback: () => '' },
      { action: 'cancel', label: t('Sidebar.Menu.Cancel'), icon: 'fa-solid fa-xmark', callback: () => null },
    ],
    rejectClose: false,
  });

  return typeof result === 'string' ? result : null;
}
