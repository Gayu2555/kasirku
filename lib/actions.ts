'use server'

import { revalidatePath } from 'next/cache'
import sql from './db'
import { getCustomerDetail, getMoves, getRecipe } from './data'
import { actionGuard } from './auth/server'
import { serializeNav } from './nav'
import { isAccentId, isDensity, isFontId } from './appearance'
import { hhmmToMin, isValidHHMM } from './promo'
import { uploadImage, deleteImage } from './storage'
import type { PayMethod, Receipt, StoreSettings } from './types'

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

export type { Result }

const fail = (error: string): Result<never> => ({ ok: false, error })
const done = () => revalidatePath('/', 'layout')

export async function uploadProductImage(file: File): Promise<Result<{ url: string }>> {
  if (!(await actionGuard('owner'))) return fail('Aksi ini khusus owner')
  try {
    const url = await uploadImage(file)
    return { ok: true, url }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Gagal mengunggah gambar')
  }
}

export async function checkout(
  items: { productId: string; qty: number; note?: string }[],
  paid: number,
  method: PayMethod = 'tunai',
  customer?: { id?: string; name?: string; phone?: string },
  discount?: { type: 'persen' | 'nominal'; value: number },
): Promise<Result<{ receipt: Receipt }>> {
  if (!items.length) return fail('Keranjang masih kosong')
  if (!['tunai', 'qris', 'transfer', 'kasbon'].includes(method)) return fail('Metode pembayaran tidak valid')
  if (method === 'tunai' && (!Number.isFinite(paid) || paid < 0)) return fail('Nominal pembayaran tidak valid')
  if (method === 'kasbon' && !customer?.id && !customer?.name?.trim()) return fail('Pilih atau buat pelanggan untuk kasbon')
  const me = await actionGuard('kasir')
  if (!me) return fail('Silakan masuk dulu')
  const [shift] = await sql`
    select id from shifts where user_id = ${me.id} and closed_at is null
    order by opened_at desc limit 1`
  if (!shift) return fail('Buka shift dulu sebelum bertransaksi')
  try {
    const receipt = await sql.begin(async (tx) => {
      const ids = items.map((i) => i.productId)
      const prods = await tx`select * from products where id = any(${ids}) for update`
      const map = new Map(prods.map((p) => [p.id, p]))
      let subtotal = 0
      const lines: { p: (typeof prods)[number]; qty: number; note: string }[] = []
      for (const it of items) {
        const p = map.get(it.productId)
        if (!p) throw new Error('Produk tidak ditemukan')
        if (!Number.isInteger(it.qty) || it.qty < 1) throw new Error('Jumlah item tidak valid')
        if (p.stock < it.qty) throw new Error(`Stok ${p.name} tidak cukup (sisa ${p.stock})`)
        subtotal += Number(p.price) * it.qty
        lines.push({ p, qty: it.qty, note: (it.note ?? '').trim() })
      }
      let disc = 0
      let promo = false
      if (discount && discount.value > 0) {
        if (!Number.isFinite(discount.value) || discount.value < 0) throw new Error('Diskon tidak valid')
        disc = discount.type === 'persen'
          ? Math.round(subtotal * Math.min(discount.value, 100) / 100)
          : Math.round(discount.value)
        if (disc > subtotal) throw new Error('Diskon melebihi total belanja')
      } else {
        // Happy hour: diskon otomatis dalam jendela WIB, hanya jika tanpa diskon manual
        const ps = await tx`select key, value from settings where key in ('promo_enabled','promo_start','promo_end','promo_persen')`
        const pm = new Map(ps.map((r) => [r.key, r.value]))
        if (pm.get('promo_enabled') === '1') {
          const s = hhmmToMin(pm.get('promo_start') ?? '')
          const e = hhmmToMin(pm.get('promo_end') ?? '')
          const persen = Number(pm.get('promo_persen') ?? 0)
          const [w] = await tx`
            select (extract(hour from now() at time zone 'Asia/Jakarta') * 60
              + extract(minute from now() at time zone 'Asia/Jakarta'))::int as mins`
          if (s >= 0 && e > s && persen > 0 && w.mins >= s && w.mins < e) {
            disc = Math.round(subtotal * Math.min(persen, 100) / 100)
            promo = disc > 0
          }
        }
      }
      const total = subtotal - disc
      if (method === 'tunai' && paid < total) throw new Error('Uang pembayaran kurang dari total')
      // QRIS/transfer: nominal pas otomatis; kasbon: belum ada uang masuk
      const pay = method === 'tunai' ? paid : method === 'kasbon' ? 0 : total
      const change = method === 'tunai' ? paid - total : 0

      let customerId: string | null = null
      let customerName: string | null = null
      if (customer?.id) {
        const [c] = await tx`select id, name from customers where id = ${customer.id}`
        if (!c) throw new Error('Pelanggan tidak ditemukan')
        customerId = c.id
        customerName = c.name
      } else if (method === 'kasbon') {
        const [c] = await tx`
          insert into customers (name, phone) values (${customer!.name!.trim()}, ${customer?.phone?.trim() ?? ''})
          returning id, name`
        customerId = c.id
        customerName = c.name
      }

      // Stamp loyalitas: tiap stamp_per rupiah belanja = 1 stamp (0 = nonaktif)
      const [sp] = await tx`select value from settings where key = 'stamp_per'`
      const stampPer = Number(sp?.value ?? 20000) || 0
      const earned = customerId && stampPer > 0 ? Math.floor(total / stampPer) : 0

      const [cnt] = await tx`select count(*)::int as n from sales where created_at >= date_trunc('day', now())`
      const d = new Date()
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
      const receiptNo = `INV-${stamp}-${String(cnt.n + 1).padStart(3, '0')}`

      const [sale] = await tx`
        insert into sales (receipt_no, total, discount, paid, change, shift_id, payment_method, customer_id, stamps_earned)
        values (${receiptNo}, ${total}, ${disc}, ${pay}, ${change}, ${shift.id}, ${method}, ${customerId}, ${earned})
        returning *`
      const receiptItems = []
      for (const { p, qty, note } of lines) {
        await tx`
          insert into sale_items (sale_id, product_id, name, qty, price, cost, note)
          values (${sale.id}, ${p.id}, ${p.name}, ${qty}, ${p.price}, ${p.cost}, ${note})`
        await tx`update products set stock = stock - ${qty} where id = ${p.id}`
        await tx`
          insert into stock_moves (product_id, type, qty, note, sale_id)
          values (${p.id}, 'sale', ${-qty}, ${receiptNo}, ${sale.id})`
        receiptItems.push({ name: p.name, qty, price: Number(p.price), cost: Number(p.cost), note })
      }
      let customerStamps: number | null = null
      if (customerId) {
        if (earned > 0) {
          const [c] = await tx`
            update customers set stamps = stamps + ${earned}, stamps_total = stamps_total + ${earned}
            where id = ${customerId} returning stamps`
          customerStamps = c.stamps
        } else {
          const [c] = await tx`select stamps from customers where id = ${customerId}`
          customerStamps = c.stamps
        }
      }
      // Kasbon belum jadi uang masuk; pendapatan dicatat saat pelunasan
      if (method !== 'kasbon') {
        await tx`
          insert into cash_entries (type, amount, category, note, sale_id)
          values ('income', ${total}, 'Penjualan', ${receiptNo}, ${sale.id})`
      }
      return {
        receipt_no: receiptNo,
        total,
        discount: disc,
        paid: pay,
        change,
        payment_method: method,
        customer_name: customerName,
        created_at: sale.created_at.toISOString(),
        items: receiptItems,
        stamps_earned: earned,
        customer_stamps: customerStamps,
        promo,
      }
    })
    done()
    return { ok: true, receipt }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Checkout gagal')
  }
}

