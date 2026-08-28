// Swiftwallet M-Pesa API integration
// Docs: https://swiftwallet.co.ke/v3/docs
// Base URL: https://swiftwallet.co.ke/v3

const SW_BASE = 'https://swiftwallet.co.ke/v3'
const SW_API_KEY = process.env.SWIFTWALLET_API_KEY || 'sw_cad6ed872b2b58e7f08f7a72b9db1bfc3bdc9ce014a3ef51fdb6f627'

export interface StkPushResult {
  success: boolean
  status?: string
  message?: string
  reference?: string
  transaction_id?: number
  checkout_request_id?: string
  merchant_request_id?: string
  error?: string
}

export interface B2CResult {
  success: boolean
  status?: string
  message?: string
  reference?: string
  transaction_id?: number
  error?: string
}

// Initiate STK Push (collect money from user's M-Pesa)
export async function initiateStkPush(amount: number, phoneNumber: string, reference: string, callbackUrl?: string): Promise<StkPushResult> {
  try {
    const body: Record<string, unknown> = {
      amount,
      phone_number: phoneNumber,
      reference,
    }
    if (callbackUrl) body.callback_url = callbackUrl

    const res = await fetch(`${SW_BASE}/stk-initiate/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SW_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return data
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'STK push failed' }
  }
}

// Initiate B2C payment (send money to user's M-Pesa — for withdrawals)
export async function initiateB2C(amount: number, phoneNumber: string, reference: string, callbackUrl?: string): Promise<B2CResult> {
  try {
    const body: Record<string, unknown> = {
      amount,
      phone_number: phoneNumber,
      reference,
    }
    if (callbackUrl) body.callback_url = callbackUrl

    const res = await fetch(`${SW_BASE}/pay-request/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SW_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return data
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'B2C payment failed' }
  }
}

// Check transaction status — uses query params per Swiftwallet API docs
// Can look up by checkout_request_id, mpesa_receipt, or external reference
export async function checkTransactionStatus(transactionId: string): Promise<unknown> {
  try {
    // The API uses query params, not path params
    // GET /v3/transactions/?checkout_request_id=XXX or ?mpesa_receipt=XXX
    const params = new URLSearchParams()
    // If it looks like a checkout_request_id (starts with ws_CO), use that param
    if (transactionId.startsWith('ws_CO') || transactionId.startsWith('WR')) {
      params.append('checkout_request_id', transactionId)
    } else {
      // Otherwise treat as external reference
      params.append('external_reference', transactionId)
    }
    const res = await fetch(`${SW_BASE}/transactions/?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${SW_API_KEY}` },
    })
    const data = await res.json()
    return data
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Status check failed' }
  }
}
