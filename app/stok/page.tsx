import { getProducts } from '@/lib/data'
import StockClient from '@/components/StockClient'
import { requireOwner } from '@/lib/auth/server'

export const dynamic = 'force-dynamic'

export default async function StokPage() {
  await requireOwner()
  const products = await getProducts()
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Manajemen Stok</h1>
          <p className="muted">Kelola produk, harga, dan jumlah stok</p>
        </div>
      </div>
      <StockClient products={products} />
    </>
  )
}