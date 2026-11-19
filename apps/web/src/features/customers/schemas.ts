import { z } from 'zod';
import { isValidAbn, normaliseAbn } from '@/shared/lib/abn';
import { AUSTRALIAN_STATES, PAYMENT_TERMS_MAX_DAYS } from './types';

/** Mirrors the API's validation so mistakes are caught before a round trip; the API stays the authority. */
const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be ${max} characters or fewer`);

const requiredText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`);

export const customerFormSchema = z.object({
  legalName: requiredText(200, 'Legal name'),
  tradingName: optionalText(200, 'Trading name'),
  abn: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || (/^[\d\s]+$/.test(v) && normaliseAbn(v) !== null),
      'ABN must be 11 digits',
    )
    .refine(
      (v) => v === '' || !/^[\d\s]+$/.test(v) || normaliseAbn(v) === null || isValidAbn(v),
      "This isn't a valid ABN — check for a typo",
    ),
  billingEmail: z
    .string()
    .trim()
    .min(1, 'Billing email is required')
    .max(254, 'Billing email must be 254 characters or fewer')
    .pipe(z.email('Enter a valid email address')),
  phone: optionalText(30, 'Phone'),
  paymentTermsDays: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || (/^\d+$/.test(v) && Number(v) <= PAYMENT_TERMS_MAX_DAYS),
      `Payment terms must be a whole number of days from 0 to ${PAYMENT_TERMS_MAX_DAYS}`,
    ),
  notes: optionalText(2000, 'Notes'),
});
export type CustomerFormValues = z.infer<typeof customerFormSchema>;

export const branchFormSchema = z.object({
  name: requiredText(200, 'Branch name'),
  addressLine1: requiredText(200, 'Address line 1'),
  addressLine2: optionalText(200, 'Address line 2'),
  suburb: requiredText(100, 'Suburb'),
  state: z.enum(AUSTRALIAN_STATES, 'Choose a state'),
  postcode: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'Postcode must be 4 digits'),
  contactName: optionalText(200, 'Contact name'),
  contactPhone: optionalText(30, 'Contact phone'),
  deliveryNotes: optionalText(2000, 'Delivery notes'),
});
export type BranchFormValues = z.infer<typeof branchFormSchema>;
