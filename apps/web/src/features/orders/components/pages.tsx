import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useCan } from '@/features/auth';
import { BranchPicker, type BranchSelection } from '@/features/customers';
import { orderableProductsQuery } from '@/features/products';
import { NoPermission } from '@/shared/ui/no-permission';
import { NotFoundView } from '@/shared/ui/not-found-view';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryView } from '@/shared/ui/query-view';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { describeOrderError } from '../errors';
import { orderDetailQuery, scheduleQuery } from '../queries';
import type { Order } from '../types';
import { toApiError } from '@/shared/api/errors';
import { OrderDetail } from './OrderDetail';
import { OrderEditor } from './OrderEditor';

const notFound = (
  <NotFoundView title="Order not found" backTo="/orders" backLabel="Back to orders" />
);

export function OrderDetailPage({ orderId }: { orderId: string }) {
  const query = useQuery(orderDetailQuery(orderId));
  return (
    <QueryView query={query} loadingLabel="Loading order" notFound={notFound}>
      {(order) => <OrderDetail order={order} />}
    </QueryView>
  );
}

export function EditOrderPage({ orderId }: { orderId: string }) {
  const query = useQuery(orderDetailQuery(orderId));
  // The editor reads the product list once to work out line weights, so wait for it.
  const products = useQuery(orderableProductsQuery());
  return (
    <QueryView query={query} loadingLabel="Loading order" notFound={notFound}>
      {(latest) => {
        const a = latest.allowedActions;
        const editable =
          a.editLines !== 'none' || a.editRoastDate || a.editDeliveryDate || a.editNotes;
        if (!editable) {
          return (
            <div className="flex flex-col gap-4">
              <PageHeader
                title={`Edit ${latest.orderNumber}`}
                back={{ label: 'Orders', to: '/orders' }}
              />
              <Alert>
                <AlertDescription>
                  This order can't be changed in its current status or by your role.{' '}
                  <Link
                    to="/orders/$orderId"
                    params={{ orderId }}
                    className="font-medium underline"
                  >
                    Back to the order
                  </Link>
                </AlertDescription>
              </Alert>
            </div>
          );
        }
        if (products.isPending) {
          return (
            <p role="status" className="text-sm text-muted-foreground">
              Loading products…
            </p>
          );
        }
        return <EditOrderForm latest={latest} />;
      }}
    </QueryView>
  );
}

/**
 * The form works from the order as it was when opened (`snapshot`). A background refetch that finds
 * a newer version never replaces what the user is typing; it only shows a notice with a reload button.
 */
function EditOrderForm({ latest }: { latest: Order }) {
  const queryClient = useQueryClient();
  const [snapshot, setSnapshot] = useState(latest);
  const [reloads, setReloads] = useState(0);
  const changed = latest.version !== snapshot.version;

  async function reload() {
    const fresh = await queryClient.fetchQuery({ ...orderDetailQuery(latest.id), staleTime: 0 });
    setSnapshot(fresh);
    setReloads((n) => n + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Edit ${snapshot.orderNumber}`}
        back={{ label: 'Orders', to: '/orders' }}
      />
      {changed && (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              This order was changed by someone else since you opened it. Your edits are kept, but
              saving will be refused until you reload.
            </span>
            <Button size="lg" variant="outline" onClick={() => void reload()}>
              Reload order
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {/* Keyed by a reload counter: reloading restarts the form from the fresh order. */}
      <OrderEditor key={reloads} order={snapshot} onReload={reload} />
    </div>
  );
}

interface NewOrderPageProps {
  customerId?: string;
  branchId?: string;
}

export function NewOrderPage({ customerId, branchId }: NewOrderPageProps) {
  const canWrite = useCan('orders:write');
  const canAddProducts = useCan('products:write');
  const products = useQuery(orderableProductsQuery());
  const [selection, setSelection] = useState<BranchSelection>({
    customerId: customerId ?? '',
    branchId: branchId ?? '',
  });
  const schedule = useQuery({ ...scheduleQuery(), enabled: selection.branchId !== '' });

  if (!canWrite) return <NoPermission backTo="/orders" />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="New order" back={{ label: 'Orders', to: '/orders' }} />
      {products.isSuccess && products.data.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
          <p className="font-medium">Add products first</p>
          {canAddProducts ? (
            <Button asChild size="lg">
              <Link to="/products/new">Add product</Link>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Ask a manager to add products.</p>
          )}
        </div>
      ) : (
        <>
          <section aria-labelledby="order-customer" className="flex flex-col gap-3">
            <h2 id="order-customer" className="font-medium">
              Customer and branch
            </h2>
            <BranchPicker value={selection} onChange={setSelection} />
          </section>
          {selection.branchId !== '' &&
            (schedule.isError ? (
              <Alert variant="destructive">
                <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                  <span>{describeOrderError(toApiError(schedule.error))}</span>
                  <Button size="lg" variant="outline" onClick={() => void schedule.refetch()}>
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            ) : schedule.data ? (
              <OrderEditor
                key={selection.branchId}
                branchId={selection.branchId}
                schedule={schedule.data}
              />
            ) : (
              <p role="status" className="text-sm text-muted-foreground">
                Working out the dates…
              </p>
            ))}
        </>
      )}
    </div>
  );
}
