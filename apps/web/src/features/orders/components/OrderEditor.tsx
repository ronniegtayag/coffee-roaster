import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { type ApiError, toApiError } from '@/shared/api/errors';
import {
  daysBetweenBusinessDates,
  formatBusinessDateLong,
  formatClockTime,
  isBusinessDateString,
  todayInSydney,
} from '@/shared/lib/dates';
import { formatAud } from '@/shared/lib/money';
import { formatKg } from '@/shared/lib/weight';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Field } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { NativeSelect } from '@/shared/ui/native-select';
import { Textarea } from '@/shared/ui/textarea';
import { orderableProductsQuery, TAX_CODE_LABELS, type Product } from '@/features/products';
import { describeOrderError } from '../errors';
import { estimateLine, estimateTotals } from '../lib/estimate';
import { scheduleQuery, useCreateOrder, useUpdateOrder } from '../queries';
import type {
  AllowedActions,
  Order,
  OrderLineInput,
  ScheduleReason,
  ScheduleSuggestion,
  TaxCode,
} from '../types';

interface EditorLine {
  productId: string;
  description: string;
  sku: string;
  /** What the user typed. */
  quantity: string;
  unitPriceExGst: string;
  taxCode: TaxCode;
  /** undefined when unknown (a line whose product is no longer orderable). */
  bagSizeGrams: number | null | undefined;
  /** Not on the saved order, so it must carry the price the form showed. */
  isNew: boolean;
  originalQuantity: number | null;
  problem?: string;
}

interface PriceChange {
  description: string;
  expected: { unitPriceExGst: string; taxCode: TaxCode };
  current: { unitPriceExGst: string; taxCode: TaxCode };
}

const REASON_TEXT: Record<ScheduleReason, string> = {
  CUTOFF_PASSED: 'the cut-off for that roast date has passed',
  NOT_A_ROAST_DAY: 'it is not a roast day',
  NOT_A_DELIVERY_DAY: 'it is not a delivery day',
  DELIVERY_TOO_SOON: 'there is not enough time between roasting and delivery',
};

const FULL_ACCESS: AllowedActions = {
  editLines: 'full',
  editRoastDate: true,
  editDeliveryDate: true,
  editNotes: true,
  confirm: false,
  pack: false,
  dispatch: false,
  deliver: false,
  cancel: false,
  revert: false,
  delete: false,
  copy: false,
};

type Props =
  | { branchId: string; schedule: ScheduleSuggestion; order?: undefined; onReload?: undefined }
  | {
      order: Order;
      branchId?: undefined;
      schedule?: undefined;
      /** Fetches the order again and restarts the form from it. */
      onReload: () => Promise<void>;
    };

function isWholeQuantity(value: string): boolean {
  return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 999;
}

function linesFromOrder(order: Order, products: Product[]): EditorLine[] {
  return order.lines.map((line) => {
    const product = products.find((p) => p.id === line.productId);
    return {
      productId: line.productId,
      description: line.description,
      sku: line.sku,
      quantity: String(line.quantity),
      unitPriceExGst: line.unitPriceExGst,
      taxCode: line.taxCode,
      bagSizeGrams: product ? product.bagSizeGrams : undefined,
      isNew: false,
      originalQuantity: line.quantity,
    };
  });
}

