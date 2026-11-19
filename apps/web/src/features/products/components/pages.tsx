import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useCan } from '@/features/auth';
import { formatAud } from '@/shared/lib/money';
import { formatTimestamp } from '@/shared/lib/dates';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { NoPermission } from '@/shared/ui/no-permission';
import { NotFoundView } from '@/shared/ui/not-found-view';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryView } from '@/shared/ui/query-view';
import {
  coffeeDetailQuery,
  openOrderCountQuery,
  productDetailQuery,
  useSetCoffeeActive,
  useSetProductActive,
} from '../queries';
import { COFFEE_TYPE_LABELS, TAX_CODE_LABELS, type CoffeeDetail, type Product } from '../types';
import { CoffeeForm } from './CoffeeForm';
import { ProductForm } from './ProductForm';

export function NewProductPage({ coffeeId }: { coffeeId?: string }) {
  const canWrite = useCan('products:write');
  if (!canWrite) return <NoPermission backTo="/products" />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Add product" back={{ label: 'Products', to: '/products' }} />
      <ProductForm coffeeId={coffeeId} />
    </div>
  );
}

export function ProductDetailPage({ productId }: { productId: string }) {
  const query = useQuery(productDetailQuery(productId));
  return (
    <QueryView
      query={query}
      loadingLabel="Loading product"
      notFound={
        <NotFoundView title="Product not found" backTo="/products" backLabel="Back to products" />
      }
    >
      {(product) => <ProductDetail product={product} />}
    </QueryView>
  );
}

function ProductDetail({ product }: { product: Product }) {
  const canWrite = useCan('products:write');
  const setActive = useSetProductActive(product.id);
  // Only people who can change a price or tax code need the warning about open orders.
  const openOrders = useQuery({ ...openOrderCountQuery(product.id), enabled: canWrite });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={product.displayName}
        back={{ label: 'Products', to: '/products' }}
        badges={
          !product.isActive ? (
            <Badge variant="outline">Inactive</Badge>
          ) : !product.orderable ? (
            <Badge variant="outline">Coffee inactive</Badge>
          ) : undefined
        }
        actions={
          canWrite &&
          (product.isActive ? (
            <ConfirmDialog
              trigger={
                <Button variant="outline" size="lg">
                  Deactivate
                </Button>
              }
              title={`Deactivate ${product.displayName}?`}
              description="It can no longer be added to new orders. Existing orders keep it, and you can reactivate it later."
              confirmLabel="Deactivate product"
              onConfirm={() => setActive.mutateAsync(false)}
            />
          ) : (
            <ConfirmDialog
              trigger={<Button size="lg">Reactivate</Button>}
              title={`Reactivate ${product.displayName}?`}
              description="It can be added to new orders again."
              confirmLabel="Reactivate product"
              onConfirm={() => setActive.mutateAsync(true)}
            />
          ))
        }
      />

      {canWrite && openOrders.data !== undefined && openOrders.data > 0 && (
        <Alert>
          <AlertDescription>
            {openOrders.data} open {openOrders.data === 1 ? 'order carries' : 'orders carry'} this
            product. Changing its price or tax code won't change those orders; they keep what they
            were saved with.
          </AlertDescription>
        </Alert>
      )}

      {canWrite ? (
        <ProductForm product={product} />
      ) : (
        <dl className="grid max-w-2xl gap-x-6 gap-y-3 rounded-lg border p-4 text-sm sm:grid-cols-2">
          <Item label="SKU">{product.sku}</Item>
          <Item label="List price ex-GST">{formatAud(product.listPriceExGst)}</Item>
          <Item label="Tax code">{TAX_CODE_LABELS[product.taxCode]}</Item>
          <Item label="Last updated">{formatTimestamp(product.updatedAt)}</Item>
        </dl>
      )}
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function NewCoffeePage() {
  const canWrite = useCan('products:write');
  if (!canWrite) return <NoPermission backTo="/coffees" />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Add coffee" back={{ label: 'Coffees', to: '/coffees' }} />
      <CoffeeForm />
    </div>
  );
}

