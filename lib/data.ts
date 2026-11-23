import sql from './db'
import { parseNav } from './nav'
import { APPEARANCE_DEFAULT } from './appearance'
import type { CashEntry, Customer, CustomerPayment, DayPoint, HeldOrder, Ingredient, PayMethod, Product, ProductStat, RecipeRow, Sale, Shift, StockMove, StoreSettings, TeamMember } from './types'

const n = (v: unknown) => Number(v)

export async function getProducts(): Promise<Product[]> {
  const rows = await sql`
    select p.*, coalesce(s.q, 0)::int as sold30
    from products p
    left join (
      select si.product_id, sum(si.qty) as q
      from sale_items si join sales sa on sa.id = si.sale_id
      where sa.voided_at is null and sa.created_at >= date_trunc('day', now()) - interval '29 days'
      group by si.product_id
    ) s on s.product_id = p.id
    where p.is_active
    order by p.pinned desc, sold30 desc, p.name`
  return rows.map((r) => ({
    id: r.id,
    sku: r.sku,
    name: r.name,
    category: r.category,
    price: n(r.price),
    cost: n(r.cost),
    overhead: n(r.overhead),
    stock: r.stock,
    unit: r.unit,
    min_stock: r.min_stock,
    is_active: r.is_active,
    pinned: r.pinned,
    sold30: r.sold30,
    image_url: r.image_url ?? '',
  }))
}

export async function getLowStock(): Promise<Product[]> {
  return (await getProducts()).filter((p) => p.stock <= p.min_stock)
}

const SETTINGS_DEFAULT: StoreSettings = {
  store_name: 'KasirKu',
  store_address: '',
  store_phone: '',
  receipt_footer: 'Terima kasih, selamat menikmati!',
  daily_target: 0,
  supplier_phone: '',
  stamp_per: 20000,
  stamp_goal: 10,
  stamp_reward: 'Gratis Es Teh Manis',
  ui_font: APPEARANCE_DEFAULT.font,
  ui_accent: APPEARANCE_DEFAULT.accent,
  ui_density: APPEARANCE_DEFAULT.density,
  nav: [],
  promo_enabled: false,
  promo_start: '14:00',
  promo_end: '17:00',
  promo_persen: 10,
}

export async function getSettings(): Promise<StoreSettings> {
  const rows = await sql`select key, value from settings`
  const map = new Map(rows.map((r) => [r.key, r.value]))
  return {
    store_name: map.get('store_name') || SETTINGS_DEFAULT.store_name,
    store_address: map.get('store_address') ?? '',
    store_phone: map.get('store_phone') ?? '',
    receipt_footer: map.get('receipt_footer') || SETTINGS_DEFAULT.receipt_footer,
    daily_target: Number(map.get('daily_target') ?? 0) || 0,
    supplier_phone: map.get('supplier_phone') ?? '',
    stamp_per: Number(map.get('stamp_per') ?? SETTINGS_DEFAULT.stamp_per) || 0,
    stamp_goal: Number(map.get('stamp_goal') ?? SETTINGS_DEFAULT.stamp_goal) || SETTINGS_DEFAULT.stamp_goal,
    stamp_reward: map.get('stamp_reward') || SETTINGS_DEFAULT.stamp_reward,
    ui_font: map.get('ui_font') || SETTINGS_DEFAULT.ui_font,
    ui_accent: map.get('ui_accent') || SETTINGS_DEFAULT.ui_accent,
    ui_density: map.get('ui_density') === 'compact' ? 'compact' : 'comfortable',
    nav: parseNav(map.get('nav_config')),
    promo_enabled: map.get('promo_enabled') === '1',
    promo_start: map.get('promo_start') || SETTINGS_DEFAULT.promo_start,
    promo_end: map.get('promo_end') || SETTINGS_DEFAULT.promo_end,
    promo_persen: Number(map.get('promo_persen') ?? SETTINGS_DEFAULT.promo_persen) || SETTINGS_DEFAULT.promo_persen,
  }
}

