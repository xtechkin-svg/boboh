import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Initiate a call (voice/video)
export async function POST(req: NextRequest) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { toUsername, toUserId, type } = body // type: 'voice' | 'video'

  let targetId = toUserId
  if (!targetId && toUsername) {
    const u = await db.user.findUnique({ where: { username: toUsername.toLowerCase() } })
    if (!u) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    targetId = u.id
  }
  if (!targetId) return NextResponse.json({ error: 'toUsername or toUserId required' }, { status: 400 })
  if (targetId === me.id) return NextResponse.json({ error: "Can't call yourself" }, { status: 400 })

  const call = await db.call.create({
    data: { fromUserId: me.id, toUserId: targetId, type: type || 'voice', status: 'ringing' },
  })

  await db.notification.create({
    data: { toUserId: targetId, fromUserId: me.id, type: 'call', text: `is calling you (${type || 'voice'})` },
  })

  return NextResponse.json({ call })
}

// Get call history OR incoming ringing calls (for incoming-call UI polling)
// ?incoming=1 → returns only calls where I'm the recipient AND status is 'ringing'
export async function GET(req: NextRequest) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const incomingOnly = url.searchParams.get('incoming') === '1'

  if (incomingOnly) {
    // Get incoming calls that are still ringing (for the incoming-call overlay)
    const calls = await db.call.findMany({
      where: { toUserId: me.id, status: 'ringing' },
      orderBy: { startedAt: 'desc' },
      take: 5,
      include: {
        fromUser: { select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true, verifiedType: true } },
      },
    })
    return NextResponse.json({ calls })
  }

  // Default: full call history
  const calls = await db.call.findMany({
    where: { OR: [{ fromUserId: me.id }, { toUserId: me.id }] },
    orderBy: { startedAt: 'desc' },
    take: 20,
    include: {
      fromUser: { select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true, verifiedType: true } },
      toUser: { select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true, verifiedType: true } },
    },
  })
  return NextResponse.json({ calls })
}
