import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createBranch,
  createCustomer,
  getCustomer,
  listCustomers,
  setBranchActive,
  setCustomerActive,
  updateBranch,
  updateCustomer,
} from './api';
import type { BranchInput, CustomerInput, CustomerListFilters } from './types';

export const customerKeys = {
  all: ['customers'] as const,
  lists: () => [...customerKeys.all, 'list'] as const,
  list: (filters: CustomerListFilters) => [...customerKeys.lists(), filters] as const,
  detail: (id: string) => [...customerKeys.all, 'detail', id] as const,
};

export const customerListQuery = (filters: CustomerListFilters) =>
  queryOptions({
    queryKey: customerKeys.list(filters),
    queryFn: () => listCustomers(filters),
    // Keep showing the previous page while the next one loads.
    placeholderData: keepPreviousData,
  });

export const customerDetailQuery = (id: string) =>
  queryOptions({
    queryKey: customerKeys.detail(id),
    queryFn: () => getCustomer(id),
  });

/** Customer and branch writes all end by refreshing that customer and every list. */
function useInvalidateCustomer() {
  const queryClient = useQueryClient();
  return (id: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(id) }),
      queryClient.invalidateQueries({ queryKey: customerKeys.lists() }),
    ]);
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CustomerInput) => createCustomer(input),
    onSuccess: (customer) => {
      queryClient.setQueryData(customerKeys.detail(customer.id), customer);
      return queryClient.invalidateQueries({ queryKey: customerKeys.lists() });
    },
  });
}

export function useUpdateCustomer(id: string) {
  const invalidate = useInvalidateCustomer();
  return useMutation({
    mutationFn: (input: Partial<CustomerInput>) => updateCustomer(id, input),
    onSuccess: () => invalidate(id),
  });
}

export function useSetCustomerActive(id: string) {
  const invalidate = useInvalidateCustomer();
  return useMutation({
    mutationFn: (active: boolean) => setCustomerActive(id, active),
    onSuccess: () => invalidate(id),
  });
}

export function useCreateBranch(customerId: string) {
  const invalidate = useInvalidateCustomer();
  return useMutation({
    mutationFn: (input: BranchInput) => createBranch(customerId, input),
    onSuccess: () => invalidate(customerId),
  });
}

export function useUpdateBranch(customerId: string, branchId: string) {
  const invalidate = useInvalidateCustomer();
  return useMutation({
    mutationFn: (input: Partial<BranchInput>) => updateBranch(branchId, input),
    onSuccess: () => invalidate(customerId),
  });
}

export function useSetBranchActive(customerId: string, branchId: string) {
  const invalidate = useInvalidateCustomer();
  return useMutation({
    mutationFn: (active: boolean) => setBranchActive(branchId, active),
    onSuccess: () => invalidate(customerId),
  });
}
