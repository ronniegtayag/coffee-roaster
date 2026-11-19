import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useCan } from '@/features/auth';
import { toApiError } from '@/shared/api/errors';
import { applyApiError } from '@/shared/lib/form-errors';
import { formatAbn, normaliseAbn } from '@/shared/lib/abn';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Field } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { useCreateCustomer, useUpdateCustomer } from '../queries';
import { customerFormSchema, type CustomerFormValues } from '../schemas';
import { PAYMENT_TERMS_DEFAULT_DAYS, PAYMENT_TERMS_MAX_DAYS, type Customer } from '../types';

const FIELDS = Object.keys(customerFormSchema.shape);

function toFormValues(customer?: Customer): CustomerFormValues {
  return {
    legalName: customer?.legalName ?? '',
    tradingName: customer?.tradingName ?? '',
    abn: customer?.abn ? formatAbn(customer.abn) : '',
    billingEmail: customer?.billingEmail ?? '',
    phone: customer?.phone ?? '',
    paymentTermsDays: String(customer?.paymentTermsDays ?? PAYMENT_TERMS_DEFAULT_DAYS),
    notes: customer?.notes ?? '',
  };
}

const orNull = (value: string) => value.trim() || null;

/** Create (no `customer`) or edit a customer. */
export function CustomerForm({ customer }: { customer?: Customer }) {
  const navigate = useNavigate();
  const canEditTerms = useCan('customers:edit-terms');
  const create = useCreateCustomer();
  const update = useUpdateCustomer(customer?.id ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const [abnOwner, setAbnOwner] = useState<{ id: string; name: string } | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: toFormValues(customer),
  });

  const pending = isSubmitting || create.isPending || update.isPending;

  async function onSubmit(values: CustomerFormValues) {
    setFormError(null);
    setAbnOwner(null);
    const terms = values.paymentTermsDays.trim();
    const payload = {
      legalName: values.legalName,
      tradingName: orNull(values.tradingName),
      abn: normaliseAbn(values.abn) ?? orNull(values.abn),
      billingEmail: values.billingEmail,
      phone: orNull(values.phone),
      notes: orNull(values.notes),
      // Blank means "use the default"; only people allowed to set terms may send them.
      ...(canEditTerms && terms !== '' ? { paymentTermsDays: Number(terms) } : {}),
    };

    try {
      if (customer) {
        await update.mutateAsync(payload);
        await navigate({ to: '/customers/$customerId', params: { customerId: customer.id } });
      } else {
        const created = await create.mutateAsync(payload);
        await navigate({ to: '/customers/$customerId', params: { customerId: created.id } });
      }
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.code === 'ABN_TAKEN') {
        const { customerId, displayName } = apiError.meta;
        if (typeof customerId === 'string') {
          setAbnOwner({
            id: customerId,
            name: typeof displayName === 'string' ? displayName : 'another customer',
          });
        }
        setError('abn', {
          type: 'server',
          message: apiError.fieldErrors[0]?.message ?? apiError.message,
        });
        return;
      }
      setFormError(applyApiError(apiError, setError, FIELDS));
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(onSubmit)(e)}
      noValidate
      className="flex max-w-2xl flex-col gap-5"
    >
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <Field id="legalName" label="Legal name" required error={errors.legalName?.message}>
          <Input className="h-10" autoComplete="off" {...register('legalName')} />
        </Field>
        <Field
          id="tradingName"
          label="Trading name"
          hint="The name staff know the cafe by, if different."
          error={errors.tradingName?.message}
        >
          <Input className="h-10" autoComplete="off" {...register('tradingName')} />
        </Field>
        <Field
          id="abn"
          label="ABN"
          hint="11 digits. Optional until a tax invoice needs it."
          error={
            errors.abn && (
              <>
                {errors.abn.message}
                {abnOwner && (
                  <>
                    {' '}
                    <Link
                      to="/customers/$customerId"
                      params={{ customerId: abnOwner.id }}
                      className="font-medium underline"
                    >
                      View {abnOwner.name}
                    </Link>
                  </>
                )}
              </>
            )
          }
        >
          <Input
            className="h-10"
            inputMode="numeric"
            autoComplete="off"
            {...register('abn', { onChange: () => (clearErrors('abn'), setAbnOwner(null)) })}
          />
        </Field>
        <Field
          id="billingEmail"
          label="Billing email"
          required
          error={errors.billingEmail?.message}
        >
          <Input className="h-10" type="email" autoComplete="off" {...register('billingEmail')} />
        </Field>
        <Field id="phone" label="Phone" error={errors.phone?.message}>
          <Input className="h-10" type="tel" autoComplete="off" {...register('phone')} />
        </Field>
        {canEditTerms && (
          <Field
            id="paymentTermsDays"
            label="Payment terms (days)"
            hint={
              customer
                ? `Whole days, 0 to ${PAYMENT_TERMS_MAX_DAYS}. 0 means due on issue. Changes apply to future invoices only.`
                : `The default of ${PAYMENT_TERMS_DEFAULT_DAYS} days is pre-filled (to be confirmed with the roaster). 0 means due on issue; up to ${PAYMENT_TERMS_MAX_DAYS}.`
            }
            error={errors.paymentTermsDays?.message}
          >
            <Input
              className="h-10"
              type="number"
              min={0}
              max={PAYMENT_TERMS_MAX_DAYS}
              step={1}
              autoComplete="off"
              {...register('paymentTermsDays')}
            />
          </Field>
        )}
      </div>

      <Field id="notes" label="Notes" error={errors.notes?.message}>
        <Textarea rows={4} {...register('notes')} />
      </Field>

      <div className="flex gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? 'Saving…' : customer ? 'Save changes' : 'Create customer'}
        </Button>
        <Button asChild variant="outline" size="lg">
          {customer ? (
            <Link to="/customers/$customerId" params={{ customerId: customer.id }}>
              Cancel
            </Link>
          ) : (
            <Link to="/customers">Cancel</Link>
          )}
        </Button>
      </div>
    </form>
  );
}
