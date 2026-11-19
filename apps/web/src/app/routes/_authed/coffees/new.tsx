import { createFileRoute } from '@tanstack/react-router';
import { NewCoffeePage } from '@/features/products';

export const Route = createFileRoute('/_authed/coffees/new')({
  component: NewCoffeePage,
});