export async function saveProduct(input: {
  id?: string
  sku?: string
  name: string
  category: string
  price: number
  cost: number
  stock: number
  unit: string
  min_stock: number
  image?: File
  deleteImage: boolean
}): Promise<Result> {
  if (!(await actionGuard('owner'))) return fail('Aksi ini khusus owner')
  if (!input.name.trim()) return fail('Nama produk wajib diisi')
  if (input.price < 0 || input.cost < 0 || input.stock < 0 || input.min_stock < 0)
    return fail('Angka tidak boleh negatif')
  try {
    let existingProduct: { image_url: string }[] = []
    if (input.id) {
      existingProduct = await sql`select image_url from products where id = ${input.id}`
    }
    let imageUrl = existingProduct[0]?.image_url ?? ''
    
    if (input.deleteImage && existingProduct[0]?.image_url) {
      // Delete existing image
      await deleteImage(existingProduct[0].image_url)
      imageUrl = ''
    } else if (input.image) {
      // Upload new image
      imageUrl = await uploadImage(input.image)
      // Delete old image if exists
      if (existingProduct[0]?.image_url) {
        await deleteImage(existingProduct[0].image_url)
      }
    }
    
    if (input.id) {
      await sql`
        update products set
          name = ${input.name}, category = ${input.category}, price = ${input.price},
          cost = ${input.cost}, unit = ${input.unit}, min_stock = ${input.min_stock},
          sku = ${input.sku?.trim() || null}, image_url = ${imageUrl}
        where id = ${input.id}`
    } else {
      const [p] = await sql`
        insert into products (name, category, price, cost, stock, unit, min_stock, sku, image_url)
        values (${input.name}, ${input.category}, ${input.price}, ${input.cost}, ${input.stock}, ${input.unit}, ${input.min_stock}, ${input.sku?.trim() || null}, ${imageUrl})
        returning id`
      if (input.stock > 0) {
        await sql`
          insert into stock_moves (product_id, type, qty, note)
          values (${p.id}, 'in', ${input.stock}, 'Stok awal')`
      }
    }
    done()
    return { ok: true }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Gagal menyimpan produk')
  }
}

