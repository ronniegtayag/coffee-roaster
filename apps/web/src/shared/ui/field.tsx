import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { Label } from './label';

interface FieldProps {
  /** Id of the control inside; the label, hint and error are wired to it. */
  id: string;
  label: string;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactElement<Record<string, unknown>>;
}

/** A labelled form control with an optional hint and an error message announced to screen readers. */
export function Field({ id, label, required, hint, error, className, children }: FieldProps) {
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span aria-hidden className="text-destructive">
            *
          </span>
        )}
      </Label>
      {isValidElement(children)
        ? cloneElement(children, {
            id,
            'aria-invalid': error ? true : undefined,
            'aria-describedby': describedBy || undefined,
            'aria-required': required ? true : undefined,
          })
        : children}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
