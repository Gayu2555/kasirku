import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL!)

const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')
for (const stmt of schema.split(';').map((s) => s.trim()).filter(Boolean)) {
  await sql.unsafe(stmt)
}
// app_roles & settings sengaja tidak di-truncate supaya peran user dan profil toko tetap ada setelah re-seed
await sql`truncate cash_entries, stock_moves, sale_items, sales, shifts, recipes, ingredients, products, customer_payments, customers, held_orders cascade`

// RNG deterministik biar demo konsisten
function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(42)

const ingredients = [
  { id: randomUUID(), name: 'Ayam broiler', unit: 'g', cost: 35 },
  { id: randomUUID(), name: 'Tepung bumbu', unit: 'g', cost: 20 },
  { id: randomUUID(), name: 'Minyak goreng', unit: 'ml', cost: 15 },
  { id: randomUUID(), name: 'Gas & listrik', unit: 'porsi', cost: 1000 },
  { id: randomUUID(), name: 'Kemasan kertas', unit: 'pcs', cost: 1000 },
  { id: randomUUID(), name: 'Saus sambal', unit: 'g', cost: 60 },
  { id: randomUUID(), name: 'Beras', unit: 'g', cost: 15 },
  { id: randomUUID(), name: 'Teh celup', unit: 'pcs', cost: 500 },
  { id: randomUUID(), name: 'Gula pasir', unit: 'g', cost: 18 },
  { id: randomUUID(), name: 'Es batu', unit: 'pcs', cost: 300 },
]
const ingId = (n: string) => ingredients.find((i) => i.name === n)!.id
const ingCost = (n: string) => ingredients.find((i) => i.name === n)!.cost

const ayamRecipe: [string, number][] = [
  ['Ayam broiler', 200],
  ['Tepung bumbu', 80],
  ['Minyak goreng', 30],
  ['Gas & listrik', 1],
  ['Kemasan kertas', 1],
  ['Saus sambal', 20],
]

const IMAGE_BY_SKU: Record<string, string> = {
  AY01: '/products/ayam-goreng.webp',
  AY02: '/products/ayam-geprek.webp',
  PK01: '/products/paket-nasi-ayam.webp',
  ES01: '/products/es-teh-manis.webp',
  KT01: '/products/kentang-goreng.webp',
  AM01: '/products/air-mineral.webp',
}
const products = [
  { id: randomUUID(), sku: 'AY01', name: 'Ayam Goreng Original', category: 'Makanan', price: 18000, base: 40, min: 10, recipe: ayamRecipe },
  { id: randomUUID(), sku: 'AY02', name: 'Ayam Geprek', category: 'Makanan', price: 20000, base: 30, min: 10, recipe: [...ayamRecipe.slice(0, 5), ['Saus sambal', 40]] as [string, number][] },
  { id: randomUUID(), sku: 'PK01', name: 'Paket Nasi + Ayam', category: 'Paket', price: 25000, base: 20, min: 8, recipe: [...ayamRecipe, ['Beras', 150]] as [string, number][] },
  { id: randomUUID(), sku: 'ES01', name: 'Es Teh Manis', category: 'Minuman', price: 5000, base: 50, min: 15, recipe: [['Teh celup', 1], ['Gula pasir', 30], ['Es batu', 2]] as [string, number][] },
  { id: randomUUID(), sku: 'KT01', name: 'Kentang Goreng', category: 'Snack', price: 10000, base: 25, min: 8, recipe: null, cost: 4000 },
  { id: randomUUID(), sku: 'AM01', name: 'Air Mineral', category: 'Minuman', price: 4000, base: 60, min: 20, recipe: null, cost: 2500 },
]
const costOf = (p: (typeof products)[number]) =>
  p.recipe ? p.recipe.reduce((s, [n, q]) => s + q * ingCost(n), 0) : (p.cost ?? 0)

const customers = [
  { id: randomUUID(), name: 'Bu Sari Warung', phone: '081234567801', note: 'Langganan paket nasi', stamps: 0, stamps_total: 0, stamps_redeemed: 0 },
  { id: randomUUID(), name: 'Pak Budi Kantor', phone: '081234567802', note: 'Biasa bayar tiap Jumat', stamps: 0, stamps_total: 0, stamps_redeemed: 0 },
  { id: randomUUID(), name: 'Mbak Rani Kos', phone: '081234567803', note: '', stamps: 0, stamps_total: 0, stamps_redeemed: 0 },
  { id: randomUUID(), name: 'Mas Dedi Ojol', phone: '081234567804', note: 'Sering kasbon es teh', stamps: 0, stamps_total: 0, stamps_redeemed: 0 },
]

