import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// End a call
export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const call = await db.call.findUnique({ where: { id } })
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  if (call.fromUserId !== me.id && call.toUserId !== me.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const updated = await db.call.update({
    where: { id },
    data: { status: 'ended', endedAt: new Date() },
  })
  return NextResponse.json({ ok: true, call: updated })
}
