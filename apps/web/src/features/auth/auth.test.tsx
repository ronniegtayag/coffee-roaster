import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { shouldNotCall } from '@/test/helpers';
import { errorBody, listItem, manager, page, sessionBody } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import { loginAs, renderApp, resetSession } from '@/test/render';
import { useAuthStore } from '@/stores/auth.store';

const refreshFails = http.post('*/api/v1/auth/refresh', () =>
  HttpResponse.json(errorBody(401, 'SESSION_EXPIRED', 'Session expired'), { status: 401 }),
);
const emptyList = http.get('*/api/v1/customers', () => HttpResponse.json(page([listItem()])));

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByRole('textbox', { name: /email/i }), email);
  await user.type(screen.getByLabelText(/password/i), password);
  await user.click(screen.getByRole('button', { name: 'Log in' }));
}

describe('route guard and session bootstrap', () => {
  afterEach(resetSession);

  it('redirects a visitor with no session to /login, keeping the page and search params', async () => {
    server.use(refreshFails);
    const { router } = await renderApp('/customers?search=bean&page=2');
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toMatchObject({
      redirect: '/customers?search=bean&page=2',
    });
  });

  it('sends a logged-in user straight from /login to the redirect target', async () => {
    loginAs();
    server.use(emptyList);
    const { router } = await renderApp('/login?redirect=%2Fcustomers%3Fstatus%3Dall');
    await screen.findByRole('heading', { name: 'Customers' });
    expect(router.state.location.pathname).toBe('/customers');
  });
});

