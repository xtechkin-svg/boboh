import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Tap-tap like (increments like count)
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const stream = await db.liveStream.findUnique({ where: { id } })
  if (!stream || !stream.isLive) return NextResponse.json({ error: 'Stream not live' }, { status: 404 })

  await db.liveStream.update({
    where: { id },
    data: { likeCount: { increment: 1 } },
  })
  return NextResponse.json({ ok: true })
}
