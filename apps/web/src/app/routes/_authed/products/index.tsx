import { createFileRoute } from '@tanstack/react-router';
import { ProductList, validateProductListSearch } from '@/features/products';

export const Route = createFileRoute('/_authed/products/')({
  validateSearch: validateProductListSearch,
  component: Page,
});

function Page() {
  return <ProductList search={Route.useSearch()} />;
}
