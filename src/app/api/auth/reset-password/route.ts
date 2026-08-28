import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/session'

export const runtime = 'nodejs'

// POST /api/auth/reset-password
// Body: { token, newPassword }
// Verifies the token + sets the new password.
export async function POST(req: NextRequest) {
  try {
    const { token, newPassword } = await req.json()
    if (!token || !newPassword) {
      return NextResponse.json({ error: 'Token and new password are required' }, { status: 400 })
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    // Find user by token
    const user = await db.user.findFirst({
      where: { passwordResetToken: token },
      select: { id: true, passwordResetExpires: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'Invalid or expired reset link. Please request a new one.' }, { status: 400 })
    }

    // Check expiry
    if (!user.passwordResetExpires || new Date(user.passwordResetExpires) < new Date()) {
      return NextResponse.json({ error: 'This reset link has expired. Please request a new one.' }, { status: 400 })
    }

    // Hash new password + clear token
    const passwordHash = await hashPassword(newPassword)
    await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    })

    console.log('[ResetPassword] ✓ Password reset for user:', user.id)
    return NextResponse.json({ ok: true, message: 'Password reset successfully. You can now log in with your new password.' })
  } catch (e: unknown) {
    console.error('[ResetPassword] Route error:', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
