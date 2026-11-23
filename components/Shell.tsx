'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth/client'
import type { Role } from '@/lib/auth/server'
import type { NavPref, Product } from '@/lib/types'
import { NAV_ITEMS } from '@/lib/nav'
import Icon from './Icon'

const RAIL_KEY = 'kk.sidebar.collapsed'

export default function Shell({
  children,
  user,
  lowStock,
  supplierPhone,
  nav,
  storeName,
}: {
  children: React.ReactNode
  user: { email: string; role: Role }
  lowStock: Product[]
  supplierPhone: string
  nav: NavPref[]
  storeName: string
}) {
  const path = usePathname()
  const router = useRouter()
  const [showLow, setShowLow] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Deteksi viewport mobile (drawer overlay) vs desktop (sidebar/rail).
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 960px)')
    const apply = () => setIsMobile(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  // Preferensi rail desktop diingat antar kunjungan.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(RAIL_KEY) === '1')
    } catch {
      /* private mode: abaikan */
    }
  }, [])

  // Tutup drawer & panel stok tiap pindah halaman.
  useEffect(() => {
    setDrawer(false)
    setShowLow(false)
  }, [path])

  // Kembali ke desktop: pastikan drawer tertutup (scroll body tidak terkunci).
  useEffect(() => {
    if (!isMobile) setDrawer(false)
  }, [isMobile])

  // Kunci scroll body saat drawer terbuka.
  useEffect(() => {
    document.body.style.overflow = drawer ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [drawer])

  const toggleSidebar = () => {
    if (isMobile) {
      setDrawer((v) => !v)
    } else {
      setCollapsed((v) => {
        const next = !v
        try {
          localStorage.setItem(RAIL_KEY, next ? '1' : '0')
        } catch {
          /* abaikan */
        }
        return next
      })
    }
  }

  // Ctrl+B buka/tutup sidebar, Esc menutup drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        toggleSidebar()
      } else if (e.key === 'Escape') {
        setDrawer(false)
        setShowLow(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile])

  // Payload RSC lama (pra-auth) bisa datang tanpa prop user; jangan crash.
  const role = user?.role
  const prefs = nav?.length ? nav : NAV_ITEMS.map((i) => ({ href: i.href, on: true }))
  const items = prefs
    .map((p) => ({ on: p.on, item: NAV_ITEMS.find((i) => i.href === p.href) }))
    .filter((x): x is { on: boolean; item: (typeof NAV_ITEMS)[number] } => Boolean(x.item) && x.on && (!x.item!.owner || role === 'owner'))
  const low = lowStock ?? []
  const rail = !isMobile && collapsed

  const active = items.find((x) => x.item.href === path) ?? items.find((x) => x.item.href !== '/' && path.startsWith(x.item.href + '/'))
  const activeLabel = active?.item.label ?? storeName ?? 'KasirKu'

  const waSupplier = `https://wa.me/${(supplierPhone ?? '').replace(/\D/g, '').replace(/^0/, '62')}?text=${encodeURIComponent(
    'Halo, mau pesan bahan:\n' + low.map((p) => `- ${p.name} (sisa ${p.stock} ${p.unit})`).join('\n') + '\nTerima kasih.',
  )}`

  const logout = async () => {
    await authClient.signOut()
    router.push('/masuk')
    router.refresh()
  }

  const onBell = () => {
    if (rail) {
      // Rail terlalu sempit untuk panel: lebarkan dulu, lalu tampilkan.
      setCollapsed(false)
      try {
        localStorage.setItem(RAIL_KEY, '0')
      } catch {
        /* abaikan */
      }
      setShowLow(true)
    } else setShowLow((v) => !v)
  }

  return (
    <div className={`shell${rail ? ' rail' : ''}`}>
      {isMobile && drawer && <div className="scrim" onClick={() => setDrawer(false)} aria-hidden="true" />}
      <aside className={`sidebar${isMobile ? ' mobile' : ''}${drawer ? ' open' : ''}`} aria-label="Navigasi utama">
        <div className="brand-row">
          <div className="brand">
            {rail ? (
              <span className="brand-mark" title={storeName || 'KasirKu'}>
                {(storeName || 'KasirKu').charAt(0).toUpperCase()}
              </span>
            ) : (
              <>
                {storeName || 'KasirKu'}
                <small>POS · Stok · Keuangan · HPP</small>
              </>
            )}
          </div>
          {isMobile && (
            <button className="icon-btn drawer-close" onClick={() => setDrawer(false)} aria-label="Tutup menu">
              <Icon name="x" />
            </button>
          )}
        </div>
        {role === 'owner' && low.length > 0 && (
          <>
            <button className="bell-btn" onClick={onBell} title={`Stok menipis: ${low.length} item`}>
              <Icon name="bell" size={16} />
              <span className="nav-label">Stok menipis</span>
              <span className="bell-count">{low.length}</span>
            </button>
            {showLow && !rail && (
              <div className="low-panel">
                <strong>Perlu dibeli:</strong>
                <ul>
                  {low.map((p) => (
                    <li key={p.id}>{p.name} — sisa {p.stock} {p.unit} (min {p.min_stock})</li>
                  ))}
                </ul>
                {supplierPhone ? (
                  <a className="btn btn-primary btn-sm" style={{ width: '100%', justifyContent: 'center' }} href={waSupplier} target="_blank" rel="noreferrer">
                    Kirim WA ke supplier
                  </a>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>Set nomor supplier di Pengaturan untuk kirim WA.</p>
                )}
              </div>
            )}
          </>
        )}
        <nav className="nav-list">
          {items.map(({ item }) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link${active?.item.href === item.href ? ' active' : ''}`}
              title={rail ? item.label : undefined}
              onClick={() => setDrawer(false)}
            >
              <Icon name={item.icon} className="nav-icon" />
              <span className="nav-label">{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          {!rail && <div className="foot-email">{user?.email}</div>}
          <span className="badge auto foot-badge">{role === 'owner' ? 'Owner' : 'Kasir'}</span>
          <button className="btn btn-ghost btn-sm foot-logout" onClick={logout} title="Keluar dari akun">
            <Icon name="logout" size={15} />
            <span className="nav-label">Keluar</span>
          </button>
        </div>
      </aside>
      <div className="main-col">
        <header className="topbar">
          <button
            className="icon-btn"
            onClick={toggleSidebar}
            aria-label={isMobile ? (drawer ? 'Tutup menu' : 'Buka menu') : collapsed ? 'Lebarkan sidebar' : 'Ciutkan sidebar'}
            title="Buka/tutup sidebar (Ctrl+B)"
          >
            <Icon name={isMobile ? 'menu' : 'panel'} />
          </button>
          <div className="topbar-title">{activeLabel}</div>
          <div className="topbar-right">
            <span className="topbar-hint">Ctrl+B</span>
            <span className="badge auto">{role === 'owner' ? 'Owner' : 'Kasir'}</span>
          </div>
        </header>
        <main className="main">{children}</main>
      </div>
    </div>
  )
}