import { http } from '@/shared/api/http';
import type {
  ClosureDay,
  CopyOrderResult,
  CreateOrderInput,
  ListOrdersParams,
  Order,
  OrderListItem,
  Page,
  RoastCalendar,
  RoastCalendarInput,
  RoastSummary,
  ScheduleSuggestion,
  UpdateOrderInput,
} from './types';

const id = encodeURIComponent;

export async function listOrders(params: ListOrdersParams): Promise<Page<OrderListItem>> {
  const { data } = await http.get<Page<OrderListItem>>('/orders', { params });
  return data;
}

export async function getOrder(orderId: string): Promise<Order> {
  const { data } = await http.get<Order>(`/orders/${id(orderId)}`);
  return data;
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const { data } = await http.post<Order>('/orders', input);
  return data;
}

export async function updateOrder(orderId: string, input: UpdateOrderInput): Promise<Order> {
  const { data } = await http.patch<Order>(`/orders/${id(orderId)}`, input);
  return data;
}

export type OrderTransition = 'confirm' | 'pack' | 'dispatch' | 'deliver' | 'cancel' | 'revert';

export async function transitionOrder(
  orderId: string,
  action: OrderTransition,
  body: { version: number; reason?: string },
): Promise<Order> {
  const { data } = await http.post<Order>(`/orders/${id(orderId)}/${action}`, body);
  return data;
}

export async function copyOrder(orderId: string, requestId: string): Promise<CopyOrderResult> {
  const { data } = await http.post<CopyOrderResult>(`/orders/${id(orderId)}/copy`, { requestId });
  return data;
}

export async function deleteOrder(orderId: string, version: number): Promise<void> {
  await http.delete(`/orders/${id(orderId)}`, { params: { version } });
}

export async function getSchedule(deliveryDate?: string): Promise<ScheduleSuggestion> {
  const { data } = await http.get<ScheduleSuggestion>('/orders/schedule', {
    params: deliveryDate ? { deliveryDate } : undefined,
  });
  return data;
}

export async function getRoastSummary(roastDate: string): Promise<RoastSummary> {
  const { data } = await http.get<RoastSummary>('/orders/roast-summary', { params: { roastDate } });
  return data;
}

export async function getRoastCalendar(): Promise<RoastCalendar> {
  const { data } = await http.get<RoastCalendar>('/roast-calendar');
  return data;
}

export async function putRoastCalendar(input: RoastCalendarInput): Promise<RoastCalendar> {
  const { data } = await http.put<RoastCalendar>('/roast-calendar', input);
  return data;
}

export async function listClosures(from?: string): Promise<ClosureDay[]> {
  const { data } = await http.get<{ items: ClosureDay[] }>('/roast-calendar/closures', {
    params: from ? { from } : undefined,
  });
  return data.items;
}

export async function createClosure(input: {
  date: string;
  description: string;
}): Promise<ClosureDay> {
  const { data } = await http.post<ClosureDay>('/roast-calendar/closures', input);
  return data;
}

export async function deleteClosure(closureId: string): Promise<void> {
  await http.delete(`/roast-calendar/closures/${id(closureId)}`);
}