export async function getHeldOrders(userId: string): Promise<HeldOrder[]> {
  const rows = await sql`
    select h.id, h.label, h.items, h.customer_id, h.created_at,
      coalesce(t.total, 0) as total, coalesce(t.n, 0)::int as item_count
    from held_orders h
    left join lateral (
      select sum(p.price * (it->>'qty')::int) as total, sum((it->>'qty')::int) as n
      from jsonb_array_elements(h.items) it
      join products p on p.id = (it->>'productId')::uuid
    ) t on true
    where h.user_id = ${userId}
    order by h.created_at desc`
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    items: (r.items as { productId: string; qty: number; note?: string }[]).map((i) => ({
      productId: i.productId,
      qty: i.qty,
      note: i.note ?? '',
    })),
    customerId: r.customer_id,
    createdAt: r.created_at.toISOString(),
    itemCount: r.item_count,
    total: n(r.total),
  }))
}

export async function getTodayRevenue(): Promise<number> {
  const [t] = await sql`
    select coalesce(sum(total), 0) as revenue from sales
    where created_at >= date_trunc('day', now()) and voided_at is null`
  return n(t.revenue)
}

export async function getIngredients(): Promise<Ingredient[]> {
  const rows = await sql`select * from ingredients order by name`
  return rows.map((r) => ({ id: r.id, name: r.name, unit: r.unit, cost_per_unit: n(r.cost_per_unit) }))
}

export async function getRecipe(productId: string): Promise<RecipeRow[]> {
  const rows = await sql`
    select r.ingredient_id, i.name, i.unit, i.cost_per_unit, r.quantity
    from recipes r join ingredients i on i.id = r.ingredient_id
    where r.product_id = ${productId}
    order by i.name`
  return rows.map((r) => ({
    ingredient_id: r.ingredient_id,
    name: r.name,
    unit: r.unit,
    cost_per_unit: n(r.cost_per_unit),
    quantity: n(r.quantity),
  }))
}

export async function getSales(limit?: number, query?: string): Promise<Sale[]> {
  const q = (query ?? '').trim()
  const sales = q
    ? await sql`select s.*, c.name as customer_name from sales s left join customers c on c.id = s.customer_id where s.receipt_no ilike ${'%' + q + '%'} order by s.created_at desc limit ${limit ?? 300}`
    : limit
      ? await sql`select s.*, c.name as customer_name from sales s left join customers c on c.id = s.customer_id order by s.created_at desc limit ${limit}`
      : await sql`select s.*, c.name as customer_name from sales s left join customers c on c.id = s.customer_id order by s.created_at desc`
  const items = await sql`select * from sale_items`
  return sales.map((s) => ({
    id: s.id,
    receipt_no: s.receipt_no,
    total: n(s.total),
    discount: n(s.discount),
    paid: n(s.paid),
    change: n(s.change),
    payment_method: s.payment_method as PayMethod,
    voided_at: s.voided_at ? s.voided_at.toISOString() : null,
    voided_by: s.voided_by,
    customer_id: s.customer_id,
    customer_name: s.customer_name,
    created_at: s.created_at.toISOString(),
    items: items
      .filter((i) => i.sale_id === s.id)
      .map((i) => ({ name: i.name, qty: i.qty, price: n(i.price), cost: n(i.cost), note: i.note ?? '' })),
  }))
}

export async function getCashEntries(): Promise<CashEntry[]> {
  const rows = await sql`select * from cash_entries order by created_at desc`
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    amount: n(r.amount),
    category: r.category,
    note: r.note,
    sale_id: r.sale_id,
    created_at: r.created_at.toISOString(),
  }))
}

export async function getMoves(productId: string): Promise<StockMove[]> {
  const rows = await sql`
    select * from stock_moves where product_id = ${productId}
    order by created_at desc limit 15`
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    qty: r.qty,
    note: r.note,
    created_at: r.created_at.toISOString(),
  }))
}

