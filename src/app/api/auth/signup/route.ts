import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, setSessionCookie } from '@/lib/session'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { username, email, password, displayName } = body

    if (!username || !password || !displayName) {
      return NextResponse.json({ error: 'username, password, and displayName are required' }, { status: 400 })
    }
    // Email is optional now (no email verification)
    const emailLower = email ? email.trim().toLowerCase() : null
    if (emailLower && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 })
    }
    if (username.length < 3 || username.length > 20) {
      return NextResponse.json({ error: 'Username must be 3-20 characters' }, { status: 400 })
    }
    if (!/^[a-zA-Z0-9_.]+$/.test(username)) {
      return NextResponse.json({ error: 'Username can only have letters, numbers, _ and .' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const existing = await db.user.findFirst({
      where: emailLower ? { OR: [{ username: username.toLowerCase() }, { email: emailLower }] } : { username: username.toLowerCase() },
    })
    if (existing) {
      return NextResponse.json({ error: 'Username or email already taken' }, { status: 400 })
    }

    const passwordHash = await hashPassword(password)
    const user = await db.user.create({
      data: {
        username: username.toLowerCase(),
        email: emailLower,
        passwordHash,
        displayName,
        // New email-signup users are unverified and must complete profile setup
        verified: false,
        verifiedType: '',
        profileSetupCompleted: false,
      },
    })

    await setSessionCookie(user.id)
    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        verified: user.verified,
        verifiedType: user.verifiedType,
        isAdmin: user.isAdmin,
        isPrivate: user.isPrivate,
        isOfficialAI: user.isOfficialAI,
        whatsappNumber: user.whatsappNumber,
        bio: user.bio,
        profileSetupCompleted: user.profileSetupCompleted,
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
