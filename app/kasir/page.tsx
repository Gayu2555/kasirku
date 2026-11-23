import { getCustomers, getHeldOrders, getOpenShift, getProducts, getSettings, getTodayRevenue } from '@/lib/data'
import PosClient from '@/components/PosClient'
import { requireUser } from '@/lib/auth/server'

export const dynamic = 'force-dynamic'

export default async function KasirPage() {
  const user = await requireUser()
  const products = await getProducts()
  const openShift = await getOpenShift(user.id)
  const customers = await getCustomers()
  const settings = await getSettings()
  const todayRevenue = await getTodayRevenue()
  const heldOrders = await getHeldOrders(user.id)
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Kasir</h1>
          <p className="muted">Pilih produk, terima pembayaran, stok otomatis berkurang</p>
        </div>
      </div>
      <PosClient products={products} openShift={openShift} customers={customers} settings={settings} todayRevenue={todayRevenue} heldOrders={heldOrders} />
    </>
  )
}