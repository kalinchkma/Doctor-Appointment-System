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

const publicOrigins = [
  process.env.MOBILE_ORIGIN,
  'http://localhost:5173',
  'http://localhost',
  'capacitor://localhost',
].filter(Boolean) as string[]

export default buildConfig({
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
  cors: publicOrigins,
  csrf: publicOrigins,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  onInit: ensureIndexes,
})