// Catatan item demo (level pedas / tanpa es / bungkus) biar struk & riwayat hidup
const noteFor = (sku: string, r: number): string => {
  if (sku === 'AY02') return r < 0.35 ? 'Pedas lv3' : r < 0.5 ? 'Extra pedas' : ''
  if (sku === 'ES01') return r < 0.3 ? 'Tanpa es' : r < 0.4 ? 'Gula sedikit' : ''
  if (sku === 'PK01') return r < 0.25 ? 'Bungkus' : r < 0.35 ? 'Pedas lv2' : ''
  if (sku === 'AY01') return r < 0.2 ? 'Bungkus' : ''
  if (sku === 'KT01') return r < 0.2 ? 'Extra saus' : ''
  if (sku === 'AM01') return r < 0.15 ? 'Dingin' : ''
  return ''
}
const STAMP_PER = 20000

// ---- riwayat penjualan 30 hari + shift harian ----
const sold = new Map<string, number>()
const stampOf = new Map<string, number>()
const shifts: Record<string, unknown>[] = []
const sales: Record<string, unknown>[] = []
const saleItems: Record<string, unknown>[] = []
const moves: Record<string, unknown>[] = []
const cash: Record<string, unknown>[] = []

for (let d = 29; d >= 0; d--) {
  const day = new Date()
  day.setDate(day.getDate() - d)
  const y = day.getFullYear()
  const m = String(day.getMonth() + 1).padStart(2, '0')
  const dd = String(day.getDate()).padStart(2, '0')
  const stamp = `${y}${m}${dd}`
  const at = (h: number, min: number) => new Date(y, day.getMonth(), day.getDate(), h, min)

  const shiftId = randomUUID()
  const opening = 100000
  let dayCash = 0
  const nSales = 3 + Math.floor(rnd() * 6)
  for (let s = 1; s <= nSales; s++) {
    const saleId = randomUUID()
    const hour = d === 0 ? 9 + Math.floor(rnd() * 5) : 10 + Math.floor(rnd() * 9)
    const created = at(hour, Math.floor(rnd() * 60))
    const nLines = 1 + Math.floor(rnd() * 3)
    const picked = new Set<number>()
    let total = 0
    const lines: { p: (typeof products)[number]; qty: number; note: string }[] = []
    for (let l = 0; l < nLines; l++) {
      let idx = Math.floor(rnd() * products.length)
      while (picked.has(idx)) idx = (idx + 1) % products.length
      picked.add(idx)
      const qty = 1 + Math.floor(rnd() * 3)
      lines.push({ p: products[idx], qty, note: noteFor(products[idx].sku, rnd()) })
      total += products[idx].price * qty
    }
    // Dummy metode bayar: 55% tunai, 25% QRIS, 10% transfer, 10% kasbon; beberapa transaksi di-void
    const mr = rnd()
    const method = mr < 0.55 ? 'tunai' : mr < 0.8 ? 'qris' : mr < 0.9 ? 'transfer' : 'kasbon'
    // Pelanggan dikenali untuk kasbon (wajib) atau sebagian transaksi lain (loyalitas)
    const customer = method === 'kasbon' || rnd() < 0.35 ? customers[Math.floor(rnd() * customers.length)] : null
    // Diskon promo sesekali untuk QRIS/transfer
    const disc = (method === 'qris' || method === 'transfer') && rnd() < 0.35 ? (rnd() < 0.5 ? 2000 : 5000) : 0
    total -= disc
    const paid = Math.ceil(total / 5000) * 5000
    const receiptNo = `INV-${stamp}-${String(s).padStart(3, '0')}`
    const voided = (d === 20 || d === 12 || d === 5) && s === 2
    const pay = method === 'tunai' ? paid : method === 'kasbon' ? 0 : total
    const earned = customer ? Math.floor(total / STAMP_PER) : 0
    if (customer && !voided) stampOf.set(customer.id, (stampOf.get(customer.id) ?? 0) + earned)
    sales.push({
      id: saleId, receipt_no: receiptNo, total, discount: disc, paid: pay, change: pay - total, shift_id: shiftId,
      payment_method: method,
      customer_id: customer?.id ?? null,
      stamps_earned: earned,
      voided_at: voided ? new Date(created.getTime() + 3600000) : null,
      voided_by: voided ? 'demo@kasirku.id' : null,
      created_at: created,
    })
    for (const { p, qty, note } of lines) {
      saleItems.push({ id: randomUUID(), sale_id: saleId, product_id: p.id, name: p.name, qty, price: p.price, cost: costOf(p), note })
      moves.push({ id: randomUUID(), product_id: p.id, type: 'sale', qty: -qty, note: receiptNo, sale_id: saleId, created_at: created })
      if (!voided) sold.set(p.id, (sold.get(p.id) ?? 0) + qty)
      else moves.push({ id: randomUUID(), product_id: p.id, type: 'in', qty, note: 'Void ' + receiptNo, sale_id: saleId, created_at: new Date(created.getTime() + 3600000) })
    }
    // Kasbon tidak mencatat pendapatan saat transaksi; uang masuk saat pelunasan
    if (method !== 'kasbon') cash.push({ id: randomUUID(), type: 'income', amount: total, category: 'Penjualan', note: receiptNo, sale_id: saleId, created_at: created })
    if (voided && method !== 'kasbon') cash.push({ id: randomUUID(), type: 'expense', amount: total, category: 'Void penjualan', note: receiptNo + ' — salah input demo', sale_id: saleId, created_at: new Date(created.getTime() + 3600000) })
    if (!voided && method === 'tunai') dayCash += total
  }
  const expected = opening + dayCash
  const diffPool = [0, 0, 0, 0, -2000, 5000]
  const difference = diffPool[Math.floor(rnd() * diffPool.length)]
  shifts.push({
    id: shiftId,
    user_id: 'seed',
    user_email: 'demo@kasirku.id',
    opening_cash: opening,
    expected_cash: expected,
    counted_cash: expected + difference,
    difference,
    note: difference === 0 ? '' : 'Selisih demo',
    opened_at: at(9, 0),
    closed_at: at(21, 0),
  })
}

