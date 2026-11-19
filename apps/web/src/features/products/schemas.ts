import { z } from 'zod';

const requiredText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`);

const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be ${max} characters or fewer`);

export const PRICE_MESSAGE = 'Price must be more than $0.00 with at most 2 decimal places';

/** Prices stay strings: checked by pattern, never converted to a number. Max $9,999.99. */
export const priceSchema = z
  .string()
  .trim()
  .regex(/^\d{1,4}(\.\d{1,2})?$/, PRICE_MESSAGE)
  .refine((v) => !/^0+(\.0+)?$/.test(v), PRICE_MESSAGE);

export const coffeeFormSchema = z.object({
  name: requiredText(100, 'Name'),
  type: z.enum(['SINGLE_ORIGIN', 'BLEND'], 'Choose a type'),
  origin: optionalText(100, 'Origin'),
  description: optionalText(1000, 'Description'),
});
export type CoffeeFormValues = z.infer<typeof coffeeFormSchema>;

const skuSchema = z
  .string()
  .trim()
  .min(1, 'SKU is required')
  .max(40, 'SKU must be 40 characters or fewer')
  .regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/, 'SKU can only use letters, numbers and dashes');

const taxCodeSchema = z.enum(['GST', 'GST_FREE'], 'Choose a tax code');

/** One schema for both kinds; the kind-specific fields are checked in superRefine. */
export const productFormSchema = z
  .object({
    kind: z.enum(['COFFEE', 'OTHER']),
    sku: skuSchema,
    coffeeId: z.string(),
    bagSizeGrams: z.string().trim(),
    grindId: z.string(),
    name: z.string().trim().max(200, 'Name must be 200 characters or fewer'),
    listPriceExGst: priceSchema,
    taxCode: taxCodeSchema,
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'COFFEE') {
      if (!v.coffeeId)
        ctx.addIssue({ code: 'custom', path: ['coffeeId'], message: 'Choose a coffee' });
      if (
        !/^\d+$/.test(v.bagSizeGrams) ||
        Number(v.bagSizeGrams) < 1 ||
        Number(v.bagSizeGrams) > 100000
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['bagSizeGrams'],
          message: 'Bag size must be a whole number of grams above 0',
        });
      }
      if (!v.grindId)
        ctx.addIssue({ code: 'custom', path: ['grindId'], message: 'Choose a grind' });
    } else if (!v.name) {
      ctx.addIssue({ code: 'custom', path: ['name'], message: 'Name is required' });
    }
  });
export type ProductFormValues = z.infer<typeof productFormSchema>;
