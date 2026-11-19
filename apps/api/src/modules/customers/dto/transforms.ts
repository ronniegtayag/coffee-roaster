import { TransformFnParams } from 'class-transformer';
import { normaliseAbn } from '../abn';

export const abnOrNull = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? normaliseAbn(value) || null : value;
