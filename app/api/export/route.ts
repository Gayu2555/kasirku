import { NextRequest, NextResponse } from 'next/server'
import { actionGuard } from '@/lib/auth/server'
import { getCashEntries, getSales } from '@/lib/data'

export async function GET(req: NextRequest) {
  const me = await actionGuard('owner')
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const type = req.nextUrl.searchParams.get('type') ?? 'sales'
  const from = Number(req.nextUrl.searchParams.get('from') ?? 0)
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`

  let csv: string
  if (type === 'cash') {
    const rows = (await getCashEntries()).filter((e) => new Date(e.created_at).getTime() >= from)
    csv =
      'tanggal,jenis,kategori,catatan,nominal\n' +
      rows.map((e) => [e.created_at, e.type, e.category, e.note, e.amount].map(esc).join(',')).join('\n')
  } else {
    const rows = (await getSales()).filter((s) => new Date(s.created_at).getTime() >= from)
    csv =
      'struk,tanggal,items,metode,status,diskon,total,dibayar,kembalian\n' +
      rows
        .map((s) =>
          [s.receipt_no, s.created_at, s.items.map((i) => `${i.name} x${i.qty}${i.note ? ' [' + i.note + ']' : ''}`).join('; '), s.payment_method, s.voided_at ? 'void' : 'ok', s.discount, s.total, s.paid, s.change]
            .map(esc)
            .join(','),
        )
        .join('\n')
  }

  return new NextResponse('﻿' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="kasirku-${type}.csv"`,
    },
  })
}