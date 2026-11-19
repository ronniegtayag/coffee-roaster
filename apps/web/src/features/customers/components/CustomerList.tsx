import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useEffect } from 'react';
import { useCan } from '@/features/auth';
import { toApiError } from '@/shared/api/errors';
import { formatAbn } from '@/shared/lib/abn';
import { cn } from '@/shared/lib/utils';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Field } from '@/shared/ui/field';
import { NativeSelect } from '@/shared/ui/native-select';
import { SearchBox } from '@/shared/ui/search-box';
import { Skeleton } from '@/shared/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { customerListQuery } from '../queries';
import { DEFAULT_STATUS, type CustomerListSearch } from '../search';
import { AUSTRALIAN_STATES, type AustralianState, type CustomerStatusFilter } from '../types';

const PAGE_SIZE = 25;

export function CustomerList({ search: urlSearch }: { search: CustomerListSearch }) {
  const navigate = useNavigate({ from: '/customers/' });
  const canCreate = useCan('customers:write');
  const { page = 1, search = '', status = DEFAULT_STATUS, state } = urlSearch;

  const query = useQuery(
    customerListQuery({ page, pageSize: PAGE_SIZE, search: search || undefined, status, state }),
  );
  const data = query.data;

  // A page past the end (old bookmark, or the last row was deactivated) goes to the last page.
  useEffect(() => {
    if (data && data.items.length === 0 && page > 1) {
      void navigate({
        search: (prev) => ({ ...prev, page: data.totalPages > 1 ? data.totalPages : undefined }),
        replace: true,
      });
    }
  }, [data, page, navigate]);

  function update(next: Partial<CustomerListSearch>) {
    // Any filter change goes back to page 1.
    void navigate({ search: (prev) => ({ ...prev, page: undefined, ...next }) });
  }

  const filtered = Boolean(search) || status !== DEFAULT_STATUS || Boolean(state);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Customers</h1>
        {canCreate && (
          <Button asChild size="lg">
            <Link to="/customers/new">
              <Plus aria-hidden />
              Create customer
            </Link>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {/* Keyed by the URL's search so the box resets on Clear search and Back. */}
        <SearchBox
          id="customer-search"
          placeholder="Name or ABN"
          key={search}
          initial={search}
          onSearch={(value) => update({ search: value })}
        />
        <Field id="customer-status" label="Status" className="w-40">
          <NativeSelect
            value={status}
            onChange={(e) => update({ status: e.target.value as CustomerStatusFilter })}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </NativeSelect>
        </Field>
        <Field id="customer-state" label="Branch state" className="w-40">
          <NativeSelect
            value={state ?? ''}
            onChange={(e) =>
              update({ state: (e.target.value || undefined) as AustralianState | undefined })
            }
          >
            <option value="">Any state</option>
            {AUSTRALIAN_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {filtered && (
          <Button
            variant="ghost"
            size="lg"
            className="h-10"
            onClick={() => {
              void navigate({ search: {} });
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {query.isError && !data ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {toApiError(query.error).status === 403
                ? "You don't have permission to do this"
                : 'Something went wrong — try again'}
            </span>
            <Button size="lg" variant="outline" onClick={() => void query.refetch()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : !data ? (
        <ListSkeleton />
      ) : data.totalItems === 0 ? (
        <EmptyState
          search={search}
          status={status}
          state={state}
          canCreate={canCreate}
          onClearSearch={() => update({ search: undefined })}
          onShowInactive={() => update({ status: 'all' })}
        />
      ) : (
        <div
          className={cn('flex flex-col gap-4', query.isFetching && 'opacity-70')}
          aria-busy={query.isFetching}
        >
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>ABN</TableHead>
                  <TableHead>Billing email</TableHead>
                  <TableHead className="text-right">Active branches</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to="/customers/$customerId"
                          params={{ customerId: customer.id }}
                          className="py-1 font-medium underline-offset-4 hover:underline"
                        >
                          {customer.displayName}
                        </Link>
                        {!customer.isActive && <Badge variant="outline">Inactive</Badge>}
                      </div>
                      {customer.legalName !== customer.displayName && (
                        <p className="text-xs text-muted-foreground">{customer.legalName}</p>
                      )}
                    </TableCell>
                    <TableCell>{customer.abn ? formatAbn(customer.abn) : 'No ABN'}</TableCell>
                    <TableCell>{customer.billingEmail}</TableCell>
                    <TableCell className="text-right">{customer.activeBranchCount}</TableCell>
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
              {data.totalItems === 1 ? 'customer' : 'customers'}
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

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label="Loading customers">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

interface EmptyStateProps {
  search: string;
  status: CustomerStatusFilter;
  state: AustralianState | undefined;
  canCreate: boolean;
  onClearSearch: () => void;
  onShowInactive: () => void;
}

function EmptyState({
  search,
  status,
  state,
  canCreate,
  onClearSearch,
  onShowInactive,
}: EmptyStateProps) {
  if (search) {
    return (
      <EmptyBox title={`No customers match "${search}"`}>
        <Button size="lg" variant="outline" onClick={onClearSearch}>
          Clear search
        </Button>
      </EmptyBox>
    );
  }
  if (state) {
    return <EmptyBox title={`No customers with an active branch in ${state}`} />;
  }
  if (status === 'inactive') return <EmptyBox title="No inactive customers" />;
  if (status === 'all') {
    return (
      <EmptyBox title="No customers yet">
        {canCreate ? (
          <Button asChild size="lg">
            <Link to="/customers/new">Create customer</Link>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">Ask a manager to add customers.</p>
        )}
      </EmptyBox>
    );
  }
  return (
    <EmptyBox title="No active customers">
      {canCreate ? (
        <Button asChild size="lg">
          <Link to="/customers/new">Create customer</Link>
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">Ask a manager to add customers.</p>
      )}
      <Button size="lg" variant="link" onClick={onShowInactive}>
        Show inactive customers too
      </Button>
    </EmptyBox>
  );
}

function EmptyBox({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
      <p className="font-medium">{title}</p>
      {children}
    </div>
  );
}
