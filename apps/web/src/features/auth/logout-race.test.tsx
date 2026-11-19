import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/stores/auth.store';
import { listItem, page, sessionBody } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import { loginAs, renderApp, resetSession } from '@/test/render';

describe('logout while a refresh is in flight', () => {
  afterEach(resetSession);

  it('does not restore the session when the refresh resolves after logout', async () => {
    loginAs(undefined, 'old-token');
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((r) => (releaseRefresh = r));
    let refreshStarted = false;
    server.use(
      // The list 401s, which triggers a refresh that we hold open.
      http.get('*/api/v1/customers', ({ request }) =>
        request.headers.get('authorization') === 'Bearer new-token'
          ? HttpResponse.json(page([listItem()]))
          : HttpResponse.json(
              { statusCode: 401, code: 'UNAUTHENTICATED', message: 'x' },
              { status: 401 },
            ),
      ),
      http.post('*/api/v1/auth/refresh', async () => {
        refreshStarted = true;
        await refreshGate;
        return HttpResponse.json({ ...sessionBody(), accessToken: 'new-token' });
      }),
      http.post('*/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })),
    );
    const { router } = await renderApp('/customers');
    await waitFor(() => expect(refreshStarted).toBe(true));

    await userEvent.click(screen.getAllByRole('button', { name: /log out/i })[0]);
    await waitFor(() => expect(useAuthStore.getState().accessToken).toBeNull());

    releaseRefresh();
    await new Promise((r) => setTimeout(r, 100));

    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });
});
