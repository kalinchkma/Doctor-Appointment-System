import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { Users } from './collections/Users'
import { Doctors } from './collections/Doctors'
import { AppointmentSlots } from './collections/AppointmentSlots'
import { Appointments } from './collections/Appointments'
import { KnowledgeDocuments } from './collections/KnowledgeDocuments'
import { UnresolvedQueries } from './collections/UnresolvedQueries'
import { patientAuthEndpoints } from './endpoints/patientAuth'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const publicOrigins = [process.env.MOBILE_ORIGIN, 'http://localhost:5173', 'http://localhost', 'capacitor://localhost'].filter(Boolean) as string[]

export default buildConfig({
  admin: { user: Users.slug, importMap: { baseDir: path.resolve(dirname) } },
  collections: [Users, Doctors, AppointmentSlots, Appointments, KnowledgeDocuments, UnresolvedQueries],
  endpoints: patientAuthEndpoints,
  editor: lexicalEditor(),
  db: mongooseAdapter({ url: process.env.PAYLOAD_DATABASE_URI || 'mongodb://127.0.0.1:27017/doctor_app' }),
  secret: process.env.PAYLOAD_SECRET || 'development-secret-change-me-before-deploying',
  cors: publicOrigins,
  csrf: publicOrigins,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
