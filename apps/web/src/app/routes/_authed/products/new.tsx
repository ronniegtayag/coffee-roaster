import { createFileRoute } from '@tanstack/react-router';
import { NewProductPage } from '@/features/products';

export const Route = createFileRoute('/_authed/products/new')({
  validateSearch: (search: Record<string, unknown>): { coffeeId?: string } => ({
    coffeeId:
      typeof search.coffeeId === 'string' && /^[\w-]{1,64}$/.test(search.coffeeId)
        ? search.coffeeId
        : undefined,
  }),
  component: Page,
});

function Page() {
  const { coffeeId } = Route.useSearch();
  return <NewProductPage coffeeId={coffeeId} />;
}
