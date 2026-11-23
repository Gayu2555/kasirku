import { requireOwner } from '@/lib/auth/server'
import { getSettings } from '@/lib/data'
import SettingsClient from '@/components/SettingsClient'

export const dynamic = 'force-dynamic'

export default async function PengaturanPage() {
  await requireOwner()
  const settings = await getSettings()
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pengaturan</h1>
          <p className="muted">Profil toko untuk struk & laporan, target harian, dan kontak supplier</p>
        </div>
      </div>
      <SettingsClient settings={settings} />
    </>
  )
}