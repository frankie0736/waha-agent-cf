import type { RateLimiter } from './types';

/**
 * Rate Limiter using Cloudflare KV for distributed rate limiting
 */
export class KVRateLimiter implements RateLimiter {
  constructor(
    private readonly kv: KVNamespace,
    private readonly limitPerMinute: number = 60,
    private readonly windowSizeMs: number = 60000 // 1 minute
  ) {}

  async checkLimit(key: string): Promise<{ allowed: boolean; retryAfter?: number }> {
    const now = Date.now();
    const windowKey = this.getWindowKey(key, now);
    
    try {
      // Get current count for this window
      const currentCountStr = await this.kv.get(windowKey);
      const currentCount = currentCountStr ? parseInt(currentCountStr, 10) : 0;

      if (currentCount >= this.limitPerMinute) {
        // Calculate retry after in seconds
        const windowStart = this.getWindowStart(now);
        const nextWindow = windowStart + this.windowSizeMs;
        const retryAfter = Math.ceil((nextWindow - now) / 1000);
        
        return { allowed: false, retryAfter };
      }

      return { allowed: true };
    } catch (error) {
      // If KV is unavailable, allow the request (fail open)
      console.warn('Rate limiter KV error, allowing request:', error);
      return { allowed: true };
    }
  }

  async recordRequest(key: string): Promise<void> {
    const now = Date.now();
    const windowKey = this.getWindowKey(key, now);
    
    try {
      // Get current count
      const currentCountStr = await this.kv.get(windowKey);
      const currentCount = currentCountStr ? parseInt(currentCountStr, 10) : 0;
      const newCount = currentCount + 1;

      // Calculate TTL for this window (cleanup old keys)
      const windowStart = this.getWindowStart(now);
      const nextWindow = windowStart + this.windowSizeMs;
      const ttlSeconds = Math.ceil((nextWindow - now) / 1000) + 60; // Add 1 minute buffer

      // Store the new count with TTL
      await this.kv.put(windowKey, newCount.toString(), { expirationTtl: ttlSeconds });
    } catch (error) {
      // If KV is unavailable, continue silently (fail open)
      console.warn('Rate limiter KV error, continuing:', error);
    }
  }

  private getWindowKey(key: string, timestamp: number): string {
    const windowStart = this.getWindowStart(timestamp);
    return `rate_limit:${key}:${windowStart}`;
  }

  private getWindowStart(timestamp: number): number {
    return Math.floor(timestamp / this.windowSizeMs) * this.windowSizeMs;
  }
}

/**
 * In-Memory Rate Limiter for single-instance scenarios
 */
export class MemoryRateLimiter implements RateLimiter {
  private readonly requests = new Map<string, number[]>();

  constructor(
    private readonly limitPerMinute: number = 60,
    private readonly windowSizeMs: number = 60000
  ) {
    // Clean up old entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  async checkLimit(key: string): Promise<{ allowed: boolean; retryAfter?: number }> {
    const now = Date.now();
    const requests = this.getRecentRequests(key, now);

    if (requests.length >= this.limitPerMinute) {
      const oldestRequest = requests[0];
      if (oldestRequest !== undefined) {
        const retryAfter = Math.ceil((oldestRequest + this.windowSizeMs - now) / 1000);
        return { allowed: false, retryAfter: Math.max(1, retryAfter) };
      }
      return { allowed: false, retryAfter: 1 };
    }

    return { allowed: true };
  }

  async recordRequest(key: string): Promise<void> {
    const now = Date.now();
    const requests = this.getRecentRequests(key, now);
    requests.push(now);
    this.requests.set(key, requests);
  }

  private getRecentRequests(key: string, now: number): number[] {
    const requests = this.requests.get(key) || [];
    const cutoff = now - this.windowSizeMs;
    return requests.filter(timestamp => timestamp > cutoff);
  }

  private cleanup(): void {
    const now = Date.now();
    const cutoff = now - this.windowSizeMs;

    for (const [key, requests] of this.requests.entries()) {
      const recentRequests = requests.filter(timestamp => timestamp > cutoff);
      
      if (recentRequests.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, recentRequests);
      }
    }
  }
}

/**
 * Factory function to create appropriate rate limiter
 */
export function createRateLimiter(
  kv?: KVNamespace, 
  limitPerMinute: number = 60
): RateLimiter {
  if (kv) {
    return new KVRateLimiter(kv, limitPerMinute);
  } else {
    return new MemoryRateLimiter(limitPerMinute);
  }
}