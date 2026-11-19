import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  copyOrder,
  createClosure,
  createOrder,
  deleteClosure,
  deleteOrder,
  getOrder,
  getRoastCalendar,
  getRoastSummary,
  getSchedule,
  listClosures,
  listOrders,
  putRoastCalendar,
  transitionOrder,
  updateOrder,
  type OrderTransition,
} from './api';
import type {
  CreateOrderInput,
  ListOrdersParams,
  RoastCalendarInput,
  UpdateOrderInput,
} from './types';

export const orderKeys = {
  all: ['orders'] as const,
  lists: () => [...orderKeys.all, 'list'] as const,
  list: (params: ListOrdersParams) => [...orderKeys.lists(), params] as const,
  detail: (id: string) => [...orderKeys.all, 'detail', id] as const,
  schedule: (deliveryDate?: string) =>
    [...orderKeys.all, 'schedule', deliveryDate ?? null] as const,
  roastSummary: (date: string) => [...orderKeys.all, 'roast-summary', date] as const,
};

export const roastCalendarKeys = {
  all: ['roast-calendar'] as const,
  closures: (from?: string) => [...roastCalendarKeys.all, 'closures', from ?? null] as const,
};

export const orderListQuery = (params: ListOrdersParams) =>
  queryOptions({
    queryKey: orderKeys.list(params),
    queryFn: () => listOrders(params),
    placeholderData: keepPreviousData,
  });

export const orderDetailQuery = (id: string) =>
  queryOptions({ queryKey: orderKeys.detail(id), queryFn: () => getOrder(id) });

/** Suggested dates. With a delivery date, the roast date is suggested from it. Never cached for long: it depends on "now". */
export const scheduleQuery = (deliveryDate?: string) =>
  queryOptions({
    queryKey: orderKeys.schedule(deliveryDate),
    queryFn: () => getSchedule(deliveryDate),
    staleTime: 0,
    gcTime: 0,
  });

export const roastSummaryQuery = (roastDate: string) =>
  queryOptions({
    queryKey: orderKeys.roastSummary(roastDate),
    queryFn: () => getRoastSummary(roastDate),
  });

export const roastCalendarQuery = () =>
  queryOptions({ queryKey: roastCalendarKeys.all, queryFn: getRoastCalendar });

export const closuresQuery = (from?: string) =>
  queryOptions({ queryKey: roastCalendarKeys.closures(from), queryFn: () => listClosures(from) });

/** Order writes refresh that order and every list, also after a failure: a stale version is the usual cause. */
function useInvalidateOrder() {
  const queryClient = useQueryClient();
  return (id: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(id) }),
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() }),
    ]);
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOrderInput) => createOrder(input),
    onSuccess: (order) => {
      queryClient.setQueryData(orderKeys.detail(order.id), order);
      return queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
    },
  });
}

export function useUpdateOrder(id: string) {
  const invalidate = useInvalidateOrder();
  return useMutation({
    mutationFn: (input: UpdateOrderInput) => updateOrder(id, input),
    onSuccess: () => invalidate(id),
  });
}

export function useTransitionOrder(id: string) {
  const invalidate = useInvalidateOrder();
  return useMutation({
    mutationFn: (args: { action: OrderTransition; version: number; reason?: string }) =>
      transitionOrder(id, args.action, { version: args.version, reason: args.reason }),
    onSettled: () => invalidate(id),
  });
}

export function useCopyOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => copyOrder(id, requestId),
    onSuccess: ({ order }) => {
      queryClient.setQueryData(orderKeys.detail(order.id), order);
      return queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
    },
  });
}

export function useDeleteOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (version: number) => deleteOrder(id, version),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orderKeys.lists() }),
    onError: () => queryClient.invalidateQueries({ queryKey: orderKeys.detail(id) }),
  });
}

export function useSaveRoastCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RoastCalendarInput) => putRoastCalendar(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roastCalendarKeys.all }),
  });
}

export function useCreateClosure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { date: string; description: string }) => createClosure(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roastCalendarKeys.all }),
  });
}

export function useDeleteClosure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteClosure(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roastCalendarKeys.all }),
  });
}
