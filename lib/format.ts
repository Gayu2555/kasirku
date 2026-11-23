export function rupiah(n: number): string {
  return 'Rp' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.round(n))
}

export function tanggal(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function persen(n: number): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(n) + '%'
}