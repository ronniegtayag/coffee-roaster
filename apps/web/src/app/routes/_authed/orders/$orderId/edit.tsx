import { createFileRoute } from '@tanstack/react-router';
import { EditOrderPage } from '@/features/orders';

export const Route = createFileRoute('/_authed/orders/$orderId/edit')({
  component: Page,
});

function Page() {
  const { orderId } = Route.useParams();
  return <EditOrderPage orderId={orderId} />;
}
