import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { initiateStkPush } from '@/lib/swiftwallet'

export const runtime = 'nodejs'

// Initiate REAL M-Pesa STK push via Swiftwallet
export async function POST(req: NextRequest) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { amountKES, phone } = body

  const amount = Number(amountKES)
  if (!amount || amount < 30) return NextResponse.json({ error: 'Minimum top-up is KES 30' }, { status: 400 })
  if (amount > 70000) return NextResponse.json({ error: 'Maximum top-up is KES 70,000' }, { status: 400 })

  // Normalize phone
  let normalizedPhone = String(phone || '').replace(/[\s+\-()]/g, '')
  if (normalizedPhone.startsWith('07')) normalizedPhone = '254' + normalizedPhone.slice(1)
  else if (normalizedPhone.startsWith('01')) normalizedPhone = '254' + normalizedPhone.slice(1)
  else if (normalizedPhone.startsWith('7') && normalizedPhone.length === 9) normalizedPhone = '254' + normalizedPhone
  else if (normalizedPhone.startsWith('1') && normalizedPhone.length === 9) normalizedPhone = '254' + normalizedPhone
  if (!/^254[17]\d{8}$/.test(normalizedPhone)) {
    return NextResponse.json({ error: 'Invalid phone. Use 07XXXXXXXX or 2547XXXXXXXX' }, { status: 400 })
  }

  const wallet = await db.wallet.upsert({
    where: { userId: me.id },
    update: {},
    create: { userId: me.id },
  })

  const amountCents = Math.round(amount * 100)
  const reference = `VF-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`

  // Build webhook URL for live payment confirmation
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.get('host') || 'boboh-vibes.2bd.net'}`
  const callbackUrl = `${baseUrl}/api/wallet/webhook`

  // Call real Swiftwallet API
  const result = await initiateStkPush(amount, normalizedPhone, reference, callbackUrl)

  if (!result.success) {
    return NextResponse.json({
      error: result.error || result.message || 'STK push failed. Try again.',
    }, { status: 400 })
  }

  // Create a PENDING transaction — will be marked completed when webhook fires
  await db.transaction.create({
    data: {
      walletId: wallet.id,
      type: 'topup',
      amount: amountCents,
      reference,
      status: 'pending',
      checkoutRequestId: result.checkout_request_id || '',
    },
  })

  return NextResponse.json({
    ok: true,
    message: `STK Push sent to ${normalizedPhone}. Enter your M-Pesa PIN to complete.`,
    reference,
    checkoutRequestId: result.checkout_request_id,
    transactionId: result.transaction_id,
    status: 'pending',
  })
}
