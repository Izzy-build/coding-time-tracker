/** One-shot message handed from one screen to the next (e.g. sign-in -> dashboard). In-memory, consumed once. */
export interface Flash {
  tone: 'success' | 'info' | 'warning';
  title: string;
  message?: string;
  /** Warnings that need attention stay until dismissed. */
  sticky?: boolean;
}

let pending: Flash | null = null;

export function setFlash(flash: Flash): void {
  pending = flash;
}

export function takeFlash(): Flash | null {
  const flash = pending;
  pending = null;
  return flash;
}
