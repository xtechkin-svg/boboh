import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/session'
import nodemailer from 'nodemailer'
import crypto from 'crypto'

export const runtime = 'nodejs'

// POST /api/auth/security — 3 actions:
//   { action: 'send-code' } → generates 6-digit code, emails it
//   { action: 'verify-code', code } → verifies the code
//   { action: 'change-password', code, newPassword } → verifies code + sets new password
export async function POST(req: NextRequest) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { action } = body

    const user = await db.user.findUnique({
      where: { id: me.id },
      select: { id: true, email: true, username: true, displayName: true, passwordHash: true, securityCode: true, securityCodeExpires: true, avatarUrl: true, bio: true, isPrivate: true, coverUrl: true, dateOfBirth: true, gender: true, createdAt: true, whatsappNumber: true, verified: true, verifiedType: true, isAdmin: true, _count: { select: { posts: true, gotFollows: true, sentFollows: true } } },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // Action 1: Send verification code
    if (action === 'send-code') {
      if (!user.email) return NextResponse.json({ error: 'No email on file' }, { status: 400 })
      const code = Math.floor(100000 + Math.random() * 900000).toString()
      const expires = new Date(Date.now() + 10 * 60 * 1000) // 10 min

      await db.user.update({
        where: { id: me.id },
        data: { securityCode: code, securityCodeExpires: expires },
      })

      const GMAIL_USER = process.env.GMAIL_USER || 'xtechkin@gmail.com'
      const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD
      if (GMAIL_APP_PASSWORD) {
        try {
          const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD } })
          await transporter.sendMail({
            from: `Boboh Vibe <${GMAIL_USER}>`,
            to: user.email,
            subject: `Your security code: ${code}`,
            text: `Your Boboh Vibe security code is: ${code}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this, someone may be trying to access your account.`,
            html: `<div style="background:#0a0a0d;padding:40px 20px;font-family:Arial,sans-serif;"><div style="max-width:480px;margin:0 auto;background:#0d0d10;border-radius:20px;border:1px solid #1a1a20;"><div style="background:linear-gradient(135deg,#7c3aed,#5b21b6);padding:30px;text-align:center;"><h1 style="color:#d4af37;font-size:28px;margin:0;">Boboh<span style="color:#fff;">Vibe</span></h1></div><div style="padding:30px;"><p style="color:#f5f5f7;font-size:16px;">Hi ${user.displayName || user.username},</p><p style="color:#b0b0b8;font-size:14px;">Use this code to verify your identity:</p><div style="text-align:center;margin:20px 0;"><div style="display:inline-block;padding:16px 40px;background:#1a1020;border-radius:12px;border:2px solid #7c3aed;"><span style="font-size:36px;font-weight:bold;color:#d4af37;letter-spacing:10px;font-family:monospace;">${code}</span></div></div><p style="color:#666;font-size:12px;text-align:center;">Expires in 10 minutes. If you didn't request this, secure your account immediately.</p></div></div></div>`,
          })
        } catch (e) {
          return NextResponse.json({ error: 'Failed to send code' }, { status: 500 })
        }
      }
      return NextResponse.json({ ok: true, message: 'Verification code sent to your email' })
    }

    // Action 2: Verify code
    if (action === 'verify-code') {
      const { code } = body
      if (!code) return NextResponse.json({ error: 'Code required' }, { status: 400 })
      if (!user.securityCode || !user.securityCodeExpires) {
        return NextResponse.json({ error: 'No code sent. Please request a new one.' }, { status: 400 })
      }
      if (new Date(user.securityCodeExpires) < new Date()) {
        return NextResponse.json({ error: 'Code expired. Please request a new one.' }, { status: 400 })
      }
      if (user.securityCode !== code.trim()) {
        return NextResponse.json({ error: 'Invalid code' }, { status: 400 })
      }
      return NextResponse.json({ ok: true })
    }

    // Action 3: Change password (verify code + set new)
    if (action === 'change-password') {
      const { code, newPassword } = body
      if (!code || !newPassword) return NextResponse.json({ error: 'Code and new password required' }, { status: 400 })
      if (newPassword.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })

      // Verify code
      if (!user.securityCode || !user.securityCodeExpires || new Date(user.securityCodeExpires) < new Date() || user.securityCode !== code.trim()) {
        return NextResponse.json({ error: 'Invalid or expired code. Please request a new one.' }, { status: 400 })
      }

      const passwordHash = await hashPassword(newPassword)
      await db.user.update({
        where: { id: me.id },
        data: { passwordHash, securityCode: null, securityCodeExpires: null },
      })
      return NextResponse.json({ ok: true, message: 'Password changed successfully' })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

// GET /api/auth/security — return full account info for Account & Security page
export async function GET() {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: me.id },
    select: {
      id: true, username: true, displayName: true, email: true, avatarUrl: true,
      bio: true, isPrivate: true, coverUrl: true, dateOfBirth: true, gender: true,
      createdAt: true, whatsappNumber: true, verified: true, verifiedType: true,
      isAdmin: true, profileSetupCompleted: true,
      displayNameChangedAt: true, displayNameChangeCount: true,
      _count: { select: { posts: true, gotFollows: true, sentFollows: true } },
    },
  })
  return NextResponse.json({ user })
}
