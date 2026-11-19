import { registerDecorator, ValidationOptions } from 'class-validator';
import { parsePrice } from './money';

export const PRICE_MESSAGE = 'Price must be more than $0.00 with at most 2 decimal places';

/** A money string such as "34.00": > 0, at most 2 decimals, at most 9999.99. Numbers are rejected. */
export function IsPrice(options?: ValidationOptions): PropertyDecorator {
  return (object, propertyName) =>
    registerDecorator({
      name: 'isPrice',
      target: object.constructor,
      propertyName: propertyName as string,
      options: { message: PRICE_MESSAGE, ...options },
      validator: { validate: (value: unknown) => parsePrice(value) !== null },
    });
}

/** `YYYY-MM-DD` that is a real calendar date. */
export function IsPlainDate(message: string, options?: ValidationOptions): PropertyDecorator {
  return (object, propertyName) =>
    registerDecorator({
      name: 'isPlainDate',
      target: object.constructor,
      propertyName: propertyName as string,
      options: { message, ...options },
      validator: {
        validate: (value: unknown) => typeof value === 'string' && isPlainDateString(value),
      },
    });
}

import { isPlainDate as isPlainDateString } from './business-date';
