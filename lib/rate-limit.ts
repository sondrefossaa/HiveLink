// lib/rate-limit.ts
// Local token-bucket rate limiter (no Redis). Used to pace Datamuse API calls.

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

export class RateLimiter {
  private readonly options: RateLimiterOptions
  private readonly refillRatePerMs: number
  private queue: QueueJob[] = []
  private draining = false
  private tokens: number
  private lastRefill = Date.now()

  constructor(options: RateLimiterOptions) {
    if (options.intervalMs <= 0) {
      throw new Error('intervalMs must be greater than 0')
    }

    if (options.tokensPerInterval <= 0) {
      throw new Error('tokensPerInterval must be greater than 0')
    }

    const burstCapacity = Math.max(options.burstCapacity, 1)
    this.options = { ...options, burstCapacity }
    this.refillRatePerMs = options.tokensPerInterval / options.intervalMs
    this.tokens = burstCapacity
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
      const waitTime = this.acquireSlot()
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

  private acquireSlot(): number {
    const now = Date.now()
    const delta = now - this.lastRefill
    this.lastRefill = now

    this.tokens = Math.min(
      this.options.burstCapacity,
      this.tokens + delta * this.refillRatePerMs
    )

    if (this.tokens >= 1) {
      this.tokens -= 1
      return 0
    }

    return Math.ceil((1 - this.tokens) / this.refillRatePerMs)
  }
}

const tokensPerInterval = Math.max(Number(process.env.DATAMUSE_RATE_LIMIT_TOKENS ?? 10), 1)
const intervalMs = Math.max(Number(process.env.DATAMUSE_RATE_LIMIT_INTERVAL_MS ?? 1000), 1)
const burstCapacity = Math.max(
  Number(process.env.DATAMUSE_RATE_LIMIT_BURST ?? tokensPerInterval * 2),
  1
)

const datamuseLimiter = new RateLimiter({
  id: 'datamuse-compound-validation',
  tokensPerInterval,
  intervalMs,
  burstCapacity,
})

export const datamuseRateLimiter = datamuseLimiter
