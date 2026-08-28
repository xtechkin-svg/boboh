import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Get group by invite code (preview before joining)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const group = await db.chatGroup.findUnique({
    where: { inviteCode: String(code).trim().toUpperCase() },
    include: {
      _count: { select: { members: true } },
      creator: { select: { username: true, displayName: true, avatarUrl: true, verified: true, verifiedType: true } },
    },
  })
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  return NextResponse.json({ group })
}