export async function getOpenShift(userId: string): Promise<Shift | null> {
  const [s] = await sql`
    select * from shifts where user_id = ${userId} and closed_at is null
    order by opened_at desc limit 1`
  if (!s) return null
  const [t] = await sql`
    select coalesce(sum(total), 0) as total,
      coalesce(sum(total) filter (where payment_method = 'tunai'), 0) as cash,
      coalesce(sum(total) filter (where payment_method <> 'tunai'), 0) as noncash
    from sales where shift_id = ${s.id} and voided_at is null`
  return mapShift(s, n(t.total), n(t.cash), n(t.noncash))
}

export async function getShifts(limit = 10): Promise<Shift[]> {
  const rows = await sql`select * from shifts order by opened_at desc limit ${limit}`
  const totals = await sql`
    select shift_id, coalesce(sum(total), 0) as total,
      coalesce(sum(total) filter (where payment_method = 'tunai'), 0) as cash,
      coalesce(sum(total) filter (where payment_method <> 'tunai'), 0) as noncash
    from sales where voided_at is null group by shift_id`
  return rows.map((s) => {
    const t = totals.find((x) => x.shift_id === s.id)
    return mapShift(s, n(t?.total ?? 0), n(t?.cash ?? 0), n(t?.noncash ?? 0))
  })
}

function mapShift(s: Record<string, any>, salesTotal: number, salesCash: number, salesNoncash: number): Shift {
  return {
    id: s.id,
    user_email: s.user_email,
    opening_cash: n(s.opening_cash),
    expected_cash: s.expected_cash === null ? null : n(s.expected_cash),
    counted_cash: s.counted_cash === null ? null : n(s.counted_cash),
    difference: s.difference === null ? null : n(s.difference),
    note: s.note,
    opened_at: s.opened_at.toISOString(),
    closed_at: s.closed_at ? s.closed_at.toISOString() : null,
    sales_total: salesTotal,
    sales_cash: salesCash,
    sales_noncash: salesNoncash,
  }
}

export async function getAnalytics(): Promise<{ daily: DayPoint[]; products: ProductStat[]; methods: { method: PayMethod; total: number; count: number }[] }> {
  const daily = await sql`
    select to_char(d.day, 'YYYY-MM-DD') as day,
      coalesce(sum(s.total), 0) as revenue, count(s.id)::int as count
    from generate_series(
      date_trunc('day', now()) - interval '29 days',
      date_trunc('day', now()), interval '1 day'
    ) as d(day)
    left join sales s on s.created_at >= d.day and s.created_at < d.day + interval '1 day' and s.voided_at is null
    group by d.day order by d.day`
  const products = await sql`
    select p.id, p.name, p.price, p.cost,
      coalesce(sum(si.qty), 0)::int as qty,
      coalesce(sum(si.price * si.qty), 0) as revenue,
      coalesce(sum((si.price - si.cost) * si.qty), 0) as profit
    from products p
    left join sale_items si on si.product_id = p.id
    left join sales s on s.id = si.sale_id and s.voided_at is null
    where s.id is not null or si.id is null
    group by p.id order by revenue desc`
  const methods = await sql`
    select payment_method as method, coalesce(sum(total), 0) as total, count(*)::int as count
    from sales where voided_at is null and created_at >= date_trunc('day', now()) - interval '29 days'
    group by payment_method order by total desc`
  return {
    daily: daily.map((r) => ({ day: r.day, revenue: n(r.revenue), count: r.count })),
    products: products.map((r) => ({
      id: r.id, name: r.name, price: n(r.price), cost: n(r.cost),
      qty: r.qty, revenue: n(r.revenue), profit: n(r.profit),
    })),
    methods: methods.map((r) => ({ method: r.method as PayMethod, total: n(r.total), count: r.count })),
  }
}

