import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { setSessionCookie } from '@/lib/session'

export const runtime = 'nodejs'

// Google Sign-in / Sign-up
// Body: { googleId, email, displayName, photoURL }
// If user exists with this email → login. If not → create account.
// Google users are normal users — NO verification badge.
export async function POST(req: NextRequest) {
  const { googleId, email, displayName, photoURL } = await req.json()
  if (!email || !googleId) {
    return NextResponse.json({ error: 'Google ID and email required' }, { status: 400 })
  }

  const emailLower = email.trim().toLowerCase()

  // Check if user exists with this email
  let user = await db.user.findUnique({ where: { email: emailLower } })

  if (!user) {
    // Create new user — Google users skip email verification (Google already verified)
    // BUT they are normal users with NO badge, and they must complete profile setup.
    let username = (displayName || email.split('@')[0]).toLowerCase().replace(/[^a-z0-9_.]/g, '')
    if (!username) username = 'user' + Math.floor(Math.random() * 99999)
    // Ensure username is unique
    const existing = await db.user.findUnique({ where: { username } })
    if (existing) {
      username = username + Math.floor(Math.random() * 9999)
    }

    user = await db.user.create({
      data: {
        username,
        email: emailLower,
        displayName: displayName || username,
        avatarUrl: photoURL || '',
        // NO verified badge — Google users are normal users
        verified: false,
        verifiedType: '',
        profileSetupCompleted: false, // must complete Facebook-style setup
        // No passwordHash — Google users don't need a password
      },
    })
  }

  // Set session cookie
  await setSessionCookie(user.id)

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      verified: user.verified,
      verifiedType: user.verifiedType,
      isAdmin: user.isAdmin,
      isPrivate: user.isPrivate,
      isOfficialAI: user.isOfficialAI,
      whatsappNumber: user.whatsappNumber,
      bio: user.bio,
      profileSetupCompleted: user.profileSetupCompleted,
    },
  })
}
