import Redis from 'ioredis'

const globalRedis = globalThis as typeof globalThis & {
  __redisClient?: Redis
}

let warningLogged = false

function resolveRedisUrl(): string | null {
  return process.env.REDIS_URL || process.env.REDIS_TLS_URL || null
}

export function getRedisClient(): Redis | null {
  if (typeof window !== 'undefined') {
    return null
  }

  const redisUrl = resolveRedisUrl()
  if (!redisUrl) {
    if (process.env.NODE_ENV === 'development' && !warningLogged) {
      warningLogged = true
      console.warn('Redis URL not configured. Falling back to in-memory rate limiting.')
    }
    return null
  }

  if (!globalRedis.__redisClient) {
    globalRedis.__redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false,
    })

    globalRedis.__redisClient.on('error', error => {
      console.error('Redis connection error:', error)
    })
  }

  return globalRedis.__redisClient
}
