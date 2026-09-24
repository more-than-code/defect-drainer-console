/** Compact relative time. `title` / tooltips carry the absolute local time. */

export function absoluteLocal(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleString();
}

export function relativeTime(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const sec = Math.round((now - t) / 1000);
  if (sec < 45) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) {
    const n = Math.max(1, min);
    return n === 1 ? '1 minute ago' : `${n} minutes ago`;
  }
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr === 1 ? '1 hour ago' : `${hr} hours ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return day === 1 ? '1 day ago' : `${day} days ago`;
  const month = Math.floor(day / 30);
  if (month < 12) return month === 1 ? '1 month ago' : `${month} months ago`;
  const year = Math.max(1, Math.floor(day / 365));
  return year === 1 ? '1 year ago' : `${year} years ago`;
}
