import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Doctors } from './collections/Doctors'
import { AppointmentSlots } from './collections/AppointmentSlots'
import { Appointments } from './collections/Appointments'
import { KnowledgeFiles } from './collections/KnowledgeFiles'
import { KnowledgeDocuments } from './collections/KnowledgeDocuments'
import { UnresolvedQueries } from './collections/UnresolvedQueries'
import { ChatSuggestedQuestions } from './collections/ChatSuggestedQuestions'
import { RagSettings } from './globals/RagSettings'
import { patientAuthEndpoints } from './endpoints/patientAuth'
import { chatEndpoints } from './endpoints/chat'
import { internalRagEndpoints } from './endpoints/internalRag'
import { ensureIndexes } from './lib/ensureIndexes'
import { storagePlugins } from './lib/storage'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const serverURL = (process.env.PAYLOAD_PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '')

// CSRF checks the browser Origin against this list before accepting the auth cookie.
// The admin panel Origin (PAYLOAD_PUBLIC_URL) must be included or logout/login cookie
// flows from /admin silently fail — cookie JWT extraction returns null.
const trustedOrigins = [
  serverURL,
  process.env.MOBILE_ORIGIN,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost',
  'capacitor://localhost',
].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index)

export default buildConfig({
  serverURL,
  admin: { user: Users.slug, importMap: { baseDir: path.resolve(dirname) } },
  collections: [
    Users,
    Media,
    Doctors,
    AppointmentSlots,
    Appointments,
    KnowledgeFiles,
    KnowledgeDocuments,
    UnresolvedQueries,
    ChatSuggestedQuestions,
  ],
  globals: [RagSettings],
  endpoints: [...patientAuthEndpoints, ...chatEndpoints, ...internalRagEndpoints],
  plugins: storagePlugins(),
  editor: lexicalEditor(),
  db: mongooseAdapter({
    url: process.env.PAYLOAD_DATABASE_URI || 'mongodb://127.0.0.1:27017/doctor_app',
  }),
  secret: process.env.PAYLOAD_SECRET || 'development-secret-change-me-before-deploying',
  // Payload needs the sharp instance handed to it, not merely installed, or upload
  // collections silently skip their configured imageSizes.
  sharp,
  cors: trustedOrigins,
  csrf: trustedOrigins,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  onInit: ensureIndexes,
})
