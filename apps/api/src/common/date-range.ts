export function monthRange(month?: string) {
  const value = month && /^\d{4}-\d{2}$/.test(month) ? `${month}-01T00:00:00.000Z` : undefined;
  const start = value ? new Date(value) : startOfMonth(new Date());
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return { start, end };
}

export function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function parseDate(value: unknown, fallback = new Date()) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}
