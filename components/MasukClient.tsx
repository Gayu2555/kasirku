'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth/client'

function EyeIcon({ off }: { off?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
      {off && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  )
}

export default function MasukClient({ notice, loggedIn }: { notice?: string; loggedIn?: boolean }) {
  const router = useRouter()
  const [mode, setMode] = useState<'masuk' | 'daftar'>('masuk')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setBusy(true)
    setError('')
    const res =
      mode === 'masuk'
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: name || email.split('@')[0] })
    setBusy(false)
    if (res.error) {
      setError(res.error.message || 'Terjadi kesalahan')
      return
    }
    router.replace('/')
    router.refresh()
  }

  const logout = async () => {
    await authClient.signOut()
    router.replace('/masuk')
    router.refresh()
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="brand" style={{ padding: 0, marginBottom: 4, color: 'var(--green-deep)' }}>
          KasirKu
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          {mode === 'masuk' ? 'Masuk untuk mulai bertransaksi.' : 'Daftar akun baru. Pendaftar pertama menjadi Owner, lainnya menunggu persetujuan owner.'}
        </p>
        {notice && (
          <div className="card" style={{ background: 'var(--cream, #fdf6ec)', border: '1px solid var(--line, #e5dcc9)', padding: '10px 12px', marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: 13 }}>{notice}</p>
            {loggedIn && (
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={logout}>
                Keluar
              </button>
            )}
          </div>
        )}
        <div className="chips">
          <button className={`chip${mode === 'masuk' ? ' active' : ''}`} onClick={() => setMode('masuk')}>
            Masuk
          </button>
          <button className={`chip${mode === 'daftar' ? ' active' : ''}`} onClick={() => setMode('daftar')}>
            Daftar
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'daftar' && (
            <label className="field">
              Nama
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama kamu" />
            </label>
          )}
          <label className="field">
            Email
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@contoh.id" />
          </label>
          <div className="field">
            <span>Kata sandi</span>
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                style={{ paddingRight: 42, width: '100%' }}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="Minimal 8 karakter"
                autoComplete={mode === 'masuk' ? 'current-password' : 'new-password'}
              />
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                title={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 2,
                  background: 'none',
                  border: 'none',
                  padding: 4,
                  cursor: 'pointer',
                  color: 'var(--muted, #6b7280)',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <EyeIcon off={showPassword} />
              </button>
            </div>
          </div>
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} disabled={busy} onClick={submit}>
          {busy ? 'Memproses…' : mode === 'masuk' ? 'Masuk' : 'Daftar'}
        </button>
        <p className="muted" style={{ marginBottom: 0 }}>
          Autentikasi dikelola Neon Auth (Managed Better Auth).
        </p>
      </div>
    </div>
  )
}