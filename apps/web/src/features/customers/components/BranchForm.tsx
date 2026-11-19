import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useCan } from '@/features/auth';
import { toApiError } from '@/shared/api/errors';
import { applyApiError } from '@/shared/lib/form-errors';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Field } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { NativeSelect } from '@/shared/ui/native-select';
import { Textarea } from '@/shared/ui/textarea';
import { useCreateBranch, useUpdateBranch } from '../queries';
import { branchFormSchema, type BranchFormValues } from '../schemas';
import { AUSTRALIAN_STATES, type Branch, type Customer } from '../types';

const FIELDS = Object.keys(branchFormSchema.shape);

const orNull = (value: string) => value.trim() || null;

function toFormValues(customer: Customer, branch?: Branch): Partial<BranchFormValues> {
  return {
    // The first branch is usually the cafe itself, so offer its name.
    name: branch?.name ?? (customer.branches.length === 0 ? customer.displayName : ''),
    addressLine1: branch?.addressLine1 ?? '',
    addressLine2: branch?.addressLine2 ?? '',
    suburb: branch?.suburb ?? '',
    state: branch?.state,
    postcode: branch?.postcode ?? '',
    contactName: branch?.contactName ?? '',
    contactPhone: branch?.contactPhone ?? '',
    deliveryNotes: branch?.deliveryNotes ?? '',
  };
}

interface Props {
  customer: Customer;
  /** Present when editing. */
  branch?: Branch;
}

export function BranchForm({ customer, branch }: Props) {
  const navigate = useNavigate();
  const canWrite = useCan('branches:write');
  const create = useCreateBranch(customer.id);
  const update = useUpdateBranch(customer.id, branch?.id ?? '');
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<BranchFormValues>({
    resolver: zodResolver(branchFormSchema),
    defaultValues: toFormValues(customer, branch),
  });

  const pending = isSubmitting || create.isPending || update.isPending;
  // Without branches:write only contact name, contact phone and delivery notes can change.
  const addressLocked = Boolean(branch) && !canWrite;

  async function onSubmit(values: BranchFormValues) {
    setFormError(null);
    const contact = {
      contactName: orNull(values.contactName),
      contactPhone: orNull(values.contactPhone),
      deliveryNotes: orNull(values.deliveryNotes),
    };
    try {
      if (branch) {
        await update.mutateAsync(
          addressLocked
            ? contact
            : {
                ...contact,
                name: values.name,
                addressLine1: values.addressLine1,
                addressLine2: orNull(values.addressLine2),
                suburb: values.suburb,
                state: values.state,
                postcode: values.postcode,
              },
        );
      } else {
        await create.mutateAsync({
          ...contact,
          name: values.name,
          addressLine1: values.addressLine1,
          addressLine2: orNull(values.addressLine2),
          suburb: values.suburb,
          state: values.state,
          postcode: values.postcode,
        });
      }
      await navigate({ to: '/customers/$customerId', params: { customerId: customer.id } });
    } catch (error) {
      setFormError(applyApiError(toApiError(error), setError, FIELDS));
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
      {addressLocked && (
        <Alert>
          <AlertDescription>
            You can update the contact and delivery notes. Ask a manager to change the name or
            address.
          </AlertDescription>
        </Alert>
      )}

      <fieldset disabled={addressLocked} className="grid gap-5 md:grid-cols-2">
        <legend className="sr-only">Branch address</legend>
        <Field
          id="name"
          label="Branch name"
          required
          error={errors.name?.message}
          className="md:col-span-2"
        >
          <Input className="h-10" autoComplete="off" {...register('name')} />
        </Field>
        <Field
          id="addressLine1"
          label="Address line 1"
          required
          error={errors.addressLine1?.message}
        >
          <Input className="h-10" autoComplete="off" {...register('addressLine1')} />
        </Field>
        <Field id="addressLine2" label="Address line 2" error={errors.addressLine2?.message}>
          <Input className="h-10" autoComplete="off" {...register('addressLine2')} />
        </Field>
        <Field id="suburb" label="Suburb" required error={errors.suburb?.message}>
          <Input className="h-10" autoComplete="off" {...register('suburb')} />
        </Field>
        <div className="grid grid-cols-2 gap-5">
          <Field id="state" label="State" required error={errors.state?.message}>
            <NativeSelect {...register('state')}>
              <option value="">Select…</option>
              {AUSTRALIAN_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="postcode" label="Postcode" required error={errors.postcode?.message}>
            <Input
              className="h-10"
              inputMode="numeric"
              maxLength={4}
              autoComplete="off"
              {...register('postcode')}
            />
          </Field>
        </div>
      </fieldset>

      <div className="grid gap-5 md:grid-cols-2">
        <Field id="contactName" label="Contact name" error={errors.contactName?.message}>
          <Input className="h-10" autoComplete="off" {...register('contactName')} />
        </Field>
        <Field id="contactPhone" label="Contact phone" error={errors.contactPhone?.message}>
          <Input className="h-10" type="tel" autoComplete="off" {...register('contactPhone')} />
        </Field>
      </div>
      <Field
        id="deliveryNotes"
        label="Delivery notes"
        hint="Access instructions, delivery window, key or lockbox, where to leave the order."
        error={errors.deliveryNotes?.message}
      >
        <Textarea rows={4} {...register('deliveryNotes')} />
      </Field>

      <div className="flex gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? 'Saving…' : branch ? 'Save changes' : 'Add branch'}
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link to="/customers/$customerId" params={{ customerId: customer.id }}>
            Cancel
          </Link>
        </Button>
      </div>
    </form>
  );
}
