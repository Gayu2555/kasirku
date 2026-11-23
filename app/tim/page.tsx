import { requireOwner } from '@/lib/auth/server'
import { getTeam } from '@/lib/data'
import TeamClient from '@/components/TeamClient'

export const dynamic = 'force-dynamic'

export default async function TimPage() {
  const me = await requireOwner()
  const members = await getTeam()
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tim</h1>
          <p className="muted">Setujui pendaftar, atur peran owner/kasir, nonaktifkan akun</p>
        </div>
      </div>
      <TeamClient members={members} meId={me.id} />
    </>
  )
}