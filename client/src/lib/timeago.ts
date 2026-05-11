/**
 * Lightweight relative-time formatter.
 *
 * Returns gardening-flavoured strings like "planted 3 weeks ago"
 * for the board cards. Falls back to a short date for anything
 * older than ~11 months.
 */

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * Format a Date as a gardening-themed relative string.
 *
 * @param date  The timestamp to format
 * @param verb  Prefix verb — defaults to "planted"
 */
export function timeAgo(date: Date, verb = 'planted'): string {
  const now = Date.now();
  const diff = now - date.getTime();

  if (diff < MINUTE) return `${verb} just now`;
  if (diff < HOUR) {
    const m = Math.floor(diff / MINUTE);
    return `${verb} ${m}m ago`;
  }
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    return `${verb} ${h}h ago`;
  }
  if (diff < WEEK) {
    const d = Math.floor(diff / DAY);
    return `${verb} ${d}d ago`;
  }
  if (diff < MONTH) {
    const w = Math.floor(diff / WEEK);
    return `${verb} ${w}w ago`;
  }
  if (diff < YEAR) {
    const mo = Math.floor(diff / MONTH);
    return `${verb} ${mo}mo ago`;
  }

  // Older than a year — show a short date
  return `${verb} ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
