import { NextRequest } from 'next/server'
import { actionGuard } from '@/lib/auth/server'
import { buildContext } from '@/lib/assistant-context'
import { buildSystemPrompt } from '@/lib/assistant-prompt'
import { getSnapshot, type SnapshotBundle } from '@/lib/assistant-snapshot'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const enc = new TextEncoder()
const sse = (obj: unknown) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`)

function upstreamError(status: number): string {
  if (status === 401) return 'API key Kenari tidak valid. Cek KENARI_API_KEY.'
  if (status === 402) return 'Saldo Kenari habis.'
  if (status === 403) return 'API key tidak punya izin untuk model ini.'
  if (status === 429) return 'Limit tercapai (akun gratis: 5 request/menit, 50/hari). Coba lagi nanti.'
  if (status >= 500) return 'Server model sedang bermasalah, coba lagi sebentar.'
  return `Model menolak permintaan (kode ${status}).`
}

export async function POST(req: NextRequest) {
  if (!(await actionGuard('owner'))) {
    return Response.json({ error: 'Khusus owner' }, { status: 403 })
  }
  const apiKey = process.env.KENARI_API_KEY || ''
  if (!apiKey) return Response.json({ error: 'KENARI_API_KEY belum diisi' }, { status: 500 })

  const body = (await req.json().catch(() => null)) as { messages?: { role: string; content: string }[] } | null
  // Cukup 8 pesan terakhir: hemat token, model gratis sering kehabisan context di percakapan panjang
  const incoming = (body?.messages ?? []).slice(-8)
  if (!incoming.length || incoming[incoming.length - 1].role !== 'user') {
    return Response.json({ error: 'Pesan tidak valid' }, { status: 400 })
  }
  const history = incoming
    .filter((m) => String(m.content ?? '').trim() !== '')
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      // Jawaban asisten dipotong lebih longgar supaya pertanyaan lanjutan tetap nyambung
      content: String(m.content).slice(0, m.role === 'assistant' ? 3000 : 1500),
    }))

  let bundle: SnapshotBundle
  try {
    bundle = await getSnapshot()
  } catch {
    return Response.json({ error: 'Gagal membaca data toko' }, { status: 500 })
  }
  const snapshot = bundle.snapshot

  // 4 pesan user terakhir: pertanyaan awal tetap jadi acuan rentang/nama saat lanjutan
  const userTexts = history.filter((m) => m.role === 'user').slice(-4).map((m) => m.content)
  const question = userTexts.join('\n')
  const current = userTexts[userTexts.length - 1] ?? ''
  const previousAnswer = [...history].reverse().find((m) => m.role === 'assistant')?.content ?? ''
  const extra = await buildContext(question, {
    products: bundle.products,
    customers: bundle.customers,
    settings: bundle.settings,
    current,
    previousAnswer,
  }).catch(() => null)

  const systemPrompt = buildSystemPrompt(snapshot, extra)

  const base = (process.env.KENARI_BASE || 'https://kenari.id/v1').replace(/\/+$/, '')
  const endpoint = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
  const model = process.env.KENARI_MODEL || 'glm-4-7-flash:free'

  const payload = JSON.stringify({
    model,
    stream: true,
    temperature: 0.35, // 0.2 terlalu rapat → jawaban cenderung mengulang diri sendiri
    max_tokens: 2000, // token grafik + saran lanjutan butuh ruang ekstra
    reasoning: { enabled: false },
    messages: [{ role: 'system', content: systemPrompt }, ...history],
  })

  // Client bisa menutup chat atau menekan Stop kapan saja. Sinyalnya dipakai untuk
  // membatalkan fetch ke model, supaya kuota Kenari tidak terbuang percuma.
  const upstream = new AbortController()
  const connectTimer = setTimeout(() => upstream.abort(), 90_000)
  // Batas waktu baca isi stream; tanpa ini, upstream yang berhenti mengirim data
  // bikin chat muter selamanya sampai user menutupnya sendiri.
  let bodyTimer: ReturnType<typeof setTimeout> | null = null
  const onClientAbort = () => upstream.abort()
  req.signal.addEventListener('abort', onClientAbort)
  const release = () => {
    clearTimeout(connectTimer)
    if (bodyTimer) clearTimeout(bodyTimer)
    req.signal.removeEventListener('abort', onClientAbort)
  }

  // Keandalan model gratis rendah: coba ulang sekali untuk 5xx / gagal konek.
  // 400 dari Kenari bisa juga transient ("provider rejected") — ikut di-retry sekali.
  const callUpstream = async (): Promise<Response> => {
    let last: Response | null = null
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: payload,
          signal: upstream.signal,
        })
        clearTimeout(connectTimer) // header sudah sampai; batas 90 detik hanya untuk koneksi
        if (bodyTimer) clearTimeout(bodyTimer)
        bodyTimer = setTimeout(() => upstream.abort(), 150_000)
        if (res.ok || (res.status < 500 && res.status !== 400)) return res
        last = res
      } catch (e) {
        if (attempt === 1) throw e
      }
      await new Promise((r) => setTimeout(r, 800))
    }
    return last as Response
  }

  const stream = new ReadableStream({
    async start(controller) {
      // Kalau client sudah menutup chat, enqueue gagal — hentikan juga modelnya
      const push = (obj: unknown) => {
        try {
          controller.enqueue(sse(obj))
        } catch {
          upstream.abort()
        }
      }
      let adaIsi = false
      try {
        // Upstream kadang balas 200 tapi tanpa isi sama sekali (transient).
        // Belum ada apa pun yang terkirim ke client, jadi mengulang sekali aman.
        for (let round = 0; round < 2; round++) {
          let full = ''
          try {
            if (req.signal.aborted) return
            const res = await callUpstream()
            if (!res.ok || !res.body) {
              push({ t: 'error', v: upstreamError(res.status) })
              return
            }

            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''
            for (;;) {
              const { done, value } = await reader.read()
              if (done) break
              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop() ?? ''
              for (const line of lines) {
                const trimmed = line.trim()
                if (!trimmed.startsWith('data:')) continue
                const data = trimmed.slice(5).trim()
                if (data === '[DONE]') continue
                try {
                  const json = JSON.parse(data)
                  const piece: string = json.choices?.[0]?.delta?.content ?? ''
                  if (piece) {
                    full += piece
                    const clean = full.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*$/, '')
                    push({ t: 'd', v: clean.trimStart() })
                  }
                } catch {
                  /* lewati baris non-JSON */
                }
              }
            }
          } catch {
            // Client menekan Stop / menutup chat: diamkan, jangan kirim error ke koneksi yang sudah pergi
            if (!req.signal.aborted) push({ t: 'error', v: 'Asisten sedang tidak bisa dihubungi, coba lagi sebentar.' })
            return
          }
          if (full.trim() !== '') adaIsi = true
          if (adaIsi || req.signal.aborted) break
          if (round === 0) await new Promise((r) => setTimeout(r, 1200))
        }
        // Dua percobaan kosong berturut-turut: kasih tahu user, jangan bubble hantu
        push(adaIsi ? { t: 'done' } : { t: 'error', v: 'Asisten tidak merespons, coba kirim ulang pesannya.' })
      } finally {
        release()
        try {
          controller.close()
        } catch {
          /* stream sudah tertutup sendiri */
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
} 