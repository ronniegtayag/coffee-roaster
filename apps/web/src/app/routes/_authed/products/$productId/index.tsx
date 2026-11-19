import { createFileRoute } from '@tanstack/react-router';
import { ProductDetailPage } from '@/features/products';

export const Route = createFileRoute('/_authed/products/$productId/')({
  component: Page,
});

function Page() {
  const { productId } = Route.useParams();
  return <ProductDetailPage productId={productId} />;
}
