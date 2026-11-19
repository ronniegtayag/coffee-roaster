import { createFileRoute } from '@tanstack/react-router';
import { OrderList, validateOrderListSearch } from '@/features/orders';

export const Route = createFileRoute('/_authed/orders/')({
  validateSearch: validateOrderListSearch,
  component: Page,
});

function Page() {
  return <OrderList search={Route.useSearch()} />;
}
