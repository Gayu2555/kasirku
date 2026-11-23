'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setMemberRole, setMemberStatus } from '@/lib/actions'
import { rupiah, tanggal } from '@/lib/format'
import type { TeamMember } from '@/lib/types'

const STATUS_LABEL = { pending: 'Menunggu', aktif: 'Aktif', nonaktif: 'Nonaktif' } as const
const STATUS_BADGE = { pending: 'auto', aktif: 'ok', nonaktif: 'low' } as const

export default function TeamClient({ members, meId }: { members: TeamMember[]; meId: string }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')

  const run = async (id: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusyId(id)
    setError('')
    const res = await fn()
    setBusyId('')
    if (res.ok) router.refresh()
    else setError(res.error || 'Gagal')
  }

  const pending = members.filter((m) => m.status === 'pending')

  return (
    <>
      {pending.length > 0 && (
        <div className="card" style={{ marginBottom: 12, borderLeft: '4px solid var(--amber, #d9a441)' }}>
          <strong>{pending.length} pendaftaran menunggu persetujuan:</strong>{' '}
          {pending.map((m) => m.email).join(', ')}
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Anggota</th>
              <th>Peran</th>
              <th>Status</th>
              <th className="num">Transaksi</th>
              <th className="num">Omzet</th>
              <th className="num">Selisih shift</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const self = m.user_id === meId
              const busy = busyId === m.user_id
              return (
                <tr key={m.user_id}>
                  <td>
                    <div style={{ color: 'var(--ink)', fontWeight: 600 }}>{m.name || m.email.split('@')[0]}{self && ' (kamu)'}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{m.email} · gabung {tanggal(m.joined_at)}</div>
                  </td>
                  <td><span className="badge auto">{m.role === 'owner' ? 'Owner' : 'Kasir'}</span></td>
                  <td><span className={`badge ${STATUS_BADGE[m.status]}`}>{STATUS_LABEL[m.status]}</span></td>
                  <td className="num">{m.sales_count}</td>
                  <td className="num">{rupiah(m.revenue)}</td>
                  <td className="num" style={m.shift_diff !== 0 ? { color: 'var(--red, #b3402e)', fontWeight: 600 } : undefined}>
                    {rupiah(m.shift_diff)}
                  </td>
                  <td>
                    {self ? (
                      <span className="muted" style={{ fontSize: 12 }}>—</span>
                    ) : (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {m.status === 'pending' && (
                          <>
                            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(m.user_id, () => setMemberStatus(m.user_id, 'aktif'))}>
                              Setujui
                            </button>
                            <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => run(m.user_id, () => setMemberStatus(m.user_id, 'nonaktif'))}>
                              Tolak
                            </button>
                          </>
                        )}
                        {m.status === 'aktif' && (
                          <>
                            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(m.user_id, () => setMemberRole(m.user_id, m.role === 'owner' ? 'kasir' : 'owner'))}>
                              {m.role === 'owner' ? 'Jadikan kasir' : 'Jadikan owner'}
                            </button>
                            <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => run(m.user_id, () => setMemberStatus(m.user_id, 'nonaktif'))}>
                              Nonaktifkan
                            </button>
                          </>
                        )}
                        {m.status === 'nonaktif' && (
                          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(m.user_id, () => setMemberStatus(m.user_id, 'aktif'))}>
                            Aktifkan lagi
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="muted">
        Pendaftar baru berstatus “Menunggu” sampai owner menyetujui. Akun nonaktif tidak bisa masuk maupun bertransaksi.
        Minimal harus ada satu owner aktif.
      </p>
    </>
  )
}