export async function adjustStock(productId: string, delta: number, note: string): Promise<Result> {
  if (!(await actionGuard('owner'))) return fail('Aksi ini khusus owner')
  if (!Number.isInteger(delta) || delta === 0) return fail('Jumlah penyesuaian tidak valid')
  try {
    const [p] = await sql`select stock, name from products where id = ${productId}`
    if (!p) return fail('Produk tidak ditemukan')
    if (p.stock + delta < 0) return fail(`Stok ${p.name} tidak boleh minus (sisa ${p.stock})`)
    await sql`update products set stock = stock + ${delta} where id = ${productId}`
    await sql`
      insert into stock_moves (product_id, type, qty, note)
      values (${productId}, ${delta > 0 ? 'in' : 'out'}, ${delta}, ${note})`
    done()
    return { ok: true }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Gagal menyesuaikan stok')
  }
}

export async function addCashEntry(
  type: 'income' | 'expense',
  amount: number,
  category: string,
  note: string,
): Promise<Result> {
  if (!(await actionGuard('owner'))) return fail('Aksi ini khusus owner')
  if (!Number.isFinite(amount) || amount <= 0) return fail('Nominal harus lebih dari 0')
  try {
    await sql`
      insert into cash_entries (type, amount, category, note)
      values (${type}, ${amount}, ${category || 'Umum'}, ${note})`
    done()
    return { ok: true }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Gagal menyimpan catatan')
  }
}

export async function deleteCashEntry(id: string): Promise<Result> {
  if (!(await actionGuard('owner'))) return fail('Aksi ini khusus owner')
  const [row] = await sql`select sale_id from cash_entries where id = ${id}`
  if (!row) return fail('Catatan tidak ditemukan')
  if (row.sale_id) return fail('Pendapatan otomatis dari penjualan tidak bisa dihapus')
  await sql`delete from cash_entries where id = ${id}`
  done()
  return { ok: true }
}

