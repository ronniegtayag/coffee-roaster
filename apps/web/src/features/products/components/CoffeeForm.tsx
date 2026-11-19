import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toApiError } from '@/shared/api/errors';
import { applyApiError } from '@/shared/lib/form-errors';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Field } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { NativeSelect } from '@/shared/ui/native-select';
import { Textarea } from '@/shared/ui/textarea';
import { useCreateCoffee, useUpdateCoffee } from '../queries';
import { coffeeFormSchema, type CoffeeFormValues } from '../schemas';
import { COFFEE_TYPE_LABELS, type Coffee } from '../types';

const FIELDS = Object.keys(coffeeFormSchema.shape);
const orNull = (value: string) => value.trim() || null;

export function CoffeeForm({ coffee }: { coffee?: Coffee }) {
  const navigate = useNavigate();
  const create = useCreateCoffee();
  const update = useUpdateCoffee(coffee?.id ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CoffeeFormValues>({
    resolver: zodResolver(coffeeFormSchema),
    defaultValues: {
      name: coffee?.name ?? '',
      type: coffee?.type ?? 'BLEND',
      origin: coffee?.origin ?? '',
      description: coffee?.description ?? '',
    },
  });
  const pending = isSubmitting || create.isPending || update.isPending;

  async function onSubmit(values: CoffeeFormValues) {
    setFormError(null);
    const payload = {
      name: values.name,
      type: values.type,
      origin: orNull(values.origin),
      description: orNull(values.description),
    };
    try {
      const saved = coffee ? await update.mutateAsync(payload) : await create.mutateAsync(payload);
      await navigate({ to: '/coffees/$coffeeId', params: { coffeeId: saved.id } });
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
      <div className="grid gap-5 md:grid-cols-2">
        <Field id="name" label="Name" required error={errors.name?.message}>
          <Input className="h-10" autoComplete="off" {...register('name')} />
        </Field>
        <Field id="type" label="Type" required error={errors.type?.message}>
          <NativeSelect {...register('type')}>
            {(['BLEND', 'SINGLE_ORIGIN'] as const).map((type) => (
              <option key={type} value={type}>
                {COFFEE_TYPE_LABELS[type]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="origin" label="Origin" error={errors.origin?.message}>
          <Input className="h-10" autoComplete="off" {...register('origin')} />
        </Field>
      </div>
      <Field id="description" label="Description" error={errors.description?.message}>
        <Textarea rows={4} {...register('description')} />
      </Field>
      <div className="flex gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? 'Saving…' : coffee ? 'Save changes' : 'Add coffee'}
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link to="/coffees">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
