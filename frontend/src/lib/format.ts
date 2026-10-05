/** 6400 -> "1h 46m", 300 -> "5m", 42 -> "42s" (same rules as the backend's `formattedTime`). */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

/** 6400 -> "1.78" (display only; the source of truth is always integer seconds). */
export function formatHours(totalSeconds: number): string {
  return (Math.max(0, totalSeconds) / 3600).toFixed(2);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
}
