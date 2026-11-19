import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useCan } from '@/features/auth';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Field } from '@/shared/ui/field';
import { NativeSelect } from '@/shared/ui/native-select';
import { SearchBox } from '@/shared/ui/search-box';
import { customerDetailQuery, customerListQuery } from '../queries';

export interface BranchSelection {
  customerId: string;
  branchId: string;
}

interface Props {
  value: BranchSelection;
  onChange: (value: BranchSelection) => void;
}

/**
 * Pick a customer, then one of its active branches (a single active branch is chosen for you).
 * Used where a branch is needed, such as taking an order.
 */
export function BranchPicker({ value, onChange }: Props) {
  const canAddBranch = useCan('branches:write');
  const [term, setTerm] = useState('');
  const results = useQuery({
    ...customerListQuery({ page: 1, pageSize: 8, search: term, status: 'active' }),
    enabled: term.length > 0,
  });
  const customer = useQuery({
    ...customerDetailQuery(value.customerId),
    enabled: value.customerId !== '',
  });

  const activeBranches = customer.data?.branches.filter((b) => b.isActive) ?? [];
  const onlyBranchId = activeBranches.length === 1 ? activeBranches[0].id : '';

  useEffect(() => {
    if (customer.data?.isActive && onlyBranchId && value.branchId !== onlyBranchId) {
      onChange({ customerId: value.customerId, branchId: onlyBranchId });
    }
  }, [customer.data?.isActive, onlyBranchId, value, onChange]);

  return (
    <div className="flex flex-col gap-4">
      {value.customerId === '' ? (
        <div className="flex flex-col gap-3">
          <SearchBox
            id="branch-picker-search"
            initial={term}
            placeholder="Customer name or ABN"
            onSearch={(next) => setTerm(next ?? '')}
          />
          {term && results.isPending && <p className="text-sm text-muted-foreground">Searching…</p>}
          {results.isError && (
            <p role="alert" className="text-sm text-destructive">
              Something went wrong — try again
            </p>
          )}
          {term && results.data && results.data.items.length === 0 && (
            <p className="text-sm text-muted-foreground">No active customers match "{term}".</p>
          )}
          {results.data && results.data.items.length > 0 && (
            <ul
              aria-label="Matching customers"
              className="flex flex-col divide-y rounded-lg border"
            >
              {results.data.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 p-3">
                  <span className="text-sm">
                    <span className="font-medium">{item.displayName}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      · {item.activeBranchCount}{' '}
                      {item.activeBranchCount === 1 ? 'branch' : 'branches'}
                    </span>
                  </span>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => onChange({ customerId: item.id, branchId: '' })}
                  >
                    Choose<span className="sr-only"> {item.displayName}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : customer.isPending ? (
        <p className="text-sm text-muted-foreground" role="status">
          Loading customer…
        </p>
      ) : customer.isError ? (
        <Alert variant="destructive">
          <AlertDescription>Something went wrong — try again</AlertDescription>
        </Alert>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-medium">{customer.data.displayName}</p>
            <Button
              size="lg"
              variant="ghost"
              onClick={() => {
                setTerm('');
                onChange({ customerId: '', branchId: '' });
              }}
            >
              Change customer
            </Button>
          </div>
          {!customer.data.isActive ? (
            <Alert variant="destructive">
              <AlertDescription>
                {customer.data.displayName} is inactive, so orders can't be taken for them.{' '}
                <Link
                  to="/customers/$customerId"
                  params={{ customerId: customer.data.id }}
                  className="font-medium underline"
                >
                  View customer
                </Link>
              </AlertDescription>
            </Alert>
          ) : activeBranches.length === 0 ? (
            <Alert variant="destructive">
              <AlertDescription>
                {canAddBranch ? (
                  <>
                    Add a branch to {customer.data.displayName} before taking an order.{' '}
                    <Link
                      to="/customers/$customerId/branches/new"
                      params={{ customerId: customer.data.id }}
                      className="font-medium underline"
                    >
                      Add branch
                    </Link>
                  </>
                ) : (
                  <>{customer.data.displayName} has no active branch. Ask a manager to add one.</>
                )}
              </AlertDescription>
            </Alert>
          ) : (
            <Field id="branch-picker-branch" label="Branch" required className="max-w-sm">
              <NativeSelect
                value={value.branchId}
                onChange={(e) =>
                  onChange({ customerId: value.customerId, branchId: e.target.value })
                }
              >
                {activeBranches.length > 1 && <option value="">Select…</option>}
                {activeBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name} — {branch.suburb}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
        </div>
      )}
    </div>
  );
}
