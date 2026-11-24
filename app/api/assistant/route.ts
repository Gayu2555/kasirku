import { NextRequest } from 'next/server'
import { actionGuard } from '@/lib/auth/server'
import { getAnalytics, getCustomers, getDailyReport, getProducts, getSettings, getStats } from '@/lib/data'
import { buildContext } from '@/lib/assistant-context'

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
  const [stats, analytics, customers, products, repToday, repYesterday, settings] = await Promise.all([
    getStats(),
    getAnalytics(),
    getCustomers(),
    getProducts(),
    getDailyReport(today),
    getDailyReport(yesterday),
    getSettings(),
  ])
  const trim = (r: Awaited<ReturnType<typeof getDailyReport>>) => {
    const { shifts, ...rest } = r
    return { ...rest, jumlahShift: shifts.length }
  }
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null)

  const labaKotorBulan = stats.monthRevenue - stats.monthHpp
  const target = settings.daily_target
  const penunggak = customers.filter((c) => c.debt > 0).sort((a, b) => b.debt - a.debt)
  const totalPiutang = penunggak.reduce((s, c) => s + c.debt, 0)
  const habis = products.filter((p) => p.stock <= 0)
  const nilaiPersediaan = products.reduce((s, p) => s + Math.max(p.stock, 0) * p.cost, 0)
  const marginProduk = products
    .filter((p) => p.price > 0)
    .map((p) => ({ nama: p.name, harga: p.price, hpp: p.cost, marginPersen: pct(p.price - p.cost, p.price) }))
    .sort((a, b) => (b.marginPersen ?? 0) - (a.marginPersen ?? 0))
  const terlarisNama = new Set(analytics.products.slice(0, 10).map((p) => p.name))

  return {
    toko: settings.store_name,
    hariIni: today,
    ringkasan: {
      omzetHariIni: stats.todayRevenue,
      transaksiHariIni: stats.todayCount,
      rataRataPerTransaksiHariIni: stats.todayCount > 0 ? Math.round(stats.todayRevenue / stats.todayCount) : 0,
      targetHarian: target,
      pencapaianTargetHariIniPersen: pct(stats.todayRevenue, target),
      omzetBulanIni: stats.monthRevenue,
      hppBulanIni: stats.monthHpp,
      labaKotorBulanIni: labaKotorBulan,
      marginKotorBulanIniPersen: pct(labaKotorBulan, stats.monthRevenue),
      pemasukanKasBulanIni: stats.monthIncome,
      pengeluaranBulanIni: stats.monthExpense,
      labaBersihKasBulanIni: stats.monthIncome - stats.monthExpense,
    },
    persediaan: {
      jumlahProduk: products.length,
      nilaiPersediaanPadaHpp: nilaiPersediaan,
      stokHabis: habis.map((p) => p.name),
      stokMenipis: stats.lowStock.map((p) => ({ nama: p.name, sisa: p.stock, minimum: p.min_stock, satuan: p.unit })),
      stokBanyakTapiTidakTerlaris: products
        .filter((p) => p.stock > 0 && !terlarisNama.has(p.name))
        .sort((a, b) => b.stock * b.cost - a.stock * a.cost)
        .slice(0, 8)
        .map((p) => ({ nama: p.name, stok: p.stock, nilaiModal: p.stock * p.cost })),
      marginTertinggi: marginProduk.slice(0, 5),
      marginTerendah: marginProduk.slice(-5).reverse(),
    },
    penjualan: {
      produkTerlaris30Hari: analytics.products
        .slice(0, 10)
        .map((p) => ({ nama: p.name, qty: p.qty, omzet: p.revenue, laba: p.profit })),
      omzetHarian14Hari: analytics.daily.slice(-14),
      metodeBayar30Hari: analytics.methods,
    },
    piutang: {
      totalPiutang,
      jumlahPelangganBerhutang: penunggak.length,
      terbesar: penunggak.slice(0, 15).map((c) => ({ nama: c.name, utang: c.debt })),
    },
    laporanHariIni: trim(repToday),
    laporanKemarin: trim(repYesterday),
  }
}

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

  // Data tambahan sesuai pertanyaan (2 pesan user terakhir, supaya pertanyaan lanjutan tetap nyambung)
  const question = history.filter((m) => m.role === 'user').slice(-2).map((m) => m.content).join('\n')
  const extra = await buildContext(question).catch(() => null)

  const systemPrompt = `Kamu analis bisnis pribadi untuk owner toko (aplikasi kasir). Gaya: Bahasa Indonesia santai, ringkas, to the point.

ATURAN DATA
- Jawab HANYA dari data di bawah. Kalau data tidak ada atau tidak cukup, bilang terus terang dan sebutkan data apa yang kurang. Jangan mengarang angka.
- Semua angka sudah dihitung; pakai apa adanya, jangan hitung ulang. Kalau perlu membandingkan, sebut dua angkanya.
- Kalau ada DATA TAMBAHAN, utamakan itu untuk pertanyaan yang spesifik (produk, pelanggan, struk, periode tertentu).
- Selalu sebut periodenya (hari ini, bulan ini, 30 hari terakhir, dst.).
- Uang ditulis Rp dengan titik pemisah ribuan (Rp1.250.000).
- Kamu hanya bisa membaca data, tidak bisa mengubah apa pun. Jangan tampilkan proses berpikir.

CARA MENJAWAB
- Mulai dari jawaban atau kesimpulan inti dalam 1–2 kalimat.
- Lanjutkan dengan poin pendukung (maksimal 5 poin) kalau memang perlu.
- Untuk pertanyaan analisis ("kenapa", "gimana", "sebaiknya"): jelaskan temuan dari data, lalu beri 1–3 saran konkret. Bedakan jelas antara fakta dari data dan saran/dugaan.
- Untuk pertanyaan sempit (satu angka, satu produk): jawab singkat saja, tanpa ceramah.
- Kalau pertanyaan ambigu, tanya balik satu pertanyaan klarifikasi.
- Di luar urusan toko dan datanya, tolak dengan sopan dalam satu kalimat.

NAVIGASI
Kamu bisa menyertakan tombol pintasan ke halaman aplikasi dengan format [[Label tombol|/path]]. Hanya pakai path dari daftar ini:
/kasir (transaksi kasir), /riwayat (riwayat struk dan void), /stok (produk, stok, stock opname), /keuangan (arus kas dan pembelian stok), /laporan (laporan harian dan shift), /analitik (grafik dan jam ramai), /hpp (HPP per produk), /pelanggan (pelanggan, kasbon, loyalitas), /tim (anggota tim dan persetujuan), /pengaturan (toko, promo, loyalitas).
Khusus riwayat, path boleh membawa filter: /riwayat?filter=void (nilai filter: tunai, qris, transfer, kasbon, void) atau /riwayat?q=INV-20261120 (cari nomor struk). Pakai bentuk ini kalau jawabanmu membahas jenis transaksi tertentu atau satu struk tertentu.
Aturan tombol: taruh di baris sendiri di akhir jawaban, maksimal 3, dan hanya kalau relevan dengan isi jawaban (misalnya membahas stok menipis → [[Buka Stok|/stok]]). Jangan mengarang path atau parameter lain.

PERTANYAAN LANJUTAN
Di baris paling akhir (setelah tombol navigasi), tulis 2–3 saran pertanyaan lanjutan yang relevan dengan jawabanmu dan bisa dijawab dari data. Format: [[?Teks pertanyaan]], satu token per saran, maksimal 45 karakter, bahasa santai. Jangan beri saran kalau jawabanmu berupa penolakan atau pesan error.

DATA TOKO (JSON):
${JSON.stringify(snapshot)}
${extra ? `\nDATA TAMBAHAN SESUAI PERTANYAAN (JSON, topik: ${extra.topik.join(', ')}):\n${JSON.stringify(extra.data)}` : ''}`

  const base = (process.env.KENARI_BASE || 'https://kenari.id/v1').replace(/\/+$/, '')
  const endpoint = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
  const model = process.env.KENARI_MODEL || 'glm-4-7-flash:free'

  const payload = JSON.stringify({
    model,
    stream: true,
    temperature: 0.2,
    max_tokens: 1500,
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
            if (!trimmed.startsWith('data:')) continue
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