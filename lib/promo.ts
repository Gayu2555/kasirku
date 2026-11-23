// Helper happy hour: jendela diskon otomatis berbasis jam WIB (Asia/Jakarta).
// Client pakai ini untuk preview keranjang; checkout tetap otoritatif di server (SQL).

export const hhmmToMin = (v: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v ?? '')
  if (!m) return -1
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return -1
  return h * 60 + min
}

export const isValidHHMM = (v: string): boolean => hhmmToMin(v) >= 0

// Menit sejak tengah malam di WIB, dari Date apa pun (browser user timezone bebas).
export function wibMinutes(d: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return h * 60 + m
}

export function promoActive(enabled: boolean, start: string, end: string, nowMin: number): boolean {
  if (!enabled) return false
  const s = hhmmToMin(start)
  const e = hhmmToMin(end)
  if (s < 0 || e < 0 || s >= e) return false
  return nowMin >= s && nowMin < e
}