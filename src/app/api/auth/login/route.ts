import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword, setSessionCookie } from '@/lib/session'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { username, password } = body
    if (!username || !password) {
      return NextResponse.json({ error: 'username and password required' }, { status: 400 })
    }
    const user = await db.user.findFirst({
      where: {
        OR: [
          { username: username.toLowerCase() },
          { email: username.toLowerCase() },
        ],
      },
    })
    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 400 })
    }
    const ok = await verifyPassword(password, user.passwordHash)
    if (!ok) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 400 })
    }

    // Check ban status — still let them log in (so they can see the banned screen + appeal)
    // but include banInfo in the response so client knows to redirect to banned screen
    const banInfo = user.banned ? {
      banned: true,
      reason: user.bannedReason,
      permanent: user.bannedPermanently,
      until: user.bannedUntil,
      bannedAt: user.bannedAt,
    } : null

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
      banInfo,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
