import { createFileRoute } from '@tanstack/react-router';
import { EditBranchPage } from '@/features/customers';

export const Route = createFileRoute('/_authed/customers/$customerId/branches/$branchId/edit')({
  component: Page,
});

function Page() {
  const { customerId, branchId } = Route.useParams();
  return <EditBranchPage customerId={customerId} branchId={branchId} />;
}
