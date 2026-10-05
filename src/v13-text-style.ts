/**
 * Font color and size for Foundry v13, whose editor has no color or size marks.
 * v13's generic "span" mark keeps any attributes in `_preserve` and writes them back
 * to the HTML, so both are stored as a style on a span: the same HTML v14 produces.
 */

/** The parts of a ProseMirror view used here; typed loosely to work across versions. */
interface EditorViewLike {
  state: any;
  dispatch(tr: any): void;
  focus(): void;
}

type StyleProperty = 'color' | 'font-size';

function parseStyle(style: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of (style ?? '').split(';')) {
    const index = part.indexOf(':');
    if (index < 0) continue;
    const key = part.slice(0, index).trim().toLowerCase();
    const value = part.slice(index + 1).trim();
    if (key && value) map.set(key, value);
  }
  return map;
}

function serializeStyle(map: Map<string, string>): string {
  return [...map].map(([key, value]) => `${key}: ${value}`).join('; ');
}

/** `style` with one property set, or removed when `value` is empty. */
export function setStyleProperty(style: string | undefined, property: StyleProperty, value: string): string {
  const map = parseStyle(style);
  if (value) map.set(property, value);
  else map.delete(property);
  return serializeStyle(map);
}

/** The property's value on the first selected text, or "" if none. */
export function readSelectionStyle(view: EditorViewLike, property: StyleProperty): string {
  const { state } = view;
  const spanType = state.schema.marks.span;
  const { from, to } = state.selection;
  let found = '';
  state.doc.nodesBetween(from, to, (node: any) => {
    if (found || !node.isText) return;
    const span = node.marks.find((mark: any) => mark.type === spanType);
    found = parseStyle(span?.attrs?._preserve?.style).get(property) ?? '';
  });
  return found;
}

/**
 * Sets the property on the selected text, keeping any other style and attributes
 * already on each piece of it. Returns false, changing nothing, if nothing is selected.
 */
export function applySelectionStyle(view: EditorViewLike, property: StyleProperty, value: string): boolean {
  const { state } = view;
  const spanType = state.schema.marks.span;
  const { from, to, empty } = state.selection;
  if (empty || !spanType) return false;

  const tr = state.tr;
  state.doc.nodesBetween(from, to, (node: any, pos: number) => {
    if (!node.isText) return;
    const start = Math.max(pos, from);
    const end = Math.min(pos + node.nodeSize, to);
    if (start >= end) return;
    const existing = node.marks.find((mark: any) => mark.type === spanType);
    const preserved = { ...(existing?.attrs?._preserve ?? {}) };
    const style = setStyleProperty(preserved.style, property, value);
    if (style) preserved.style = style;
    else delete preserved.style;
    tr.removeMark(start, end, spanType);
    if (Object.keys(preserved).length) tr.addMark(start, end, spanType.create({ _preserve: preserved }));
  });
  view.dispatch(tr);
  view.focus();
  return true;
}
