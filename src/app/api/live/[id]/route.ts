import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Get a single live stream
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSession()
  const stream = await db.liveStream.findUnique({
    where: { id },
    include: {
      host: { select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true, verifiedType: true, _count: { select: { gotFollows: true } } } },
      _count: { select: { viewers: true } },
      gifts: { take: 20, orderBy: { createdAt: 'desc' }, include: { fromUser: { select: { id: true, username: true, displayName: true, avatarUrl: true } } } },
    },
  })
  if (!stream) return NextResponse.json({ error: 'Stream not found' }, { status: 404 })

  // If I'm not the host, add me as a viewer
  if (me && me.id !== stream.hostId) {
    await db.liveViewer.upsert({
      where: { streamId_userId: { streamId: id, userId: me.id } },
      update: {},
      create: { streamId: id, userId: me.id },
    })
    await db.liveStream.update({ where: { id }, data: { viewerCount: { increment: 1 } } })
  }

  return NextResponse.json({ stream })
}

// End a live stream (host only)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const stream = await db.liveStream.findUnique({ where: { id } })
  if (!stream) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (stream.hostId !== me.id) return NextResponse.json({ error: 'Host only' }, { status: 403 })

  await db.liveStream.update({
    where: { id },
    data: { isLive: false, endedAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}