// ---- stamp loyalitas pelanggan: total dari penjualan tidak di-void ----
for (const c of customers) {
  const t = stampOf.get(c.id) ?? 0
  c.stamps = t
  c.stamps_total = t
}

const expenses = [
  { days: 28, amount: 500000, category: 'Bahan baku', note: 'Belanja bahan minggu 1' },
  { days: 21, amount: 500000, category: 'Bahan baku', note: 'Belanja bahan minggu 2' },
  { days: 14, amount: 150000, category: 'Operasional', note: 'Gas LPG 3kg' },
  { days: 7, amount: 500000, category: 'Bahan baku', note: 'Belanja bahan minggu 3' },
  { days: 2, amount: 150000, category: 'Operasional', note: 'Gas LPG 3kg' },
]
for (const e of expenses) {
  const t = new Date()
  t.setDate(t.getDate() - e.days)
  t.setHours(8, 30, 0, 0)
  cash.push({ id: randomUUID(), type: 'expense', amount: e.amount, category: e.category, note: e.note, sale_id: null, created_at: t })
}

// ---- pelunasan kasbon: dua pelanggan pertama bayar setengah hutangnya kemarin ----
const payments: Record<string, unknown>[] = []
const debtOf = new Map<string, number>()
for (const s of sales) {
  if (s.payment_method === 'kasbon' && !s.voided_at && s.customer_id) {
    debtOf.set(s.customer_id as string, (debtOf.get(s.customer_id as string) ?? 0) + (s.total as number))
  }
}
for (const c of customers.slice(0, 2)) {
  const half = Math.floor((debtOf.get(c.id) ?? 0) / 2 / 5000) * 5000
  if (half <= 0) continue
  const t = new Date()
  t.setDate(t.getDate() - 1)
  t.setHours(16, 0, 0, 0)
  payments.push({ id: randomUUID(), customer_id: c.id, amount: half, method: 'tunai', note: 'Cicilan demo', created_at: t })
  cash.push({ id: randomUUID(), type: 'income', amount: half, category: 'Pelunasan kasbon', note: c.name + ' — Cicilan demo', sale_id: null, created_at: t })
}

