import { NextRequest } from 'next/server'
import { actionGuard } from '@/lib/auth/server'
import { getAnalytics, getCustomers, getDailyReport, getSettings, getStats } from '@/lib/data'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const enc = new TextEncoder()
const sse = (obj: unknown) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`)

const jakartaDay = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86400000)
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }) // YYYY-MM-DD
}

async function buildSnapshot() {
  const today = jakartaDay(0)
  const yesterday = jakartaDay(-1)
  const [stats, analytics, customers, repToday, repYesterday, settings] = await Promise.all([
    getStats(),
    getAnalytics(),
    getCustomers(),
    getDailyReport(today),
    getDailyReport(yesterday),
    getSettings(),
  ])
  const trim = (r: Awaited<ReturnType<typeof getDailyReport>>) => {
    const { shifts, ...rest } = r
    return { ...rest, jumlahShift: shifts.length }
  }
  return {
    toko: settings.store_name,
    targetHarian: settings.daily_target,
    hariIni: today,
    ringkasan: {
      omzetHariIni: stats.todayRevenue,
      transaksiHariIni: stats.todayCount,
      omzetBulanIni: stats.monthRevenue,
      hppBulanIni: stats.monthHpp,
      pemasukanKasBulanIni: stats.monthIncome,
      pengeluaranBulanIni: stats.monthExpense,
    },
    stokMenipis: stats.lowStock.map((p) => ({ nama: p.name, sisa: p.stock, minimum: p.min_stock, satuan: p.unit })),
    produkTerlaris30Hari: analytics.products
      .slice(0, 10)
      .map((p) => ({ nama: p.name, qty: p.qty, omzet: p.revenue, laba: p.profit })),
    omzetHarian14Hari: analytics.daily.slice(-14),
    metodeBayar30Hari: analytics.methods,
    kasbonTerbesar: customers
      .filter((c) => c.debt > 0)
      .sort((a, b) => b.debt - a.debt)
      .slice(0, 15)
      .map((c) => ({ nama: c.name, utang: c.debt })),
    laporanHariIni: trim(repToday),
    laporanKemarin: trim(repYesterday),
  }
}

function upstreamError(status: number): string {
  if (status === 401) return 'API key Kenari tidak valid. Cek KENARI_API_KEY di .env.local.'
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
  if (!apiKey) return Response.json({ error: 'KENARI_API_KEY belum diisi di .env.local' }, { status: 500 })

  const body = (await req.json().catch(() => null)) as { messages?: { role: string; content: string }[] } | null
  const incoming = (body?.messages ?? []).slice(-12)
  if (!incoming.length || incoming[incoming.length - 1].role !== 'user') {
    return Response.json({ error: 'Pesan tidak valid' }, { status: 400 })
  }
  const history = incoming
    .filter((m) => String(m.content ?? '').trim() !== '')
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content).slice(0, 2000),
    }))

  let snapshot: unknown
  try {
    snapshot = await buildSnapshot()
  } catch {
    return Response.json({ error: 'Gagal membaca data toko' }, { status: 500 })
  }

  const systemPrompt = `Kamu asisten untuk owner toko (aplikasi kasir). Jawab dalam Bahasa Indonesia yang santai dan ringkas.
Jawab HANYA berdasarkan data di bawah. Kalau datanya tidak ada atau tidak cukup, bilang terus terang, jangan mengarang angka.
Format uang sebagai Rp dengan pemisah titik (contoh Rp1.250.000). Kamu hanya bisa membaca data, tidak bisa mengubahnya.
Jangan tampilkan proses berpikir, langsung jawabannya.

DATA TOKO (JSON):
${JSON.stringify(snapshot)}`

  const base = (process.env.KENARI_BASE || 'https://kenari.id/v1').replace(/\/+$/, '')
  const endpoint = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
  const model = process.env.KENARI_MODEL || 'flint-v1-0:free'

  const payload = JSON.stringify({
    model,
    stream: true,
    temperature: 0.3,
    max_tokens: 1200,
    reasoning: { enabled: false },
    messages: [{ role: 'system', content: systemPrompt }, ...history],
  })

  // Keandalan model gratis rendah: coba ulang sekali untuk 5xx / gagal konek
  const callUpstream = async (): Promise<Response> => {
    let last: Response | null = null
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: payload,
          signal: AbortSignal.timeout(90_000),
        })
        if (res.ok || res.status < 500) return res
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
      let full = ''
      try {
        const upstream = await callUpstream()
        if (!upstream.ok || !upstream.body) {
          controller.enqueue(sse({ t: 'error', v: upstreamError(upstream.status) }))
          controller.close()
          return
        }

        const reader = upstream.body.getReader()
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
            if (!trimmed.startsWith('data:')) continue // lewati keepalive ":" dan baris kosong
            const data = trimmed.slice(5).trim()
            if (data === '[DONE]') continue
            try {
              const json = JSON.parse(data)
              const piece: string = json.choices?.[0]?.delta?.content ?? ''
              if (piece) {
                full += piece
                const clean = full.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*$/, '')
                controller.enqueue(sse({ t: 'd', v: clean.trimStart() }))
              }
            } catch {
              /* lewati baris non-JSON */
            }
          }
        }
        controller.enqueue(sse({ t: 'done' }))
      } catch {
        controller.enqueue(sse({ t: 'error', v: 'Asisten sedang tidak bisa dihubungi, coba lagi sebentar.' }))
      }
      controller.close()
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