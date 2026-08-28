import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import nodemailer from 'nodemailer'
import crypto from 'crypto'

export const runtime = 'nodejs'

// POST /api/auth/forgot-password
// Body: { emailOrUsername }
// Generates a reset token + sends email with reset link.
export async function POST(req: NextRequest) {
  try {
    const { emailOrUsername } = await req.json()
    if (!emailOrUsername || !emailOrUsername.trim()) {
      return NextResponse.json({ error: 'Email or username is required' }, { status: 400 })
    }

    const input = emailOrUsername.trim().toLowerCase()

    // Find user by email or username
    const user = await db.user.findFirst({
      where: {
        OR: [
          { email: input },
          { username: input },
        ],
      },
      select: { id: true, email: true, username: true, displayName: true, passwordHash: true },
    })

    // For security, always return success even if user not found
    // (don't leak which emails are registered)
    if (!user || !user.email || !user.passwordHash) {
      return NextResponse.json({ ok: true, message: 'If that account exists, a reset link has been sent to the email on file.' })
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 30 * 60 * 1000) // 30 minutes

    // Store token + expiry
    await db.user.update({
      where: { id: user.id },
      data: { passwordResetToken: token, passwordResetExpires: expires },
    })

    // Send email with reset link
    const GMAIL_USER = process.env.GMAIL_USER || 'xtechkin@gmail.com'
    const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD

    if (GMAIL_APP_PASSWORD) {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
        })

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.get('host') || 'boboh-vibes.2bd.net'}`
        const resetLink = `${baseUrl}/auth/forgotten-password?token=${token}`

        const html = `<div style="background:#0a0a0d;padding:40px 20px;font-family:Arial,sans-serif;">
<div style="max-width:480px;margin:0 auto;background:#0d0d10;border-radius:20px;border:1px solid #1a1a20;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#7c3aed,#5b21b6);padding:30px;text-align:center;">
    <h1 style="color:#d4af37;font-size:32px;margin:0;font-weight:bold;letter-spacing:-1px;">
      Boboh<span style="color:#fff;">Vibe</span>
    </h1>
    <p style="color:rgba(255,255,255,0.7);font-size:12px;margin-top:6px;letter-spacing:2px;">Boboh Vibe</p>
  </div>
  <div style="padding:32px 28px;">
    <p style="color:#f5f5f7;font-size:16px;margin:0 0 8px 0;">Hi ${user.displayName || user.username},</p>
    <p style="color:#b0b0b8;font-size:14px;line-height:1.6;margin:0 0 24px 0;">
      We received a request to reset your password. Click the button below to set a new password. This link will expire in 30 minutes.
    </p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${resetLink}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#7c3aed,#5b21b6);color:#fff;text-decoration:none;font-weight:bold;border-radius:12px;font-size:15px;box-shadow:0 4px 16px rgba(124,58,237,0.4);">
        Reset Password
      </a>
    </div>
    <p style="color:#666;font-size:12px;text-align:center;margin:18px 0 0 0;">
      If you didn't request this, you can safely ignore this email.<br/>
      Or copy this link: ${resetLink}
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
          to: user.email,
          subject: 'Reset your Boboh Vibe password',
          text: `Hi ${user.displayName || user.username},\n\nWe received a request to reset your password. Click this link to set a new password (expires in 30 minutes):\n\n${resetLink}\n\nIf you didn't request this, you can safely ignore this email.`,
          html,
        })

        console.log('[ForgotPassword] ✓ Reset email sent to:', user.email)
      } catch (emailError) {
        console.error('[ForgotPassword] ✗ Email send failed:', emailError instanceof Error ? emailError.message : 'unknown')
        return NextResponse.json({ error: 'Failed to send reset email. Please try again.' }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true, message: 'If that account exists, a reset link has been sent to the email on file.' })
  } catch (e: unknown) {
    console.error('[ForgotPassword] Route error:', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
