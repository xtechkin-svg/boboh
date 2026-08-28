import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Swiftwallet webhook — called when M-Pesa transaction completes
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log('[SWIFTWALLET WEBHOOK]', JSON.stringify(body))

    // Swiftwallet STK callback payload:
    // { success, transaction_id, external_reference, checkout_request_id, merchant_request_id,
    //   status: "completed"|"failed"|"cancelled", result: { ResultCode, ResultDesc, MpesaReceiptNumber, ... } }
    const { external_reference, reference, checkout_request_id, status, result, result_code, mpesa_receipt_number } = body

    // Use external_reference (Swiftwallet's field) or fall back to reference
    const txRef = external_reference || reference
    if (!txRef) return NextResponse.json({ ok: true })

    // Find the pending transaction — match by reference prefix (our ref is VF-XXXX, webhook might have full or partial)
    const tx = await db.transaction.findFirst({
      where: { reference: { startsWith: txRef.slice(0, 20) }, status: 'pending' },
      include: { wallet: true },
    })

    if (!tx) {
      console.log('[WEBHOOK] No pending transaction for reference:', txRef)
      return NextResponse.json({ ok: true })
    }

    // Check if payment was successful
    // result.ResultCode 0 = success, anything else = failure
    // Also check top-level status and result_code for backwards compat
    const resultCode = result?.ResultCode ?? result_code
    const isSuccess = status === 'completed' || resultCode === 0 || resultCode === '0'

    if (isSuccess) {
      // Credit the wallet
      await db.$transaction([
        db.transaction.update({
          where: { id: tx.id },
          data: {
            status: 'completed',
            checkoutRequestId: checkout_request_id || tx.checkoutRequestId,
            reference: (result?.MpesaReceiptNumber || mpesa_receipt_number) ? `${tx.reference}|MPESA:${result?.MpesaReceiptNumber || mpesa_receipt_number}` : tx.reference,
          },
        }),
        db.wallet.update({
          where: { id: tx.walletId },
          data: { balance: { increment: tx.amount } },
        }),
      ])
      console.log('[WEBHOOK] Wallet credited:', tx.walletId, tx.amount)
    } else {
      // Mark as failed
      await db.transaction.update({
        where: { id: tx.id },
        data: { status: 'failed' },
      })
      console.log('[WEBHOOK] Transaction failed:', reference)
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    console.error('[WEBHOOK ERROR]', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: true })
  }
}
