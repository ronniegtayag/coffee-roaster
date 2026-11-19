import { createFileRoute } from '@tanstack/react-router';
import { CoffeeList, validateCoffeeListSearch } from '@/features/products';

export const Route = createFileRoute('/_authed/coffees/')({
  validateSearch: validateCoffeeListSearch,
  component: Page,
});

function Page() {
  return <CoffeeList search={Route.useSearch()} />;
}
