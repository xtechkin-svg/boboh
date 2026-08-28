import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// POST /api/profile/setup — save profile setup data
// Body: { dateOfBirth?: string (ISO), gender?: 'male' | 'female', avatarUrl?: string, coverUrl?: string, step?: 'dob' | 'photos' | 'complete' }
// Returns updated user
export async function POST(req: NextRequest) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { dateOfBirth, gender, avatarUrl, coverUrl, step } = body as {
      dateOfBirth?: string
      gender?: 'male' | 'female'
      avatarUrl?: string
      coverUrl?: string
      step?: 'dob' | 'photos' | 'complete'
    }

    const update: {
      dateOfBirth?: Date
      gender?: string
      avatarUrl?: string
      coverUrl?: string
      profileSetupCompleted?: boolean
    } = {}

    // Step 'dob' — validate + save date of birth (15+) and gender
    if (step === 'dob') {
      if (!dateOfBirth) {
        return NextResponse.json({ error: 'Date of birth is required' }, { status: 400 })
      }
      const dob = new Date(dateOfBirth)
      if (isNaN(dob.getTime())) {
        return NextResponse.json({ error: 'Invalid date of birth' }, { status: 400 })
      }
      // Validate age >= 15
      const today = new Date()
      let age = today.getFullYear() - dob.getFullYear()
      const m = today.getMonth() - dob.getMonth()
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--
      if (age < 15) {
        return NextResponse.json({ error: 'You must be at least 15 years old to use Boboh Vibe' }, { status: 400 })
      }
      if (dob > today) {
        return NextResponse.json({ error: 'Date of birth cannot be in the future' }, { status: 400 })
      }
      update.dateOfBirth = dob

      if (gender && (gender === 'male' || gender === 'female')) {
        update.gender = gender
      } else {
        return NextResponse.json({ error: 'Please select male or female' }, { status: 400 })
      }
    }

    // Step 'photos' — save avatarUrl + coverUrl if provided (optional)
    if (step === 'photos') {
      if (avatarUrl) update.avatarUrl = avatarUrl
      if (coverUrl) update.coverUrl = coverUrl
    }

    // Step 'complete' — only flip the profileSetupCompleted flag.
    // DOB/gender/photos were already saved in previous steps, so DO NOT re-validate here.
    if (step === 'complete') {
      update.profileSetupCompleted = true
    }

    const updated = await db.user.update({
      where: { id: me.id },
      data: update,
      select: {
        id: true, username: true, displayName: true, avatarUrl: true,
        verified: true, verifiedType: true, bio: true, isPrivate: true,
        isAdmin: true, isOfficialAI: true, whatsappNumber: true,
        profileSetupCompleted: true, dateOfBirth: true, gender: true, coverUrl: true,
        _count: { select: { posts: true, gotFollows: true, sentFollows: true } },
      },
    })

    return NextResponse.json({ ok: true, user: updated })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET — return current user's profile setup status
export async function GET() {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: me.id },
    select: {
      profileSetupCompleted: true, dateOfBirth: true, gender: true,
      avatarUrl: true, coverUrl: true,
    },
  })
  return NextResponse.json({ user })
}