export async function getBusyHours(): Promise<{ matrix: number[][]; max: number; peak: { dow: number; hour: number; count: number } | null }> {
  const rows = await sql`
    select extract(dow from created_at at time zone 'Asia/Jakarta')::int as dow,
      extract(hour from created_at at time zone 'Asia/Jakarta')::int as hour,
      count(*)::int as count
    from sales
    where voided_at is null and created_at >= date_trunc('day', now()) - interval '29 days'
    group by 1, 2`
  const matrix = Array.from({ length: 7 }, () => Array(24).fill(0))
  let max = 0
  let peak: { dow: number; hour: number; count: number } | null = null
  for (const r of rows) {
    matrix[r.dow][r.hour] = r.count
    if (r.count > max) max = r.count
    if (!peak || r.count > peak.count) peak = { dow: r.dow, hour: r.hour, count: r.count }
  }
  return { matrix, max, peak }
}

export async function getStats() {
  const [today] = await sql`
    select coalesce(sum(total), 0) as revenue, count(*)::int as count
    from sales where created_at >= date_trunc('day', now()) and voided_at is null`
  const [month] = await sql`
    select
      coalesce(sum(amount) filter (where type = 'income'), 0) as income,
      coalesce(sum(amount) filter (where type = 'expense'), 0) as expense
    from cash_entries where created_at >= date_trunc('month', now())`
  const [hpp] = await sql`
    select coalesce(sum(si.cost * si.qty), 0) as hpp, coalesce(sum(si.price * si.qty), 0) as revenue
    from sale_items si join sales s on s.id = si.sale_id
    where s.created_at >= date_trunc('month', now()) and s.voided_at is null`
  const low = await getProducts()
  return {
    todayRevenue: n(today.revenue),
    todayCount: today.count,
    monthIncome: n(month.income),
    monthExpense: n(month.expense),
    monthHpp: n(hpp.hpp),
    monthRevenue: n(hpp.revenue),
    lowStock: low.filter((p) => p.stock <= p.min_stock),
    recentSales: await getSales(5),
  }
}

export async function getCustomers(): Promise<Customer[]> {
  const rows = await sql`
    select c.*, coalesce(k.t, 0) as kasbon_total, coalesce(p.t, 0) as paid_total
    from customers c
    left join (select customer_id, sum(total) as t from sales where payment_method = 'kasbon' and voided_at is null group by customer_id) k on k.customer_id = c.id
    left join (select customer_id, sum(amount) as t from customer_payments group by customer_id) p on p.customer_id = c.id
    order by c.name`
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    note: r.note,
    created_at: r.created_at.toISOString(),
    kasbon_total: n(r.kasbon_total),
    paid_total: n(r.paid_total),
    debt: n(r.kasbon_total) - n(r.paid_total),
    stamps: r.stamps ?? 0,
    stamps_total: r.stamps_total ?? 0,
    stamps_redeemed: r.stamps_redeemed ?? 0,
  }))
}

export async function getCustomerDetail(id: string): Promise<{ customer: Customer; sales: Sale[]; payments: CustomerPayment[] } | null> {
  const all = await getCustomers()
  const customer = all.find((c) => c.id === id)
  if (!customer) return null
  const sales = (await getSales()).filter((s) => s.customer_id === id)
  const pays = await sql`select * from customer_payments where customer_id = ${id} order by created_at desc`
  return {
    customer,
    sales,
    payments: pays.map((r) => ({
      id: r.id,
      customer_id: r.customer_id,
      amount: n(r.amount),
      method: r.method,
      note: r.note,
      created_at: r.created_at.toISOString(),
    })),
  }
}

export interface DailyReport {
  day: string
  count: number
  revenue: number
  prevRevenue: number
  methods: { method: PayMethod; total: number; count: number }[]
  topProducts: { name: string; qty: number; revenue: number }[]
  grossProfit: number
  voidCount: number
  voidTotal: number
  income: number
  expense: number
  expenseByCategory: { category: string; total: number }[]
  shifts: Shift[]
  kasbonBaru: number
  pelunasan: number
}

