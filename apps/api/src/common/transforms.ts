import { TransformFnParams } from 'class-transformer';

export const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Trims; a blank string becomes null. */
export const trimOrNull = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() || null : value;
