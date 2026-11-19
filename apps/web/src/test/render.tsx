import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render } from '@testing-library/react';
import { queryClient } from '@/shared/api/query-client';
import { clearSession, setSessionExpiredHandler } from '@/shared/api/session';
import { routeTree } from '@/app/routeTree.gen';
import { type SessionUser, useAuthStore } from '@/stores/auth.store';
import { manager } from './msw/fixtures';

// The app's query client retries 5xx twice with back-off; tests want the error state immediately.
queryClient.setDefaultOptions({ queries: { retry: false, staleTime: 0 } });

export function loginAs(user: SessionUser = manager, token = 'token-123') {
  useAuthStore.getState().setSession(token, user);
}

export function resetSession() {
  // Unmount first so no observer refetches while the cache is cleared.
  cleanup();
  void queryClient.cancelQueries();
  clearSession();
}

/** Renders the real route tree at `path` with a memory history and the real Axios instances. */
export async function renderApp(path: string) {
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  setSessionExpiredHandler(() => {
    void router.navigate({
      to: '/login',
      search: { redirect: router.state.location.href, reason: 'expired' },
      replace: true,
    });
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await act(async () => {});
  return { router, ...utils };
}
