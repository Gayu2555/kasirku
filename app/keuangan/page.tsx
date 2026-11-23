import { getCashEntries, getProducts, getSales } from '@/lib/data'
import FinanceClient from '@/components/FinanceClient'
import PurchaseForm from '@/components/PurchaseForm'
import { requireOwner } from '@/lib/auth/server'

export const dynamic = 'force-dynamic'

export default async function KeuanganPage() {
  await requireOwner()
  const [entries, sales, products] = await Promise.all([getCashEntries(), getSales(), getProducts()])
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Keuangan</h1>
          <p className="muted">Pencatatan pendapatan & pengeluaran, plus laporan laba</p>
        </div>
      </div>
      <PurchaseForm products={products} />
      <FinanceClient entries={entries} sales={sales} />
    </>
  )
}