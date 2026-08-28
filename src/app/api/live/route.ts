import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Get all live streams
export async function GET() {
  const streams = await db.liveStream.findMany({
    where: { isLive: true },
    orderBy: { viewerCount: 'desc' },
    take: 50,
    include: {
      host: { select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true, verifiedType: true } },
      _count: { select: { viewers: true } },
    },
  })
  return NextResponse.json({ streams })
}

// Start a live stream
export async function POST(req: NextRequest) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check if already live
  const existing = await db.liveStream.findFirst({ where: { hostId: me.id, isLive: true } })
  if (existing) return NextResponse.json({ stream: existing })

  const body = await req.json().catch(() => ({}))
  const stream = await db.liveStream.create({
    data: { hostId: me.id, title: body.title || `${me.displayName} is live!` },
    include: {
      host: { select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true, verifiedType: true } },
    },
  })
  return NextResponse.json({ stream })
}
