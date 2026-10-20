export function normalizeHexColor(value: unknown): string {
  if (typeof value !== 'string') return '';
  const hex = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(hex);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : '';
}

export function rowGradient(rowColor: string): string {
  const hex = normalizeHexColor(rowColor);
  return hex ? `linear-gradient(to right, ${hex} 0%, #000000 25%)` : '';
}