export async function addIngredient(name: string, unit: string, costPerUnit: number): Promise<Result> {
  if (!(await actionGuard('owner'))) return fail('Aksi ini khusus owner')
  if (!name.trim()) return fail('Nama bahan wajib diisi')
  if (costPerUnit < 0) return fail('Harga tidak boleh negatif')
  try {
    await sql`insert into ingredients (name, unit, cost_per_unit) values (${name}, ${unit || 'pcs'}, ${costPerUnit})`
    done()
    return { ok: true }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Gagal menambah bahan')
  }
}

export async function updateIngredientCost(id: string, costPerUnit: number): Promise<Result> {
  if (!(await actionGuard('owner'))) return fail('Aksi ini khusus owner')
  if (costPerUnit < 0) return fail('Harga tidak boleh negatif')
  await sql`update ingredients set cost_per_unit = ${costPerUnit} where id = ${id}`
  done()
  return { ok: true }
}

export async function fetchMoves(productId: string) {
  if (!(await actionGuard('owner'))) return []
  return getMoves(productId)
}

export async function fetchRecipe(productId: string) {
  if (!(await actionGuard('owner'))) return []
  return getRecipe(productId)
}

export async function saveRecipe(
  productId: string,
  rows: { ingredientId: string; quantity: number }[],
  overhead: number,
): Promise<Result<{ hpp: number }>> {
  if (!(await actionGuard('owner'))) return fail('Aksi ini khusus owner')
  if (overhead < 0) return fail('Overhead tidak boleh negatif')
  for (const r of rows) if (!(r.quantity > 0)) return fail('Kuantitas bahan harus lebih dari 0')
  try {
    const hpp = await sql.begin(async (tx) => {
      await tx`delete from recipes where product_id = ${productId}`
      let sum = 0
      for (const r of rows) {
        const [ing] = await tx`select cost_per_unit from ingredients where id = ${r.ingredientId}`
        if (!ing) throw new Error('Bahan tidak ditemukan')
        await tx`
          insert into recipes (product_id, ingredient_id, quantity)
          values (${productId}, ${r.ingredientId}, ${r.quantity})`
        sum += Number(ing.cost_per_unit) * r.quantity
      }
      const total = sum + overhead
      await tx`update products set cost = ${total}, overhead = ${overhead} where id = ${productId}`
      return total
    })
    done()
    return { ok: true, hpp }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Gagal menyimpan resep')
  }
}

export async function openShift(openingCash: number): Promise<Result> {
  const me = await actionGuard('kasir')
  if (!me) return fail('Silakan masuk dulu')
  if (!Number.isFinite(openingCash) || openingCash < 0) return fail('Modal awal tidak valid')
  const [open] = await sql`select id from shifts where user_id = ${me.id} and closed_at is null`
  if (open) return fail('Masih ada shift yang terbuka')
  await sql`insert into shifts (user_id, user_email, opening_cash) values (${me.id}, ${me.email}, ${openingCash})`
  done()
  return { ok: true }
}

export async function closeShift(
  countedCash: number,
  note: string,
): Promise<Result<{ expected: number; difference: number; nonCash: number }>> {
  const me = await actionGuard('kasir')
  if (!me) return fail('Silakan masuk dulu')
  if (!Number.isFinite(countedCash) || countedCash < 0) return fail('Uang dihitung tidak valid')
  const [shift] = await sql`
    select * from shifts where user_id = ${me.id} and closed_at is null
    order by opened_at desc limit 1`
  if (!shift) return fail('Tidak ada shift terbuka')
  // Laci hanya menampung uang tunai; QRIS/transfer tidak masuk hitungan laci
  const [t] = await sql`
    select coalesce(sum(total) filter (where payment_method = 'tunai'), 0) as cash,
      coalesce(sum(total) filter (where payment_method <> 'tunai'), 0) as noncash
    from sales where shift_id = ${shift.id} and voided_at is null`
  const expected = Number(shift.opening_cash) + Number(t.cash)
  const difference = countedCash - expected
  await sql`
    update shifts set closed_at = now(), expected_cash = ${expected},
      counted_cash = ${countedCash}, difference = ${difference}, note = ${note}
    where id = ${shift.id}`
  done()
  return { ok: true, expected, difference, nonCash: Number(t.noncash) }
}

