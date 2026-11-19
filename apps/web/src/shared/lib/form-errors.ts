import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form';
import type { ApiError } from '@/shared/api/errors';

/** One sentence for errors that are not about a single field. */
export function describeApiError(error: ApiError): string {
  if (error.status === 403) return "You don't have permission to do this";
  if (error.status === 0 || error.status >= 500) return 'Something went wrong — try again';
  return error.message;
}

/**
 * Puts API field errors next to their fields and keeps the user's input.
 * Returns a form-level message when the error isn't about a field this form has.
 */
export function applyApiError<T extends FieldValues>(
  error: ApiError,
  setError: UseFormSetError<T>,
  fields: readonly string[],
): string | null {
  const unplaced: string[] = [];
  for (const fieldError of error.fieldErrors) {
    if (fields.includes(fieldError.field)) {
      setError(fieldError.field as FieldPath<T>, { type: 'server', message: fieldError.message });
    } else {
      unplaced.push(fieldError.message);
    }
  }
  if (error.fieldErrors.length > 0 && unplaced.length === 0) return null;
  return unplaced[0] ?? describeApiError(error);
}
