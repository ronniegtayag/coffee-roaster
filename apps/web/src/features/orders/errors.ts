import type { ApiError } from '@/shared/api/errors';
import { formatBusinessDateLong } from '@/shared/lib/dates';
import { describeApiError } from '@/shared/lib/form-errors';
import { ORDER_STATUS_LABELS, type OrderStatus } from './types';

interface LineMeta {
  description?: string;
}

function lineNames(error: ApiError): string {
  const lines = error.meta.lines;
  if (!Array.isArray(lines)) return 'A product';
  return (lines as LineMeta[])
    .map((line) => line.description)
    .filter(Boolean)
    .join(', ');
}

/** Plain-language text for the order-specific error codes (ordering design 6.5). */
export function describeOrderError(error: ApiError): string {
  switch (error.code) {
    case 'VERSION_CONFLICT':
      return 'This order was changed by someone else — reload';
    case 'INVALID_TRANSITION': {
      const status = error.meta.status as OrderStatus | undefined;
      return status
        ? `This order is now ${ORDER_STATUS_LABELS[status] ?? status}. The page has been refreshed.`
        : 'This order has changed. The page has been refreshed.';
    }
    case 'ORDER_NOT_EDITABLE':
      return "This order can't be changed in its current status";
    case 'ORDER_EMPTY':
      return 'An order needs at least one line. Cancel it instead if it is called off.';
    case 'ORDER_NOT_DELETABLE':
      return "This order can't be deleted. Cancel it instead.";
    case 'PRODUCT_UNAVAILABLE':
      return `${lineNames(error)} is no longer available. Remove it to continue.`;
    case 'CUSTOMER_INACTIVE':
      return 'This customer is inactive. Reactivate the customer first.';
    case 'BRANCH_INACTIVE':
      return 'This branch is inactive. Reactivate the branch first.';
    case 'NO_SCHEDULE_AVAILABLE':
      return 'No roast or delivery day is available soon. Check the roast calendar.';
    case 'SCHEDULE_OVERRIDE_REQUIRED': {
      const suggestion = error.meta.suggestion as { roastDate?: string } | undefined;
      const reasons = error.meta.reasons as string[] | undefined;
      const lead =
        reasons && reasons.length === 1 && reasons[0] === 'CUTOFF_PASSED'
          ? 'The cut-off for this roast date has passed'
          : 'These dates are off schedule';
      return suggestion?.roastDate
        ? `${lead} — ask a manager or pick the next date (${formatBusinessDateLong(suggestion.roastDate)}).`
        : `${lead} — ask a manager or pick the next date.`;
    }
    case 'REQUEST_ID_REUSED':
      return 'This order was already started by someone else. Reload the page and try again.';
    case 'FORBIDDEN': {
      switch (error.meta.reason) {
        case 'PAST_CUTOFF':
          return 'The cut-off has passed. Only a manager can change or cancel this order.';
        case 'SHORT_SUPPLY':
          return 'Only a manager can reduce lines on a packed order.';
        case 'LATE_CHANGE':
          return 'Only a manager can make this late change.';
        default:
          return describeApiError(error);
      }
    }
    default:
      return describeApiError(error);
  }
}
