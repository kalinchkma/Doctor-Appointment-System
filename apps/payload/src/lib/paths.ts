import { existsSync } from 'node:fs'
import path from 'node:path'

// Upload dirs must be stable across Next's bundled module paths. Resolving from
// import.meta.url in production points into .next/server/... and misses the
// Docker volume mounts used by seed + CMS.
function resolveAppDir(name: string): string {
  const envKey = `${name.toUpperCase().replace(/-/g, '_')}_DIR`
  if (process.env[envKey]) {
    return process.env[envKey] as string
  }

  const candidates = [
    path.resolve(process.cwd(), name),
    path.resolve(process.cwd(), 'apps/payload', name),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  return candidates[0]
}

export function knowledgeFilesDir(): string {
  return process.env.KNOWLEDGE_FILES_DIR || resolveAppDir('knowledge-files')
}

export function mediaDir(): string {
  return process.env.MEDIA_DIR || resolveAppDir('media')
}
