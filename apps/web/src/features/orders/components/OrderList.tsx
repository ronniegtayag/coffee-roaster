import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useEffect } from 'react';
import { useCan } from '@/features/auth';
import { formatBusinessDate, todayInSydney } from '@/shared/lib/dates';
import { formatAud } from '@/shared/lib/money';
import { cn } from '@/shared/lib/utils';
import { formatKg } from '@/shared/lib/weight';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Field } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { PageHeader } from '@/shared/ui/page-header';
import { SearchBox } from '@/shared/ui/search-box';
import { Skeleton } from '@/shared/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { orderListQuery } from '../queries';
import { isDefaultView, parseStatuses, type OrderListSearch } from '../search';
import {
  DEFAULT_OPEN_STATUSES,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  type OrderStatus,
} from '../types';
import { OrderStatusBadge } from './OrderStatusBadge';

const PAGE_SIZE = 25;

export function OrderList({ search: urlSearch }: { search: OrderListSearch }) {
  const navigate = useNavigate({ from: '/orders/' });
  const canWrite = useCan('orders:write');
  const {
    page = 1,
    search = '',
    deliveryFrom,
    deliveryTo,
    roastDate,
    customerId,
    branchId,
  } = urlSearch;
  const defaultView = isDefaultView(urlSearch);
  const selected = parseStatuses(urlSearch.status);
  const shownStatuses = selected.length > 0 ? selected : DEFAULT_OPEN_STATUSES;

  const query = useQuery(
    orderListQuery({
      page,
      pageSize: PAGE_SIZE,
      search: search || undefined,
      status: urlSearch.status,
      // The default view is "what's coming up": from today (Sydney), without cluttering the URL.
      deliveryFrom: defaultView ? todayInSydney() : deliveryFrom,
      deliveryTo,
      roastDate,
      customerId,
      branchId,
    }),
  );
  const data = query.data;
  const hasFilters =
    !defaultView || Boolean(urlSearch.status) || Boolean(customerId) || Boolean(branchId);

  // A page past the end goes to the last page.
  useEffect(() => {
    if (data && data.items.length === 0 && page > 1) {
      void navigate({
        search: (prev) => ({ ...prev, page: data.totalPages > 1 ? data.totalPages : undefined }),
        replace: true,
      });
    }
  }, [data, page, navigate]);

  function update(next: Partial<OrderListSearch>) {
    void navigate({ search: (prev) => ({ ...prev, page: undefined, ...next }) });
  }

  function toggleStatus(status: OrderStatus, on: boolean) {
    const next = ORDER_STATUSES.filter((s) => (s === status ? on : shownStatuses.includes(s)));
    update({ status: next.length > 0 ? next.join(',') : undefined });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Orders"
        actions={
          <>
            <Button asChild variant="outline" size="lg">
              <Link to="/orders/roast-summary">Roast summary</Link>
            </Button>
            {canWrite && (
              <Button asChild size="lg">
                <Link to="/orders/new">
                  <Plus aria-hidden />
                  New order
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <SearchBox
          key={search}
          id="order-search"
          initial={search}
          placeholder="Order no., customer or branch"
          onSearch={(value) => update({ search: value })}
        />
        <Field id="order-delivery-from" label="Delivery from" className="w-44">
          <Input
            className="h-10"
            type="date"
            value={deliveryFrom ?? ''}
            onChange={(e) => update({ deliveryFrom: e.target.value || undefined })}
          />
        </Field>
        <Field id="order-delivery-to" label="Delivery to" className="w-44">
          <Input
            className="h-10"
            type="date"
            value={deliveryTo ?? ''}
            onChange={(e) => update({ deliveryTo: e.target.value || undefined })}
          />
        </Field>
        <Field id="order-roast-date" label="Roast date" className="w-44">
          <Input
            className="h-10"
            type="date"
            value={roastDate ?? ''}
            onChange={(e) => update({ roastDate: e.target.value || undefined })}
          />
        </Field>
        {hasFilters && (
          <Button
            variant="ghost"
            size="lg"
            className="h-10"
            onClick={() => void navigate({ search: {} })}
          >
            Clear filters
          </Button>
        )}
      </div>

      <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <legend className="mb-1 text-sm font-medium">Status</legend>
        {ORDER_STATUSES.map((status) => (
          <label key={status} className="flex min-h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={shownStatuses.includes(status)}
              onChange={(e) => toggleStatus(status, e.target.checked)}
            />
            {ORDER_STATUS_LABELS[status]}
          </label>
        ))}
      </fieldset>

      {(customerId || branchId) && (
        <p className="text-sm text-muted-foreground">
          Showing one {branchId ? 'branch' : 'customer'} only.{' '}
          <button
            type="button"
            className="underline underline-offset-4"
            onClick={() => update({ customerId: undefined, branchId: undefined })}
          >
            Show all
          </button>
        </p>
      )}
      {defaultView && (
        <p className="text-sm text-muted-foreground">
          Showing upcoming orders, from today ({formatBusinessDate(todayInSydney())}).
        </p>
      )}

      {query.isError && !data ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>Something went wrong — try again</span>
            <Button size="lg" variant="outline" onClick={() => void query.refetch()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : !data ? (
        <div className="flex flex-col gap-2" role="status" aria-label="Loading orders">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : data.totalItems === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
          {hasFilters ? (
            <>
              <p className="font-medium">No orders for these filters</p>
              <Button size="lg" variant="outline" onClick={() => void navigate({ search: {} })}>
                Clear filters
              </Button>
            </>
          ) : (
            <>
              <p className="font-medium">No upcoming orders</p>
              {canWrite && (
                <Button asChild size="lg">
                  <Link to="/orders/new">New order</Link>
                </Button>
              )}
            </>
          )}
        </div>
      ) : (
        <div
          className={cn('flex flex-col gap-4', query.isFetching && 'opacity-70')}
          aria-busy={query.isFetching}
        >
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead>Roast</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="text-right">Weight</TableHead>
                  <TableHead className="text-right">Total inc-GST</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Link
                        to="/orders/$orderId"
                        params={{ orderId: order.id }}
                        className="py-1 font-medium underline-offset-4 hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{formatBusinessDate(order.deliveryDate)}</TableCell>
                    <TableCell>{formatBusinessDate(order.roastDate)}</TableCell>
                    <TableCell className="whitespace-normal">
                      <p className="font-medium">{order.customer.displayName}</p>
                      <p className="text-xs text-muted-foreground">
                        {order.branch.name}, {order.branch.suburb}
                      </p>
                    </TableCell>
                    <TableCell className="text-right">{order.lineCount}</TableCell>
                    <TableCell className="text-right">{formatKg(order.totalWeightGrams)}</TableCell>
                    <TableCell className="text-right">{formatAud(order.totalIncGst)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <OrderStatusBadge status={order.status} />
                        {order.afterCutoff && <Badge variant="outline">After cut-off</Badge>}
                        {!order.customer.isActive && (
                          <Badge variant="outline">Inactive customer</Badge>
                        )}
                        {!order.branch.isActive && <Badge variant="outline">Inactive branch</Badge>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <nav
            aria-label="Pagination"
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <p className="text-sm text-muted-foreground">
              Page {data.page} of {data.totalPages} · {data.totalItems}{' '}
              {data.totalItems === 1 ? 'order' : 'orders'}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="lg"
                disabled={data.page <= 1}
                onClick={() =>
                  void navigate({
                    search: (prev) => ({
                      ...prev,
                      page: data.page > 2 ? data.page - 1 : undefined,
                    }),
                  })
                }
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="lg"
                disabled={data.page >= data.totalPages}
                onClick={() =>
                  void navigate({ search: (prev) => ({ ...prev, page: data.page + 1 }) })
                }
              >
                Next
              </Button>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
