import { createFileRoute } from '@tanstack/react-router';
import { CustomerList, validateCustomerListSearch } from '@/features/customers';

export const Route = createFileRoute('/_authed/customers/')({
  validateSearch: validateCustomerListSearch,
  component: CustomersPage,
});

function CustomersPage() {
  return <CustomerList search={Route.useSearch()} />;
}
