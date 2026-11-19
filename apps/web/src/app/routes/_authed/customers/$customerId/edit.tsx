import { createFileRoute } from '@tanstack/react-router';
import { EditCustomerPage } from '@/features/customers';

export const Route = createFileRoute('/_authed/customers/$customerId/edit')({
  component: Page,
});

function Page() {
  const { customerId } = Route.useParams();
  return <EditCustomerPage customerId={customerId} />;
}