export async function getDailyReport(day: string): Promise<DailyReport> {
  const sales = await sql`
    select * from sales
    where created_at >= ${day}::date and created_at < ${day}::date + 1 and voided_at is null`
  const items = await sql`
    select si.name, si.qty, si.price, si.cost from sale_items si
    join sales s on s.id = si.sale_id
    where s.created_at >= ${day}::date and s.created_at < ${day}::date + 1 and s.voided_at is null`
  const [vd] = await sql`
    select count(*)::int as c, coalesce(sum(total), 0) as t from sales
    where voided_at >= ${day}::date and voided_at < ${day}::date + 1`
  const cash = await sql`
    select type, category, amount from cash_entries
    where created_at >= ${day}::date and created_at < ${day}::date + 1`
  const [prev] = await sql`
    select coalesce(sum(total), 0) as t from sales
    where created_at >= ${day}::date - 1 and created_at < ${day}::date and voided_at is null`
  const [pel] = await sql`
    select coalesce(sum(amount), 0) as t from customer_payments
    where created_at >= ${day}::date and created_at < ${day}::date + 1`

  const methodMap = new Map<PayMethod, { total: number; count: number }>()
  let revenue = 0
  let kasbonBaru = 0
  for (const s of sales) {
    const t = n(s.total)
    revenue += t
    if (s.payment_method === 'kasbon') kasbonBaru += t
    const m = methodMap.get(s.payment_method) ?? { total: 0, count: 0 }
    m.total += t
    m.count += 1
    methodMap.set(s.payment_method, m)
  }
  const prodMap = new Map<string, { qty: number; revenue: number }>()
  let grossProfit = 0
  for (const i of items) {
    const p = prodMap.get(i.name) ?? { qty: 0, revenue: 0 }
    p.qty += i.qty
    p.revenue += n(i.price) * i.qty
    prodMap.set(i.name, p)
    grossProfit += (n(i.price) - n(i.cost)) * i.qty
  }
  const expMap = new Map<string, number>()
  let income = 0
  let expense = 0
  for (const c of cash) {
    if (c.type === 'income') income += n(c.amount)
    else {
      expense += n(c.amount)
      expMap.set(c.category, (expMap.get(c.category) ?? 0) + n(c.amount))
    }
  }
  const shifts = (await getShifts(90)).filter(
    (sh) => sh.opened_at.slice(0, 10) === day || (sh.closed_at ?? '').slice(0, 10) === day,
  )
  return {
    day,
    count: sales.length,
    revenue,
    prevRevenue: n(prev.t),
    methods: Array.from(methodMap.entries()).map(([method, v]) => ({ method, ...v })).sort((a, b) => b.total - a.total),
    topProducts: Array.from(prodMap.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.qty - a.qty).slice(0, 5),
    grossProfit,
    voidCount: vd.c,
    voidTotal: n(vd.t),
    income,
    expense,
    expenseByCategory: Array.from(expMap.entries()).map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total),
    shifts,
    kasbonBaru,
    pelunasan: n(pel.t),
  }
}

export async function getTeam(): Promise<TeamMember[]> {
  const rows = await sql`
    select r.user_id, r.email, r.role, r.status, r.created_at, u.name,
      coalesce(s.cnt, 0)::int as sales_count, coalesce(s.rev, 0) as revenue, coalesce(d.diff, 0) as shift_diff
    from app_roles r
    left join neon_auth."user" u on u.id::text = r.user_id
    left join (
      select sh.user_id, count(s.id) as cnt, sum(s.total) as rev
      from shifts sh left join sales s on s.shift_id = sh.id and s.voided_at is null
      group by sh.user_id
    ) s on s.user_id = r.user_id
    left join (
      select user_id, sum(difference) as diff from shifts where closed_at is not null group by user_id
    ) d on d.user_id = r.user_id
    order by r.created_at`
  return rows.map((r) => ({
    user_id: r.user_id,
    email: r.email,
    name: r.name ?? r.email,
    role: r.role,
    status: r.status,
    joined_at: r.created_at.toISOString(),
    sales_count: r.sales_count,
    revenue: n(r.revenue),
    shift_diff: n(r.shift_diff),
  }))
}