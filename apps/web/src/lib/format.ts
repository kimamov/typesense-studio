const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

export function formatBytes(value: number | string | undefined, locale?: string): string {
  const bytes = Number(value)
  if (!Number.isFinite(bytes)) return '–'
  let unit = 0
  let scaled = bytes
  while (Math.abs(scaled) >= 1024 && unit < BYTE_UNITS.length - 1) {
    scaled /= 1024
    unit++
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: unit === 0 ? 0 : 1 }).format(scaled)} ${BYTE_UNITS[unit]}`
}

export function formatNumber(value: number | string | undefined, locale?: string, maximumFractionDigits = 1): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return '–'
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(n)
}

/** Ratio in percent, clamped to 0–100; returns 0 when the total is unknown. */
export function percent(used: number | string | undefined, total: number | string | undefined): number {
  const u = Number(used)
  const t = Number(total)
  if (!Number.isFinite(u) || !Number.isFinite(t) || t <= 0) return 0
  return Math.min(100, Math.max(0, (u / t) * 100))
}

export function formatDate(unixSeconds: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(unixSeconds * 1000))
}

// CI smoke test: deliberate type error, reverted in the next commit.
export const ciSmokeTest: number = "not a number"
