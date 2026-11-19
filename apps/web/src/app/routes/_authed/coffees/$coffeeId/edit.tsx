import { createFileRoute } from '@tanstack/react-router';
import { EditCoffeePage } from '@/features/products';

export const Route = createFileRoute('/_authed/coffees/$coffeeId/edit')({
  component: Page,
});

function Page() {
  const { coffeeId } = Route.useParams();
  return <EditCoffeePage coffeeId={coffeeId} />;
}
