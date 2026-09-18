import { withPayload } from '@payloadcms/next/withPayload'
import { existsSync } from 'node:fs'
import path from 'node:path'

// Configuration lives in one .env at the repository root so the CMS, the RAG service and
// Compose all read the same values. Next only looks in its own directory, so the root
// file is loaded here, before the Payload config reads process.env. In Docker the values
// come from Compose and no file is present, hence the existence check.
const rootEnv = path.resolve(process.cwd(), '../../.env')
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv)
}

const publicUrl = process.env['PAYLOAD_PUBLIC_URL'] || 'http://localhost:3000'
let publicHost = 'localhost:3000'
try {
  publicHost = new URL(publicUrl).host
} catch {
  /* keep default */
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(process.cwd(), '../../'),
  transpilePackages: ['payload'],
  // Next 16 writes AGENTS.md and CLAUDE.md into the app directory on boot. This project
  // keeps its guidance in docs/, so the generated files would only be noise in git.
  agentRules: false,
  // Admin login uses server functions. Behind nginx the browser Origin is the public
  // host, not cms:3000 — without this, login 200s then redirects back to /admin/login.
  serverActions: {
    allowedOrigins: [publicHost, 'localhost:3000', '127.0.0.1:3000', 'localhost'],
  },
}

// withPayload injects the webpack/sass options Payload's admin UI needs. Without it,
// production Turbopack builds often ship an incomplete stylesheet set.
export default withPayload(nextConfig)
