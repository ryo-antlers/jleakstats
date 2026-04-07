import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isFantasyRoute = createRouteMatcher(['/fantasy(.*)'])

const clerkHandler = clerkMiddleware(async (auth, request) => {
  const { pathname } = new URL(request.url)

  // /admin はBasic Auth保護
  if (pathname.startsWith('/admin')) {
    const authHeader = request.headers.get('authorization')
    if (authHeader) {
      const [scheme, encoded] = authHeader.split(' ')
      if (scheme === 'Basic' && encoded) {
        const decoded = atob(encoded)
        const colonIndex = decoded.indexOf(':')
        const password = decoded.slice(colonIndex + 1)
        if (password === process.env.SITE_PASSWORD) {
          return NextResponse.next()
        }
      }
    }
    return new Response('管理者のみアクセス可能です', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="jleakstats-admin"' },
    })
  }

  // /fantasy はClerk認証
  if (isFantasyRoute(request)) {
    await auth.protect()
  }

  return NextResponse.next()
})

export function proxy(request, event) {
  return clerkHandler(request, event)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
