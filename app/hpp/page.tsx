import { getIngredients, getProducts } from '@/lib/data'
import HppClient from '@/components/HppClient'
import { requireOwner } from '@/lib/auth/server'

export const dynamic = 'force-dynamic'

export default async function HppPage() {
  await requireOwner()
  const [products, ingredients] = await Promise.all([getProducts(), getIngredients()])
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Kalkulator HPP</h1>
          <p className="muted">Hitung harga pokok penjualan dari resep bahan, lalu tentukan margin & harga jual</p>
        </div>
      </div>
      <HppClient products={products} ingredients={ingredients} />
    </>
  )
}