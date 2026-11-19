import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { toApiError } from '@/shared/api/errors';
import { Alert, AlertDescription } from './alert';
import { Button } from './button';
import { Skeleton } from './skeleton';

interface Props<T> {
  query: UseQueryResult<T>;
  /** Shown for a 404, e.g. "Order not found". */
  notFound: ReactNode;
  loadingLabel: string;
  children: (data: T) => ReactNode;
}

/** Renders a detail query's loading, 404 and error states, then `children(data)`. */
export function QueryView<T>({ query, notFound, loadingLabel, children }: Props<T>) {
  if (query.data !== undefined) return <>{children(query.data)}</>;
  if (query.isError) {
    const error = toApiError(query.error);
    if (error.status === 404) return <>{notFound}</>;
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>
            {error.status === 403
              ? "You don't have permission to do this"
              : 'Something went wrong — try again'}
          </span>
          <Button size="lg" variant="outline" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="flex flex-col gap-3" role="status" aria-label={loadingLabel}>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
