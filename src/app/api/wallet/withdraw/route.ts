import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { initiateB2C } from '@/lib/swiftwallet'

export const runtime = 'nodejs'

// Withdraw money to M-Pesa (B2C via Swiftwallet)
export async function POST(req: NextRequest) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { amountKES, phone, walletType } = body // walletType: 'main' | 'live'

  const amount = Number(amountKES)
  if (!amount || amount < 10) return NextResponse.json({ error: 'Minimum withdrawal is KES 10' }, { status: 400 })

  // Normalize phone
  let normalizedPhone = String(phone || '').replace(/[\s+\-()]/g, '')
  if (normalizedPhone.startsWith('07')) normalizedPhone = '254' + normalizedPhone.slice(1)
  else if (normalizedPhone.startsWith('01')) normalizedPhone = '254' + normalizedPhone.slice(1)
  else if (normalizedPhone.startsWith('7') && normalizedPhone.length === 9) normalizedPhone = '254' + normalizedPhone
  else if (normalizedPhone.startsWith('1') && normalizedPhone.length === 9) normalizedPhone = '254' + normalizedPhone
  if (!/^254[17]\d{8}$/.test(normalizedPhone)) {
    return NextResponse.json({ error: 'Invalid phone' }, { status: 400 })
  }

  const wallet = await db.wallet.findUnique({ where: { userId: me.id } })
  if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })

  // Check which balance to use
  const isLive = walletType === 'live'
  const balance = isLive ? wallet.liveBalance : wallet.balance

  // For live wallet: check 500 follower requirement
  if (isLive) {
    const followerCount = await db.follow.count({ where: { followingId: me.id } })
    if (followerCount < 500) {
      return NextResponse.json({
        error: `You need at least 500 followers to withdraw live earnings. You have ${followerCount} followers. Keep growing your audience!`,
      }, { status: 400 })
    }
  }

  const amountCents = Math.round(amount * 100)
  if (balance < amountCents) {
    return NextResponse.json({
      error: `Insufficient balance. You have KES ${(balance / 100).toFixed(2)} in your ${isLive ? 'live' : 'main'} wallet.`,
    }, { status: 400 })
  }

  const reference = `WD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`

  // Call Swiftwallet B2C
  const result = await initiateB2C(amount, normalizedPhone, reference)

  if (!result.success) {
    return NextResponse.json({
      error: result.error || 'Withdrawal failed. The payment wallet may have insufficient funds. Please try again later or contact support.',
    }, { status: 400 })
  }

  // Debit wallet and create transaction
  await db.$transaction([
    db.wallet.update({
      where: { id: wallet.id },
      data: isLive ? { liveBalance: { decrement: amountCents } } : { balance: { decrement: amountCents } },
    }),
    db.transaction.create({
      data: {
        walletId: wallet.id,
        type: isLive ? 'live_withdraw' : 'withdraw',
        amount: -amountCents,
        reference,
        status: 'completed',
      },
    }),
  ])

  return NextResponse.json({
    ok: true,
    message: `KES ${amount.toFixed(2)} withdrawn to ${normalizedPhone} via M-Pesa.`,
    reference,
  })
}
