import { Link } from '@tanstack/react-router';
import { useCan } from '@/features/auth';
import { toApiError } from '@/shared/api/errors';
import { describeApiError } from '@/shared/lib/form-errors';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { useSetBranchActive } from '../queries';
import type { Branch, Customer } from '../types';

export function BranchCard({ customer, branch }: { customer: Customer; branch: Branch }) {
  const canWriteBranch = useCan('branches:write');
  const canEditContact = useCan('branches:update-contact');
  const canEdit = canWriteBranch || canEditContact;
  const canOrder = useCan('orders:write');
  const canToggle = useCan('branches:deactivate');
  const setActive = useSetBranchActive(customer.id, branch.id);

  return (
    <li className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium">{branch.name}</h3>
          {!branch.isActive && <Badge variant="outline">Inactive</Badge>}
        </div>
        <div className="flex flex-wrap gap-2">
          {canOrder && branch.isActive && customer.isActive && (
            <Button asChild variant="outline" size="lg">
              <Link to="/orders/new" search={{ customerId: customer.id, branchId: branch.id }}>
                New order<span className="sr-only"> for {branch.name}</span>
              </Link>
            </Button>
          )}
          {canEdit && (
            <Button asChild variant="outline" size="lg">
              <Link
                to="/customers/$customerId/branches/$branchId/edit"
                params={{ customerId: customer.id, branchId: branch.id }}
              >
                Edit<span className="sr-only"> {branch.name}</span>
              </Link>
            </Button>
          )}
          {canToggle && branch.isActive && (
            <ConfirmDialog
              trigger={
                <Button variant="outline" size="lg">
                  Deactivate<span className="sr-only"> {branch.name}</span>
                </Button>
              }
              title={`Deactivate ${branch.name}?`}
              description="It will no longer be offered for new orders. You can reactivate it later."
              confirmLabel="Deactivate branch"
              onConfirm={() => setActive.mutateAsync(false)}
            />
          )}
          {/* Reactivating under an inactive customer is refused by the API, so don't offer it. */}
          {canToggle && !branch.isActive && customer.isActive && (
            <Button
              variant="outline"
              size="lg"
              disabled={setActive.isPending}
              onClick={() => setActive.mutate(true)}
            >
              Reactivate<span className="sr-only"> {branch.name}</span>
            </Button>
          )}
        </div>
      </div>
      <address className="text-sm not-italic">
        {branch.addressLine1}
        <br />
        {branch.addressLine2 && (
          <>
            {branch.addressLine2}
            <br />
          </>
        )}
        {branch.suburb} {branch.state} {branch.postcode}
      </address>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Contact</dt>
          <dd>
            {[branch.contactName, branch.contactPhone].filter(Boolean).join(' · ') ||
              'None recorded'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Delivery notes</dt>
          <dd className="whitespace-pre-wrap">{branch.deliveryNotes ?? 'None recorded'}</dd>
        </div>
      </dl>
      {setActive.isError && (
        <p role="alert" className="text-sm text-destructive">
          {describeApiError(toApiError(setActive.error))}
        </p>
      )}
    </li>
  );
}
