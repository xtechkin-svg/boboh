import { NextRequest, NextResponse } from 'next/server'
import { getSession, setSessionCookie, verifyPassword } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Switch to another account (by logging in with stored credentials)
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { username, password } = body
  if (!username || !password) return NextResponse.json({ error: 'Username and password required' }, { status: 400 })

  const user = await db.user.findFirst({ where: { OR: [{ username: username.toLowerCase() }, { email: username.toLowerCase() }] } })
  if (!user || !user.passwordHash) return NextResponse.json({ error: 'Invalid credentials' }, { status: 400 })
  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) return NextResponse.json({ error: 'Invalid credentials' }, { status: 400 })

  await setSessionCookie(user.id)
  return NextResponse.json({
    ok: true,
    user: {
      id: user.id, username: user.username, displayName: user.displayName,
      avatarUrl: user.avatarUrl, verified: user.verified, verifiedType: user.verifiedType,
      isAdmin: user.isAdmin, isPrivate: user.isPrivate, isOfficialAI: user.isOfficialAI,
      whatsappNumber: user.whatsappNumber, bio: user.bio,
    },
  })
}
