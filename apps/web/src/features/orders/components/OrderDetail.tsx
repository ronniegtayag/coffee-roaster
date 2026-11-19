import { useNavigate, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { toApiError } from '@/shared/api/errors';
import { formatBusinessDateLong, formatClockTime, formatTimestamp } from '@/shared/lib/dates';
import { formatAud } from '@/shared/lib/money';
import { formatKg } from '@/shared/lib/weight';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { PageHeader } from '@/shared/ui/page-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { describeOrderError } from '../errors';
import { useCopyOrder, useDeleteOrder, useTransitionOrder } from '../queries';
import { type Order, type OrderEventType } from '../types';
import { OrderStatusBadge } from './OrderStatusBadge';

const EVENT_LABELS: Record<OrderEventType, string> = {
  CREATED: 'Created',
  UPDATED: 'Changed',
  CONFIRMED: 'Confirmed',
  PACKED: 'Packed',
  DISPATCHED: 'Dispatched',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REVERTED: 'Moved back a step',
};

const TAX_LABEL = { GST: 'GST', GST_FREE: 'GST-free' } as const;

export function OrderDetail({ order }: { order: Order }) {
  const navigate = useNavigate();
  const { allowedActions: can } = order;
  const transition = useTransitionOrder(order.id);
  const copy = useCopyOrder(order.id);
  const remove = useDeleteOrder(order.id);
  const [actionError, setActionError] = useState<string | null>(null);
  // One id until a copy succeeds, so retrying after a timeout can't make a second copy.
  const [copyRequestId, setCopyRequestId] = useState(() => crypto.randomUUID());

  const canEdit =
    can.editLines !== 'none' || can.editRoastDate || can.editDeliveryDate || can.editNotes;
  const open = order.status !== 'DELIVERED' && order.status !== 'CANCELLED';
  const inactive = !order.customer.isActive ? 'customer' : !order.branch.isActive ? 'branch' : null;

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(describeOrderError(toApiError(error)));
    }
  }

  const step = (
    action: 'confirm' | 'pack' | 'dispatch' | 'deliver',
    label: string,
    primary = false,
  ) => (
    <Button
      size="lg"
      variant={primary ? 'default' : 'outline'}
      disabled={transition.isPending}
      onClick={() => void run(() => transition.mutateAsync({ action, version: order.version }))}
    >
      {label}
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={order.orderNumber}
        back={{ label: 'Orders', to: '/orders' }}
        badges={
          <>
            <OrderStatusBadge status={order.status} />
            {order.afterCutoff && <Badge variant="outline">After cut-off</Badge>}
            {order.pastCutoff && (order.status === 'DRAFT' || order.status === 'CONFIRMED') && (
              <Badge variant="outline">Past cut-off</Badge>
            )}
          </>
        }
        actions={
          <>
            {canEdit && (
              <Button asChild variant="outline" size="lg">
                <Link to="/orders/$orderId/edit" params={{ orderId: order.id }}>
                  Edit order
                </Link>
              </Button>
            )}
            {can.confirm && step('confirm', 'Confirm order', true)}
            {can.pack && step('pack', 'Mark packed', true)}
            {can.dispatch && step('dispatch', 'Mark dispatched')}
            {can.deliver && step('deliver', 'Mark delivered', order.status === 'DISPATCHED')}
            {can.copy && (
              <Button
                variant="outline"
                size="lg"
                disabled={copy.isPending}
                onClick={() =>
                  void run(async () => {
                    const { order: copied } = await copy.mutateAsync(copyRequestId);
                    setCopyRequestId(crypto.randomUUID());
                    await navigate({ to: '/orders/$orderId', params: { orderId: copied.id } });
                  })
                }
              >
                Copy order
              </Button>
            )}
            {can.revert && (
              <ConfirmDialog
                trigger={
                  <Button variant="outline" size="lg">
                    Move back a step
                  </Button>
                }
                title={`Move ${order.orderNumber} back a step?`}
                description="Use this to fix a mistake. The order returns to the previous status."
                confirmLabel="Move back"
                reasonLabel="Reason"
                describeError={describeOrderError}
                onConfirm={(reason) =>
                  transition.mutateAsync({ action: 'revert', version: order.version, reason })
                }
              />
            )}
            {can.cancel && (
              <ConfirmDialog
                trigger={
                  <Button variant="outline" size="lg">
                    Cancel order
                  </Button>
                }
                title={`Cancel ${order.orderNumber}?`}
                description="A cancelled order can't be edited or restored. You can copy it to start a new one."
                confirmLabel="Cancel order"
                reasonLabel="Reason for cancelling"
                describeError={describeOrderError}
                onConfirm={(reason) =>
                  transition.mutateAsync({ action: 'cancel', version: order.version, reason })
                }
              />
            )}
            {can.delete && (
              <ConfirmDialog
                trigger={
                  <Button variant="outline" size="lg">
                    Delete draft
                  </Button>
                }
                title={`Delete ${order.orderNumber}?`}
                description="This draft was never confirmed, so it will be removed."
                confirmLabel="Delete draft"
                describeError={describeOrderError}
                onConfirm={async () => {
                  await remove.mutateAsync(order.version);
                  await navigate({ to: '/orders' });
                }}
              />
            )}
          </>
        }
      />

      {actionError && (
        <Alert variant="destructive">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}
      {inactive && open && (
        <Alert>
          <AlertDescription>
            This order's {inactive} is inactive. The order is unchanged and is not cancelled
            automatically — a manager decides.{' '}
            <Link
              to="/customers/$customerId"
              params={{ customerId: order.customer.id }}
              className="font-medium underline"
            >
              View {order.customer.displayName}
            </Link>
          </AlertDescription>
        </Alert>
      )}
      {order.status === 'CANCELLED' && (
        <Alert>
          <AlertDescription>
            Cancelled{order.cancelledAt ? ` on ${formatTimestamp(order.cancelledAt)}` : ''}
            {order.cancelReason ? `: ${order.cancelReason}` : ''}
          </AlertDescription>
        </Alert>
      )}

      <section aria-labelledby="order-summary" className="grid gap-4 md:grid-cols-2">
        <h2 id="order-summary" className="sr-only">
          Summary
        </h2>
        <div className="flex flex-col gap-3 rounded-lg border p-4 text-sm">
          <Item label="Customer">
            <Link
              to="/customers/$customerId"
              params={{ customerId: order.customer.id }}
              className="font-medium underline underline-offset-4"
            >
              {order.customer.displayName}
            </Link>
            {!order.customer.isActive && <Badge variant="outline">Inactive</Badge>}
          </Item>
          <Item label="Delivery date">
            {formatBusinessDateLong(order.deliveryDate)} {order.deliveryDate.slice(0, 4)}
          </Item>
          <Item label="Roast date">
            {formatBusinessDateLong(order.roastDate)} {order.roastDate.slice(0, 4)}
          </Item>
          <Item label="Cut-off">
            {formatBusinessDateLong(order.cutoff.date)}, {formatClockTime(order.cutoff.time)}
          </Item>
          <Item label="Notes">
            <span className="whitespace-pre-wrap">{order.notes ?? '—'}</span>
          </Item>
        </div>
        <div className="flex flex-col gap-2 rounded-lg border p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            Deliver to {order.branch.name}
            {!order.branch.isActive && <Badge variant="outline">Inactive</Badge>}
          </p>
          <address className="not-italic">
            {order.branch.addressLine1}
            <br />
            {order.branch.addressLine2 && (
              <>
                {order.branch.addressLine2}
                <br />
              </>
            )}
            {order.branch.suburb} {order.branch.state} {order.branch.postcode}
          </address>
          <Item label="Contact">
            {[order.branch.contactName, order.branch.contactPhone].filter(Boolean).join(' · ') ||
              'None recorded'}
          </Item>
          <Item label="Delivery notes (from the branch)">
            <span className="whitespace-pre-wrap">
              {order.branch.deliveryNotes ?? 'None recorded'}
            </span>
          </Item>
        </div>
      </section>

      <section aria-labelledby="order-lines" className="flex flex-col gap-3">
        <h2 id="order-lines" className="font-medium">
          Lines
        </h2>
        {order.lines.length === 0 ? (
          <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            No lines yet. Edit the order to add products.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Tax code</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit ex-GST</TableHead>
                  <TableHead className="text-right">Line ex-GST</TableHead>
                  <TableHead className="text-right">GST</TableHead>
                  <TableHead className="text-right">Line inc-GST</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-wrap items-center gap-2">
                        {line.description}
                        {!line.productOrderable && (
                          <Badge variant="outline">Inactive product</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{line.sku}</p>
                    </TableCell>
                    <TableCell>{TAX_LABEL[line.taxCode]}</TableCell>
                    <TableCell className="text-right">{line.quantity}</TableCell>
                    <TableCell className="text-right">{formatAud(line.unitPriceExGst)}</TableCell>
                    <TableCell className="text-right">{formatAud(line.lineTotalExGst)}</TableCell>
                    <TableCell className="text-right">{formatAud(line.gstAmount)}</TableCell>
                    <TableCell className="text-right">{formatAud(line.lineTotalIncGst)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <dl className="ml-auto grid w-full max-w-sm grid-cols-2 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Subtotal ex-GST</dt>
          <dd className="text-right">{formatAud(order.subtotalExGst)}</dd>
          <dt className="text-muted-foreground">GST</dt>
          <dd className="text-right">{formatAud(order.gstAmount)}</dd>
          <dt className="font-medium">Total inc-GST</dt>
          <dd className="text-right font-medium">{formatAud(order.totalIncGst)}</dd>
          <dt className="text-muted-foreground">Total weight</dt>
          <dd className="text-right">{formatKg(order.totalWeightGrams)}</dd>
        </dl>
      </section>

      <section aria-labelledby="order-history" className="flex flex-col gap-3">
        <h2 id="order-history" className="font-medium">
          History
        </h2>
        <p className="text-xs text-muted-foreground">
          Created by {order.createdBy.name} · last changed by {order.updatedBy.name},{' '}
          {formatTimestamp(order.updatedAt)}
        </p>
        {order.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No history recorded.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border text-sm">
            {order.events.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-baseline justify-between gap-2 p-3"
              >
                <span>
                  <span className="font-medium">{EVENT_LABELS[event.type]}</span> by{' '}
                  {event.user.name}
                  {event.reason ? ` — ${event.reason}` : ''}
                </span>
                <span className="text-muted-foreground">{formatTimestamp(event.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="flex flex-wrap items-center gap-2">{children}</p>
    </div>
  );
}
