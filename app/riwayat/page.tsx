import { requireOwner } from '@/lib/auth/server'
import { getSales } from '@/lib/data'
import HistoryClient from '@/components/HistoryClient'

export const dynamic = 'force-dynamic'

export default async function RiwayatPage() {
  await requireOwner()
  const sales = await getSales(300)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Riwayat transaksi</h1>
          <p className="muted">Cari struk, lihat detail, void bila salah input</p>
        </div>
      </div>
      <HistoryClient sales={sales} />
    </>
  )
}