export async function voidSale(saleId: string, reason: string): Promise<Result> {
  const me = await actionGuard('owner')
  if (!me) return fail('Aksi ini khusus owner')
  const [sale] = await sql`select * from sales where id = ${saleId}`
  if (!sale) return fail('Transaksi tidak ditemukan')
  if (sale.voided_at) return fail('Transaksi sudah di-void')
  try {
    await sql.begin(async (tx) => {
      await tx`
        update sales set voided_at = now(), voided_by = ${me.email}
        where id = ${saleId}`
      const items = await tx`select * from sale_items where sale_id = ${saleId}`
      for (const i of items) {
        if (!i.product_id) continue
        await tx`update products set stock = stock + ${i.qty} where id = ${i.product_id}`
        await tx`
          insert into stock_moves (product_id, type, qty, note, sale_id)
          values (${i.product_id}, 'in', ${i.qty}, ${'Void ' + sale.receipt_no}, ${saleId})`
      }
      // Pembalik pendapatan supaya laba bersih tetap benar (kasbon tidak punya pendapatan awal)
      if (sale.payment_method !== 'kasbon') {
        await tx`
          insert into cash_entries (type, amount, category, note, sale_id)
          values ('expense', ${Number(sale.total)}, 'Void penjualan', ${sale.receipt_no + (reason.trim() ? ' — ' + reason.trim() : '')}, ${saleId})`
      }
      // Balik stamp loyalitas supaya saldo pelanggan tetap benar
      if (sale.customer_id && sale.stamps_earned > 0) {
        await tx`
          update customers set stamps = greatest(stamps - ${sale.stamps_earned}, 0),
            stamps_total = greatest(stamps_total - ${sale.stamps_earned}, 0)
          where id = ${sale.customer_id}`
      }
    })
    done()
    return { ok: true }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Void gagal')
  }
}

export async function fetchCustomer(id: string) {
  if (!(await actionGuard('owner'))) return null
  return getCustomerDetail(id)
}

export async function addCustomer(name: string, phone: string): Promise<Result<{ id: string }>> {
  if (!(await actionGuard('owner'))) return fail('Aksi ini khusus owner')
  if (!name.trim()) return fail('Nama pelanggan wajib diisi')
  const [c] = await sql`
    insert into customers (name, phone) values (${name.trim()}, ${phone.trim()})
    returning id`
  done()
  return { ok: true, id: c.id }
}

export async function receivePayment(
  customerId: string,
  amount: number,
  method: 'tunai' | 'qris' | 'transfer',
  note: string,
): Promise<Result> {
  const me = await actionGuard('owner')
  if (!me) return fail('Aksi ini khusus owner')
  if (!Number.isFinite(amount) || amount <= 0) return fail('Nominal pembayaran harus lebih dari 0')
  if (!['tunai', 'qris', 'transfer'].includes(method)) return fail('Metode tidak valid')
  const [c] = await sql`select id, name from customers where id = ${customerId}`
  if (!c) return fail('Pelanggan tidak ditemukan')
  try {
    await sql.begin(async (tx) => {
      await tx`
        insert into customer_payments (customer_id, amount, method, note)
        values (${customerId}, ${amount}, ${method}, ${note.trim()})`
      await tx`
        insert into cash_entries (type, amount, category, note)
        values ('income', ${amount}, 'Pelunasan kasbon', ${c.name + (note.trim() ? ' — ' + note.trim() : '')})`
    })
    done()
    return { ok: true }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Gagal mencatat pembayaran')
  }
}

async function otherActiveOwners(excludeUserId: string): Promise<number> {
  const [c] = await sql`
    select count(*)::int as n from app_roles
    where role = 'owner' and status = 'aktif' and user_id <> ${excludeUserId}`
  return c.n
}