// ---- insert bulk ----
await sql`insert into ingredients ${sql(ingredients.map((i) => ({ id: i.id, name: i.name, unit: i.unit, cost_per_unit: i.cost })))}`
await sql`insert into products ${sql(products.map((p) => ({
  id: p.id, sku: p.sku, name: p.name, category: p.category, price: p.price,
  cost: costOf(p), stock: p.base + (sold.get(p.id) ?? 0), unit: 'porsi', min_stock: p.min,
  pinned: p.sku === 'AY01' || p.sku === 'ES01',
  image_url: IMAGE_BY_SKU[p.sku] ?? '',
})))}`
const recipeRows = products.flatMap((p) =>
  (p.recipe ?? []).map(([n, q]) => ({ product_id: p.id, ingredient_id: ingId(n), quantity: q })),
)
await sql`insert into recipes ${sql(recipeRows)}`
await sql`insert into customers ${sql(customers)}`
await sql`insert into shifts ${sql(shifts)}`
await sql`insert into sales ${sql(sales)}`
await sql`insert into sale_items ${sql(saleItems)}`
await sql`insert into stock_moves ${sql([
  ...products.map((p) => ({ id: randomUUID(), product_id: p.id, type: 'in', qty: p.base + (sold.get(p.id) ?? 0), note: 'Stok awal', sale_id: null, created_at: new Date(Date.now() - 30 * 86400000) })),
  ...moves,
])}`
// Demo alarm stok menipis: PK01 sengaja disisakan di bawah minimum
const pk = products.find((p) => p.sku === 'PK01')!
const pkStock = pk.base + (sold.get(pk.id) ?? 0)
await sql`update products set stock = 5 where id = ${pk.id}`
await sql`insert into stock_moves (product_id, type, qty, note) values (${pk.id}, 'adjust', ${5 - pkStock}, 'Demo stok menipis')`
await sql`insert into cash_entries ${sql(cash)}`
await sql`insert into customer_payments ${sql(payments)}`
// Profil toko demo: jangan timpa pengaturan yang sudah diubah user
await sql`insert into settings (key, value) values
  ('store_name', 'Ayam Geprek Mantap'),
  ('store_address', 'Jl. Merdeka No. 12, Bandung'),
  ('store_phone', '081234567800'),
  ('receipt_footer', 'Terima kasih, selamat menikmati!'),
  ('daily_target', '500000'),
  ('supplier_phone', '081300001111'),
  ('stamp_per', '20000'),
  ('stamp_goal', '10'),
  ('stamp_reward', 'Gratis Es Teh Manis'),
  ('ui_font', 'classic'),
  ('ui_accent', 'sage'),
  ('ui_density', 'comfortable'),
  ('nav_config', '[{"href":"/","on":true},{"href":"/kasir","on":true},{"href":"/riwayat","on":true},{"href":"/pelanggan","on":true},{"href":"/laporan","on":true},{"href":"/stok","on":true},{"href":"/keuangan","on":true},{"href":"/hpp","on":true},{"href":"/analitik","on":true},{"href":"/tim","on":true},{"href":"/pengaturan","on":true}]'),
  ('promo_enabled', '1'),
  ('promo_start', '14:00'),
  ('promo_end', '17:00'),
  ('promo_persen', '10')
  on conflict (key) do nothing`

// Demo parkir pesanan: dua parkiran milik owner aktif pertama biar fitur langsung terlihat
const [owner] = await sql`select user_id from app_roles where role = 'owner' and status = 'aktif' order by created_at limit 1`
if (owner) {
  const geprek = products.find((p) => p.sku === 'AY02')!
  const es = products.find((p) => p.sku === 'ES01')!
  const paket = products.find((p) => p.sku === 'PK01')!
  const air = products.find((p) => p.sku === 'AM01')!
  await sql`insert into held_orders (user_id, label, items, customer_id, created_at) values
    (${owner.user_id}, 'Meja 2 — tunggu teman', ${sql.json([
      { productId: geprek.id, qty: 2, note: 'Pedas lv3' },
      { productId: es.id, qty: 2, note: 'Tanpa es' },
    ])}, null, ${new Date(Date.now() - 25 * 60000)}),
    (${owner.user_id}, 'Bu Sari — balik lagi', ${sql.json([
      { productId: paket.id, qty: 1, note: 'Bungkus' },
      { productId: air.id, qty: 1, note: '' },
    ])}, ${customers[0].id}, ${new Date(Date.now() - 8 * 60000)})`
}

console.log(`Seed selesai: ${products.length} produk, ${ingredients.length} bahan, ${sales.length} penjualan 30 hari, ${shifts.length} shift, ${customers.length} pelanggan, ${payments.length} pelunasan kasbon${owner ? ', 2 pesanan diparkir' : ''}.`)
await sql.end()