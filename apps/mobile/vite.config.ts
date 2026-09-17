import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dirname, '../..')

export default defineConfig(({ mode }) => {
  // Root .env is shared with CMS/Compose. apps/mobile/.env overrides it so device
  // builds can set a LAN IP without changing the host-side localhost defaults.
  const rootEnv = loadEnv(mode, repoRoot, '')
  const mobileEnv = loadEnv(mode, dirname, '')
  const env = { ...rootEnv, ...mobileEnv }

  const payloadURL = (env.VITE_PAYLOAD_URL || 'http://localhost:3000').replace(/\/$/, '')

  return {
    plugins: [react()],
    // Keep Vite's default lookup in apps/mobile; define pins the resolved URL into
    // the bundle so a stale root localhost value cannot win at build time.
    envDir: dirname,
    define: {
      'import.meta.env.VITE_PAYLOAD_URL': JSON.stringify(payloadURL),
    },
    server: { port: 5173 },
  }
})
