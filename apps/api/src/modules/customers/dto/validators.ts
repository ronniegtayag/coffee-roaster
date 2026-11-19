import { registerDecorator, ValidationOptions } from 'class-validator';
import { isAbnChecksumValid, isAbnFormat } from '../abn';

function abnRule(name: string, check: (value: string) => boolean, message: string) {
  return (options?: ValidationOptions): PropertyDecorator =>
    (object, propertyName) =>
      registerDecorator({
        name,
        target: object.constructor,
        propertyName: propertyName as string,
        options: { message, ...options },
        validator: { validate: (value: unknown) => typeof value === 'string' && check(value) },
      });
}

export const IsAbnFormat = abnRule('abnFormat', isAbnFormat, 'ABN must be 11 digits');

/** Only fails for well-formed values, so a bad format reports `abnFormat` alone. */
export const IsAbnChecksum = abnRule(
  'abnChecksum',
  (v) => !isAbnFormat(v) || isAbnChecksumValid(v),
  "This isn't a valid ABN — check for a typo",
);
