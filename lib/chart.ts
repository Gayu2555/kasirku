// Token grafik dari asisten: [[chart|{json}]] — model hanya mengirim spesifikasi data,
// gambar SVG-nya dirender di client. Tidak pernah merender HTML/SVG mentah dari model.

export type ChartSpec = {
  type: 'bar'
  title: string
  labels: string[]
  series: { name: string; values: number[] }[]
}

const MAX_JSON = 4000 // batas panjang token sebelum di-parse
const MAX_TITLE = 80
const MIN_LABELS = 2
const MAX_LABELS = 14 // muat untuk tren 14 hari; di luar ini terlalu padat di bubble chat
const MAX_LABEL_LEN = 40
const MAX_SERIES = 2
const MAX_NAME = 30
const MAX_VALUE = 1e15 // angka di luar ini pasti salah ketik/model ngawur

const isText = (v: unknown, max: number) =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max

// JSON.parse bisa menghasilkan Infinity (mis. 1e999) — tolak selain bilangan wajar
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= MAX_VALUE

/** Validasi ketat spesifikasi grafik; gagal parse/invalid → null (grafik dibuang diam-diam). */
export function parseChartSpec(raw: string): ChartSpec | null {
  if (!raw || raw.length > MAX_JSON) return null
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const o = data as Record<string, unknown>
  if (o.type !== 'bar') return null

  const title = typeof o.title === 'string' ? o.title.trim().slice(0, MAX_TITLE) : ''

  if (!Array.isArray(o.labels) || o.labels.length < MIN_LABELS || o.labels.length > MAX_LABELS) return null
  if (!o.labels.every((l) => isText(l, MAX_LABEL_LEN))) return null
  const labels = o.labels.map((l) => (l as string).trim())

  if (!Array.isArray(o.series) || o.series.length < 1 || o.series.length > MAX_SERIES) return null
  const series: ChartSpec['series'] = []
  for (const s of o.series) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return null
    const ser = s as Record<string, unknown>
    if (!isText(ser.name, MAX_NAME)) return null
    if (!Array.isArray(ser.values) || ser.values.length !== labels.length) return null
    if (!ser.values.every(isNum)) return null
    series.push({ name: (ser.name as string).trim(), values: ser.values as number[] })
  }

  return { type: 'bar', title, labels, series }
}

const TOKEN_SRC = '\\[\\[\\s*chart\\|(\\{[\\s\\S]*?\\})\\s*\\]\\]'
const TOKEN = new RegExp(TOKEN_SRC, 'i')
const TOKEN_G = new RegExp(TOKEN_SRC, 'gi')

/** Ambil token chart pertama yang valid dari teks; token rusak/belum selesai ikut dibuang. */
export function takeChart(raw: string): { text: string; spec: ChartSpec | null } {
  const m = raw.match(TOKEN)
  const spec = m ? parseChartSpec(m[1]) : null
  const text = raw
    .replace(TOKEN_G, '')
    .replace(/\[\[\s*chart[\s\S]*$/i, '') // token yang belum selesai (masih streaming)
  return { text, spec }
}

/** Angka ringkas untuk label grafik kecil: 1,2 jt / 850 rb / 12 — tanpa satuan uang. */
export function ringkas(n: number): string {
  const a = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(1).replace('.', ',')} M`
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(1).replace('.', ',')} jt`
  if (a >= 1e3) return `${sign}${Math.round(a / 1000)} rb`
  return `${sign}${Math.round(a)}`
}
