import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export const config = {
  matcher: ['/((?!api|_next|favicon|robots|uploads|vibefam.apk|xfamvibe.apk|admin.apk|manifest|test).*)'],
}

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname

  // /@username/profile-setup → rewrite to / (SPA renders ProfileSetupView)
  const setupMatch = path.match(/^\/(@|%40)([a-zA-Z0-9_.-]+)\/profile-setup$/)
  if (setupMatch) {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    url.searchParams.set('_route', 'profile-setup')
    url.searchParams.set('_user', decodeURIComponent(setupMatch[2]))
    return NextResponse.rewrite(url)
  }

  // /@username → rewrite to / (SPA renders profile)
  const atMatch = path.match(/^\/(@|%40)([a-zA-Z0-9_.-]+)$/)
  if (atMatch) {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    url.searchParams.set('_route', 'profile')
    url.searchParams.set('_user', decodeURIComponent(atMatch[2]))
    return NextResponse.rewrite(url)
  }

  // Route map — all rewrite to / (URL stays visible)
  const routeMap: Record<string, string> = {
    '/auth/login': 'auth-login',
    '/auth/register': 'auth-register',
    '/auth/signup': 'auth-register',
    '/auth/verify-email': 'auth-verify',
    '/auth/forgotten-password': 'auth-forgot',
    '/auth/forgot-password': 'auth-forgot',
    '/home': 'feed',
    '/home/feeds': 'feed',
    '/feeds': 'feed',
    '/messages': 'dm',
    '/dm': 'dm',
    '/profile': 'myprofile',
    '/discover': 'discover',
    '/explore': 'discover',
    '/notifications': 'notifications',
    '/create': 'create',
    '/create-post': 'create',
    '/groups': 'groups',
    '/live': 'live',
    '/wallet': 'wallet',
  }

  if (routeMap[path]) {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    url.searchParams.set('_route', routeMap[path])
    return NextResponse.rewrite(url)
  }

  return NextResponse.next()
}
