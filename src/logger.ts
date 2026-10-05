import { MODULE_ID, MODULE_TITLE } from './constants.js';

type Details = Record<string, unknown>;

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** One plain line: "message | key=value, key=value". Readable in an exported console log. */
function formatLine(message: string, details?: Details): string {
  if (!details) return `[${MODULE_TITLE}] ${message}`;
  const parts = Object.entries(details).map(([key, value]) => `${key}=${formatValue(value)}`);
  return `[${MODULE_TITLE}] ${message} | ${parts.join(', ')}`;
}

export function isDebug(): boolean {
  try {
    return game.settings!.get(MODULE_ID, 'debug') === true;
  } catch {
    return false;
  }
}

export interface LogOptions {
  /** Also printed for players. Only for lines that reveal no transition content. */
  player?: boolean;
}

/**
 * Printed only when the "Enable debug logging" setting is on. For players, only lines
 * marked `player: true` are printed, so their console never shows transition content.
 */
export function debugLog(message: string, details?: Details, options: LogOptions = {}): void {
  if (!isDebug()) return;
  if (!(game.user?.isGM ?? true) && !options.player) return;
  console.log(formatLine(message, details));
}

const MAX_RECENT_ERRORS = 20;
const recentErrors: string[] = [];

/** Always printed, and kept (the last MAX_RECENT_ERRORS) for the diagnostics report. */
export function errorLog(message: string, error?: unknown, details?: Details): void {
  const line = formatLine(message, { ...details, ...(error === undefined ? {} : { error }) });
  recentErrors.push(`${new Date().toISOString()} ${line}`);
  if (recentErrors.length > MAX_RECENT_ERRORS) recentErrors.shift();
  const stack = error instanceof Error && error.stack ? `\n${error.stack}` : '';
  console.error(line + stack);
}

export function getRecentErrors(): string[] {
  return [...recentErrors];
}
