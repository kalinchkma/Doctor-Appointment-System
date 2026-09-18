import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

function hostOf(value: string): string {
  return value.split(',')[0]!.trim().replace(/:(80|443)$/, '').toLowerCase()
}

function originHost(origin: string): string | null {
  try {
    return hostOf(new URL(origin).host)
  } catch {
    return null
  }
}

/**
 * After login, Next navigates to /admin?_rsc=… (a fetch, so it sends Origin).
 * Payload extractJWT then drops the auth cookie unless Origin is on the CSRF list
 * exactly (http://IP and http://IP:3000 are different). Same-host Origin is not CSRF.
 */
export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin')
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
  if (!origin || !host) return NextResponse.next()

  const from = originHost(origin)
  if (!from || from !== hostOf(host)) return NextResponse.next()

  const headers = new Headers(request.headers)
  // Drop Origin so extractJWT falls through to Sec-Fetch-Site (same-origin RSC fetch).
  headers.delete('origin')
  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: ['/admin', '/admin/:path*', '/api/:path*'],
}
