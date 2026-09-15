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

/** @type {import('next').NextConfig} */
export default {
  output: 'standalone',
  outputFileTracingRoot: path.join(process.cwd(), '../../'),
  transpilePackages: ['payload'],
  // Next 16 writes AGENTS.md and CLAUDE.md into the app directory on boot. This project
  // keeps its guidance in docs/, so the generated files would only be noise in git.
  agentRules: false,
}
