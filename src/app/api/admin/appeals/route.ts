import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// GET — list all appeals (admin only)
// POST — submit a new appeal (any logged-in user, for their own ban)
// PATCH — resolve an appeal (admin only): { appealId, status: 'approved'|'rejected', adminNotes }

export async function GET(req: NextRequest) {
  const me = await getAdminSession()
  if (!me?.isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || 'pending'

  const appeals = await db.banAppeal.findMany({
    where: status === 'all' ? {} : { status },
    orderBy: { createdAt: 'desc' },
    include: {
      user: {
        select: {
          id: true, username: true, displayName: true, avatarUrl: true,
          banned: true, bannedReason: true, bannedPermanently: true, bannedUntil: true, bannedAt: true,
        },
      },
    },
  })

  return NextResponse.json({ appeals })
}

// User submits an appeal for their own ban
export async function POST(req: NextRequest) {
  // This endpoint is for the banned USER, not the admin — use regular getSession
  const { getSession } = await import('@/lib/session')
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // User must be banned to appeal
  const user = await db.user.findUnique({ where: { id: me.id } })
  if (!user?.banned) return NextResponse.json({ error: 'You are not banned' }, { status: 400 })

  // Don't allow permanent bans to appeal
  if (user.bannedPermanently) {
    return NextResponse.json({ error: 'Your account is permanently banned and cannot be appealed. Contact support.' }, { status: 400 })
  }

  // Check for existing pending appeal
  const existing = await db.banAppeal.findFirst({
    where: { userId: me.id, status: 'pending' },
  })
  if (existing) return NextResponse.json({ error: 'You already have a pending appeal. Please wait for admin review.' }, { status: 400 })

  const { reason } = await req.json()
  if (!reason || !reason.trim()) return NextResponse.json({ error: 'Reason required' }, { status: 400 })

  const appeal = await db.banAppeal.create({
    data: {
      userId: me.id,
      reason: reason.trim().slice(0, 1000),
    },
  })

  return NextResponse.json({ ok: true, appeal })
}

// Admin resolves an appeal
export async function PATCH(req: NextRequest) {
  const me = await getAdminSession()
  if (!me?.isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { appealId, status, adminNotes } = await req.json()
  if (!appealId) return NextResponse.json({ error: 'appealId required' }, { status: 400 })
  if (status !== 'approved' && status !== 'rejected') {
    return NextResponse.json({ error: 'status must be approved or rejected' }, { status: 400 })
  }

  const appeal = await db.banAppeal.findUnique({ where: { id: appealId } })
  if (!appeal) return NextResponse.json({ error: 'Appeal not found' }, { status: 404 })
  if (appeal.status !== 'pending') return NextResponse.json({ error: 'Appeal already resolved' }, { status: 400 })

  await db.banAppeal.update({
    where: { id: appealId },
    data: {
      status,
      adminNotes: (adminNotes || '').slice(0, 500),
      resolvedAt: new Date(),
    },
  })

  if (status === 'approved') {
    // Unban the user
    await db.user.update({
      where: { id: appeal.userId },
      data: {
        banned: false,
        bannedReason: '',
        bannedPermanently: false,
        bannedUntil: null,
        bannedAt: null,
      },
    })
    if (me.userId) {
      await db.notification.create({
        data: {
          toUserId: appeal.userId,
          fromUserId: me.userId,
          type: 'gift',
          text: '✅ Your ban appeal was approved. Welcome back to VibeFam!',
        },
      }).catch(() => {})
    }
  } else {
    // Reject — ban permanently (no further appeals)
    await db.user.update({
      where: { id: appeal.userId },
      data: {
        bannedPermanently: true,
        bannedUntil: null,
      },
    })
    if (me.userId) {
      await db.notification.create({
        data: {
          toUserId: appeal.userId,
          fromUserId: me.userId,
          type: 'gift',
          text: `❌ Your ban appeal was rejected. Your account is now permanently banned.${adminNotes ? ` Note: ${adminNotes}` : ''}`,
        },
      }).catch(() => {})
    }
  }

  return NextResponse.json({ ok: true })
}
