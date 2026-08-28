import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { checkTransactionStatus } from '@/lib/swiftwallet'

export const runtime = 'nodejs'

// GET /api/wallet/status/[reference]
// Returns the live status of a transaction by reference.
// Checks the local DB first, then falls back to Swiftwallet API for a live update.
export async function GET(req: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reference } = await params
  if (!reference) return NextResponse.json({ error: 'Reference required' }, { status: 400 })

  // Find the transaction in the DB
  const tx = await db.transaction.findFirst({
    where: { reference: { startsWith: reference } },
    include: { wallet: true },
  })

  if (!tx) {
    return NextResponse.json({ status: 'not_found' }, { status: 404 })
  }

  // If already completed or failed, return immediately
  if (tx.status === 'completed' || tx.status === 'failed') {
    return NextResponse.json({
      status: tx.status,
      amount: tx.amount,
      reference: tx.reference,
    })
  }

  // Transaction is still pending — check Swiftwallet API for live status
  // The Swiftwallet transaction ID might be stored in checkoutRequestId
  // or we can use the reference to query
  try {
    // Use checkout_request_id for Swiftwallet API lookup (most reliable)
    // Fall back to our reference (external_reference)
    const swTransactionId = tx.checkoutRequestId || tx.reference
    const swStatus: any = await checkTransactionStatus(swTransactionId)

    // Swiftwallet returns: { transaction: { status: "completed"|"failed"|"pending"|"cancelled", ... } }
    // or { transactions: [...] } for list queries
    const swTx = swStatus?.transaction || (swStatus?.transactions && swStatus?.transactions[0]) || swStatus
    const swStatusCode = swTx?.status || swTx?.result?.ResultCode || swTx?.result_code
    const isSuccess = swTx?.status === 'completed' || swTx?.result?.ResultCode === 0 || swTx?.result_code === 0 || swTx?.result_code === '0'
    const isFailed = swTx?.status === 'failed' || swTx?.status === 'cancelled' ||
      (swTx?.result?.ResultCode && swTx?.result?.ResultCode !== 0) ||
      (swTx?.result_code && swTx?.result_code !== 0 && swTx?.result_code !== '0')

    if (isSuccess && tx.status === 'pending') {
      // Credit the wallet — webhook might have missed it
      await db.$transaction([
        db.transaction.update({
          where: { id: tx.id },
          data: { status: 'completed' },
        }),
        db.wallet.update({
          where: { id: tx.walletId },
          data: { balance: { increment: tx.amount } },
        }),
      ])
      console.log('[STATUS POLL] Wallet credited via polling:', tx.walletId, tx.amount)
      return NextResponse.json({ status: 'completed', amount: tx.amount, reference: tx.reference })
    }

    if (isFailed && tx.status === 'pending') {
      await db.transaction.update({
        where: { id: tx.id },
        data: { status: 'failed' },
      })
      console.log('[STATUS POLL] Transaction marked failed via polling:', tx.reference)
      return NextResponse.json({
        status: 'failed',
        reason: swTx?.result?.ResultDesc || swTx?.message || swStatus?.message || 'Payment failed',
        amount: tx.amount,
        reference: tx.reference,
      })
    }
  } catch (e: any) {
    // Swiftwallet API error — just return pending, will retry on next poll
    console.error('[STATUS POLL] Swiftwallet check error:', e?.message)
  }

  // Still pending
  return NextResponse.json({
    status: 'pending',
    amount: tx.amount,
    reference: tx.reference,
  })
}
