import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { formatTimestamp } from '@/shared/lib/dates';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { healthQuery } from '../queries';

function StatusBadge({ up }: { up: boolean }) {
  return <Badge variant={up ? 'default' : 'destructive'}>{up ? 'Up' : 'Down'}</Badge>;
}

export function SystemStatus() {
  const { data, error, isPending, isFetching, refetch, dataUpdatedAt, errorUpdatedAt } =
    useQuery(healthQuery);

  const checkedAt = Math.max(dataUpdatedAt, errorUpdatedAt);
  const apiReachable = !error && !!data;
  const checks = data ? Object.entries(data.details) : [];

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">System status</h1>
          <p className="text-sm text-muted-foreground">
            {checkedAt
              ? `Last checked ${formatTimestamp(new Date(checkedAt).toISOString())}`
              : 'Checking…'}
          </p>
        </div>
        <Button size="lg" variant="outline" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={isFetching ? 'animate-spin' : undefined} aria-hidden />
          Check now
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Services</CardTitle>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <p className="text-muted-foreground">Checking the API…</p>
          ) : (
            <ul className="divide-y">
              <li className="flex h-12 items-center justify-between">
                <span>API</span>
                <StatusBadge up={apiReachable} />
              </li>
              {checks.map(([name, check]) => (
                <li key={name} className="flex h-12 items-center justify-between">
                  <span className="capitalize">{name}</span>
                  <StatusBadge up={check.status === 'up'} />
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {error.message}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
