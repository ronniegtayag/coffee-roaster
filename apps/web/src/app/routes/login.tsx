import { createFileRoute, redirect } from '@tanstack/react-router';
import { Coffee } from 'lucide-react';
import { LoginForm, safeRedirect } from '@/features/auth';
import { ensureSession } from '@/shared/api/session';

interface LoginSearch {
  redirect?: string;
  reason?: 'expired';
}

const DEFAULT_LANDING = '/customers';

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: safeRedirect(search.redirect),
    reason: search.reason === 'expired' ? 'expired' : undefined,
  }),
  beforeLoad: async ({ search }) => {
    // A valid refresh cookie means the user is already logged in.
    if (await ensureSession()) throw redirect({ href: search.redirect ?? DEFAULT_LANDING });
  },
  component: LoginPage,
});

function LoginPage() {
  const { redirect: redirectTo, reason } = Route.useSearch();
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-2 text-lg font-semibold">
          <Coffee className="size-5" aria-hidden />
          Coffee Roaster CRM
        </div>
        <h1 className="mb-4 text-xl font-semibold">Log in</h1>
        <LoginForm redirectTo={redirectTo ?? DEFAULT_LANDING} expired={reason === 'expired'} />
      </div>
    </main>
  );
}
