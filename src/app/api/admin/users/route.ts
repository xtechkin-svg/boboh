import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Get all users (admin only) — includes ban info
export async function GET() {
  const me = await getAdminSession()
  if (!me?.isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const users = await db.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, username: true, displayName: true, email: true, phone: true,
      avatarUrl: true, verified: true, verifiedType: true, isAdmin: true,
      isPrivate: true, createdAt: true, bio: true,
      // Ban fields
      banned: true, bannedReason: true, bannedPermanently: true, bannedUntil: true, bannedAt: true,
      _count: { select: { posts: true, gotFollows: true, sentFollows: true } },
    },
  })
  return NextResponse.json({ users })
}

// Delete a user (admin only) — body: { userId }
export async function DELETE(req: Request) {
  const me = await getAdminSession()
  if (!me?.isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  // Prevent deleting other admins or yourself
  const target = await db.user.findUnique({ where: { id: userId } })
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (target.isAdmin) return NextResponse.json({ error: 'Cannot delete an admin' }, { status: 400 })

  await db.user.delete({ where: { id: userId } })
  return NextResponse.json({ ok: true })
}
