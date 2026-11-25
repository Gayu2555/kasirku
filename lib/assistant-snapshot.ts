import { getAnalytics, getCustomers, getDailyReport, getProducts, getSettings, getStats } from './data'

export const jakartaDay = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86400000)
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }) // YYYY-MM-DD
}

export async function buildSnapshot() {
  const today = jakartaDay(0)
  const yesterday = jakartaDay(-1)
  // Diambil sekali di sini, dipakai ulang oleh buildContext (hemat query duplikat)
  const [products, customers] = await Promise.all([getProducts(), getCustomers()])
  const [stats, analytics, repToday, repYesterday, settings] = await Promise.all([
    getStats({ products, recent: false }),
    getAnalytics(),
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

  // Snapshot = data yang dikirim ke model; produk/pelanggan/settings dipakai lagi untuk buildContext
  const snapshot = {
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
      // Perbandingan hari-ke-hari cukup angka inti; detail kemarin bisa dimuat buildContext saat ditanya
      omzetKemarin: repYesterday.revenue,
      transaksiKemarin: repYesterday.count,
      labaKotorKemarin: repYesterday.grossProfit,
      voidKemarin: repYesterday.voidCount,
    },
    persediaan: {
      jumlahProduk: products.length,
      nilaiPersediaanPadaHpp: nilaiPersediaan,
      stokHabis: habis.slice(0, 10).map((p) => p.name),
      jumlahStokHabis: habis.length,
      stokMenipis: stats.lowStock.map((p) => ({ nama: p.name, sisa: p.stock, minimum: p.min_stock, satuan: p.unit })),
      stokBanyakTapiTidakTerlaris: products
        .filter((p) => p.stock > 0 && !terlarisNama.has(p.name))
        .sort((a, b) => b.stock * b.cost - a.stock * a.cost)
        .slice(0, 5)
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
      terbesar: penunggak.slice(0, 8).map((c) => ({ nama: c.name, utang: c.debt })),
    },
    laporanHariIni: trim(repToday),
  }
  return { snapshot, products, customers, settings }
}

export type SnapshotBundle = Awaited<ReturnType<typeof buildSnapshot>>

const SNAPSHOT_TTL = 45_000 // data boleh telat maks 45 detik; tiap pesan jadi jauh lebih ringan
let snapCached: { at: number; bundle: SnapshotBundle } | null = null
let snapInflight: Promise<SnapshotBundle> | null = null

// Snapshot belasan query: pakai ulang 45 detik & gabung request yang datang bersamaan
export function getSnapshot(): Promise<SnapshotBundle> {
  if (snapCached && Date.now() - snapCached.at < SNAPSHOT_TTL) return Promise.resolve(snapCached.bundle)
  if (snapInflight) return snapInflight
  snapInflight = buildSnapshot()
    .then((bundle) => {
      snapCached = { at: Date.now(), bundle }
      return bundle
    })
    .finally(() => {
      snapInflight = null
    })
  return snapInflight
}
