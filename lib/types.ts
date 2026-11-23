export interface Product {
  id: string
  sku: string | null
  name: string
  category: string
  price: number
  cost: number
  overhead: number
  stock: number
  unit: string
  min_stock: number
  is_active: boolean
  pinned: boolean
  sold30: number
  image_url: string
}

export interface Ingredient {
  id: string
  name: string
  unit: string
  cost_per_unit: number
}

export interface RecipeRow {
  ingredient_id: string
  name: string
  unit: string
  cost_per_unit: number
  quantity: number
}

export type PayMethod = 'tunai' | 'qris' | 'transfer' | 'kasbon'

export type RoleStatus = 'pending' | 'aktif' | 'nonaktif'

export interface SaleItem {
  name: string
  qty: number
  price: number
  cost: number
  note: string
}

export interface Sale {
  id: string
  receipt_no: string
  total: number
  discount: number
  paid: number
  change: number
  payment_method: PayMethod
  voided_at: string | null
  voided_by: string | null
  customer_id: string | null
  customer_name: string | null
  created_at: string
  items: SaleItem[]
}

export interface CashEntry {
  id: string
  type: 'income' | 'expense'
  amount: number
  category: string
  note: string
  sale_id: string | null
  created_at: string
}

export interface StockMove {
  id: string
  type: string
  qty: number
  note: string
  created_at: string
}

export interface Receipt {
  receipt_no: string
  total: number
  discount: number
  paid: number
  change: number
  payment_method: PayMethod
  customer_name: string | null
  created_at: string
  items: SaleItem[]
  stamps_earned: number
  customer_stamps: number | null
  promo: boolean
}

export interface HeldOrder {
  id: string
  label: string
  items: { productId: string; qty: number; note: string }[]
  customerId: string | null
  createdAt: string
  itemCount: number
  total: number
}

export interface Customer {
  id: string
  name: string
  phone: string
  note: string
  created_at: string
  kasbon_total: number
  paid_total: number
  debt: number
  stamps: number
  stamps_total: number
  stamps_redeemed: number
}

export interface CustomerPayment {
  id: string
  customer_id: string
  amount: number
  method: 'tunai' | 'qris' | 'transfer'
  note: string
  created_at: string
}

export interface TeamMember {
  user_id: string
  email: string
  name: string
  role: 'owner' | 'kasir'
  status: RoleStatus
  joined_at: string
  sales_count: number
  revenue: number
  shift_diff: number
}

export interface Shift {
  id: string
  user_email: string
  opening_cash: number
  expected_cash: number | null
  counted_cash: number | null
  difference: number | null
  note: string
  opened_at: string
  closed_at: string | null
  sales_total: number
  sales_cash: number
  sales_noncash: number
}

export interface DayPoint {
  day: string
  revenue: number
  count: number
}

export interface NavPref {
  href: string
  on: boolean
}

export interface StoreSettings {
  store_name: string
  store_address: string
  store_phone: string
  receipt_footer: string
  daily_target: number
  supplier_phone: string
  stamp_per: number
  stamp_goal: number
  stamp_reward: string
  ui_font: string
  ui_accent: string
  ui_density: 'comfortable' | 'compact'
  nav: NavPref[]
  promo_enabled: boolean
  promo_start: string
  promo_end: string
  promo_persen: number
}

export interface ProductStat {
  id: string
  name: string
  price: number
  cost: number
  qty: number
  revenue: number
  profit: number
}