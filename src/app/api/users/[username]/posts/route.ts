import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Get all posts by a user (for profile grid pagination)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const user = await db.user.findUnique({ where: { username: username.toLowerCase() } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const posts = await db.post.findMany({
    where: { authorId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 60,
    select: {
      id: true, imageUrl: true, caption: true, createdAt: true, location: true,
      _count: { select: { likes: true, comments: true } },
    },
  })
  return NextResponse.json({ posts })
}
