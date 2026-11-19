import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useCan } from '@/features/auth';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Field } from '@/shared/ui/field';
import { NativeSelect } from '@/shared/ui/native-select';
import { PageHeader } from '@/shared/ui/page-header';
import { SearchBox } from '@/shared/ui/search-box';
import { Skeleton } from '@/shared/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { coffeeListQuery } from '../queries';
import type { CoffeeListSearch } from '../search';
import { COFFEE_TYPE_LABELS, type ActiveFilter } from '../types';

export function CoffeeList({ search: urlSearch }: { search: CoffeeListSearch }) {
  const navigate = useNavigate({ from: '/coffees/' });
  const canWrite = useCan('products:write');
  const { search = '', status = 'active' } = urlSearch;
  const query = useQuery(coffeeListQuery({ status, search: search || undefined }));
  const filtered = Boolean(search) || status !== 'active';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Coffees"
        actions={
          canWrite && (
            <Button asChild size="lg">
              <Link to="/coffees/new">
                <Plus aria-hidden />
                Add coffee
              </Link>
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <SearchBox
          key={search}
          id="coffee-search"
          initial={search}
          placeholder="Coffee name"
          onSearch={(value) => void navigate({ search: (prev) => ({ ...prev, search: value }) })}
        />
        <Field id="coffee-status" label="Status" className="w-36">
          <NativeSelect
            value={status}
            onChange={(e) =>
              void navigate({
                search: (prev) => ({
                  ...prev,
                  status:
                    e.target.value === 'active' ? undefined : (e.target.value as ActiveFilter),
                }),
              })
            }
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
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

      {query.isError ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>Something went wrong — try again</span>
            <Button size="lg" variant="outline" onClick={() => void query.refetch()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : !query.data ? (
        <div className="flex flex-col gap-2" role="status" aria-label="Loading coffees">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : query.data.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
          <p className="font-medium">
            {filtered ? 'No coffees match these filters' : 'No coffees yet'}
          </p>
          {filtered ? (
            <Button size="lg" variant="outline" onClick={() => void navigate({ search: {} })}>
              Clear filters
            </Button>
          ) : canWrite ? (
            <Button asChild size="lg">
              <Link to="/coffees/new">Add coffee</Link>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Ask a manager to add coffees.</p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Coffee</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Origin</TableHead>
                <TableHead className="text-right">Active products</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.map((coffee) => (
                <TableRow key={coffee.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Link
                        to="/coffees/$coffeeId"
                        params={{ coffeeId: coffee.id }}
                        className="py-1 font-medium underline-offset-4 hover:underline"
                      >
                        {coffee.name}
                      </Link>
                      {!coffee.isActive && <Badge variant="outline">Inactive</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>{COFFEE_TYPE_LABELS[coffee.type]}</TableCell>
                  <TableCell>{coffee.origin ?? '—'}</TableCell>
                  <TableCell className="text-right">{coffee.activeProductCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
