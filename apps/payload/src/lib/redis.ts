import Redis from 'ioredis'

let client: Redis | null = null

/** Shared Redis client for chat sessions. Lazily connects on first use. */
export function getRedis(): Redis {
  if (client) return client

  const url = (process.env.REDIS_URL || 'redis://127.0.0.1:6379').trim()
  client = new Redis(url, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: false,
  })

  client.on('error', (error) => {
    // Avoid crashing the CMS process on transient Redis blips; callers surface errors.
    console.error('[redis]', error.message)
  })

  return client
}
