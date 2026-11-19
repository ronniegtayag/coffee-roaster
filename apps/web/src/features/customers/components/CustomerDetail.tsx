import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useCan } from '@/features/auth';
import { formatAbn } from '@/shared/lib/abn';
import { formatTimestamp } from '@/shared/lib/dates';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { useSetCustomerActive } from '../queries';
import type { Customer } from '../types';
import { BranchCard } from './BranchCard';

function formatTerms(days: number): string {
  if (days === 0) return 'Due on issue';
  return days === 1 ? '1 day' : `${days} days`;
}

export function CustomerDetail({ customer }: { customer: Customer }) {
  const canWrite = useCan('customers:write');
  const canToggle = useCan('customers:deactivate');
  const canAddBranch = useCan('branches:write');
  const setActive = useSetCustomerActive(customer.id);

  // Active branches first (the API already orders each group).
  const branches = [...customer.branches].sort((a, b) => Number(b.isActive) - Number(a.isActive));

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link to="/customers" className="text-muted-foreground underline-offset-4 hover:underline">
          Customers
        </Link>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{customer.displayName}</h1>
          {!customer.isActive && <Badge variant="outline">Inactive</Badge>}
        </div>
        <div className="flex gap-2">
          {canWrite && (
            <Button asChild variant="outline" size="lg">
              <Link to="/customers/$customerId/edit" params={{ customerId: customer.id }}>
                Edit customer
              </Link>
            </Button>
          )}
          {canToggle &&
            (customer.isActive ? (
              <ConfirmDialog
                trigger={
                  <Button variant="outline" size="lg">
                    Deactivate
                  </Button>
                }
                title={`Deactivate ${customer.displayName}?`}
                description="They will drop out of the default customer list and can't receive new orders. Their branches and history are kept, and you can reactivate them later."
                confirmLabel="Deactivate customer"
                onConfirm={() => setActive.mutateAsync(false)}
              />
            ) : (
              <ConfirmDialog
                trigger={<Button size="lg">Reactivate</Button>}
                title={`Reactivate ${customer.displayName}?`}
                description="They will return to the customer list, with their branches as they were."
                confirmLabel="Reactivate customer"
                onConfirm={() => setActive.mutateAsync(true)}
              />
            ))}
        </div>
      </div>

      {!customer.isActive && (
        <Alert>
          <AlertDescription>
            This customer is inactive
            {customer.deactivatedAt ? ` since ${formatTimestamp(customer.deactivatedAt)}` : ''}.
            They can't receive new orders, but you can still edit their details.
          </AlertDescription>
        </Alert>
      )}

      <section aria-labelledby="details-heading" className="rounded-lg border p-4">
        <h2 id="details-heading" className="mb-3 font-medium">
          Details
        </h2>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Item label="Legal name">{customer.legalName}</Item>
          <Item label="Trading name">{customer.tradingName ?? '—'}</Item>
          <Item label="ABN">{customer.abn ? formatAbn(customer.abn) : 'No ABN'}</Item>
          <Item label="Billing email">
            <a href={`mailto:${customer.billingEmail}`} className="underline underline-offset-4">
              {customer.billingEmail}
            </a>
          </Item>
          <Item label="Phone">{customer.phone ?? '—'}</Item>
          <Item label="Payment terms">{formatTerms(customer.paymentTermsDays)}</Item>
          <Item label="Notes" wide>
            <span className="whitespace-pre-wrap">{customer.notes ?? '—'}</span>
          </Item>
          <Item label="Last updated">{formatTimestamp(customer.updatedAt)}</Item>
        </dl>
      </section>

      <section aria-labelledby="branches-heading" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="branches-heading" className="font-medium">
            Branches
          </h2>
          {canAddBranch && branches.length > 0 && <AddBranchButton customerId={customer.id} />}
        </div>
        {branches.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-10 text-center">
            <p className="font-medium">No branches yet</p>
            {canAddBranch ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Add the cafe's venue so orders can be delivered to the right place.
                </p>
                <AddBranchButton customerId={customer.id} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Ask a manager to add a branch.</p>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {branches.map((branch) => (
              <BranchCard key={branch.id} customer={customer} branch={branch} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AddBranchButton({ customerId }: { customerId: string }) {
  return (
    <Button asChild size="lg">
      <Link to="/customers/$customerId/branches/new" params={{ customerId }}>
        <Plus aria-hidden />
        Add branch
      </Link>
    </Button>
  );
}

function Item({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