export async function setMemberRole(userId: string, role: 'owner' | 'kasir'): Promise<Result> {
  const me = await actionGuard('owner')
  if (!me) return fail('Aksi ini khusus owner')
  if (userId === me.id) return fail('Tidak bisa mengubah peran akun sendiri')
  if (!['owner', 'kasir'].includes(role)) return fail('Peran tidak valid')
  const [row] = await sql`select role, status from app_roles where user_id = ${userId}`
  if (!row) return fail('Anggota tidak ditemukan')
  if (row.role === 'owner' && role === 'kasir' && (await otherActiveOwners(userId)) === 0)
    return fail('Minimal harus ada satu owner aktif')
  await sql`update app_roles set role = ${role} where user_id = ${userId}`
  done()
  return { ok: true }
}

export async function setMemberStatus(userId: string, status: 'pending' | 'aktif' | 'nonaktif'): Promise<Result> {
  const me = await actionGuard('owner')
  if (!me) return fail('Aksi ini khusus owner')
  if (userId === me.id) return fail('Tidak bisa mengubah status akun sendiri')
  if (!['pending', 'aktif', 'nonaktif'].includes(status)) return fail('Status tidak valid')
  const [row] = await sql`select role, status from app_roles where user_id = ${userId}`
  if (!row) return fail('Anggota tidak ditemukan')
  if (row.role === 'owner' && status !== 'aktif' && (await otherActiveOwners(userId)) === 0)
    return fail('Minimal harus ada satu owner aktif')
  await sql`update app_roles set status = ${status} where user_id = ${userId}`
  done()
  return { ok: true }
}

export async function saveSettings(input: Partial<StoreSettings>): Promise<Result> {
  if (!(await actionGuard('owner'))) return fail('Aksi ini khusus owner')
  if (input.daily_target !== undefined && (!Number.isFinite(input.daily_target) || input.daily_target < 0))
    return fail('Target harian tidak valid')
  if (input.stamp_per !== undefined && (!Number.isFinite(input.stamp_per) || input.stamp_per < 0))
    return fail('Nilai rupiah per stamp tidak valid')
  if (input.stamp_goal !== undefined && (!Number.isFinite(input.stamp_goal) || input.stamp_goal < 1))
    return fail('Target stamp minimal 1')
  if (input.ui_font !== undefined && !isFontId(input.ui_font)) return fail('Pilihan font tidak dikenal')
  if (input.ui_accent !== undefined && !isAccentId(input.ui_accent)) return fail('Pilihan warna tidak dikenal')
  if (input.ui_density !== undefined && !isDensity(input.ui_density)) return fail('Kepadatan tampilan tidak valid')
  if (input.nav !== undefined && !Array.isArray(input.nav)) return fail('Konfigurasi menu tidak valid')
  if (input.promo_start !== undefined && !isValidHHMM(input.promo_start)) return fail('Jam mulai promo tidak valid')
  if (input.promo_end !== undefined && !isValidHHMM(input.promo_end)) return fail('Jam selesai promo tidak valid')
  if (input.promo_start !== undefined && input.promo_end !== undefined && hhmmToMin(input.promo_start) >= hhmmToMin(input.promo_end))
    return fail('Jam mulai promo harus sebelum jam selesai')
  if (input.promo_persen !== undefined && (!Number.isFinite(input.promo_persen) || input.promo_persen < 1 || input.promo_persen > 90))
    return fail('Persen promo harus antara 1 dan 90')
  const entries: [string, string][] = []
  if (input.store_name !== undefined) entries.push(['store_name', input.store_name.trim()])
  if (input.store_address !== undefined) entries.push(['store_address', input.store_address.trim()])
  if (input.store_phone !== undefined) entries.push(['store_phone', input.store_phone.trim()])
  if (input.receipt_footer !== undefined) entries.push(['receipt_footer', input.receipt_footer.trim()])
  if (input.supplier_phone !== undefined) entries.push(['supplier_phone', input.supplier_phone.trim()])
  if (input.daily_target !== undefined) entries.push(['daily_target', String(Math.round(input.daily_target))])
  if (input.stamp_per !== undefined) entries.push(['stamp_per', String(Math.round(input.stamp_per))])
  if (input.stamp_goal !== undefined) entries.push(['stamp_goal', String(Math.round(input.stamp_goal))])
  if (input.stamp_reward !== undefined) entries.push(['stamp_reward', input.stamp_reward.trim()])
  if (input.ui_font !== undefined) entries.push(['ui_font', input.ui_font])
  if (input.ui_accent !== undefined) entries.push(['ui_accent', input.ui_accent])
  if (input.ui_density !== undefined) entries.push(['ui_density', input.ui_density])
  if (input.nav !== undefined) entries.push(['nav_config', serializeNav(input.nav)])
  if (input.promo_enabled !== undefined) entries.push(['promo_enabled', input.promo_enabled ? '1' : '0'])
  if (input.promo_start !== undefined) entries.push(['promo_start', input.promo_start])
  if (input.promo_end !== undefined) entries.push(['promo_end', input.promo_end])
  if (input.promo_persen !== undefined) entries.push(['promo_persen', String(Math.round(input.promo_persen))])
  for (const [key, value] of entries) {
    await sql`insert into settings (key, value) values (${key}, ${value}) on conflict (key) do update set value = excluded.value`
  }
  done()
  return { ok: true }
}

