import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useEffect } from 'react';
import { useCan } from '@/features/auth';
import { formatAud } from '@/shared/lib/money';
import { cn } from '@/shared/lib/utils';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Field } from '@/shared/ui/field';
import { NativeSelect } from '@/shared/ui/native-select';
import { PageHeader } from '@/shared/ui/page-header';
import { SearchBox } from '@/shared/ui/search-box';
import { Skeleton } from '@/shared/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { coffeeListQuery, productListQuery } from '../queries';
import type { ProductListSearch } from '../search';
import { type ActiveFilter, TAX_CODE_LABELS } from '../types';

const PAGE_SIZE = 25;

export function ProductList({ search: urlSearch }: { search: ProductListSearch }) {
  const navigate = useNavigate({ from: '/products/' });
  const canWrite = useCan('products:write');
  const { page = 1, search = '', status = 'active', kind, coffeeId } = urlSearch;
  const query = useQuery(
    productListQuery({
      page,
      pageSize: PAGE_SIZE,
      search: search || undefined,
      status,
      kind,
      coffeeId,
    }),
  );
  const coffees = useQuery(coffeeListQuery({ status: 'all' }));
  const data = query.data;
  const filtered = Boolean(search) || status !== 'active' || Boolean(kind) || Boolean(coffeeId);

  // A page past the end goes to the last page.
  useEffect(() => {
    if (data && data.items.length === 0 && page > 1) {
      void navigate({
        search: (prev) => ({ ...prev, page: data.totalPages > 1 ? data.totalPages : undefined }),
        replace: true,
      });
    }
  }, [data, page, navigate]);

  function update(next: Partial<ProductListSearch>) {
    void navigate({ search: (prev) => ({ ...prev, page: undefined, ...next }) });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Products"
        actions={
          canWrite && (
            <Button asChild size="lg">
              <Link to="/products/new">
                <Plus aria-hidden />
                Add product
              </Link>
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <SearchBox
          key={search}
          id="product-search"
          initial={search}
          placeholder="Coffee, name or SKU"
          onSearch={(value) => update({ search: value })}
        />
        <Field id="product-status" label="Status" className="w-36">
          <NativeSelect
            value={status}
            onChange={(e) =>
              update({
                status: e.target.value === 'active' ? undefined : (e.target.value as ActiveFilter),
              })
            }
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </NativeSelect>
        </Field>
        <Field id="product-kind" label="Kind" className="w-36">
          <NativeSelect
            value={kind ?? ''}
            onChange={(e) =>
              update({ kind: (e.target.value || undefined) as ProductListSearch['kind'] })
            }
          >
            <option value="">All</option>
            <option value="coffee">Coffee</option>
            <option value="other">Other</option>
          </NativeSelect>
        </Field>
        <Field id="product-coffee" label="Coffee" className="w-48">
          <NativeSelect
            value={coffeeId ?? ''}
            onChange={(e) => update({ coffeeId: e.target.value || undefined })}
          >
            <option value="">Any coffee</option>
            {coffees.data?.map((coffee) => (
              <option key={coffee.id} value={coffee.id}>
                {coffee.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {filtered && (
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
        <div className="flex flex-col gap-2" role="status" aria-label="Loading products">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : data.totalItems === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
          {filtered ? (
            <>
              <p className="font-medium">No products match these filters</p>
              <Button size="lg" variant="outline" onClick={() => void navigate({ search: {} })}>
                Clear filters
              </Button>
            </>
          ) : (
            <>
              <p className="font-medium">No products yet</p>
              {canWrite ? (
                <Button asChild size="lg">
                  <Link to="/products/new">Add product</Link>
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">Ask a manager to add products.</p>
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
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Price ex-GST</TableHead>
                  <TableHead>Tax code</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="whitespace-normal">
                      <Link
                        to="/products/$productId"
                        params={{ productId: product.id }}
                        className="py-1 font-medium underline-offset-4 hover:underline"
                      >
                        {product.displayName}
                      </Link>
                    </TableCell>
                    <TableCell>{product.sku}</TableCell>
                    <TableCell className="text-right">
                      {formatAud(product.listPriceExGst)}
                    </TableCell>
                    <TableCell>{TAX_CODE_LABELS[product.taxCode]}</TableCell>
                    <TableCell>
                      {!product.isActive ? (
                        <Badge variant="outline">Inactive</Badge>
                      ) : !product.orderable ? (
                        <Badge variant="outline">Coffee inactive</Badge>
                      ) : (
                        'Active'
                      )}
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
              {data.totalItems === 1 ? 'product' : 'products'}
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