export function EditCoffeePage({ coffeeId }: { coffeeId: string }) {
  const canWrite = useCan('products:write');
  const query = useQuery(coffeeDetailQuery(coffeeId));
  if (!canWrite) return <NoPermission backTo="/coffees" />;
  return (
    <QueryView
      query={query}
      loadingLabel="Loading coffee"
      notFound={
        <NotFoundView title="Coffee not found" backTo="/coffees" backLabel="Back to coffees" />
      }
    >
      {(coffee) => (
        <div className="flex flex-col gap-6">
          <PageHeader title={`Edit ${coffee.name}`} back={{ label: 'Coffees', to: '/coffees' }} />
          <CoffeeForm coffee={coffee} />
        </div>
      )}
    </QueryView>
  );
}

export function CoffeeDetailPage({ coffeeId }: { coffeeId: string }) {
  const query = useQuery(coffeeDetailQuery(coffeeId));
  return (
    <QueryView
      query={query}
      loadingLabel="Loading coffee"
      notFound={
        <NotFoundView title="Coffee not found" backTo="/coffees" backLabel="Back to coffees" />
      }
    >
      {(coffee) => <CoffeeDetailView coffee={coffee} />}
    </QueryView>
  );
}

function CoffeeDetailView({ coffee }: { coffee: CoffeeDetail }) {
  const canWrite = useCan('products:write');
  const setActive = useSetCoffeeActive(coffee.id);
  const products = [...coffee.products].sort((a, b) => Number(b.isActive) - Number(a.isActive));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={coffee.name}
        back={{ label: 'Coffees', to: '/coffees' }}
        badges={!coffee.isActive ? <Badge variant="outline">Inactive</Badge> : undefined}
        actions={
          canWrite && (
            <>
              <Button asChild variant="outline" size="lg">
                <Link to="/coffees/$coffeeId/edit" params={{ coffeeId: coffee.id }}>
                  Edit coffee
                </Link>
              </Button>
              {coffee.isActive ? (
                <ConfirmDialog
                  trigger={
                    <Button variant="outline" size="lg">
                      Deactivate
                    </Button>
                  }
                  title={`Deactivate ${coffee.name}?`}
                  description="None of its products can be added to new orders. Their own status is unchanged, and reactivating the coffee makes them available again."
                  confirmLabel="Deactivate coffee"
                  onConfirm={() => setActive.mutateAsync(false)}
                />
              ) : (
                <ConfirmDialog
                  trigger={<Button size="lg">Reactivate</Button>}
                  title={`Reactivate ${coffee.name}?`}
                  description="Its active products can be added to new orders again."
                  confirmLabel="Reactivate coffee"
                  onConfirm={() => setActive.mutateAsync(true)}
                />
              )}
            </>
          )
        }
      />
      {!coffee.isActive && (
        <Alert>
          <AlertDescription>
            This coffee is inactive
            {coffee.deactivatedAt ? ` since ${formatTimestamp(coffee.deactivatedAt)}` : ''}. Its
            products can't be added to new orders.
          </AlertDescription>
        </Alert>
      )}
      <dl className="grid gap-x-6 gap-y-3 rounded-lg border p-4 text-sm sm:grid-cols-2">
        <Item label="Type">{COFFEE_TYPE_LABELS[coffee.type]}</Item>
        <Item label="Origin">{coffee.origin ?? '—'}</Item>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Description</dt>
          <dd className="whitespace-pre-wrap">{coffee.description ?? '—'}</dd>
        </div>
      </dl>

      <section aria-labelledby="coffee-products" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="coffee-products" className="font-medium">
            Products
          </h2>
          {canWrite && (
            <Button asChild size="lg">
              <Link to="/products/new" search={{ coffeeId: coffee.id }}>
                <Plus aria-hidden />
                Add product
              </Link>
            </Button>
          )}
        </div>
        {products.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center">
            <p className="font-medium">No products yet</p>
            <p className="text-sm text-muted-foreground">
              {canWrite
                ? 'Add a bag size and grind to sell this coffee.'
                : 'Ask a manager to add products.'}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {products.map((product) => (
              <li
                key={product.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3"
              >
                <div className="flex items-center gap-2">
                  <Link
                    to="/products/$productId"
                    params={{ productId: product.id }}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {product.displayName}
                  </Link>
                  {!product.isActive && <Badge variant="outline">Inactive</Badge>}
                </div>
                <span className="text-sm text-muted-foreground">
                  {product.sku} · {formatAud(product.listPriceExGst)} ·{' '}
                  {TAX_CODE_LABELS[product.taxCode]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
