import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import nodemailer from 'nodemailer'

export const runtime = 'nodejs'

// POST /api/auth/send-verification
// Body: { email }
// Generates a 6-digit code, stores it in VerificationCode table, emails it to the user.
// Returns { ok: true, message: 'Code sent to your email' } on success.
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Basic email format validation
    const emailLower = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 })
    }

    // Check if email is already registered
    const existing = await db.user.findUnique({ where: { email: emailLower } })
    if (existing) {
      return NextResponse.json({ error: 'Email already in use. Try logging in instead.' }, { status: 400 })
    }

    // Generate 6-digit code + 10-minute expiry
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const expires = String(Date.now() + 10 * 60 * 1000) // 10 minutes

    // Delete any previous codes for this email, then insert the new one
    await db.verificationCode.deleteMany({ where: { email: emailLower } })
    await db.verificationCode.create({
      data: {
        email: emailLower,
        code,
        expires,
      },
    })

    // Send the email
    const GMAIL_USER = process.env.GMAIL_USER || 'xtechkin@gmail.com'
    const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD

    if (!GMAIL_APP_PASSWORD) {
      console.error('[Email] No GMAIL_APP_PASSWORD env var set — cannot send email')
      return NextResponse.json({ error: 'Email service not configured. Please contact support.' }, { status: 500 })
    }

    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
      })

      const emailHtml = `<div style="background:#0a0a0d;padding:40px 20px;font-family:Arial,sans-serif;">
<div style="max-width:480px;margin:0 auto;background:#0d0d10;border-radius:20px;border:1px solid #1a1a20;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#7c3aed,#5b21b6);padding:30px;text-align:center;">
    <h1 style="color:#d4af37;font-size:32px;margin:0;font-weight:bold;letter-spacing:-1px;">
      Boboh<span style="color:#fff;">Vibe</span>
    </h1>
    <p style="color:rgba(255,255,255,0.7);font-size:12px;margin-top:6px;letter-spacing:2px;">Boboh Vibe Verification</p>
  </div>
  <div style="padding:32px 28px;">
    <p style="color:#f5f5f7;font-size:16px;margin:0 0 8px 0;">Welcome to Boboh Vibe! 👋</p>
    <p style="color:#b0b0b8;font-size:14px;line-height:1.6;margin:0 0 24px 0;">
      Please use the verification code below to complete your sign-up. This code will expire in 10 minutes.
    </p>
    <div style="text-align:center;margin:24px 0;">
      <div style="display:inline-block;padding:18px 44px;background:#1a1020;border-radius:14px;border:2px solid #7c3aed;box-shadow:0 0 24px rgba(124,58,237,0.3);">
        <span style="font-size:38px;font-weight:bold;color:#d4af37;letter-spacing:12px;font-family:'Courier New',monospace;">${code}</span>
      </div>
    </div>
    <p style="color:#666;font-size:12px;text-align:center;margin:18px 0 0 0;">
      If you didn't request this code, you can safely ignore this email.
    </p>
  </div>
  <div style="padding:20px;border-top:1px solid #1a1a20;text-align:center;background:#0a0a0d;">
    <p style="color:#d4af37;font-size:16px;font-weight:bold;margin:0;letter-spacing:1px;">VIBEFAM</p>
    <p style="color:#555;font-size:11px;margin:4px 0 0 0;">Your community. Your moments.</p>
  </div>
</div>
</div>`

      await transporter.sendMail({
        from: `Boboh Vibe <${GMAIL_USER}>`,
        to: emailLower,
        subject: `Your xfamvibe verification code: ${code}`,
        text: `Your Boboh Vibe verification code is: ${code}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this code, you can safely ignore this email.`,
        html: emailHtml,
      })

      console.log('[Email] ✓ Verification code sent to:', emailLower)
      return NextResponse.json({ ok: true, message: 'Verification code sent to your email' })
    } catch (emailError) {
      console.error('[Email] ✗ SMTP send failed:', emailError instanceof Error ? emailError.message : 'unknown')
      // Don't leak the code in production — return a proper error
      return NextResponse.json(
        { error: 'Failed to send verification email. Please check your email address and try again.' },
        { status: 500 }
      )
    }
  } catch (e: unknown) {
    console.error('[Email] Route error:', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

// PATCH /api/auth/send-verification
// Body: { email, code }
// Verifies the 6-digit code entered by the user. Returns { ok: true } on success.
export async function PATCH(req: NextRequest) {
  try {
    const { email, code } = await req.json()
    if (!email || !code) {
      return NextResponse.json({ error: 'Email and code are required' }, { status: 400 })
    }

    const emailLower = email.trim().toLowerCase()
    const codeTrim = code.trim()

    // Find the most recent code for this email
    const records = await db.verificationCode.findMany({
      where: { email: emailLower },
      orderBy: { createdAt: 'desc' },
      take: 1,
    })

    if (!records || records.length === 0) {
      return NextResponse.json({ ok: false, error: 'No verification code found. Please request a new one.' })
    }

    const stored = records[0]

    // Check expiry
    if (Date.now() > Number(stored.expires)) {
      await db.verificationCode.deleteMany({ where: { email: emailLower } })
      return NextResponse.json({ ok: false, error: 'Your code has expired. Please request a new one.' })
    }

    // Check code match
    if (stored.code !== codeTrim) {
      return NextResponse.json({ ok: false, error: 'Invalid code. Please check your email and try again.' })
    }

    // Success — delete the used code
    await db.verificationCode.deleteMany({ where: { email: emailLower } })
    console.log('[Email] ✓ Verified:', emailLower)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    console.error('[Email] PATCH route error:', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
