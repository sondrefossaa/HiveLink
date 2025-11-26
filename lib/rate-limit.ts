import { getRedisClient } from './redis'

const ACQUIRE_TOKEN_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local capacity = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])

local state = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(state[1])
local last_refill = tonumber(state[2])

if not tokens then tokens = capacity end
if not last_refill then last_refill = now end

if now < last_refill then last_refill = now end
local delta = now - last_refill
local refill = delta * refill_rate
if refill > 0 then
  tokens = math.min(capacity, tokens + refill)
end

local allowed = 0
local wait_time = 0

if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
else
  wait_time = math.ceil((1 - tokens) / refill_rate)
end

redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
redis.call('PEXPIRE', key, ttl)

return {allowed, wait_time, tokens}
`

type RateLimiterOptions = {
  id: string
  tokensPerInterval: number
  intervalMs: number
  burstCapacity: number
}

type QueueJob = {
  fn: () => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export class DistributedRateLimiter {
  private readonly options: RateLimiterOptions
  private readonly redisKey: string
  private readonly refillRatePerMs: number
  private queue: QueueJob[] = []
  private draining = false
  private localTokens: number
  private localLastRefill = Date.now()

  constructor(options: RateLimiterOptions) {
    if (options.intervalMs <= 0) {
      throw new Error('intervalMs must be greater than 0')
    }

    if (options.tokensPerInterval <= 0) {
      throw new Error('tokensPerInterval must be greater than 0')
    }

    const burstCapacity = Math.max(options.burstCapacity, 1)
    this.options = { ...options, burstCapacity }
    this.redisKey = `rate-limit:${options.id}`
    this.refillRatePerMs = options.tokensPerInterval / options.intervalMs
    this.localTokens = burstCapacity
  }

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        fn: async () => fn(),
        resolve: value => resolve(value as T),
        reject,
      })
      void this.drainQueue()
    })
  }

  private async drainQueue(): Promise<void> {
    if (this.draining) {
      return
    }

    this.draining = true
    while (this.queue.length) {
      const waitTime = await this.acquireSlot()
      if (waitTime > 0) {
        await delay(waitTime)
        continue
      }

      const job = this.queue.shift()!
      try {
        const result = await job.fn()
        job.resolve(result)
      } catch (error) {
        job.reject(error)
      }
    }

    this.draining = false
  }

  private async acquireSlot(): Promise<number> {
    const redis = getRedisClient()
    if (!redis) {
      return this.acquireLocalSlot()
    }

    try {
      const now = Date.now()
      const ttl = Math.ceil(this.options.intervalMs * 2)
      const result = (await redis.eval(
        ACQUIRE_TOKEN_SCRIPT,
        1,
        this.redisKey,
        now,
        this.refillRatePerMs,
        this.options.burstCapacity,
        ttl
      )) as [number, number]

      if (Array.isArray(result) && result[0] === 1) {
        return 0
      }

      const waitTime = Array.isArray(result) ? Number(result[1]) : this.options.intervalMs
      return Number.isFinite(waitTime) && waitTime > 0 ? waitTime : this.options.intervalMs
    } catch (error) {
      console.error('Distributed rate limiter Redis error:', error)
      return this.acquireLocalSlot()
    }
  }

  private acquireLocalSlot(): number {
    const now = Date.now()
    const delta = now - this.localLastRefill
    this.localLastRefill = now

    this.localTokens = Math.min(
      this.options.burstCapacity,
      this.localTokens + delta * this.refillRatePerMs
    )

    if (this.localTokens >= 1) {
      this.localTokens -= 1
      return 0
    }

    return Math.ceil((1 - this.localTokens) / this.refillRatePerMs)
  }
}

const tokensPerInterval = Math.max(Number(process.env.DATAMUSE_RATE_LIMIT_TOKENS ?? 10), 1)
const intervalMs = Math.max(Number(process.env.DATAMUSE_RATE_LIMIT_INTERVAL_MS ?? 1000), 1)
const burstCapacity = Math.max(
  Number(process.env.DATAMUSE_RATE_LIMIT_BURST ?? tokensPerInterval * 2),
  1
)

const datamuseLimiter = new DistributedRateLimiter({
  id: 'datamuse-compound-validation',
  tokensPerInterval,
  intervalMs,
  burstCapacity,
})

export const datamuseRateLimiter = datamuseLimiter
