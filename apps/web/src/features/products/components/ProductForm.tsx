import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toApiError } from '@/shared/api/errors';
import { applyApiError } from '@/shared/lib/form-errors';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Field } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { NativeSelect } from '@/shared/ui/native-select';
import { coffeeListQuery, grindListQuery, useCreateProduct, useUpdateProduct } from '../queries';
import { productFormSchema, type ProductFormValues } from '../schemas';
import { type Product, type TaxCode, TAX_CODE_LABELS } from '../types';

const FIELDS = Object.keys(productFormSchema.shape);

/** Coffee is GST-free and everything else is GST by default; the accountant confirms (A1). */
const defaultTaxCode = (kind: 'COFFEE' | 'OTHER'): TaxCode =>
  kind === 'COFFEE' ? 'GST_FREE' : 'GST';

function toFormValues(
  product: Product | undefined,
  coffeeId: string | undefined,
): ProductFormValues {
  const kind = product?.kind ?? 'COFFEE';
  return {
    kind,
    sku: product?.sku ?? '',
    coffeeId: product?.coffee?.id ?? coffeeId ?? '',
    bagSizeGrams: product?.bagSizeGrams ? String(product.bagSizeGrams) : '',
    grindId: product?.grind?.id ?? '',
    name: product?.name ?? '',
    listPriceExGst: product?.listPriceExGst ?? '',
    taxCode: product?.taxCode ?? defaultTaxCode(kind),
  };
}

interface Props {
  /** Present when editing. Coffee, bag size and grind never change after creation. */
  product?: Product;
  /** Pre-selects the coffee on create. */
  coffeeId?: string;
}

export function ProductForm({ product, coffeeId }: Props) {
  const navigate = useNavigate();
  const create = useCreateProduct();
  const update = useUpdateProduct(product?.id ?? '');
  const coffees = useQuery(coffeeListQuery({ status: 'active' }));
  const grinds = useQuery(grindListQuery());
  const [formError, setFormError] = useState<string | null>(null);
  const [existing, setExisting] = useState<{ id: string; name: string } | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: toFormValues(product, coffeeId),
  });

  // React Hook Form doesn't count a pick equal to the initial value as dirty, so track picks ourselves.
  const [taxCodePicked, setTaxCodePicked] = useState(false);
  const kind = useWatch({ control, name: 'kind' });
  const pending = isSubmitting || create.isPending || update.isPending;

  async function onSubmit(values: ProductFormValues) {
    setFormError(null);
    setExisting(null);
    try {
      if (product) {
        await update.mutateAsync({
          sku: values.sku,
          ...(product.kind === 'OTHER' ? { name: values.name } : {}),
          listPriceExGst: values.listPriceExGst,
          taxCode: values.taxCode,
        });
        await navigate({ to: '/products' });
      } else {
        const created = await create.mutateAsync(
          values.kind === 'COFFEE'
            ? {
                sku: values.sku,
                coffeeId: values.coffeeId,
                bagSizeGrams: Number(values.bagSizeGrams),
                grindId: values.grindId,
                listPriceExGst: values.listPriceExGst,
                taxCode: values.taxCode,
              }
            : {
                sku: values.sku,
                name: values.name,
                listPriceExGst: values.listPriceExGst,
                taxCode: values.taxCode,
              },
        );
        await navigate({ to: '/products/$productId', params: { productId: created.id } });
      }
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.code === 'PRODUCT_VARIANT_EXISTS') {
        const { productId, displayName } = apiError.meta;
        if (typeof productId === 'string') {
          setExisting({
            id: productId,
            name: typeof displayName === 'string' ? displayName : 'it',
          });
        }
        setFormError(apiError.message);
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
          <AlertDescription>
            {formError}
            {existing && (
              <>
                {' '}
                <Link
                  to="/products/$productId"
                  params={{ productId: existing.id }}
                  className="font-medium underline"
                >
                  View {existing.name}
                </Link>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      {!product && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Kind of product</legend>
          <div className="flex gap-6">
            {(['COFFEE', 'OTHER'] as const).map((value) => (
              <label key={value} className="flex min-h-10 items-center gap-2 text-sm">
                <input
                  type="radio"
                  value={value}
                  className="size-4"
                  {...register('kind', {
                    onChange: () => {
                      // Follow the kind until the user has picked a tax code themselves.
                      if (!taxCodePicked) setValue('taxCode', defaultTaxCode(value));
                    },
                  })}
                />
                {value === 'COFFEE' ? 'Coffee' : 'Other (e.g. cleaning tablets)'}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {product ? (
        <div className="flex flex-col gap-1 rounded-lg border bg-muted/30 p-4 text-sm">
          <p className="text-muted-foreground">Product</p>
          <p className="font-medium">{product.displayName}</p>
          <p className="text-xs text-muted-foreground">
            Coffee, bag size and grind can't be changed. For a different bag size or grind, add a
            new product.
          </p>
        </div>
      ) : kind === 'COFFEE' ? (
        <div className="grid gap-5 md:grid-cols-3">
          <Field id="coffeeId" label="Coffee" required error={errors.coffeeId?.message}>
            <NativeSelect {...register('coffeeId')}>
              <option value="">Select…</option>
              {coffees.data?.map((coffee) => (
                <option key={coffee.id} value={coffee.id}>
                  {coffee.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            id="bagSizeGrams"
            label="Bag size (grams)"
            required
            error={errors.bagSizeGrams?.message}
          >
            <Input className="h-10" type="number" min={1} step={1} {...register('bagSizeGrams')} />
          </Field>
          <Field id="grindId" label="Grind" required error={errors.grindId?.message}>
            <NativeSelect {...register('grindId')}>
              <option value="">Select…</option>
              {grinds.data?.map((grind) => (
                <option key={grind.id} value={grind.id}>
                  {grind.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      ) : null}

      {kind === 'OTHER' && (!product || product.kind === 'OTHER') && (
        <Field id="name" label="Name" required error={errors.name?.message}>
          <Input className="h-10" autoComplete="off" {...register('name')} />
        </Field>
      )}

      <div className="grid gap-5 md:grid-cols-3">
        <Field id="sku" label="SKU" required error={errors.sku?.message}>
          <Input className="h-10" autoComplete="off" {...register('sku')} />
        </Field>
        <Field
          id="listPriceExGst"
          label="List price ex-GST (AUD)"
          required
          error={errors.listPriceExGst?.message}
          hint="Per bag. Existing order lines keep the price they were saved with."
        >
          <Input
            className="h-10"
            inputMode="decimal"
            autoComplete="off"
            {...register('listPriceExGst')}
          />
        </Field>
        <Field
          id="taxCode"
          label="Tax code"
          required
          error={errors.taxCode?.message}
          hint="Tax code: confirm with your accountant."
        >
          <NativeSelect {...register('taxCode', { onChange: () => setTaxCodePicked(true) })}>
            {(['GST_FREE', 'GST'] as const).map((code) => (
              <option key={code} value={code}>
                {TAX_CODE_LABELS[code]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <div className="flex gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? 'Saving…' : product ? 'Save changes' : 'Add product'}
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link to="/products">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
