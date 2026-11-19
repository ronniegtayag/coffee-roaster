import type { OrderStatus } from '../../generated/prisma/client';
import { hasPermission, Permission } from '../auth';
import type { AllowedActionsDto } from './dto/order.dto';

interface RuleInput {
  status: OrderStatus;
  confirmedAt: Date | null;
  pastCutoff: boolean;
}

/**
 * What the current user may do with an order right now (design §4, §6.3). The web only reads
 * this; the service enforces the same rules on every write.
 */
export function computeAllowedActions(
  order: RuleInput,
  user: { permissions: readonly Permission[] },
): AllowedActionsDto {
  const can = (p: Permission): boolean => hasPermission(user, p);
  const write = can(Permission.OrdersWrite);
  const late = can(Permission.OrdersLateChange);
  const { status, pastCutoff } = order;

  // DRAFT is always editable (off-schedule saves are decided at save time). CONFIRMED past
  // cut-off needs late-change because the order may already be in the roast plan.
  const editableByStaff =
    status === 'DRAFT' ? write : status === 'CONFIRMED' ? (pastCutoff ? late : write) : false;
  const packedLike = status === 'PACKED' || status === 'DISPATCHED';

  return {
    editLines: editableByStaff
      ? 'full'
      : packedLike && can(Permission.OrdersShortSupply)
        ? 'reduceOnly'
        : 'none',
    editRoastDate: editableByStaff,
    editDeliveryDate: editableByStaff || (packedLike && late),
    editNotes: write,
    confirm: status === 'DRAFT' && write,
    pack: status === 'CONFIRMED' && can(Permission.OrdersFulfil),
    dispatch: status === 'PACKED' && can(Permission.OrdersFulfil),
    deliver: packedLike && can(Permission.OrdersFulfil),
    cancel:
      status === 'DRAFT'
        ? write
        : status === 'CONFIRMED'
          ? pastCutoff
            ? late
            : write
          : packedLike
            ? late
            : false,
    revert: late && (status === 'CONFIRMED' || packedLike),
    delete: status === 'DRAFT' && order.confirmedAt === null && write,
    copy: write,
  };
}
