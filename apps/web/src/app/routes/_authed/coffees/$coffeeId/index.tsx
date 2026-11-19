import { createFileRoute } from '@tanstack/react-router';
import { CoffeeDetailPage } from '@/features/products';

export const Route = createFileRoute('/_authed/coffees/$coffeeId/')({
  component: Page,
});

function Page() {
  const { coffeeId } = Route.useParams();
  return <CoffeeDetailPage coffeeId={coffeeId} />;
}
