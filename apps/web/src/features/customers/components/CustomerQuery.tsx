import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { toApiError } from '@/shared/api/errors';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { customerDetailQuery } from '../queries';
import type { Customer } from '../types';
import { CustomerNotFound } from './CustomerNotFound';

/** Loads a customer and handles loading, 404 and error states, then renders `children(customer)`. */
export function CustomerQuery({
  customerId,
  children,
}: {
  customerId: string;
  children: (customer: Customer) => ReactNode;
}) {
  const query = useQuery(customerDetailQuery(customerId));

  if (query.data) return <>{children(query.data)}</>;
  if (query.isError) {
    const error = toApiError(query.error);
    if (error.status === 404) return <CustomerNotFound />;
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
    <div className="flex flex-col gap-3" role="status" aria-label="Loading customer">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
