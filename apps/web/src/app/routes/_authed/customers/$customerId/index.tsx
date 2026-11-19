import { createFileRoute } from '@tanstack/react-router';
import { CustomerDetailPage } from '@/features/customers';

export const Route = createFileRoute('/_authed/customers/$customerId/')({
  component: Page,
});

function Page() {
  const { customerId } = Route.useParams();
  return <CustomerDetailPage customerId={customerId} />;
}
