import { createFileRoute } from '@tanstack/react-router';
import { NewBranchPage } from '@/features/customers';

export const Route = createFileRoute('/_authed/customers/$customerId/branches/new')({
  component: Page,
});

function Page() {
  const { customerId } = Route.useParams();
  return <NewBranchPage customerId={customerId} />;
}
