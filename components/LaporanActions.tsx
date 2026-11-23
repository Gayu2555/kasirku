'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LaporanActions({ day, waText }: { day: string; waText: string }) {
  const router = useRouter()
  const [pick, setPick] = useState(day)

  return (
    <div className="chips no-print" style={{ marginBottom: 12 }}>
      <input
        className="input"
        type="date"
        style={{ width: 170 }}
        value={pick}
        onChange={(e) => setPick(e.target.value)}
      />
      <button className="btn btn-ghost btn-sm" onClick={() => router.push(`/laporan?t=${pick}`)}>
        Lihat tanggal
      </button>
      <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
        Cetak laporan
      </button>
      <a
        className="btn btn-ghost btn-sm"
        href={`https://wa.me/?text=${encodeURIComponent(waText)}`}
        target="_blank"
        rel="noreferrer"
      >
        Kirim WA
      </a>
    </div>
  )
}