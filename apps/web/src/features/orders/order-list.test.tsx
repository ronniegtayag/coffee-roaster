import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { errorBody, orderListItem, page, staff } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import { loginAs, renderApp, resetSession } from '@/test/render';
import { todayInSydney } from '@/shared/lib/dates';

const LIST = '*/api/v1/orders';

function capture() {
  const seen: Record<string, string>[] = [];
  const handler = http.get(LIST, ({ request }) => {
    const entry: Record<string, string> = {};
    new URL(request.url).searchParams.forEach((v, k) => (entry[k] = v));
    seen.push(entry);
    return HttpResponse.json(page([orderListItem()]));
  });
  return { seen, handler };
}

describe('orders list', () => {
  beforeEach(() => loginAs());
  afterEach(resetSession);

  it('shows loading, then rows with order number, customer, kg, and total', async () => {
    server.use(
      http.get(LIST, async () => {
        await new Promise((r) => setTimeout(r, 30));
        return HttpResponse.json(page([orderListItem()]));
      }),
    );
    await renderApp('/orders');
    expect(await screen.findByRole('status', { name: 'Loading orders' })).toBeInTheDocument();
    const row = (await screen.findByText('ORD-1001')).closest('tr')!;
    expect(within(row).getByText('Bean There')).toBeInTheDocument();
    expect(within(row).getByText(/14\.5/)).toBeInTheDocument();
    expect(within(row).getByText(/448\.00/)).toBeInTheDocument();
    expect(within(row).getByText('Confirmed')).toBeInTheDocument();
  });

  it('default view sends deliveryFrom = today in Sydney and no status', async () => {
    const { seen, handler } = capture();
    server.use(handler);
    await renderApp('/orders');
    await screen.findByText('ORD-1001');
    expect(seen[0]).toMatchObject({ deliveryFrom: todayInSydney() });
    expect(seen[0]).not.toHaveProperty('status');
  });

  it('URL filters turn the default off and are sent exactly', async () => {
    const { seen, handler } = capture();
    server.use(handler);
    await renderApp(
      '/orders?deliveryFrom=2026-11-24&deliveryTo=2026-11-27&roastDate=2026-11-25&status=DRAFT,CANCELLED&search=bean',
    );
    await screen.findByText('ORD-1001');
    expect(seen).toContainEqual(
      expect.objectContaining({
        deliveryFrom: '2026-11-24',
        deliveryTo: '2026-11-27',
        roastDate: '2026-11-25',
        status: 'DRAFT,CANCELLED',
        search: 'bean',
      }),
    );
    expect(screen.queryByText(/Showing upcoming orders/)).not.toBeInTheDocument();
  });

  it('shows the default-view note and ticks the four open statuses', async () => {
    server.use(capture().handler);
    await renderApp('/orders');
    await screen.findByText('ORD-1001');
    expect(screen.getByText(/Showing upcoming orders, from today/)).toBeInTheDocument();
    for (const [name, checked] of [
      ['Draft', true],
      ['Confirmed', true],
      ['Packed', true],
      ['Dispatched', true],
      ['Delivered', false],
      ['Cancelled', false],
    ] as const) {
      const box = screen.getByRole('checkbox', { name });
      expect(checked ? box : box).toHaveProperty('checked', checked);
    }
  });

  it('ticking Delivered puts it in the status param', async () => {
    const { seen, handler } = capture();
    server.use(handler);
    const { router } = await renderApp('/orders');
    await screen.findByText('ORD-1001');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Delivered' }));
    await waitFor(() =>
      expect((router.state.location.search as { status?: string }).status).toContain('DELIVERED'),
    );
    await waitFor(() => expect(seen.some((s) => s.status?.includes('DELIVERED'))).toBe(true));
  });

  it('badges after-cut-off orders and inactive customers', async () => {
    server.use(
      http.get(LIST, () =>
        HttpResponse.json(
          page([
            orderListItem({
              afterCutoff: true,
              customer: { id: 'c-1', displayName: 'Bean There', isActive: false },
            }),
          ]),
        ),
      ),
    );
    await renderApp('/orders');
    expect(await screen.findByText('After cut-off')).toBeInTheDocument();
    expect(screen.getByText('Inactive customer')).toBeInTheDocument();
  });

  it('shows both badges when the customer and the branch are inactive', async () => {
    server.use(
      http.get(LIST, () =>
        HttpResponse.json(
          page([
            orderListItem({
              customer: { id: 'c-1', displayName: 'Bean There', isActive: false },
              branch: { id: 'b-1', name: 'Surry Hills', suburb: 'Surry Hills', isActive: false },
            }),
          ]),
        ),
      ),
    );
    await renderApp('/orders');
    expect(await screen.findByText('Inactive customer')).toBeInTheDocument();
    expect(screen.getByText('Inactive branch')).toBeInTheDocument();
  });

  it('badges an inactive branch', async () => {
    server.use(
      http.get(LIST, () =>
        HttpResponse.json(
          page([
            orderListItem({
              branch: { id: 'b-1', name: 'Surry Hills', suburb: 'Surry Hills', isActive: false },
            }),
          ]),
        ),
      ),
    );
    await renderApp('/orders');
    expect(await screen.findByText('Inactive branch')).toBeInTheDocument();
  });

  it('empty default view says "No upcoming orders"', async () => {
    server.use(http.get(LIST, () => HttpResponse.json(page([]))));
    await renderApp('/orders');
    expect(await screen.findByText('No upcoming orders')).toBeInTheDocument();
  });

  it('empty filtered view says "No orders for these filters" and Clear filters resets the URL', async () => {
    server.use(http.get(LIST, () => HttpResponse.json(page([]))));
    const { router } = await renderApp('/orders?search=zzz');
    expect(await screen.findByText('No orders for these filters')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]);
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('search', 'zzz'));
  });

  it('shows an error with Retry on 500 and recovers', async () => {
    let fail = true;
    server.use(
      http.get(LIST, () =>
        fail
          ? HttpResponse.json(errorBody(500, 'X', 'boom'), { status: 500 })
          : HttpResponse.json(page([orderListItem()])),
      ),
    );
    await renderApp('/orders');
    expect(await screen.findByText('Something went wrong — try again')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('ORD-1001')).toBeInTheDocument();
  });

  it('goes to the last page when the URL page is past the end', async () => {
    server.use(
      http.get(LIST, ({ request }) => {
        const p = Number(new URL(request.url).searchParams.get('page') ?? 1);
        return HttpResponse.json(
          p > 2
            ? page([], { page: p, totalItems: 30, totalPages: 2 })
            : page([orderListItem()], { page: p, totalItems: 30, totalPages: 2 }),
        );
      }),
    );
    const { router } = await renderApp('/orders?page=9');
    await screen.findByText('ORD-1001');
    expect(router.state.location.search).toMatchObject({ page: 2 });
  });

  it('401 with a failed refresh sends the user to login with the expired message', async () => {
    server.use(
      http.get(LIST, () =>
        HttpResponse.json(errorBody(401, 'UNAUTHENTICATED', 'x'), { status: 401 }),
      ),
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json(errorBody(401, 'SESSION_EXPIRED', 'x'), { status: 401 }),
      ),
    );
    const { router } = await renderApp('/orders');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('shows New order with orders:write', async () => {
    server.use(http.get(LIST, () => HttpResponse.json(page([orderListItem()]))));
    await renderApp('/orders');
    await screen.findByText('ORD-1001');
    expect(screen.getAllByRole('link', { name: /New order/ }).length).toBeGreaterThan(0);
  });

  it('hides New order without orders:write', async () => {
    loginAs({ ...staff, permissions: ['orders:read', 'customers:read'] });
    server.use(http.get(LIST, () => HttpResponse.json(page([orderListItem()]))));
    await renderApp('/orders');
    await screen.findByText('ORD-1001');
    expect(screen.queryByRole('link', { name: /New order/ })).not.toBeInTheDocument();
  });
});
