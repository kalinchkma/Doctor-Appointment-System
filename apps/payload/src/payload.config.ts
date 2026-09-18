import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Doctors } from './collections/Doctors'
import { DoctorReviews } from './collections/DoctorReviews'
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

// Dynamic lookup so Next does not inline an empty PAYLOAD_PUBLIC_URL at Docker build.
const envOf = (key: string) => process.env[key]

const serverURL = (envOf('PAYLOAD_PUBLIC_URL') || 'http://localhost:3000').replace(/\/$/, '')

/** http://13.60.203.108 and http://13.60.203.108:80 are different Origins to CSRF. */
const originVariants = (value?: string | null): string[] => {
  if (!value) return []
  const trimmed = value.replace(/\/$/, '')
  const out = new Set<string>([trimmed])
  try {
    const url = new URL(trimmed)
    out.add(`${url.protocol}//${url.hostname}`)
    if (url.protocol === 'http:') {
      out.add(`${url.protocol}//${url.hostname}:80`)
      out.add(`${url.protocol}//${url.hostname}:3000`)
    }
    if (url.protocol === 'https:') out.add(`${url.protocol}//${url.hostname}:443`)
  } catch {
    /* ignore invalid URLs */
  }
  return [...out]
}

// After login Payload reads the JWT cookie only if Origin is on this list
// (extractJWT). A miss looks like a successful login that bounces back to /admin/login.
const trustedOrigins = [
  ...originVariants(serverURL),
  ...originVariants(envOf('MOBILE_ORIGIN')),
  ...originVariants(envOf('PAYLOAD_CSRF_ORIGIN')),
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost',
  'http://127.0.0.1',
  // Capacitor Android WebView origin when androidScheme is "https".
  'https://localhost',
  'capacitor://localhost',
  // CapacitorHttp / some WebView builds omit or vary Origin; also allow ionic schemes.
  'ionic://localhost',
  'http://localhost:8080',
].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index)

export default buildConfig({
  serverURL,
  admin: { user: Users.slug, importMap: { baseDir: path.resolve(dirname) } },
  collections: [
    Users,
    Media,
    Doctors,
    DoctorReviews,
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
