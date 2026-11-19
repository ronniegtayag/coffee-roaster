import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { ensureSession } from '@/shared/api/session';
import { AppShell } from '../layout/AppShell';

/** Pathless layout: everything under it needs a login and is shown inside the app shell. */
export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ location }) => {
    if (!(await ensureSession())) {
      // Keep the page and its search params so login can return to it.
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
