import { createFileRoute } from '@tanstack/react-router';
import { NewCustomerPage } from '@/features/customers';

export const Route = createFileRoute('/_authed/customers/new')({
  component: NewCustomerPage,
});
