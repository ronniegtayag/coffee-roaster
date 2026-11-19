import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  countOpenOrdersWithProduct,
  createCoffee,
  createProduct,
  getCoffee,
  getProduct,
  listCoffees,
  listGrinds,
  listOrderableProducts,
  listProducts,
  setCoffeeActive,
  setProductActive,
  updateCoffee,
  updateProduct,
} from './api';
import type {
  ActiveFilter,
  CoffeeInput,
  CreateProductInput,
  ListProductsFilters,
  UpdateProductInput,
} from './types';

export const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: (filters: ListProductsFilters) => [...productKeys.lists(), filters] as const,
  orderable: () => [...productKeys.all, 'orderable'] as const,
  detail: (id: string) => [...productKeys.all, 'detail', id] as const,
  openOrders: (id: string) => [...productKeys.all, 'open-orders', id] as const,
};

export const coffeeKeys = {
  all: ['coffees'] as const,
  list: (params: { status?: ActiveFilter; search?: string }) =>
    [...coffeeKeys.all, 'list', params] as const,
  detail: (id: string) => [...coffeeKeys.all, 'detail', id] as const,
};

export const grindKeys = {
  all: ['grinds'] as const,
};

export const productListQuery = (filters: ListProductsFilters) =>
  queryOptions({
    queryKey: productKeys.list(filters),
    queryFn: () => listProducts(filters),
    placeholderData: keepPreviousData,
  });

export const orderableProductsQuery = () =>
  queryOptions({ queryKey: productKeys.orderable(), queryFn: listOrderableProducts });

export const productDetailQuery = (id: string) =>
  queryOptions({ queryKey: productKeys.detail(id), queryFn: () => getProduct(id) });

export const openOrderCountQuery = (id: string) =>
  queryOptions({
    queryKey: productKeys.openOrders(id),
    queryFn: () => countOpenOrdersWithProduct(id),
  });

export const coffeeListQuery = (params: { status?: ActiveFilter; search?: string }) =>
  queryOptions({ queryKey: coffeeKeys.list(params), queryFn: () => listCoffees(params) });

export const coffeeDetailQuery = (id: string) =>
  queryOptions({ queryKey: coffeeKeys.detail(id), queryFn: () => getCoffee(id) });

export const grindListQuery = () =>
  queryOptions({ queryKey: grindKeys.all, queryFn: () => listGrinds('active') });

/** Product and coffee writes refresh both families: a coffee's state decides its products' availability. */
function useInvalidateCatalogue() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: productKeys.all }),
      queryClient.invalidateQueries({ queryKey: coffeeKeys.all }),
    ]);
}

export function useCreateProduct() {
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: (input: CreateProductInput) => createProduct(input),
    onSuccess: invalidate,
  });
}

export function useUpdateProduct(id: string) {
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: (input: UpdateProductInput) => updateProduct(id, input),
    onSuccess: invalidate,
  });
}

export function useSetProductActive(id: string) {
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: (active: boolean) => setProductActive(id, active),
    onSuccess: invalidate,
  });
}

export function useCreateCoffee() {
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: (input: CoffeeInput) => createCoffee(input),
    onSuccess: invalidate,
  });
}

export function useUpdateCoffee(id: string) {
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: (input: Partial<CoffeeInput>) => updateCoffee(id, input),
    onSuccess: invalidate,
  });
}

export function useSetCoffeeActive(id: string) {
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: (active: boolean) => setCoffeeActive(id, active),
    onSuccess: invalidate,
  });
}
