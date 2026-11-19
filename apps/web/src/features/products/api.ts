import { http } from '@/shared/api/http';
import type {
  ActiveFilter,
  Coffee,
  CoffeeDetail,
  CoffeeInput,
  CreateProductInput,
  Grind,
  ListProductsFilters,
  Page,
  Product,
  UpdateProductInput,
} from './types';

const id = encodeURIComponent;

export async function listCoffees(params: { status?: ActiveFilter; search?: string }) {
  const { data } = await http.get<{ items: Coffee[] }>('/coffees', { params });
  return data.items;
}

export async function getCoffee(coffeeId: string): Promise<CoffeeDetail> {
  const { data } = await http.get<CoffeeDetail>(`/coffees/${id(coffeeId)}`);
  return data;
}

export async function createCoffee(input: CoffeeInput): Promise<Coffee> {
  const { data } = await http.post<Coffee>('/coffees', input);
  return data;
}

export async function updateCoffee(coffeeId: string, input: Partial<CoffeeInput>): Promise<Coffee> {
  const { data } = await http.patch<Coffee>(`/coffees/${id(coffeeId)}`, input);
  return data;
}

export async function setCoffeeActive(coffeeId: string, active: boolean): Promise<Coffee> {
  const action = active ? 'reactivate' : 'deactivate';
  const { data } = await http.post<Coffee>(`/coffees/${id(coffeeId)}/${action}`);
  return data;
}

export async function listGrinds(status: ActiveFilter = 'active'): Promise<Grind[]> {
  const { data } = await http.get<{ items: Grind[] }>('/grinds', { params: { status } });
  return data.items;
}

export async function listProducts(filters: ListProductsFilters): Promise<Page<Product>> {
  const { data } = await http.get<Page<Product>>('/products', { params: filters });
  return data;
}

export async function listOrderableProducts(): Promise<Product[]> {
  const { data } = await http.get<{ items: Product[] }>('/products/orderable');
  return data.items;
}

export async function getProduct(productId: string): Promise<Product> {
  const { data } = await http.get<Product>(`/products/${id(productId)}`);
  return data;
}

export async function createProduct(input: CreateProductInput): Promise<Product> {
  const { data } = await http.post<Product>('/products', input);
  return data;
}

export async function updateProduct(
  productId: string,
  input: UpdateProductInput,
): Promise<Product> {
  const { data } = await http.patch<Product>(`/products/${id(productId)}`, input);
  return data;
}

export async function setProductActive(productId: string, active: boolean): Promise<Product> {
  const action = active ? 'reactivate' : 'deactivate';
  const { data } = await http.post<Product>(`/products/${id(productId)}/${action}`);
  return data;
}

/** How many open (not delivered, not cancelled) orders carry a product, for the price/tax warning (P2). */
export async function countOpenOrdersWithProduct(productId: string): Promise<number> {
  const { data } = await http.get<{ totalItems: number }>('/orders', {
    params: { productId, status: 'DRAFT,CONFIRMED,PACKED,DISPATCHED', pageSize: 1 },
  });
  return data.totalItems;
}