export async function togglePin(productId: string): Promise<Result> {
  if (!(await actionGuard('kasir'))) return fail('Silakan masuk dulu')
  const [p] = await sql`update products set pinned = not pinned where id = ${productId} returning pinned`
  if (!p) return fail('Produk tidak ditemukan')
  done()
  return { ok: true }
}

export async function redeemStamp(customerId: string): Promise<Result<{ stamps: number }>> {
  if (!(await actionGuard('kasir'))) return fail('Silakan masuk dulu')
  const [c] = await sql`select id, name, stamps from customers where id = ${customerId}`
  if (!c) return fail('Pelanggan tidak ditemukan')
  const [g] = await sql`select value from settings where key = 'stamp_goal'`
  const goal = Number(g?.value ?? 10) || 10
  if (c.stamps < goal) return fail(`Stamp belum cukup (${c.stamps}/${goal})`)
  const [u] = await sql`
    update customers set stamps = stamps - ${goal}, stamps_redeemed = stamps_redeemed + 1
    where id = ${customerId} returning stamps`
  done()
  return { ok: true, stamps: u.stamps }
}

export async function holdOrder(
  items: { productId: string; qty: number; note?: string }[],
  label: string,
  customerId?: string,
): Promise<Result<{ id: string }>> {
  if (!items.length) return fail('Keranjang masih kosong')
  for (const it of items) {
    if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > 999) return fail('Jumlah item tidak valid')
  }
  const me = await actionGuard('kasir')
  if (!me) return fail('Silakan masuk dulu')
  const [cnt] = await sql`select count(*)::int as n from held_orders where user_id = ${me.id}`
  if (cnt.n >= 12) return fail('Maksimal 12 pesanan diparkir — selesaikan atau hapus dulu')
  try {
    const ids = items.map((i) => i.productId)
    const prods = await sql`select id from products where id = any(${ids}) and is_active`
    if (prods.length !== new Set(ids).size) return fail('Ada produk yang tidak tersedia')
    if (customerId) {
      const [c] = await sql`select id from customers where id = ${customerId}`
      if (!c) return fail('Pelanggan tidak ditemukan')
    }
    const clean = items.map((i) => ({ productId: i.productId, qty: i.qty, note: (i.note ?? '').trim().slice(0, 120) }))
    const [row] = await sql`
      insert into held_orders (user_id, label, items, customer_id)
      values (${me.id}, ${label.trim().slice(0, 60)}, ${sql.json(clean)}, ${customerId ?? null})
      returning id`
    done()
    return { ok: true, id: row.id }
  } catch {
    return fail('Gagal memarkir pesanan')
  }
}

export async function recallOrder(id: string): Promise<Result<{ items: { productId: string; qty: number; note: string }[]; customerId: string | null }>> {
  const me = await actionGuard('kasir')
  if (!me) return fail('Silakan masuk dulu')
  const [row] = await sql`select items, customer_id from held_orders where id = ${id} and user_id = ${me.id}`
  if (!row) return fail('Pesanan parkir tidak ditemukan')
  await sql`delete from held_orders where id = ${id} and user_id = ${me.id}`
  done()
  const items = (row.items as { productId: string; qty: number; note?: string }[]).map((i) => ({
    productId: i.productId,
    qty: i.qty,
    note: i.note ?? '',
  }))
  return { ok: true, items, customerId: row.customer_id }
}

