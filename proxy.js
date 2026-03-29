import { NextResponse } from 'next/server'

export function proxy(request) {
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

  return new Response('このサイトはアクセス制限中です', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="jleakstats"',
    },
  })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
