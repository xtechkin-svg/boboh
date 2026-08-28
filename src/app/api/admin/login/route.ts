import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword, setSessionCookie } from '@/lib/session'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()
  const user = await db.user.findFirst({
    where: {
      OR: [{ username: username.toLowerCase() }, { email: username.toLowerCase() }],
      isAdmin: true,
    },
  })
  if (!user || !user.passwordHash) return NextResponse.json({ error: 'Invalid admin credentials' }, { status: 400 })
  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) return NextResponse.json({ error: 'Invalid admin credentials' }, { status: 400 })
  await setSessionCookie(user.id)
  return NextResponse.json({ ok: true, isAdmin: true, user: { id: user.id, username: user.username, displayName: user.displayName } })
}
