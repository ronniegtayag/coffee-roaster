import { screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { listItem, page, sessionBody } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import { renderApp, resetSession } from '@/test/render';
import { useAuthStore } from '@/stores/auth.store';

// Own file: ensureSession() caches its first result per page load (module state), so this must
// be the first thing to run in a fresh module graph.
describe('session bootstrap', () => {
  afterEach(resetSession);

  it('restores a session from the refresh cookie on page load', async () => {
    let sentCsrf: string | null = null;
    server.use(
      http.post('*/api/v1/auth/refresh', ({ request }) => {
        sentCsrf = request.headers.get('x-requested-with');
        return HttpResponse.json(sessionBody());
      }),
      http.get('*/api/v1/customers', () => HttpResponse.json(page([listItem()]))),
    );
    await renderApp('/customers');
    expect(await screen.findByRole('heading', { name: 'Customers' })).toBeInTheDocument();
    expect(sentCsrf).toBe('XMLHttpRequest');
    expect(useAuthStore.getState().accessToken).toBe('token-123');
  });
});
