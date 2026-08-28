import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Send a gift during a live stream
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: streamId } = await params
  const body = await req.json()
  const { amountKES, sticker } = body

  const amount = Number(amountKES)
  if (!amount || amount < 1) return NextResponse.json({ error: 'Minimum gift is KES 1' }, { status: 400 })

  const stream = await db.liveStream.findUnique({ where: { id: streamId }, include: { host: true } })
  if (!stream || !stream.isLive) return NextResponse.json({ error: 'Stream not live' }, { status: 404 })
  if (stream.hostId === me.id) return NextResponse.json({ error: "Can't gift yourself" }, { status: 400 })

  const amountCents = Math.round(amount * 100)
  const myWallet = await db.wallet.upsert({
    where: { userId: me.id },
    update: {},
    create: { userId: me.id },
  })
  if (myWallet.balance < amountCents) {
    return NextResponse.json({ error: `Insufficient balance. You have KES ${(myWallet.balance / 100).toFixed(2)}. Top up your wallet first.` }, { status: 400 })
  }

  const hostWallet = await db.wallet.upsert({
    where: { userId: stream.hostId },
    update: {},
    create: { userId: stream.hostId },
  })

  // Check host follower count — if < 500, gifts go to liveBalance (can't withdraw)
  const hostFollowers = await db.follow.count({ where: { followingId: stream.hostId } })
  const canWithdraw = hostFollowers >= 500

  const gift = await db.$transaction(async (tx) => {
    const g = await tx.liveGift.create({
      data: { streamId, fromUserId: me.id, toUserId: stream.hostId, amount: amountCents, sticker: sticker || '🎁' },
    })
    // Debit sender's main wallet
    await tx.wallet.update({ where: { id: myWallet.id }, data: { balance: { decrement: amountCents } } })
    // Credit host's liveBalance (gifts always go to live wallet, withdrawable only at 500+ followers)
    await tx.wallet.update({ where: { id: hostWallet.id }, data: { liveBalance: { increment: amountCents } } })
    // Transactions
    await tx.transaction.create({ data: { walletId: myWallet.id, type: 'live_gift_sent', amount: -amountCents, reference: g.id, status: 'completed' } })
    await tx.transaction.create({ data: { walletId: hostWallet.id, type: 'live_gift_received', amount: amountCents, reference: g.id, status: 'completed' } })
    // Notification
    await tx.notification.create({ data: { toUserId: stream.hostId, fromUserId: me.id, type: 'live_gift', text: `sent you KES ${amount.toFixed(2)} ${sticker || '🎁'} during your live!${canWithdraw ? '' : ' (Withdraw at 500 followers)'}` } })
    return g
  })

  return NextResponse.json({ ok: true, gift: { id: gift.id, amount: amountCents, sticker: gift.sticker }, canWithdraw })
}
