import { Fragment } from 'react'
import type { DayPoint, ProductStat } from '@/lib/types'
import { rupiah } from '@/lib/format'

export function DailyChart({ data }: { data: DayPoint[] }) {
  const max = Math.max(...data.map((d) => d.revenue), 1)
  const W = 600
  const H = 190
  const bw = W / data.length
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Grafik penjualan 30 hari">
      {data.map((d, i) => {
        const h = (d.revenue / max) * 150
        return (
          <g key={d.day}>
            <rect
              x={i * bw + 1.5}
              y={160 - h}
              width={bw - 3}
              height={Math.max(h, 1)}
              rx={2}
              fill="var(--solid)"
              opacity={0.85}
            >
              <title>{`${d.day}: ${rupiah(d.revenue)} (${d.count} transaksi)`}</title>
            </rect>
            {i % 5 === 0 && (
              <text x={i * bw + bw / 2} y={178} fontSize={9} textAnchor="middle" fill="var(--muted)">
                {d.day.slice(8)}/{d.day.slice(5, 7)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export function ProfitBars({ products }: { products: ProductStat[] }) {
  const max = Math.max(...products.map((p) => p.profit), 1)
  return (
    <div>
      {products.map((p) => (
        <div className="hbar" key={p.id}>
          <span className="hbar-label">{p.name}</span>
          <div className="hbar-track">
            <div className="hbar-fill" style={{ width: `${Math.max((p.profit / max) * 100, 1)}%` }} />
          </div>
          <span className="hbar-value">{rupiah(p.profit)}</span>
        </div>
      ))}
    </div>
  )
}

const DOW_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
const DOW_FULL = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const ROW_ORDER = [1, 2, 3, 4, 5, 6, 0]

export function BusyHeatmap({ matrix, max, peak }: { matrix: number[][]; max: number; peak: { dow: number; hour: number; count: number } | null }) {
  const hours = Array.from({ length: 24 }, (_, h) => h)
  return (
    <div>
      <div className="heatmap-scroll">
        <div className="heatmap">
          <span className="hm-corner" />
          {hours.map((h) => (
            <span key={`h${h}`} className="hm-hour">{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</span>
          ))}
          {ROW_ORDER.map((dow) => (
            <Fragment key={dow}>
              <span className="hm-day">{DOW_SHORT[dow]}</span>
              {hours.map((h) => {
                const count = matrix[dow]?.[h] ?? 0
                const alpha = max > 0 ? 0.15 + 0.85 * (count / max) : 0
                return (
                  <span
                    key={`${dow}-${h}`}
                    className="hm-cell"
                    style={{ background: count > 0 ? `rgba(122,155,109,${alpha.toFixed(2)})` : 'var(--line)' }}
                    title={`${DOW_FULL[dow]} ${String(h).padStart(2, '0')}:00 — ${count} transaksi`}
                  />
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>
      <div className="hm-legend">
        <span className="muted">Sepi</span>
        <span className="hm-scale" />
        <span className="muted">Ramai</span>
        <span className="muted" style={{ marginLeft: 'auto' }}>
          {peak ? `Paling ramai: ${DOW_FULL[peak.dow]} ${String(peak.hour).padStart(2, '0')}:00 (${peak.count} transaksi)` : 'Belum ada data penjualan.'}
        </span>
      </div>
    </div>
  )
}