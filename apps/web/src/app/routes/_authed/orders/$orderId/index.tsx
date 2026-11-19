import { createFileRoute } from '@tanstack/react-router';
import { OrderDetailPage } from '@/features/orders';

export const Route = createFileRoute('/_authed/orders/$orderId/')({
  component: Page,
});

function Page() {
  const { orderId } = Route.useParams();
  return <OrderDetailPage orderId={orderId} />;
}
