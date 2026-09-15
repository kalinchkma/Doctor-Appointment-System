import type { Endpoint } from 'payload'

const json = (body: unknown, status = 200) => Response.json(body, { status })

export const patientAuthEndpoints: Endpoint[] = [
  {
    path: '/auth/patient/register',
    method: 'post',
    handler: async (req) => {
      const payload = req.payload!
      const { name, email, password } = (await req.json?.()) as {
        name?: string
        email?: string
        password?: string
      }
      if (!name || !email || !password)
        return json({ message: 'Name, email, and password are required.' }, 400)
      try {
        await payload.create({
          collection: 'users',
          data: { name, email, password, role: 'patient' },
          overrideAccess: true,
          context: { patientRegistration: true },
        })
        const session = await payload.login({
          collection: 'users',
          data: { email, password },
          overrideAccess: true,
        })
        return json(session, 201)
      } catch {
        return json(
          { message: 'Unable to create the patient account. The email may already be in use.' },
          400,
        )
      }
    },
  },
  {
    path: '/auth/patient/login',
    method: 'post',
    handler: async (req) => {
      const payload = req.payload!
      const { email, password } = (await req.json?.()) as { email?: string; password?: string }
      if (!email || !password) return json({ message: 'Email and password are required.' }, 400)
      try {
        const session = await payload.login({
          collection: 'users',
          data: { email, password },
          overrideAccess: true,
        })
        if ((session.user as { role?: string } | undefined)?.role !== 'patient')
          return json({ message: 'Administrator accounts can only use the admin portal.' }, 403)
        return json(session)
      } catch {
        return json({ message: 'Invalid email or password.' }, 401)
      }
    },
  },
]
