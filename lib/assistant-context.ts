import sql from '@/lib/db'
import { getBusyHours, getCustomers, getMoves, getProducts, getSettings, getShifts, getTeam } from '@/lib/data'
import type { Customer, Product, StoreSettings } from '@/lib/types'

const WIB = 7 * 3600000
const DAY = 86400000
const MAX_CHARS = 14000 // batas total data tambahan supaya muat di model gratis
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

const WORD_NUM: Record<string, number> = {
  satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10,
}
const MONTHS: Record<string, number> = {
  januari: 0, jan: 0, februari: 1, feb: 1, maret: 2, mar: 2, april: 3, apr: 3, mei: 4,
  juni: 5, jun: 5, juli: 6, jul: 6, agustus: 7, agu: 7, september: 8, sep: 8,
  oktober: 9, okt: 9, november: 10, nov: 10, desember: 11, des: 11,
}
const BULAN_RE = Object.keys(MONTHS).join('|')

const STOP = new Set([
  'yang', 'dan', 'apa', 'berapa', 'untuk', 'hari', 'bulan', 'minggu', 'pekan', 'stok', 'produk', 'total',
  'omzet', 'kasir', 'tim', 'toko', 'kemarin', 'lalu', 'ini', 'itu', 'dari', 'ke', 'di', 'ada', 'siapa',
  'paling', 'saya', 'gue', 'lu', 'dong', 'sih', 'aja', 'tolong', 'coba', 'lihat', 'cek', 'data', 'transaksi',
  'penjualan', 'laba', 'untung', 'kasbon', 'utang', 'pelanggan', 'terakhir', 'tanggal', 'jam',
])

type Range = { from: string; to: string }

const num = (v: unknown) => Number(v)
const ymd = (d: Date) => d.toISOString().slice(0, 10)
const wibNow = () => new Date(Date.now() + WIB)
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY)
const wibText = (d: Date) => new Date(d.getTime() + WIB).toISOString().slice(0, 16).replace('T', ' ')
const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)

const lastDays = (n: number): Range => ({ from: ymd(addDays(wibNow(), -(n - 1))), to: ymd(wibNow()) })
const monthRange = (): Range => {
  const now = wibNow()
  return { from: ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), to: ymd(now) }
}

function bounds(r: Range) {
  const start = new Date(`${r.from}T00:00:00+07:00`)
  const end = new Date(new Date(`${r.to}T00:00:00+07:00`).getTime() + DAY)
  return { a: start.toISOString(), b: end.toISOString() }
}

export function parseRange(qRaw: string): Range | null {
  const now = wibNow()
  const today = ymd(now)
  const dow = (now.getUTCDay() + 6) % 7 // 0 = Senin
  const monday = addDays(now, -dow)

  // Angka terbilang: "dua hari", "tiga minggu" → 2, 3
  const q = qRaw.replace(
    /\b(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)\s+(hari|minggu|pekan)\b/g,
    (_m, w: string, u: string) => `${WORD_NUM[w]} ${u}`,
  )

  const iso = q.match(/\d{4}-\d{2}-\d{2}/g)
  if (iso) {
    const [x, y = x] = iso
    return x <= y ? { from: x, to: y } : { from: y, to: x }
  }
  // "3 hari terakhir", "2 minggu terakhir"
  const n = q.match(/(\d{1,3})\s*(hari|minggu|pekan)/)
  if (n) {
    const days = Number(n[1]) * (n[2] === 'hari' ? 1 : 7)
    if (days >= 1 && days <= 90) return lastDays(days)
  }
  if (/kemarin/.test(q)) return { from: ymd(addDays(now, -1)), to: ymd(addDays(now, -1)) }
  if (/hari ini/.test(q)) return { from: today, to: today }
  // Akhir pekan = Sabtu–Minggu terakhir yang sudah lewat (atau "akhir pekan lalu")
  if (/akhir\s*pekan|weekend/.test(q)) {
    let sabtu = addDays(monday, 5)
    if (/lalu/.test(q) || sabtu.getTime() > now.getTime()) sabtu = addDays(sabtu, -7)
    return { from: ymd(sabtu), to: ymd(addDays(sabtu, 1)) }
  }
  if (/(minggu|pekan) ini/.test(q)) return { from: ymd(monday), to: today }
  if (/(minggu|pekan) lalu/.test(q)) return { from: ymd(addDays(monday, -7)), to: ymd(addDays(monday, -1)) }
  if (/bulan ini/.test(q)) return monthRange()
  if (/bulan lalu/.test(q)) {
    const y = now.getUTCFullYear()
    const m = now.getUTCMonth()
    return { from: ymd(new Date(Date.UTC(y, m - 1, 1))), to: ymd(new Date(Date.UTC(y, m, 0))) }
  }
  if (/tahun lalu/.test(q)) {
    const y = now.getUTCFullYear() - 1
    return { from: `${y}-01-01`, to: `${y}-12-31` }
  }
  if (/tahun ini/.test(q)) return { from: `${now.getUTCFullYear()}-01-01`, to: today }
  // "tanggal 5 November"
  const dm = q.match(new RegExp(`tanggal\\s+(\\d{1,2})\\s*(?:dari\\s+|bulan\\s+)?(${BULAN_RE})\\b`))
  if (dm && Number(dm[1]) >= 1 && Number(dm[1]) <= 31) {
    const m = MONTHS[dm[2]]
    const y = m > now.getUTCMonth() ? now.getUTCFullYear() - 1 : now.getUTCFullYear()
    const day = new Date(Date.UTC(y, m, Number(dm[1])))
    return { from: ymd(day), to: ymd(day) }
  }
  const t = q.match(/tanggal\s+(\d{1,2})/)
  if (t) {
    const d = Number(t[1])
    if (d >= 1 && d <= 31) {
      const base = d > now.getUTCDate() ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, d)) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), d))
      return { from: ymd(base), to: ymd(base) }
    }
  }
  // "bulan November" / "November" — bulan depan berarti tahun lalu (belum terjadi)
  const mo = q.match(new RegExp(`\\b(${BULAN_RE})\\b`))
  if (mo) {
    const m = MONTHS[mo[1]]
    const y = m > now.getUTCMonth() ? now.getUTCFullYear() - 1 : now.getUTCFullYear()
    return { from: ymd(new Date(Date.UTC(y, m, 1))), to: ymd(new Date(Date.UTC(y, m + 1, 0))) }
  }
  return null
}

