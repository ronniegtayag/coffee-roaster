import { http } from '@/shared/api/http';
import type {
  Branch,
  BranchInput,
  Customer,
  CustomerInput,
  CustomerListFilters,
  CustomerListItem,
  Page,
} from './types';

export async function listCustomers(filters: CustomerListFilters): Promise<Page<CustomerListItem>> {
  const { data } = await http.get<Page<CustomerListItem>>('/customers', { params: filters });
  return data;
}

export async function getCustomer(id: string): Promise<Customer> {
  const { data } = await http.get<Customer>(`/customers/${encodeURIComponent(id)}`);
  return data;
}

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  const { data } = await http.post<Customer>('/customers', input);
  return data;
}

export async function updateCustomer(id: string, input: Partial<CustomerInput>): Promise<Customer> {
  const { data } = await http.patch<Customer>(`/customers/${encodeURIComponent(id)}`, input);
  return data;
}

export async function setCustomerActive(id: string, active: boolean): Promise<Customer> {
  const action = active ? 'reactivate' : 'deactivate';
  const { data } = await http.post<Customer>(`/customers/${encodeURIComponent(id)}/${action}`);
  return data;
}

export async function createBranch(customerId: string, input: BranchInput): Promise<Branch> {
  const { data } = await http.post<Branch>(
    `/customers/${encodeURIComponent(customerId)}/branches`,
    input,
  );
  return data;
}

export async function updateBranch(id: string, input: Partial<BranchInput>): Promise<Branch> {
  const { data } = await http.patch<Branch>(`/branches/${encodeURIComponent(id)}`, input);
  return data;
}

export async function setBranchActive(id: string, active: boolean): Promise<Branch> {
  const action = active ? 'reactivate' : 'deactivate';
  const { data } = await http.post<Branch>(`/branches/${encodeURIComponent(id)}/${action}`);
  return data;
}
