import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/stores/auth.store';
import { sessionBody } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import { clearSession, logoutSession, refreshSession } from './session';

describe('session logout vs refresh race', () => {
  afterEach(clearSession);

  it('does not revive the session when a refresh resolves after logout', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    server.use(
      http.post('*/api/v1/auth/refresh', async () => {
        await gate;
        return HttpResponse.json(sessionBody());
      }),
      http.post('*/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })),
    );
    const refresh = refreshSession();
    await logoutSession();
    release();
    await refresh;
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('applies a refresh that completes with no logout in between', async () => {
    server.use(http.post('*/api/v1/auth/refresh', () => HttpResponse.json(sessionBody())));
    await refreshSession();
    expect(useAuthStore.getState().accessToken).toBe('token-123');
  });

  it('shares one request between concurrent refresh calls', async () => {
    let calls = 0;
    server.use(
      http.post('*/api/v1/auth/refresh', () => {
        calls++;
        return HttpResponse.json(sessionBody());
      }),
    );
    await Promise.all([refreshSession(), refreshSession(), refreshSession()]);
    expect(calls).toBe(1);
  });

  it('logs out locally even when the logout request fails', async () => {
    useAuthStore.getState().setSession('t', sessionBody().user);
    server.use(http.post('*/api/v1/auth/logout', () => HttpResponse.error()));
    await logoutSession();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
