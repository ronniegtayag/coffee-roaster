import { createFileRoute } from '@tanstack/react-router';
import { NewOrderPage } from '@/features/orders';

const idParam = (value: unknown) =>
  typeof value === 'string' && /^[\w-]{1,64}$/.test(value) ? value : undefined;

export const Route = createFileRoute('/_authed/orders/new')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { customerId?: string; branchId?: string } => ({
    customerId: idParam(search.customerId),
    branchId: idParam(search.branchId),
  }),
  component: Page,
});

function Page() {
  const { customerId, branchId } = Route.useSearch();
  return <NewOrderPage customerId={customerId} branchId={branchId} />;
}