export async function deleteHeldOrder(id: string): Promise<Result> {
  const me = await actionGuard('kasir')
  if (!me) return fail('Silakan masuk dulu')
  const [row] = await sql`delete from held_orders where id = ${id} and user_id = ${me.id} returning id`
  if (!row) return fail('Pesanan parkir tidak ditemukan')
  done()
  return { ok: true }
}

export async function stockOpname(
  entries: { productId: string; counted: number }[],
  note: string,
): Promise<Result<{ changed: number; plus: number; minus: number }>> {
  if (!entries.length) return fail('Tidak ada produk untuk diopname')
  for (const e of entries) {
    if (!Number.isInteger(e.counted) || e.counted < 0) return fail('Hasil hitung harus angka bulat ≥ 0')
  }
  if (!(await actionGuard('owner'))) return fail('Aksi ini khusus owner')
  try {
    const result = await sql.begin(async (tx) => {
      let changed = 0
      let plus = 0
      let minus = 0
      const label = note.trim() ? `Opname — ${note.trim()}` : 'Opname stok'
      for (const e of entries) {
        const [p] = await tx`select id, stock from products where id = ${e.productId} for update`
        if (!p) throw new Error('Produk tidak ditemukan')
        const delta = e.counted - p.stock
        if (delta === 0) continue
        await tx`update products set stock = ${e.counted} where id = ${p.id}`
        await tx`
          insert into stock_moves (product_id, type, qty, note)
          values (${p.id}, 'adjust', ${delta}, ${label})`
        changed++
        if (delta > 0) plus += delta
        else minus += -delta
      }
      return { changed, plus, minus }
    })
    done()
    return { ok: true, ...result }
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Gagal menyimpan opname')
  }
}

export async function addPurchase(
  items: { productId: string; qty: number; unitCost: number }[],
  supplier: string,
  recordExpense: boolean,
): Promise<Result<{ total: number }>> {
  if (!(await actionGuard('owner'))) return fail('Aksi ini khusus owner')
  if (!items.length) return fail('Tambahkan minimal satu barang')
  for (const i of items) {
    if (!Number.isInteger(i.qty) || i.qty < 1 || i.qty > 100000) return fail('Jumlah harus bilangan bulat ≥ 1')
    if (!Number.isFinite(i.unitCost) || i.unitCost < 0) return fail('Harga beli tidak valid')
  }
  const sup = supplier.trim().slice(0, 80)
  try {
    const total = await sql.begin(async (tx) => {
      let sum = 0
      for (const i of items) {
        const [p] = await tx`select id, name, stock, cost from products where id = ${i.productId} for update`
        if (!p) throw new Error('Produk tidak ditemukan')

        // Produk beresep: HPP dihitung dari bahan (saveRecipe), jangan ditimpa harga beli.
        const [rc] = await tx`select count(*)::int as n from recipes where product_id = ${p.id}`
        const newCost =
          rc.n > 0
            ? Number(p.cost)
            : p.stock > 0
              ? Math.round((p.stock * Number(p.cost) + i.qty * i.unitCost) / (p.stock + i.qty))
              : i.unitCost

        await tx`update products set stock = stock + ${i.qty}, cost = ${newCost} where id = ${p.id}`
        await tx`
          insert into stock_moves (product_id, type, qty, note)
          values (${p.id}, 'in', ${i.qty}, ${'Pembelian' + (sup ? ' — ' + sup : '')})`
        sum += i.qty * i.unitCost
      }
      if (recordExpense && sum > 0) {
        await tx`
          insert into cash_entries (type, amount, category, note)
          values ('expense', ${sum}, 'Pembelian stok', ${sup || 'Pembelian barang'})`
      }
      return sum
    })
    done()
    return { ok: true, total }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Gagal menyimpan pembelian')
  }
}