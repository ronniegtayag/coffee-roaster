import type { ErrorComponentProps } from '@tanstack/react-router';
import { Button } from '@/shared/ui/button';

/** Route error boundary: shown when a route's component or loader throws. */
export function ErrorView({ error, reset }: ErrorComponentProps) {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center"
    >
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">
        {error instanceof Error ? error.message : 'An unexpected error occurred.'}
      </p>
      <Button size="lg" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