/** Create a draft order, or edit an existing one within what `allowedActions` permits. */
export function OrderEditor(props: Props) {
  const { order } = props;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useCreateOrder();
  const update = useUpdateOrder(order?.id ?? '');
  const products = useQuery(orderableProductsQuery());
  const can = order ? order.allowedActions : FULL_ACCESS;

  // Generated once per form and reused on retries, so a double submit can't create two orders.
  const [requestId] = useState(() => crypto.randomUUID());
  const [deliveryDate, setDeliveryDate] = useState(
    order?.deliveryDate ?? props.schedule?.deliveryDate ?? '',
  );
  const [roastDate, setRoastDate] = useState(order?.roastDate ?? props.schedule?.roastDate ?? '');
  const [notes, setNotes] = useState(order?.notes ?? '');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<EditorLine[]>(() =>
    order ? linesFromOrder(order, products.data ?? []) : [],
  );
  const [schedule, setSchedule] = useState<ScheduleSuggestion | undefined>(props.schedule);
  const [pickProductId, setPickProductId] = useState('');
  const [pickQuantity, setPickQuantity] = useState('1');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<ApiError | null>(null);
  const [priceChanges, setPriceChanges] = useState<PriceChange[]>([]);
  const [suggestion, setSuggestion] = useState<{
    roastDate: string;
    deliveryDate: string;
    reasons: ScheduleReason[];
  } | null>(null);
  const latestDeliveryDate = useRef(deliveryDate);
  const [submitting, setSubmitting] = useState(false);

  const today = todayInSydney();
  const cutoff = schedule?.cutoff ?? order?.cutoff;
  const reduceOnly = can.editLines === 'reduceOnly';
  const canEditLines = can.editLines !== 'none';
  const orderable = products.data ?? [];
  const available = orderable.filter((p) => !lines.some((l) => l.productId === p.id));
  const tooFarAhead =
    isBusinessDateString(deliveryDate) && daysBetweenBusinessDates(today, deliveryDate) > 90;

  const validLines = lines.filter((l) => isWholeQuantity(l.quantity));
  const estimate = estimateTotals(
    validLines.map((l) => ({
      quantity: Number(l.quantity),
      unitPriceExGst: l.unitPriceExGst,
      taxCode: l.taxCode,
      bagSizeGrams: l.bagSizeGrams ?? null,
    })),
  );
  const weightKnown = lines.every((l) => l.bagSizeGrams !== undefined);

  const originalIds = new Set(order?.lines.map((l) => l.productId));
  const linesChanged =
    Boolean(order) &&
    (lines.length !== originalIds.size ||
      lines.some((l) => l.isNew || String(l.originalQuantity) !== l.quantity));

  function patchLine(productId: string, patch: Partial<EditorLine>) {
    setLines((current) => current.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));
  }

  async function onDeliveryDateChange(value: string) {
    latestDeliveryDate.current = value;
    setDeliveryDate(value);
    setSuggestion(null);
    setErrors((e) => ({ ...e, deliveryDate: '' }));
    // Re-suggest the roast date for the new delivery date; the API does not do this on save.
    if (!isBusinessDateString(value) || value < today || !can.editRoastDate) return;
    try {
      const next = await queryClient.fetchQuery(scheduleQuery(value));
      // Ignore an answer for a date the user has since changed.
      if (latestDeliveryDate.current !== value) return;
      setSchedule(next);
      setRoastDate(next.roastDate);
    } catch (error) {
      if (latestDeliveryDate.current !== value) return;
      setErrors((e) => ({ ...e, deliveryDate: describeOrderError(toApiError(error)) }));
    }
  }

  function addLine() {
    const product = orderable.find((p) => p.id === pickProductId);
    if (!product) return;
    if (!isWholeQuantity(pickQuantity)) {
      setErrors((e) => ({ ...e, newLine: 'Quantity must be a whole number from 1 to 999' }));
      return;
    }
    setErrors((e) => ({ ...e, newLine: '' }));
    setLines((current) => [
      ...current,
      {
        productId: product.id,
        description: product.displayName,
        sku: product.sku,
        quantity: pickQuantity,
        unitPriceExGst: product.listPriceExGst,
        taxCode: product.taxCode,
        bagSizeGrams: product.bagSizeGrams,
        isNew: true,
        originalQuantity: null,
      },
    ]);
    setPickProductId('');
    setPickQuantity('1');
  }

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    const deliveryChanged = !order || deliveryDate !== order.deliveryDate;
    const roastChanged = !order || roastDate !== order.roastDate;
    if (!isBusinessDateString(deliveryDate)) next.deliveryDate = 'Enter a delivery date';
    else if (deliveryChanged && deliveryDate < today)
      next.deliveryDate = "Delivery date can't be in the past";
    if (!isBusinessDateString(roastDate)) next.roastDate = 'Enter a roast date';
    else if (roastChanged && roastDate < today) next.roastDate = "Roast date can't be in the past";
    else if (isBusinessDateString(deliveryDate) && roastDate > deliveryDate) {
      next.roastDate = 'Roast date must be on or before the delivery date';
    }
    for (const line of lines) {
      if (!isWholeQuantity(line.quantity)) {
        next[`line:${line.productId}`] = 'Quantity must be a whole number from 1 to 999';
      } else if (
        reduceOnly &&
        line.originalQuantity !== null &&
        Number(line.quantity) > line.originalQuantity
      ) {
        next[`line:${line.productId}`] = 'On a packed order a quantity can only go down';
      }
    }
    if (order && reduceOnly && linesChanged && !reason.trim()) {
      next.reason = 'Add a short note, for example "short on Colombian"';
    }
    return next;
  }

  function lineInputs(): OrderLineInput[] {
    return lines.map((l) => ({
      productId: l.productId,
      quantity: Number(l.quantity),
      ...(l.isNew ? { expectedUnitPriceExGst: l.unitPriceExGst, expectedTaxCode: l.taxCode } : {}),
    }));
  }

  function showApiError(error: ApiError, sentLines: OrderLineInput[]) {
    const next: Record<string, string> = {};
    for (const fieldError of error.fieldErrors) {
      const match = /^lines\.(\d+)\./.exec(fieldError.field);
      const line = match ? sentLines[Number(match[1])] : undefined;
      next[line ? `line:${line.productId}` : fieldError.field] = fieldError.message;
    }
    setErrors(next);

    const metaLines = Array.isArray(error.meta.lines)
      ? (error.meta.lines as Record<string, unknown>[])
      : [];
    if (error.code === 'PRICE_CHANGED') {
      const changes = metaLines as unknown as (PriceChange & { productId: string })[];
      setPriceChanges(changes);
      // Show the new price on those lines so the next save carries what the user has now seen.
      setLines((current) =>
        current.map((l) => {
          const change = changes.find((c) => c.productId === l.productId);
          return change
            ? {
                ...l,
                unitPriceExGst: change.current.unitPriceExGst,
                taxCode: change.current.taxCode,
              }
            : l;
        }),
      );
      void queryClient.invalidateQueries({ queryKey: orderableProductsQuery().queryKey });
      setFormError(null);
      return;
    }
    if (error.code === 'PRODUCT_UNAVAILABLE') {
      const ids = metaLines.map((l) => l.productId);
      setLines((current) =>
        current.map((l) =>
          ids.includes(l.productId) ? { ...l, problem: 'No longer available — remove it' } : l,
        ),
      );
      void queryClient.invalidateQueries({ queryKey: orderableProductsQuery().queryKey });
    }
    if (error.code === 'SCHEDULE_OVERRIDE_REQUIRED') {
      const meta = error.meta.suggestion as { roastDate: string; deliveryDate: string } | undefined;
      setSuggestion(
        meta
          ? { ...meta, reasons: (error.meta.reasons as ScheduleReason[] | undefined) ?? [] }
          : null,
      );
    }
    if (error.fieldErrors.length === 0 || error.code === 'PRODUCT_UNAVAILABLE') setFormError(error);
    else setFormError(null);
  }

  async function onSubmit() {
    if (submitting) return;
    setFormError(null);
    setPriceChanges([]);
    setSuggestion(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    const sentLines = lineInputs();
    try {
      if (order) {
        const body = {
          version: order.version,
          ...(deliveryDate !== order.deliveryDate ? { deliveryDate } : {}),
          ...(roastDate !== order.roastDate ? { roastDate } : {}),
          ...(notes.trim() !== (order.notes ?? '') ? { notes: notes.trim() || null } : {}),
          ...(linesChanged ? { lines: sentLines } : {}),
          ...(linesChanged && reduceOnly ? { reason: reason.trim() } : {}),
        };
        if (Object.keys(body).length > 1) await update.mutateAsync(body);
        await navigate({ to: '/orders/$orderId', params: { orderId: order.id } });
      } else {
        const created = await create.mutateAsync({
          requestId,
          branchId: props.branchId,
          deliveryDate,
          roastDate,
          notes: notes.trim() || null,
          lines: sentLines,
        });
        await navigate({ to: '/orders/$orderId', params: { orderId: created.id } });
      }
    } catch (error) {
      showApiError(toApiError(error), sentLines);
      setSubmitting(false);
    }
  }

  const customerId = formError?.meta.customerId;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit();
      }}
      className="flex max-w-4xl flex-col gap-6"
    >
      {formError && (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{describeOrderError(formError)}</span>
            {formError.code === 'VERSION_CONFLICT' && props.onReload && (
              <Button
                type="button"
                size="lg"
                variant="outline"
                onClick={() => void props.onReload?.()}
              >
                Reload order
              </Button>
            )}
            {typeof customerId === 'string' && (
              <Link
                to="/customers/$customerId"
                params={{ customerId }}
                className="font-medium underline"
              >
                View customer
              </Link>
            )}
          </AlertDescription>
        </Alert>
      )}
      {priceChanges.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            <p className="font-medium">
              A price changed while you were editing. Nothing was saved.
            </p>
            <ul className="mt-1 list-disc pl-5">
              {priceChanges.map((change) => (
                <li key={change.description}>
                  {change.description}: {formatAud(change.expected.unitPriceExGst)} →{' '}
                  {formatAud(change.current.unitPriceExGst)}
                  {change.expected.taxCode !== change.current.taxCode &&
                    ` (tax code ${TAX_CODE_LABELS[change.expected.taxCode]} → ${TAX_CODE_LABELS[change.current.taxCode]})`}
                </li>
              ))}
            </ul>
            <p className="mt-1">The lines now show the new prices. Check them, then save again.</p>
          </AlertDescription>
        </Alert>
      )}
      {suggestion && (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>
              {suggestion.reasons.length === 1 && suggestion.reasons[0] === 'CUTOFF_PASSED'
                ? `Cut-off for ${formatBusinessDateLong(roastDate)} has passed — ask a manager or pick the next date`
                : `These dates are off schedule (${suggestion.reasons.map((r) => REASON_TEXT[r]).join('; ')}) — ask a manager or pick the next date`}
              : roast {formatBusinessDateLong(suggestion.roastDate)}, deliver{' '}
              {formatBusinessDateLong(suggestion.deliveryDate)}.
            </span>
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={() => {
                setRoastDate(suggestion.roastDate);
                latestDeliveryDate.current = suggestion.deliveryDate;
                setDeliveryDate(suggestion.deliveryDate);
                setSuggestion(null);
                setErrors({});
              }}
            >
              Use suggested dates
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <fieldset
        className="grid gap-5 md:grid-cols-2"
        disabled={!can.editDeliveryDate && !can.editRoastDate}
      >
        <legend className="mb-2 font-medium">Dates</legend>
        <Field id="deliveryDate" label="Delivery date" required error={errors.deliveryDate}>
          <Input
            className="h-10"
            type="date"
            value={deliveryDate}
            disabled={!can.editDeliveryDate}
            onChange={(e) => void onDeliveryDateChange(e.target.value)}
          />
        </Field>
        <Field id="roastDate" label="Roast date" required error={errors.roastDate}>
          <Input
            className="h-10"
            type="date"
            value={roastDate}
            disabled={!can.editRoastDate}
            onChange={(e) => {
              setRoastDate(e.target.value);
              setSuggestion(null);
            }}
          />
        </Field>
        <div className="flex flex-col gap-1 text-sm md:col-span-2">
          {cutoff && (
            <p className="text-muted-foreground">
              Cut-off: {formatBusinessDateLong(cutoff.date)}, {formatClockTime(cutoff.time)}
            </p>
          )}
          {schedule && !schedule.onSchedule && (
            <p role="status" className="text-amber-700 dark:text-amber-400">
              These dates are off schedule: {schedule.reasons.map((r) => REASON_TEXT[r]).join('; ')}
              . {can.editRoastDate ? 'Only a manager can save an off-schedule order.' : ''}
            </p>
          )}
          {tooFarAhead && (
            <p role="status" className="text-amber-700 dark:text-amber-400">
              This delivery date is more than 90 days away. Check it isn't a typo.
            </p>
          )}
        </div>
      </fieldset>

      <section aria-labelledby="editor-lines" className="flex flex-col gap-3">
        <h2 id="editor-lines" className="font-medium">
          Lines
        </h2>
        {lines.length === 0 ? (
          <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
            No lines yet. A draft can be saved without lines, but it needs at least one to be
            confirmed.
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {lines.map((line) => {
              const ok = isWholeQuantity(line.quantity);
              const lineEstimate = ok
                ? estimateLine({
                    quantity: Number(line.quantity),
                    unitPriceExGst: line.unitPriceExGst,
                    taxCode: line.taxCode,
                  })
                : null;
              const error = errors[`line:${line.productId}`];
              return (
                <li
                  key={line.productId}
                  className={`flex flex-wrap items-start gap-3 p-3 ${line.problem ? 'bg-destructive/5' : ''}`}
                >
                  <div className="min-w-48 flex-1">
                    <p className="font-medium">{line.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {line.sku} · {formatAud(line.unitPriceExGst)} ex-GST ·{' '}
                      {TAX_CODE_LABELS[line.taxCode]}
                    </p>
                    {line.problem && (
                      <p role="alert" className="text-sm text-destructive">
                        {line.problem}
                      </p>
                    )}
                  </div>
                  <Field
                    id={`qty-${line.productId}`}
                    label={`Quantity for ${line.description}`}
                    error={error}
                    className="w-28 [&_label]:sr-only"
                  >
                    <Input
                      className="h-10"
                      type="number"
                      min={1}
                      max={reduceOnly && line.originalQuantity ? line.originalQuantity : 999}
                      step={1}
                      value={line.quantity}
                      disabled={!canEditLines}
                      onChange={(e) =>
                        patchLine(line.productId, { quantity: e.target.value, problem: undefined })
                      }
                    />
                  </Field>
                  <p className="w-28 pt-2 text-right text-sm">
                    {lineEstimate ? formatAud(lineEstimate.lineTotalExGst) : '—'}
                  </p>
                  {canEditLines && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-lg"
                      aria-label={`Remove ${line.description}`}
                      onClick={() =>
                        setLines((current) => current.filter((l) => l.productId !== line.productId))
                      }
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {can.editLines === 'full' && (
          <div className="flex flex-wrap items-end gap-3">
            <Field
              id="add-product"
              label="Product"
              className="min-w-64 flex-1"
              error={errors.newLine}
            >
              <NativeSelect
                value={pickProductId}
                disabled={products.isPending}
                onChange={(e) => setPickProductId(e.target.value)}
              >
                <option value="">
                  {products.isPending ? 'Loading products…' : 'Select a product…'}
                </option>
                {available.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.displayName} — {formatAud(product.listPriceExGst)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="add-quantity" label="Quantity" className="w-28">
              <Input
                className="h-10"
                type="number"
                min={1}
                max={999}
                step={1}
                value={pickQuantity}
                onChange={(e) => setPickQuantity(e.target.value)}
              />
            </Field>
            <Button
              type="button"
              size="lg"
              variant="secondary"
              className="h-10"
              disabled={!pickProductId}
              onClick={addLine}
            >
              Add line
            </Button>
          </div>
        )}
        {products.isError && (
          <p role="alert" className="text-sm text-destructive">
            Couldn't load products.{' '}
            <button type="button" className="underline" onClick={() => void products.refetch()}>
              Retry
            </button>
          </p>
        )}
        {errors.lines && (
          <p role="alert" className="text-sm text-destructive">
            {errors.lines}
          </p>
        )}

        <dl
          aria-label="Estimated totals"
          className="ml-auto grid w-full max-w-sm grid-cols-2 gap-y-1 rounded-lg border bg-muted/30 p-3 text-sm"
        >
          <dt className="col-span-2 mb-1 flex items-center gap-2 font-medium">
            Estimated totals <Badge variant="outline">Estimate</Badge>
          </dt>
          <dt className="text-muted-foreground">Subtotal ex-GST</dt>
          <dd className="text-right">{formatAud(estimate.subtotalExGst)}</dd>
          <dt className="text-muted-foreground">GST</dt>
          <dd className="text-right">{formatAud(estimate.gstAmount)}</dd>
          <dt className="font-medium">Total inc-GST</dt>
          <dd className="text-right font-medium">{formatAud(estimate.totalIncGst)}</dd>
          {weightKnown && (
            <>
              <dt className="text-muted-foreground">Weight</dt>
              <dd className="text-right">{formatKg(estimate.totalWeightGrams)}</dd>
            </>
          )}
          <dd className="col-span-2 mt-1 text-xs text-muted-foreground">
            The saved order shows the exact figures worked out by the server.
          </dd>
        </dl>
      </section>

      {order && reduceOnly && linesChanged && (
        <Field
          id="reason"
          label="Reason for the change (short supply)"
          required
          error={errors.reason}
        >
          <Textarea
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      )}

      <Field
        id="notes"
        label="Order notes"
        error={errors.notes}
        hint={
          order
            ? `The branch's standing delivery notes are shown on the order and are not edited here.`
            : undefined
        }
      >
        <Textarea
          rows={3}
          maxLength={2000}
          value={notes}
          disabled={!can.editNotes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>

      <div className="flex gap-3">
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? 'Saving…' : order ? 'Save changes' : 'Save draft'}
        </Button>
        <Button asChild variant="outline" size="lg">
          {order ? (
            <Link to="/orders/$orderId" params={{ orderId: order.id }}>
              Cancel
            </Link>
          ) : (
            <Link to="/orders">Cancel</Link>
          )}
        </Button>
      </div>
    </form>
  );
}
