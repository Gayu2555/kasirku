'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { takeChart } from '@/lib/chart'
import type { ChartSpec } from '@/lib/chart'
import { SpecChart } from '@/components/Charts'

type Msg = { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = ['Ringkasan hari ini', 'Stok apa yang menipis?', 'Produk terlaris bulan ini', 'Siapa yang kasbonnya paling besar?']

const STORAGE_KEY = 'kasirku.assistant.chat.v1'
const MAX_STORED = 40 // batas pesan yang disimpan di browser

const THINKING = [
  'Bersuka ria dulu…',
  'Berkelana mencari jawaban…',
  'Membuka buku kas…',
  'Menghitung receh satu-satu…',
  'Mengintip rak stok…',
  'Menyeduh kopi sebentar…',
  'Mengetuk pintu database…',
  'Merapikan struk-struk…',
  'Bertanya ke mesin kasir…',
  'Hampir ketemu…',
]

// Halaman yang boleh dituju lewat tombol pintasan dari jawaban AI
const ALLOWED = new Set([
  '/kasir', '/riwayat', '/stok', '/keuangan', '/laporan',
  '/analitik', '/hpp', '/pelanggan', '/tim', '/pengaturan',
])
const ALLOWED_PARAMS = new Set(['filter', 'q'])

// Validasi tujuan: path harus di whitelist, query hanya filter/q dengan nilai aman
function safeHref(h: string): string | null {
  const [path, query = ''] = h.split('?')
  if (!ALLOWED.has(path)) return null
  const clean = new URLSearchParams()
  for (const [k, v] of new URLSearchParams(query)) {
    if (!ALLOWED_PARAMS.has(k) || v.length > 40 || /[<>"'`]/.test(v)) continue
    clean.set(k, v)
  }
  const s = clean.toString()
  return s ? `${path}?${s}` : path
}

// Pisahkan teks jawaban dari token tombol [[Label|/path]], saran [[?Pertanyaan]],
// dan grafik [[chart|{json}]] (spesifikasi divalidasi ketat; JSON rusak → grafik dibuang)
function splitActions(raw: string) {
  const actions: { label: string; href: string }[] = []
  const followups: string[] = []
  const { text: noChart, spec: chart } = takeChart(raw)
  const body = noChart
    .replace(/\[\[\s*\?\s*([^\]]{3,60}?)\s*\]\]/g, (_m, q: string) => {
      const t = q.trim()
      if (followups.length < 3 && !followups.includes(t)) followups.push(t)
      return ''
    })
    .replace(/\[\[([^\]|]{1,40})\|(\/[a-z]*(?:\?[A-Za-z0-9=&_.%+-]{1,80})?)\]\]/g, (_m, label: string, href: string) => {
      const safe = safeHref(href)
      if (safe && actions.length < 3 && !actions.some((a) => a.href === safe)) {
        actions.push({ label: label.trim(), href: safe })
      }
      return ''
    })
    .replace(/\[\[[^\]]*\]?$/, '') // token yang belum selesai saat streaming
    .replace(/[,;\s]+$/, '') // sisa koma/spasi di ujung setelah token dibuang
    .trim()
  return { body, actions, followups, chart }
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((p, i) =>
        p.length > 4 && p.startsWith('**') && p.endsWith('**') ? (
          <strong key={i}>{p.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}

function Markdown({ text }: { text: string }) {
  const nodes: React.ReactNode[] = []
  const cur: { ordered: boolean; items: string[] } = { ordered: false, items: [] }

  const flush = () => {
    if (!cur.items.length) return
    const Tag = cur.ordered ? 'ol' : 'ul'
    nodes.push(
      <Tag key={nodes.length} style={{ margin: '4px 0', paddingLeft: 20 }}>
        {cur.items.map((it, i) => (
          <li key={i} style={{ margin: '2px 0' }}>
            <Inline text={it} />
          </li>
        ))}
      </Tag>,
    )
    cur.items = []
  }

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const bullet = line.match(/^\s*[*\-•]\s+(.*)$/)
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/)
    const heading = line.match(/^#{1,6}\s+(.*)$/)

    if (bullet || ordered) {
      const isOrdered = !!ordered
      if (cur.items.length && cur.ordered !== isOrdered) flush()
      cur.ordered = isOrdered
      cur.items.push((bullet ?? ordered)![1])
    } else {
      flush()
      if (!line.trim()) continue
      nodes.push(
        <p key={nodes.length} style={{ margin: '4px 0', fontWeight: heading ? 700 : undefined }}>
          <Inline text={heading ? heading[1] : line} />
        </p>,
      )
    }
  }
  flush()
  return <>{nodes}</>
}

function Thinking() {
  const [i, setI] = useState(() => Math.floor(Math.random() * THINKING.length))

  useEffect(() => {
    const t = window.setInterval(() => setI((v) => (v + 1) % THINKING.length), 2200)
    return () => window.clearInterval(t)
  }, [])

  return (
    <span className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ display: 'inline-block', animation: 'kk-pulse 1s ease-in-out infinite' }}>✨</span>
      {THINKING[i]}
    </span>
  )
}

export default function AssistantBubble() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  // Muat riwayat tersimpan supaya chat tidak hilang saat refresh (server selalu mulai kosong)
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as unknown
      if (Array.isArray(saved)) {
        return saved.filter(
          (m): m is Msg =>
            !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string',
        )
      }
    } catch {
      /* data rusak → mulai dari kosong */
    }
    return []
  })
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Simpan tiap pesan berubah; debounce supaya tidak menulis tiap token streaming
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-MAX_STORED)))
      } catch {
        /* penyimpanan penuh/ditolak → abaikan */
      }
    }, 400)
    return () => window.clearTimeout(t)
  }, [msgs])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, busy, open])

  // Pindah halaman tanpa reload; chat tetap ada karena bubble hidup di layout.
  // Di HP panel ditutup supaya halaman tujuan kelihatan; di desktop tetap terbuka.
  const go = (href: string) => {
    router.push(href)
    if (window.innerWidth < 768) setOpen(false)
  }

  // Hentikan jawaban yang sedang streaming; server juga otomatis membatalkan panggilan modelnya
  const stop = () => abortRef.current?.abort()

  const send = async (text: string) => {
    const t = text.trim()
    if (!t || busy) return
    // Kirim ke server tanpa token tombol/saran, supaya riwayat tetap bersih
    const next: Msg[] = [
      ...msgs.map((m) => (m.role === 'assistant' ? { ...m, content: splitActions(m.content).body } : m)),
      { role: 'user', content: t },
    ]
    setMsgs([...msgs, { role: 'user', content: t }, { role: 'assistant', content: '' }])
    setInput('')
    setBusy(true)

    const ac = new AbortController()
    abortRef.current = ac

    const setLast = (content: string) =>
      setMsgs((cur) => cur.map((m, i) => (i === cur.length - 1 ? { ...m, content } : m)))

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
        signal: ac.signal,
      })
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        setLast(`⚠️ ${data.error ?? 'Terjadi kesalahan'}`)
      } else {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let got = false
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() ?? ''
          for (const part of parts) {
            const line = part.trim()
            if (!line.startsWith('data:')) continue
            try {
              const ev = JSON.parse(line.slice(5).trim())
              if (ev.t === 'd') {
                got = true
                setLast(ev.v)
              } else if (ev.t === 'error') {
                setLast(`⚠️ ${ev.v}`)
                got = true
              }
            } catch {
              /* abaikan */
            }
          }
        }
        if (!got) setLast('⚠️ Tidak ada jawaban dari model, coba lagi.')
      }
    } catch {
      if (ac.signal.aborted) {
        // Dihentikan lewat tombol Stop: pertahankan jawaban yang sudah masuk
        setMsgs((cur) =>
          cur.map((m, i) =>
            i === cur.length - 1 && m.role === 'assistant' && !m.content.trim()
              ? { ...m, content: '⏹ Dihentikan.' }
              : m,
          ),
        )
      } else {
        setLast('⚠️ Gagal terhubung ke server')
      }
    } finally {
      abortRef.current = null
      setBusy(false)
    }
  }

  return (
    <>
      {open && (
        <div
          className="card"
          style={{
            position: 'fixed',
            right: 20,
            bottom: 84,
            width: 'min(380px, calc(100vw - 32px))',
            height: 'min(520px, 70vh)',
            display: 'flex',
            flexDirection: 'column',
            padding: 0,
            zIndex: 60,
            boxShadow: '0 12px 40px rgba(0,0,0,.18)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line, #e5dcc9)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ color: 'var(--ink)' }}>Asisten KasirKu</strong>
            <div style={{ display: 'flex', gap: 6 }}>
              {msgs.length > 0 && !busy && (
                <button className="btn btn-ghost btn-sm" onClick={() => setMsgs([])}>Reset</button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Tutup">✕</button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {msgs.length === 0 && (
              <>
                <p className="muted" style={{ margin: 0 }}>Tanya apa aja soal penjualan, stok, keuangan, atau kasbon toko lu.</p>
                <div className="chips">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} className="chip" onClick={() => send(s)}>{s}</button>
                  ))}
                </div>
              </>
            )}
            {msgs.map((m, i) => {
              const isLast = i === msgs.length - 1
              const streaming = busy && isLast
              const { body, actions, followups, chart } =
                m.role === 'assistant'
                  ? splitActions(m.content)
                  : {
                      body: m.content,
                      actions: [] as { label: string; href: string }[],
                      followups: [] as string[],
                      chart: null as ChartSpec | null,
                    }

              return (
                <div
                  key={i}
                  style={{
                    alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    padding: '8px 12px',
                    borderRadius: 14,
                    whiteSpace: m.role === 'user' ? 'pre-wrap' : 'normal',
                    overflowWrap: 'anywhere',
                    fontSize: 14,
                    lineHeight: 1.45,
                    background: m.role === 'user' ? 'var(--green-deep, #1d5c4a)' : 'var(--cream, #fdf6ec)',
                    color: m.role === 'user' ? '#fff' : 'var(--ink, #222)',
                    border: m.role === 'user' ? 'none' : '1px solid var(--line, #e5dcc9)',
                  }}
                >
                  {m.role === 'user' ? (
                    m.content
                  ) : body || chart ? (
                    <>
                      {body && <Markdown text={body} />}
                      {chart && <SpecChart spec={chart} />}
                      {!streaming && actions.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                          {actions.map((a) => (
                            <button key={a.href} type="button" className="chip" onClick={() => go(a.href)}>
                              {a.label} →
                            </button>
                          ))}
                        </div>
                      )}
                      {!busy && isLast && followups.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                          {followups.map((q) => (
                            <button key={q} type="button" className="chip" onClick={() => send(q)}>
                              {q}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : streaming ? (
                    <Thinking />
                  ) : (
                    ''
                  )}
                </div>
              )
            })}
            <div ref={endRef} />
          </div>

          <div style={{ padding: 10, borderTop: '1px solid var(--line, #e5dcc9)', display: 'flex', gap: 8 }}>
            <input
              className="input"
              style={{ flex: 1 }}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send(input)}
              placeholder="Tulis pertanyaan…"
              disabled={busy}
            />
            {busy ? (
              <button className="btn" onClick={stop} aria-label="Hentikan jawaban">⏹ Stop</button>
            ) : (
              <button className="btn btn-primary" disabled={!input.trim()} onClick={() => send(input)}>Kirim</button>
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Buka asisten"
        style={{
          position: 'fixed',
          right: 20,
          bottom: 20,
          width: 52,
          height: 52,
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          zIndex: 60,
          background: 'var(--green-deep, #1d5c4a)',
          color: '#fff',
          fontSize: 22,
          boxShadow: '0 6px 20px rgba(0,0,0,.25)',
        }}
      >
        {open ? '✕' : '💬'}
      </button>
    </>
  )
}