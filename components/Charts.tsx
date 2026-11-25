import { Fragment } from 'react'
import type { DayPoint, ProductStat } from '@/lib/types'
import type { ChartSpec } from '@/lib/chart'
import { ringkas } from '@/lib/chart'
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

// ————— Grafik dari spesifikasi asisten (token [[chart|{json}]]) —————
// Hanya menggambar dari ChartSpec yang sudah divalidasi ketat; teks dirender React
// (otomatis escape), jadi aman dari injeksi HTML lewat nama produk/pelanggan.

const pendek = (t: string) => (t.length > 9 ? `${t.slice(0, 8)}…` : t)

export function SpecChart({ spec }: { spec: ChartSpec }) {
  const all = spec.series.flatMap((s) => s.values)
  const max = Math.max(...all, 0)
  const min = Math.min(...all, 0)
  const span = max - min
  if (span <= 0) return <p className="muted" style={{ margin: '6px 0' }}>Tidak ada angka untuk digambar.</p>

  const W = 340
  const H = 170
  const PAD = 6
  const TOP = 18 // ruang untuk label angka di atas bar
  const BOT = 24 // ruang untuk label sumbu-x
  const plotH = H - TOP - BOT
  const y = (v: number) => TOP + ((max - v) / span) * plotH

  const n = spec.labels.length
  const s = spec.series.length
  const gw = (W - PAD * 2) / n
  const barW = Math.max(Math.min((gw - 12) / s, 46), 4)
  const showValues = n * s <= 8
  const zeroY = y(0)

  return (
    <div style={{ margin: '8px 0 4px' }}>
      {spec.title && (
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 2 }}>{spec.title}</div>
      )}
      {s > 1 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 4, fontSize: 10.5, color: 'var(--muted)' }}>
          {spec.series.map((ser, k) => (
            <span key={ser.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 2,
                  background: 'var(--solid)',
                  opacity: k === 0 ? 1 : 0.45,
                }}
              />
              {ser.name}
            </span>
          ))}
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="chart"
        role="img"
        aria-label={spec.title || 'Grafik perbandingan'}
      >
        {min < 0 && (
          <line x1={PAD} x2={W - PAD} y1={zeroY} y2={zeroY} stroke="var(--line)" strokeWidth={1} />
        )}
        {spec.labels.map((label, i) => {
          const group = s > 1 ? barW * s + 2 * (s - 1) : barW
          const x0 = PAD + i * gw + (gw - group) / 2
          return (
            <g key={`${label}-${i}`}>
              {spec.series.map((ser, k) => {
                const v = ser.values[i]
                const yv = y(v)
                const top = v >= 0 ? yv : zeroY
                const h = Math.max(Math.abs(zeroY - yv), 1)
                return (
                  <g key={ser.name}>
                    <rect
                      x={x0 + k * (barW + 2)}
                      y={top}
                      width={barW}
                      height={h}
                      rx={2}
                      fill="var(--solid)"
                      opacity={s > 1 ? (k === 0 ? 1 : 0.45) : 0.9}
                    >
                      <title>{`${label} — ${ser.name}: ${v.toLocaleString('id-ID')}`}</title>
                    </rect>
                    {showValues && (
                      <text
                        x={x0 + k * (barW + 2) + barW / 2}
                        y={v >= 0 ? Math.max(yv - 4, 10) : Math.min(yv + 10, H - BOT - 2)}
                        fontSize={8}
                        textAnchor="middle"
                        fill="var(--muted)"
                      >
                        {v.toLocaleString('id-ID').length > 9 ? ringkas(v) : v.toLocaleString('id-ID')}
                      </text>
                    )}
                  </g>
                )
              })}
              <text
                x={PAD + i * gw + gw / 2}
                y={H - 8}
                fontSize={8.5}
                textAnchor="middle"
                fill="var(--muted)"
              >
                {pendek(label)}
                <title>{label}</title>
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}