import { createHmac, timingSafeEqual } from 'node:crypto'
import type { AuthStrategy } from 'payload'
import { parseCookies } from 'payload'

function verifyHs256(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, payload, signature] = parts
  const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest()
  let actual: Buffer
  try {
    actual = Buffer.from(signature, 'base64url')
  } catch {
    return null
  }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Payload's JWT strategy calls extractJWT, which drops the cookie when Origin is not
 * an exact csrf string. Next's post-login /admin?_rsc= fetch always sends Origin
 * (http://<ec2-ip>), so login 200s then the dashboard thinks the user is anonymous.
 * SameSite=Lax already prevents cross-site cookie use; this strategy only needs the token.
 */
export const cookieJwtStrategy: AuthStrategy = {
  name: 'cookie-jwt',
  authenticate: async ({ headers, payload }) => {
    const token = parseCookies(headers).get(`${payload.config.cookiePrefix}-token`)
    if (!token) return { user: null }

    const decoded = verifyHs256(token, payload.secret)
    const id = decoded?.id
    const collection = decoded?.collection
    if (typeof id !== 'string' && typeof id !== 'number') return { user: null }
    if (typeof collection !== 'string' || !payload.collections[collection]) return { user: null }

    try {
      const user = await payload.findByID({
        id,
        collection,
        depth: 0,
        overrideAccess: true,
        showHiddenFields: true,
      })
      if (!user) return { user: null }
      user.collection = collection
      user._strategy = 'cookie-jwt'
      return { user }
    } catch {
      return { user: null }
    }
  },
}
