import { redirect } from 'next/navigation'
import { ensureRoleRow, getSessionUser } from '@/lib/auth/server'
import MasukClient from '@/components/MasukClient'

export const dynamic = 'force-dynamic'

export default async function MasukPage() {
  const user = await getSessionUser()
  if (user) {
    const { status } = await ensureRoleRow(user)
    if (status === 'aktif') redirect('/')
    const notice =
      status === 'nonaktif'
        ? 'Akun kamu dinonaktifkan oleh owner. Hubungi owner untuk mengaktifkan kembali.'
        : 'Pendaftaran kamu menunggu persetujuan owner. Kamu bisa masuk setelah akun disetujui di menu Tim.'
    return <MasukClient loggedIn notice={notice} />
  }
  return <MasukClient />
}