import { useState, type ReactNode } from 'react';
import { type ApiError, toApiError } from '@/shared/api/errors';
import { describeApiError } from '@/shared/lib/form-errors';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './alert-dialog';
import { Button } from './button';
import { Field } from './field';
import { Textarea } from './textarea';

interface Props {
  /** The button that opens the dialog. */
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** Receives the reason when `reasonLabel` is set (required, 1 to 500 characters). */
  onConfirm: (reason: string) => Promise<unknown>;
  reasonLabel?: string;
  describeError?: (error: ApiError) => string;
}

/** Asks before doing something that is awkward to undo. Stays open and shows the error if it fails. */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  onConfirm,
  reasonLabel,
  describeError = describeApiError,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);

  async function confirm() {
    if (pending) return;
    if (reasonLabel && !reason.trim()) {
      setReasonError(`${reasonLabel} is required`);
      return;
    }
    setPending(true);
    setError(null);
    setReasonError(null);
    try {
      await onConfirm(reason.trim());
      setOpen(false);
    } catch (e) {
      setError(describeError(toApiError(e)));
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setError(null);
          setReasonError(null);
          setReason('');
        }
      }}
    >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {reasonLabel && (
          <Field id="confirm-reason" label={reasonLabel} required error={reasonError}>
            <Textarea
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button size="lg" disabled={pending} onClick={() => void confirm()}>
            {pending ? 'Working…' : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
