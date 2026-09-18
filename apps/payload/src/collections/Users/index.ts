import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { admins, adminsOrSelf, anyone } from '../../access'
import { cookieJwtStrategy } from '../../lib/auth/cookieJwtStrategy'

// Add user-specific hooks to this module as the feature grows.
const makeFirstUserAdmin: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
  if (operation !== 'create' || req.context.patientRegistration) return data
  const admins = await req.payload.count({
    collection: 'users',
    where: { role: { equals: 'admin' } },
  })
  if (admins.totalDocs === 0) data.role = 'admin'
  return data
}

export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    // HTTP on EC2 (nginx :80). Secure cookies would be dropped by the browser and
    // login would succeed then bounce back to /admin/login.
    cookies: {
      sameSite: 'Lax',
      secure: false,
    },
    // Session rows are hidden unless req.user is already set, so JWT sid checks
    // fail on the post-login /admin?_rsc= request. Token cookie is enough here.
    useSessions: false,
    strategies: [cookieJwtStrategy],
  },
  admin: { useAsTitle: 'name' },
  access: {
    admin: ({ req }) => req.user?.role === 'admin',
    create: anyone,
    read: adminsOrSelf,
    update: adminsOrSelf,
    delete: admins,
  },
  hooks: { beforeChange: [makeFirstUserAdmin] },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'role',
      type: 'select',
      defaultValue: 'patient',
      options: ['admin', 'patient'],
      access: {
        create: ({ req }) => req.user?.role === 'admin',
        update: ({ req }) => req.user?.role === 'admin',
      },
    },
  ],
}
