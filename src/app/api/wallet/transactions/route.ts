import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Get all transactions (longer history)
export async function GET() {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const wallet = await db.wallet.findUnique({ where: { userId: me.id } })
  if (!wallet) return NextResponse.json({ transactions: [] })

  const transactions = await db.transaction.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return NextResponse.json({
    transactions: transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      amountKES: (Math.abs(t.amount) / 100).toFixed(2),
      reference: t.reference,
      status: t.status,
      createdAt: t.createdAt,
    })),
  })
}
