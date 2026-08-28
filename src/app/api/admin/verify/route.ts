import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Set verification badge (admin only — accepts either user-session admin OR dashboard admin)
// verifiedType: blue | red | green | black | "" (remove)
export async function POST(req: NextRequest) {
  const me = await getAdminSession()
  if (!me?.isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const body = await req.json()
  const { userId, verifiedType } = body
  // verifiedType: 'blue' | 'red' | 'green' | 'black' | '' (remove badge)
  const isVerified = verifiedType === 'blue' || verifiedType === 'red' || verifiedType === 'green' || verifiedType === 'black'

  const user = await db.user.update({
    where: { id: userId },
    data: {
      verified: isVerified,
      verifiedType: isVerified ? verifiedType : '',
    },
    select: { id: true, username: true, displayName: true, verified: true, verifiedType: true },
  })

  // Notify the user
  if (me.userId) {
    await db.notification.create({
      data: {
        toUserId: userId,
        fromUserId: me.userId,
        type: 'gift',
        text: isVerified ? `Your account has been verified with a ${verifiedType} badge! ✅` : 'Your verification badge has been removed.',
      },
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true, user })
}
