/**
 * Why the last session ended. Lets the sign-in page explain itself ("your session expired") and lets the
 * route guard stay out of the way when the user signed out on purpose. In-memory only.
 */
export type EndReason = 'expired' | 'invalid' | 'signed-out';

let lastReason: EndReason | null = null;

export function setEndReason(reason: EndReason | null): void {
  lastReason = reason;
}

export function peekEndReason(): EndReason | null {
  return lastReason;
}
