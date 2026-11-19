import { Injectable } from '@nestjs/common';

const WINDOW_MS = 15 * 60 * 1000;
const COOL_OFF_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_IP = 30;

interface Bucket {
  failures: number[];
  lockedUntil: number;
}

/** In-memory login throttling (D-AR-9). Single API instance only. */
@Injectable()
export class LoginThrottleService {
  private readonly buckets = new Map<string, Bucket>();

  /** Seconds to wait before another attempt, or 0 if allowed. */
  retryAfterSeconds(email: string, ip: string, now = Date.now()): number {
    const waits = [this.wait(`email:${email}`, now), this.wait(`ip:${ip}`, now)];
    return Math.max(...waits);
  }

  recordFailure(email: string, ip: string, now = Date.now()): void {
    this.fail(`email:${email}`, MAX_FAILURES_PER_EMAIL, now);
    this.fail(`ip:${ip}`, MAX_FAILURES_PER_IP, now);
  }

  recordSuccess(email: string): void {
    this.buckets.delete(`email:${email}`);
  }

  private wait(key: string, now: number): number {
    const bucket = this.buckets.get(key);
    if (!bucket) return 0;
    if (bucket.lockedUntil > now) return Math.ceil((bucket.lockedUntil - now) / 1000);
    bucket.failures = bucket.failures.filter((t) => now - t < WINDOW_MS);
    if (bucket.failures.length === 0) this.buckets.delete(key);
    return 0;
  }

  private fail(key: string, max: number, now: number): void {
    const bucket = this.buckets.get(key) ?? { failures: [], lockedUntil: 0 };
    bucket.failures = bucket.failures.filter((t) => now - t < WINDOW_MS);
    bucket.failures.push(now);
    if (bucket.failures.length >= max) {
      bucket.lockedUntil = now + COOL_OFF_MS;
      bucket.failures = [];
    }
    this.buckets.set(key, bucket);
  }
}
