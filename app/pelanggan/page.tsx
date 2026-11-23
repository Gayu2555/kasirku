import { getCustomers, getSettings } from '@/lib/data'
import CustomersClient from '@/components/CustomersClient'
import { requireOwner } from '@/lib/auth/server'

export const dynamic = 'force-dynamic'

export default async function PelangganPage() {
  await requireOwner()
  const customers = await getCustomers()
  const settings = await getSettings()
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pelanggan</h1>
          <p className="muted">Kasbon, pelunasan, stamp loyalitas, dan pengingat WhatsApp</p>
        </div>
      </div>
      <CustomersClient customers={customers} settings={settings} />
    </>
  )
}