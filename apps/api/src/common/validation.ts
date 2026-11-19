import { ValidationError } from 'class-validator';
import { apiError, ApiException, FieldError } from './api-error';

function collect(errors: ValidationError[], prefix: string, out: FieldError[]): void {
  for (const error of errors) {
    const field = prefix ? `${prefix}.${error.property}` : error.property;
    if (error.constraints) {
      // Decorators apply bottom-up, so the last constraint is the top-most decorator: the one
      // written first, which is the most basic check (e.g. "is required") and reads best to users.
      const entries = Object.entries(error.constraints);
      const [code, message] = entries[entries.length - 1];
      out.push({ field, code, message });
    }
    if (error.children?.length) collect(error.children, field, out);
  }
}

/** ValidationPipe `exceptionFactory`: 400 VALIDATION_FAILED with one fieldErrors entry per field. */
export function validationExceptionFactory(errors: ValidationError[]): ApiException {
  const fieldErrors: FieldError[] = [];
  collect(errors, '', fieldErrors);
  return apiError(400, 'VALIDATION_FAILED', 'Some fields need attention', { fieldErrors });
}