describe('login page', () => {
  afterEach(resetSession);

  it('shows field errors for empty fields and sends no request', async () => {
    server.use(refreshFails, http.post('*/api/v1/auth/login', shouldNotCall));
    await renderApp('/login');
    await userEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Enter your email')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
  });

  it('logs in, sends the typed credentials, and lands on the requested page', async () => {
    let body: unknown;
    let csrf: string | null = null;
    server.use(
      refreshFails,
      http.post('*/api/v1/auth/login', async ({ request }) => {
        csrf = request.headers.get('x-requested-with');
        body = await request.json();
        return HttpResponse.json(sessionBody());
      }),
      emptyList,
    );
    const { router } = await renderApp('/login?redirect=%2Fcustomers%3Fstatus%3Dall');
    await fillAndSubmit('Mia@Example.com', 'secret-pass');
    expect(await screen.findByRole('heading', { name: 'Customers' })).toBeInTheDocument();
    expect(body).toEqual({
      email: 'Mia@Example.com',
      password: 'secret-pass',
    });
    expect(csrf).toBe('XMLHttpRequest');
    expect(router.state.location.search).toMatchObject({ status: 'all' });
    expect(useAuthStore.getState().user?.name).toBe('Mia Manager');
  });

  it('defaults to the customers list when there is no redirect', async () => {
    server.use(
      refreshFails,
      http.post('*/api/v1/auth/login', () => HttpResponse.json(sessionBody())),
      emptyList,
    );
    const { router } = await renderApp('/login');
    await fillAndSubmit('mia@example.com', 'secret-pass');
    await screen.findByRole('heading', { name: 'Customers' });
    expect(router.state.location.pathname).toBe('/customers');
  });

  it.each(['//evil.example.com', 'https://evil.example.com/x', 'javascript:alert(1)'])(
    'ignores the unsafe redirect %s',
    async (target) => {
      server.use(
        refreshFails,
        http.post('*/api/v1/auth/login', () => HttpResponse.json(sessionBody())),
        emptyList,
      );
      const { router } = await renderApp(`/login?redirect=${encodeURIComponent(target)}`);
      await fillAndSubmit('mia@example.com', 'secret-pass');
      await screen.findByRole('heading', { name: 'Customers' });
      expect(router.state.location.pathname).toBe('/customers');
    },
  );

  it('shows the generic message for INVALID_CREDENTIALS, keeps the email, and stays on login', async () => {
    server.use(
      refreshFails,
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json(errorBody(401, 'INVALID_CREDENTIALS', 'Invalid email or password'), {
          status: 401,
        }),
      ),
    );
    await renderApp('/login');
    await fillAndSubmit('mia@example.com', 'wrong');
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect');
    expect(screen.getByRole('textbox', { name: /email/i })).toHaveValue('mia@example.com');
    expect(screen.getByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('shows the cool-off minutes from Retry-After on 429', async () => {
    server.use(
      refreshFails,
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json(errorBody(429, 'TOO_MANY_ATTEMPTS', 'Too many'), {
          status: 429,
          headers: { 'Retry-After': '900' },
        }),
      ),
    );
    await renderApp('/login');
    await fillAndSubmit('mia@example.com', 'x');
    expect(await screen.findByRole('alert')).toHaveTextContent(/Too many attempts.*15 minutes/);
  });

  it.each([
    ['network error', () => HttpResponse.error()],
    ['500', () => HttpResponse.json(errorBody(500, 'INTERNAL', 'boom'), { status: 500 })],
  ])('says the service cannot be reached on %s and keeps the email', async (_l, resolver) => {
    server.use(refreshFails, http.post('*/api/v1/auth/login', resolver));
    await renderApp('/login');
    await fillAndSubmit('mia@example.com', 'x');
    expect(await screen.findByRole('alert')).toHaveTextContent(/Can't reach the service/);
    expect(screen.getByRole('textbox', { name: /email/i })).toHaveValue('mia@example.com');
  });

  it('disables the button while submitting', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    server.use(
      refreshFails,
      http.post('*/api/v1/auth/login', async () => {
        await gate;
        return HttpResponse.json(sessionBody());
      }),
      emptyList,
    );
    await renderApp('/login');
    await fillAndSubmit('mia@example.com', 'x');
    expect(await screen.findByRole('button', { name: 'Logging in…' })).toBeDisabled();
    release();
    await screen.findByRole('heading', { name: 'Customers' });
  });

  it('shows the expired-session banner', async () => {
    server.use(refreshFails);
    await renderApp('/login?reason=expired');
    expect(
      await screen.findByText('Your session has expired. Log in again to continue.'),
    ).toBeInTheDocument();
  });
});

describe('401 handling on business calls', () => {
  afterEach(resetSession);

  it('refreshes once, replays the request with the new token, and shows the data', async () => {
    loginAs(manager, 'old-token');
    const seen: (string | null)[] = [];
    let refreshes = 0;
    server.use(
      http.post('*/api/v1/auth/refresh', () => {
        refreshes++;
        return HttpResponse.json({ ...sessionBody(), accessToken: 'new-token' });
      }),
      http.get('*/api/v1/customers', ({ request }) => {
        const auth = request.headers.get('authorization');
        seen.push(auth);
        return auth === 'Bearer new-token'
          ? HttpResponse.json(page([listItem()]))
          : HttpResponse.json(errorBody(401, 'UNAUTHENTICATED', 'expired'), { status: 401 });
      }),
    );
    await renderApp('/customers');
    expect(await screen.findByText('Bean There Pty Ltd')).toBeInTheDocument();
    expect(seen).toEqual(['Bearer old-token', 'Bearer new-token']);
    expect(refreshes).toBe(1);
  });

  it('sends the user to login with the expired message when refresh also fails', async () => {
    loginAs();
    server.use(
      refreshFails,
      http.get('*/api/v1/customers', () =>
        HttpResponse.json(errorBody(401, 'UNAUTHENTICATED', 'expired'), { status: 401 }),
      ),
    );
    const { router } = await renderApp('/customers?search=bean');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toMatchObject({ reason: 'expired' });
    expect(
      await screen.findByText('Your session has expired. Log in again to continue.'),
    ).toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('does not log the user out when refresh fails with a network error', async () => {
    loginAs();
    server.use(
      http.post('*/api/v1/auth/refresh', () => HttpResponse.error()),
      http.get('*/api/v1/customers', () =>
        HttpResponse.json(errorBody(401, 'UNAUTHENTICATED', 'expired'), { status: 401 }),
      ),
    );
    await renderApp('/customers');
    await screen.findByText('Something went wrong — try again');
    expect(useAuthStore.getState().accessToken).not.toBeNull();
  });
});

describe('logout', () => {
  afterEach(resetSession);

  it('calls POST /auth/logout, clears the session and returns to login', async () => {
    loginAs();
    let called = false;
    server.use(
      http.post('*/api/v1/auth/logout', ({ request }) => {
        called = request.headers.get('x-requested-with') === 'XMLHttpRequest';
        return new HttpResponse(null, { status: 204 });
      }),
      emptyList,
    );
    const { router } = await renderApp('/customers');
    await screen.findByText('Bean There Pty Ltd');
    await userEvent.click(screen.getAllByRole('button', { name: /log out/i })[0]);
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(called).toBe(true);
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(screen.queryByText('Bean There Pty Ltd')).not.toBeInTheDocument();
  });
});
