import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Send a gift (KES) to another user
export async function POST(req: NextRequest) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { toUsername, toUserId, amountKES, message, sticker } = body

  // Resolve recipient
  let recipientId = toUserId
  if (!recipientId && toUsername) {
    const u = await db.user.findUnique({ where: { username: toUsername.toLowerCase() } })
    if (!u) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    recipientId = u.id
  }
  if (!recipientId) return NextResponse.json({ error: 'toUsername or toUserId required' }, { status: 400 })
  if (recipientId === me.id) return NextResponse.json({ error: "Can't gift yourself" }, { status: 400 })

  const amount = Number(amountKES)
  if (!amount || amount < 1) {
    return NextResponse.json({ error: 'Minimum gift is KES 1' }, { status: 400 })
  }
  if (amount > 50000) {
    return NextResponse.json({ error: 'Maximum gift is KES 50,000' }, { status: 400 })
  }

  const amountCents = Math.round(amount * 100)

  // Get my wallet
  const myWallet = await db.wallet.upsert({
    where: { userId: me.id },
    update: {},
    create: { userId: me.id },
  })
  if (myWallet.balance < amountCents) {
    return NextResponse.json({ error: `Insufficient balance. You have KES ${(myWallet.balance / 100).toFixed(2)}` }, { status: 400 })
  }

  // Get recipient wallet
  const theirWallet = await db.wallet.upsert({
    where: { userId: recipientId },
    update: {},
    create: { userId: recipientId },
  })

  // Run as transaction: debit me, credit them, create gift + 2 transaction records
  const gift = await db.$transaction(async (tx) => {
    const g = await tx.gift.create({
      data: {
        fromUserId: me.id,
        toUserId: recipientId,
        amount: amountCents,
        message: (message || '').slice(0, 200),
        sticker: sticker || '🎁',
      },
    })
    await tx.wallet.update({
      where: { id: myWallet.id },
      data: { balance: { decrement: amountCents } },
    })
    await tx.wallet.update({
      where: { id: theirWallet.id },
      data: { balance: { increment: amountCents } },
    })
    await tx.transaction.create({
      data: {
        walletId: myWallet.id,
        type: 'gift_sent',
        amount: -amountCents,
        reference: g.id,
        status: 'completed',
      },
    })
    await tx.transaction.create({
      data: {
        walletId: theirWallet.id,
        type: 'gift_received',
        amount: amountCents,
        reference: g.id,
        status: 'completed',
      },
    })
    await tx.notification.create({
      data: {
        toUserId: recipientId,
        fromUserId: me.id,
        type: 'gift',
        text: `sent you KES ${amount.toFixed(2)} ${sticker || '🎁'}`,
      },
    })
    return g
  })

  return NextResponse.json({
    ok: true,
    gift: { id: gift.id, amount: amountCents, amountKES: amount.toFixed(2), message: gift.message, sticker: gift.sticker },
  })
}
