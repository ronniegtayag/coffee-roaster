import { LoginThrottleService } from './login-throttle.service';

const MIN = 60 * 1000;

describe('LoginThrottleService', () => {
  let throttle: LoginThrottleService;
  const t0 = Date.UTC(2026, 10, 19, 0, 0, 0);

  beforeEach(() => {
    throttle = new LoginThrottleService();
  });

  it('allows up to 4 failures, locks on the 5th for 15 minutes', () => {
    for (let i = 0; i < 4; i++) throttle.recordFailure('a@x.com', '1.1.1.1', t0 + i);
    expect(throttle.retryAfterSeconds('a@x.com', '1.1.1.1', t0 + 10)).toBe(0);
    throttle.recordFailure('a@x.com', '1.1.1.1', t0 + 5);
    expect(throttle.retryAfterSeconds('a@x.com', '1.1.1.1', t0 + 5)).toBe(15 * 60);
    expect(throttle.retryAfterSeconds('a@x.com', '1.1.1.1', t0 + 14 * MIN)).toBeGreaterThan(0);
    expect(throttle.retryAfterSeconds('a@x.com', '1.1.1.1', t0 + 15 * MIN + 5)).toBe(0);
  });

  it('is per email: another email from a different IP is unaffected', () => {
    for (let i = 0; i < 5; i++) throttle.recordFailure('a@x.com', '1.1.1.1', t0);
    expect(throttle.retryAfterSeconds('b@x.com', '2.2.2.2', t0 + 1)).toBe(0);
  });

  it('ignores failures older than the 15 minute window', () => {
    for (let i = 0; i < 4; i++) throttle.recordFailure('a@x.com', '1.1.1.1', t0);
    throttle.recordFailure('a@x.com', '1.1.1.1', t0 + 16 * MIN);
    expect(throttle.retryAfterSeconds('a@x.com', '1.1.1.1', t0 + 16 * MIN)).toBe(0);
  });

  it('locks an IP after 30 failures across different emails', () => {
    for (let i = 0; i < 29; i++) throttle.recordFailure(`u${i}@x.com`, '9.9.9.9', t0);
    expect(throttle.retryAfterSeconds('new@x.com', '9.9.9.9', t0)).toBe(0);
    throttle.recordFailure('u30@x.com', '9.9.9.9', t0);
    expect(throttle.retryAfterSeconds('new@x.com', '9.9.9.9', t0)).toBe(15 * 60);
  });

  it('clears the email counter on success', () => {
    for (let i = 0; i < 4; i++) throttle.recordFailure('a@x.com', '1.1.1.1', t0);
    throttle.recordSuccess('a@x.com');
    throttle.recordFailure('a@x.com', '1.1.1.1', t0 + 1);
    expect(throttle.retryAfterSeconds('a@x.com', '1.1.1.9', t0 + 1)).toBe(0);
  });
});
