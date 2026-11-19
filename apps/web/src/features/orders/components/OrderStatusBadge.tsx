import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { ORDER_STATUS_LABELS, type OrderStatus } from '../types';

const STYLES: Record<OrderStatus, string> = {
  DRAFT: 'border-border bg-muted text-muted-foreground',
  CONFIRMED: 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200',
  PACKED: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  DISPATCHED: 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200',
  DELIVERED: 'bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200',
  CANCELLED: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge className={cn(STYLES[status])}>{ORDER_STATUS_LABELS[status]}</Badge>;
}
