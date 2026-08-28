import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Get my wallet (auto-create if missing)
export async function GET() {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const wallet = await db.wallet.upsert({
    where: { userId: me.id },
    update: {},
    create: { userId: me.id },
    include: {
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  })

  // Get total gifts received count
  const giftsReceived = await db.gift.count({ where: { toUserId: me.id } })
  const giftsSent = await db.gift.count({ where: { fromUserId: me.id } })
  const followerCount = await db.follow.count({ where: { followingId: me.id } })

  return NextResponse.json({
    wallet: {
      id: wallet.id,
      balance: wallet.balance,
      balanceKES: (wallet.balance / 100).toFixed(2),
      liveBalance: wallet.liveBalance,
      liveBalanceKES: (wallet.liveBalance / 100).toFixed(2),
      createdAt: wallet.createdAt,
      transactions: wallet.transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        amountKES: (Math.abs(t.amount) / 100).toFixed(2),
        reference: t.reference,
        status: t.status,
        createdAt: t.createdAt,
      })),
      stats: {
        giftsReceived,
        giftsSent,
        followerCount,
        canWithdrawLive: followerCount >= 500,
      },
    },
  })
}
