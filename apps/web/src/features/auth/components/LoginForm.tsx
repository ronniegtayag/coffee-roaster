import { useRouter } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { ApiError, toApiError } from '@/shared/api/errors';
import { applySession } from '@/shared/api/session';
import { queryClient } from '@/shared/api/query-client';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Field } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { login } from '../api';

interface Props {
  /** Where to go after login; already checked to be a path on this site. */
  redirectTo: string;
  expired: boolean;
}

function messageFor(error: ApiError): string {
  if (error.code === 'INVALID_CREDENTIALS') return 'Email or password is incorrect';
  if (error.status === 429) {
    const minutes = error.retryAfterSeconds ? Math.ceil(error.retryAfterSeconds / 60) : null;
    return minutes
      ? `Too many attempts. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`
      : 'Too many attempts. Try again later.';
  }
  if (error.status === 0 || error.status >= 500) {
    return "Can't reach the service. Check your connection and try again.";
  }
  return error.message;
}

export function LoginForm({ redirectTo, expired }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const next = {
      email: email.trim() ? undefined : 'Enter your email',
      password: password ? undefined : 'Enter your password',
    };
    setErrors(next);
    setFormError(null);
    if (next.email || next.password) {
      document.getElementById(next.email ? 'login-email' : 'login-password')?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const session = await login({ email: email.trim(), password });
      // Cached data belongs to whoever was logged in before.
      queryClient.clear();
      applySession(session);
      router.history.push(redirectTo);
    } catch (error) {
      setFormError(messageFor(toApiError(error)));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4">
      {expired && !formError && (
        <Alert>
          <AlertDescription>Your session has expired. Log in again to continue.</AlertDescription>
        </Alert>
      )}
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <Field id="login-email" label="Email" error={errors.email}>
        <Input
          id="login-email"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-10"
        />
      </Field>
      <Field id="login-password" label="Password" error={errors.password}>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-10"
        />
      </Field>
      <Button type="submit" size="lg" disabled={submitting}>
        {submitting ? 'Logging in…' : 'Log in'}
      </Button>
    </form>
  );
}
