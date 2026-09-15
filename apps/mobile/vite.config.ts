import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  // Read the same root .env the CMS and Compose use, so VITE_PAYLOAD_URL is configured in
  // one place. Only VITE_-prefixed keys are exposed to the bundle.
  envDir: path.resolve(dirname, '../..'),
  server: { port: 5173 },
})