function matchByName<T>(items: T[], getName: (t: T) => string, qTokens: Set<string>, qText: string, max = 3): T[] {
  const scored = items
    .map((it) => {
      const name = getName(it).toLowerCase().trim()
      if (name.length >= 3 && qText.includes(name)) return { it, score: 100 + name.length }
      const nt = tokens(name).filter((t) => t.length >= 3 && !STOP.has(t))
      const hit = nt.filter((t) => qTokens.has(t)).length
      return { it, score: nt.length && hit ? (hit / nt.length) * 10 + hit : 0 }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
  return scored.slice(0, max).map((x) => x.it)
}

// ---------- bagian-bagian data ----------

async function periodSummary(r: Range) {
  const { a, b } = bounds(r)
  const [t] = await sql`
    select coalesce(sum(total), 0) as revenue, count(*)::int as count from sales
    where voided_at is null and created_at >= ${a}::timestamptz and created_at < ${b}::timestamptz`
  const [g] = await sql`
    select coalesce(sum((si.price - si.cost) * si.qty), 0) as profit
    from sale_items si join sales s on s.id = si.sale_id
    where s.voided_at is null and s.created_at >= ${a}::timestamptz and s.created_at < ${b}::timestamptz`
  const methods = await sql`
    select payment_method as method, coalesce(sum(total), 0) as total, count(*)::int as count from sales
    where voided_at is null and created_at >= ${a}::timestamptz and created_at < ${b}::timestamptz
    group by payment_method order by total desc`
  const top = await sql`
    select si.name, sum(si.qty)::int as qty, sum(si.price * si.qty) as revenue, sum((si.price - si.cost) * si.qty) as profit
    from sale_items si join sales s on s.id = si.sale_id
    where s.voided_at is null and s.created_at >= ${a}::timestamptz and s.created_at < ${b}::timestamptz
    group by si.name order by qty desc limit 10`
  const [v] = await sql`
    select count(*)::int as c, coalesce(sum(total), 0) as t from sales
    where voided_at >= ${a}::timestamptz and voided_at < ${b}::timestamptz`
  const days = Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY)
  const daily =
    days <= 31
      ? await sql`
          select to_char(created_at at time zone 'Asia/Jakarta', 'YYYY-MM-DD') as day,
            coalesce(sum(total), 0) as revenue, count(*)::int as count from sales
          where voided_at is null and created_at >= ${a}::timestamptz and created_at < ${b}::timestamptz
          group by 1 order by 1`
      : []
  return {
    periode: `${r.from} s/d ${r.to}`,
    omzet: num(t.revenue),
    jumlahTransaksi: t.count,
    labaKotor: num(g.profit),
    metodeBayar: methods.map((m) => ({ metode: m.method, total: num(m.total), jumlah: m.count })),
    produkTerlaris: top.map((p) => ({ nama: p.name, qty: p.qty, omzet: num(p.revenue), laba: num(p.profit) })),
    void: { jumlah: v.c, total: num(v.t) },
    perHari: daily.map((d) => ({ tanggal: d.day, omzet: num(d.revenue), transaksi: d.count })),
  }
}

async function productDetail(p: Product, range: Range | null) {
  const r = range ?? lastDays(30)
  const { a, b } = bounds(r)
  const daily = await sql`
    select to_char(s.created_at at time zone 'Asia/Jakarta', 'YYYY-MM-DD') as day,
      sum(si.qty)::int as qty, sum(si.price * si.qty) as revenue
    from sale_items si join sales s on s.id = si.sale_id
    where si.product_id = ${p.id} and s.voided_at is null
      and s.created_at >= ${a}::timestamptz and s.created_at < ${b}::timestamptz
    group by 1 order by 1`
  const moves = await getMoves(p.id)
  return {
    nama: p.name,
    kategori: p.category,
    harga: p.price,
    hpp: p.cost,
    marginPersen: p.price > 0 ? Math.round(((p.price - p.cost) / p.price) * 1000) / 10 : null,
    stok: p.stock,
    minimumStok: p.min_stock,
    satuan: p.unit,
    terjual30Hari: p.sold30,
    periodePenjualan: `${r.from} s/d ${r.to}`,
    totalQtyTerjual: daily.reduce((s, x) => s + x.qty, 0),
    totalOmzet: daily.reduce((s, x) => s + num(x.revenue), 0),
    perHari: daily.map((d) => ({ tanggal: d.day, qty: d.qty, omzet: num(d.revenue) })),
    pergerakanStokTerakhir: moves.slice(0, 8).map((m) => ({ tipe: m.type, qty: m.qty, catatan: m.note, waktu: m.created_at.slice(0, 16).replace('T', ' ') })),
  }
}

async function customerDetail(c: Customer) {
  const sales = await sql`
    select receipt_no, total, payment_method, created_at from sales
    where customer_id = ${c.id} and voided_at is null order by created_at desc limit 8`
  const pays = await sql`
    select amount, method, created_at from customer_payments
    where customer_id = ${c.id} order by created_at desc limit 8`
  return {
    nama: c.name,
    utangSaatIni: c.debt,
    totalKasbon: c.kasbon_total,
    totalDibayar: c.paid_total,
    stempel: c.stamps,
    stempelDitukar: c.stamps_redeemed,
    catatan: c.note,
    transaksiTerakhir: sales.map((s) => ({ struk: s.receipt_no, total: num(s.total), metode: s.payment_method, waktu: wibText(s.created_at) })),
    pelunasanTerakhir: pays.map((p) => ({ jumlah: num(p.amount), metode: p.method, waktu: wibText(p.created_at) })),
  }
}

async function receiptDetail(no: string) {
  const [s] = await sql`
    select s.*, c.name as customer_name from sales s
    left join customers c on c.id = s.customer_id where s.receipt_no ilike ${no} limit 1`
  if (!s) return { struk: no, ditemukan: false }
  const items = await sql`select name, qty, price, note from sale_items where sale_id = ${s.id}`
  return {
    struk: s.receipt_no,
    waktu: wibText(s.created_at),
    metode: s.payment_method,
    pelanggan: s.customer_name,
    total: num(s.total),
    diskon: num(s.discount),
    dibayar: num(s.paid),
    kembalian: num(s.change),
    void: s.voided_at ? { oleh: s.voided_by, waktu: wibText(s.voided_at) } : null,
    item: items.map((i) => ({ nama: i.name, qty: i.qty, harga: num(i.price), catatan: i.note })),
  }
}

async function teamSection(qTokens: Set<string>, q: string) {
  const team = await getTeam()
  const hits = matchByName(team, (m) => m.name, qTokens, q)
  const list = (hits.length ? hits : team).slice(0, 15)
  const shifts = await getShifts(6)
  return {
    anggota: list.map((m) => ({ nama: m.name, peran: m.role, status: m.status, jumlahTransaksi: m.sales_count, omzet: m.revenue, totalSelisihKas: m.shift_diff })),
    shiftTerakhir: shifts.map((s) => ({
      kasir: s.user_email,
      buka: wibText(new Date(s.opened_at)),
      tutup: s.closed_at ? wibText(new Date(s.closed_at)) : 'masih buka',
      penjualan: s.sales_total,
      selisihKas: s.difference,
    })),
  }
}

async function busySection() {
  const { matrix, peak } = await getBusyHours()
  const slots: { hari: string; jam: string; transaksi: number }[] = []
  matrix.forEach((row, dow) =>
    row.forEach((count, hour) => {
      if (count > 0) slots.push({ hari: DAYS[dow], jam: `${String(hour).padStart(2, '0')}:00`, transaksi: count })
    }),
  )
  slots.sort((a, b) => b.transaksi - a.transaksi)
  return {
    catatan: 'Berdasarkan 30 hari terakhir (zona WIB)',
    puncak: peak ? { hari: DAYS[peak.dow], jam: `${String(peak.hour).padStart(2, '0')}:00`, transaksi: peak.count } : null,
    slotTeramai: slots.slice(0, 6),
    slotTersepi: slots.slice(-4),
  }
}

async function cashSection(range: Range | null) {
  const r = range ?? monthRange()
  const { a, b } = bounds(r)
  const byCat = await sql`
    select type, category, coalesce(sum(amount), 0) as total, count(*)::int as n from cash_entries
    where created_at >= ${a}::timestamptz and created_at < ${b}::timestamptz
    group by type, category order by total desc limit 15`
  const latest = await sql`
    select type, category, amount, note, created_at from cash_entries
    where created_at >= ${a}::timestamptz and created_at < ${b}::timestamptz
    order by created_at desc limit 8`
  return {
    periode: `${r.from} s/d ${r.to}`,
    perKategori: byCat.map((c) => ({ jenis: c.type === 'income' ? 'masuk' : 'keluar', kategori: c.category, total: num(c.total), jumlah: c.n })),
    terbaru: latest.map((c) => ({ jenis: c.type === 'income' ? 'masuk' : 'keluar', kategori: c.category, jumlah: num(c.amount), catatan: c.note, waktu: wibText(c.created_at) })),
  }
}

async function voidSection() {
  const rows = await sql`
    select receipt_no, total, voided_at, voided_by from sales
    where voided_at is not null order by voided_at desc limit 10`
  return rows.map((s) => ({ struk: s.receipt_no, total: num(s.total), oleh: s.voided_by, waktu: wibText(s.voided_at) }))
}

async function stockMovesSection() {
  const rows = await sql`
    select p.name, m.type, m.qty, m.note, m.created_at from stock_moves m
    join products p on p.id = m.product_id order by m.created_at desc limit 15`
  return rows.map((m) => ({ produk: m.name, tipe: m.type, qty: m.qty, catatan: m.note, waktu: wibText(m.created_at) }))
}

async function promoSection(preloaded?: StoreSettings) {
  const s = preloaded ?? (await getSettings())
  return {
    happyHour: { aktif: s.promo_enabled, mulai: s.promo_start, selesai: s.promo_end, diskonPersen: s.promo_persen },
    loyalitas: { nominalPerStempel: s.stamp_per, stempelUntukHadiah: s.stamp_goal, hadiah: s.stamp_reward },
  }
}

// ---------- perakit ----------

// Pemisah pertanyaan perbandingan: "minggu ini vs kemarin", "bulan ini dibanding bulan lalu"
const COMPARE_SEP = /\b(?:vs\.?|dibanding\w*|banding\w*|daripada|dengan)\b/

// "minggu ini vs kemarin" → dua periode; pertanyaan biasa → satu periode
export function parseQuestionRanges(q: string): { range: Range | null; base: Range | null } {
  const parts = q.split(COMPARE_SEP)
  const range = parseRange(parts[0])
  const base = parts.length > 1 ? parseRange(parts.slice(1).join(' ')) : null
  return { range, base }
}

export type ContextRefs = {
  products: Product[]
  customers: Customer[]
  settings?: StoreSettings
  /** Pertanyaan berjalan (pesan user terakhir) — sumber utama deteksi periode */
  current?: string
  /** Jawaban asisten sebelumnya — acuan resolve "yang kedua berapa?" */
  previousAnswer?: string
}

// Rentang periode: utamakan pertanyaan berjalan; kalau kosong, pakai seluruh riwayat
// ("omzet kemarin" lalu "yang paling laku?" masih dapat acuan kemarin)
export function resolveRanges(current: string, fallback: string): { range: Range | null; base: Range | null } {
  const own = parseQuestionRanges(current)
  return own.range || own.base ? own : parseQuestionRanges(fallback)
}

// Pertanyaan lanjutan pendek atau menunjuk sesuatu: "yang kedua berapa?", "stoknya?"
export const looksFollowup = (s: string) =>
  s.length <= 30 || /\b(?:tadi|itu|tersebut|pertama|kedua|ketiga|keempat|terakhir|sebut)\b|nya\b/.test(s)

// Nama produk/pelanggan yang disebut di jawaban sebelumnya (maksimal 3)
export function namesFromAnswer(prevAnswer: string, items: { name: string }[]): string[] {
  const prev = prevAnswer.toLowerCase()
  return items
    .map((i) => i.name.trim())
    .filter((n) => n.length >= 3 && prev.includes(n.toLowerCase()))
    .slice(0, 3)
}

export async function buildContext(question: string, refs?: ContextRefs): Promise<{ topik: string[]; data: Record<string, unknown> } | null> {
  const q = question.toLowerCase()
  const qTokens = new Set(tokens(q).filter((t) => !STOP.has(t)))
  const cur = (refs?.current ?? question).toLowerCase()
  const { range, base: baseRange } = resolveRanges(cur, q)
  const sections: [string, () => Promise<unknown>][] = []

  for (const no of (question.match(/INV-[\w-]+/gi) ?? []).slice(0, 2)) {
    sections.push([`struk:${no}`, () => receiptDetail(no)])
  }
  if (range) sections.push([`ringkasan_periode`, () => periodSummary(range)])
  else if (baseRange) sections.push([`ringkasan_periode`, () => periodSummary(baseRange)])
  if (range && baseRange && (baseRange.from !== range.from || baseRange.to !== range.to)) {
    sections.push([`ringkasan_pembanding`, () => periodSummary(baseRange)])
  }

  const [products, customers] = refs
    ? [refs.products, refs.customers]
    : await Promise.all([getProducts(), getCustomers()])

  // Pencocokan nama pakai riwayat; kalau pertanyaan berjalan tidak menunjuk produk/
  // pelanggan mana pun tapi berupa lanjutan, sebut nama dari jawaban sebelumnya
  let mQ = q
  let mTokens = qTokens
  let productHits = matchByName(products, (x) => x.name, mTokens, mQ)
  let customerHits = matchByName(customers, (x) => x.name, mTokens, mQ)
  const curTokens = new Set(tokens(cur).filter((t) => !STOP.has(t)))
  const curHit =
    matchByName(products, (x) => x.name, curTokens, cur).length +
    matchByName(customers, (x) => x.name, curTokens, cur).length
  if (curHit === 0 && refs?.previousAnswer && looksFollowup(cur)) {
    const names = namesFromAnswer(refs.previousAnswer, [...products, ...customers])
    if (names.length) {
      mQ = `${mQ} ${names.join(' ')}`
      mTokens = new Set(tokens(mQ).filter((t) => !STOP.has(t)))
      productHits = matchByName(products, (x) => x.name, mTokens, mQ)
      customerHits = matchByName(customers, (x) => x.name, mTokens, mQ)
    }
  }

  for (const p of productHits) {
    sections.push([`produk:${p.name}`, () => productDetail(p, range)])
  }
  for (const c of customerHits) {
    sections.push([`pelanggan:${c.name}`, () => customerDetail(c)])
  }

  if (/kasir|\btim\b|karyawan|pegawai|staf|shift|kinerja|selisih/.test(q)) sections.push(['tim_dan_shift', () => teamSection(qTokens, q)])
  if (/jam ramai|ramai|sepi|puncak|jam sibuk|padat/.test(q)) sections.push(['jam_ramai', busySection])
  if (/pengeluaran|pemasukan|biaya|\bkas\b|listrik|operasional|belanja|laba bersih|untung bersih/.test(q)) sections.push(['kas', () => cashSection(range)])
  if (/void|batal|dibatalkan/.test(q)) sections.push(['void_terakhir', voidSection])
  if (/riwayat stok|pergerakan|opname|pembelian|restock|stok masuk|stok keluar/.test(q)) sections.push(['pergerakan_stok', stockMovesSection])
  if (/promo|happy hour|stempel|loyalitas|hadiah/.test(q)) sections.push(['promo_loyalitas', () => promoSection(refs?.settings)])

  if (!sections.length) return null

  const results = await Promise.allSettled(sections.map(([, fn]) => fn()))
  const data: Record<string, unknown> = {}
  const topik: string[] = []
  let size = 0
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled' || r.value == null) return
    const len = JSON.stringify(r.value).length
    if (size + len > MAX_CHARS) return
    data[sections[i][0]] = r.value
    topik.push(sections[i][0])
    size += len
  })
  return topik.length ? { topik, data } : null
}