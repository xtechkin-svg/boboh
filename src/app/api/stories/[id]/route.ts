import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// DELETE /api/stories/[id] — delete a story (only the owner can delete)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: storyId } = await params

  const story = await db.story.findUnique({ where: { id: storyId }, select: { authorId: true } })
  if (!story) return NextResponse.json({ error: 'Story not found' }, { status: 404 })
  if (story.authorId !== me.id) {
    return NextResponse.json({ error: 'You can only delete your own stories' }, { status: 403 })
  }

  // Delete the story and its comments (cascade)
  await db.storyComment.deleteMany({ where: { storyId } })
  await db.story.delete({ where: { id: storyId } })

  return NextResponse.json({ ok: true })
}
