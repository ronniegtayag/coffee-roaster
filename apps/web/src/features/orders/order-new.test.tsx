import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { branch, customer, errorBody, order, product, staff } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import { loginAs, renderApp, resetSession } from '@/test/render';

const schedule = {
  roastDate: '2026-11-25',
  deliveryDate: '2026-11-26',
  cutoff: { date: '2026-11-24', time: '12:00' },
  onSchedule: true,
  reasons: [],
};
const espresso = product();
const tablets = product({
  id: 'p-9',
  sku: 'CT-100',
  kind: 'OTHER',
  displayName: 'Cleaning tablets — tub of 100',
  name: 'Cleaning tablets',
  coffee: null,
  bagSizeGrams: null,
  grind: null,
  listPriceExGst: '18.18',
  taxCode: 'GST',
});

function serve(opts: { products?: unknown[]; sched?: object } = {}) {
  server.use(
    http.get('*/api/v1/customers/c-1', () => HttpResponse.json(customer({ branches: [branch()] }))),
    http.get('*/api/v1/products/orderable', () =>
      HttpResponse.json({ items: opts.products ?? [espresso, tablets] }),
    ),
    http.get('*/api/v1/orders/schedule', () => HttpResponse.json(opts.sched ?? schedule)),
  );
}

const URL_NEW = '/orders/new?customerId=c-1&branchId=b-1';

async function addLine(name: string, qty: string) {
  await userEvent.selectOptions(
    await screen.findByLabelText('Product'),
    screen.getByRole('option', { name: new RegExp(name) }),
  );
  const q = screen.getByLabelText('Quantity');
  await userEvent.clear(q);
  await userEvent.type(q, qty);
  await userEvent.click(screen.getByRole('button', { name: 'Add line' }));
}

describe('new order', () => {
  beforeEach(() => loginAs());
  afterEach(resetSession);

  it('prefills the dates from /orders/schedule and shows the cut-off', async () => {
    serve();
    await renderApp(URL_NEW);
    expect(
      await screen.findByLabelText(/^Delivery date/, undefined, { timeout: 4000 }),
    ).toHaveValue('2026-11-26');
    expect(screen.getByLabelText(/^Roast date/)).toHaveValue('2026-11-25');
    expect(screen.getByText(/Cut-off: .*24 Nov.*12:00 pm/)).toBeInTheDocument();
  });

  it('shows the live estimate for the mixed example: 444.36 / 3.64 / 448.00', async () => {
    serve();
    await renderApp(URL_NEW);
    await addLine('House Espresso', '12');
    await addLine('Cleaning tablets', '2');
    const est = await screen.findByLabelText('Estimated totals');
    expect(within(est).getByText('Estimate')).toBeInTheDocument();
    expect(within(est).getByText('$444.36')).toBeInTheDocument();
    expect(within(est).getByText('$3.64')).toBeInTheDocument();
    expect(within(est).getByText('$448.00')).toBeInTheDocument();
  });

  it('estimates GST per line, half-up: 3 x 12.35 -> $3.71', async () => {
    serve({
      products: [
        product({
          id: 'p-2',
          displayName: 'Widget',
          listPriceExGst: '12.35',
          taxCode: 'GST',
          coffee: null,
          bagSizeGrams: null,
          grind: null,
          kind: 'OTHER',
          name: 'Widget',
        }),
      ],
    });
    await renderApp(URL_NEW);
    await addLine('Widget', '3');
    const est = await screen.findByLabelText('Estimated totals');
    expect(within(est).getByText('$3.71')).toBeInTheDocument();
    expect(within(est).getByText('$40.76')).toBeInTheDocument();
  });

  it('posts requestId, branch, dates and lines with the expected price and tax code', async () => {
    serve();
    let body: Record<string, unknown> = {};
    server.use(
      http.post('*/api/v1/orders', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(order({ id: 'o-new' }), { status: 201 });
      }),
      http.get('*/api/v1/orders/o-new', () => HttpResponse.json(order({ id: 'o-new' }))),
    );
    const { router } = await renderApp(URL_NEW);
    await addLine('House Espresso', '12');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/orders/o-new'));
    expect(body).toMatchObject({
      branchId: 'b-1',
      deliveryDate: '2026-11-26',
      roastDate: '2026-11-25',
      lines: [
        {
          productId: 'p-1',
          quantity: 12,
          expectedUnitPriceExGst: '34.00',
          expectedTaxCode: 'GST_FREE',
        },
      ],
    });
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('reuses the same requestId when saving is retried after an error', async () => {
    serve();
    const ids: unknown[] = [];
    let fail = true;
    server.use(
      http.post('*/api/v1/orders', async ({ request }) => {
        ids.push(((await request.json()) as { requestId: string }).requestId);
        return fail
          ? HttpResponse.json(errorBody(500, 'X', 'boom'), { status: 500 })
          : HttpResponse.json(order({ id: 'o-new' }), { status: 201 });
      }),
      http.get('*/api/v1/orders/o-new', () => HttpResponse.json(order({ id: 'o-new' }))),
    );
    await renderApp(URL_NEW);
    await addLine('House Espresso', '1');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Something went wrong — try again');
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(ids).toHaveLength(2));
    expect(ids[0]).toBe(ids[1]);
  });

  it('a double click on Save sends one request', async () => {
    serve();
    let posts = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    server.use(
      http.post('*/api/v1/orders', async () => {
        posts++;
        await gate;
        return HttpResponse.json(order({ id: 'o-new' }), { status: 201 });
      }),
      http.get('*/api/v1/orders/o-new', () => HttpResponse.json(order({ id: 'o-new' }))),
    );
    await renderApp(URL_NEW);
    await addLine('House Espresso', '1');
    await userEvent.dblClick(screen.getByRole('button', { name: 'Save draft' }));
    release();
    await waitFor(() => expect(posts).toBe(1));
  });

  it('PRICE_CHANGED saves nothing and shows old and new prices', async () => {
    serve();
    server.use(
      http.post('*/api/v1/orders', () =>
        HttpResponse.json(
          errorBody(409, 'PRICE_CHANGED', 'x', {
            meta: {
              lines: [
                {
                  productId: 'p-1',
                  description: 'House Espresso — 1 kg — Whole bean',
                  expected: { unitPriceExGst: '34.00', taxCode: 'GST_FREE' },
                  current: { unitPriceExGst: '36.00', taxCode: 'GST_FREE' },
                },
              ],
            },
          }),
          { status: 409 },
        ),
      ),
    );
    const { router } = await renderApp(URL_NEW);
    await addLine('House Espresso', '1');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(
      await screen.findByText(/A price changed while you were editing. Nothing was saved./),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/36\.00/).length).toBeGreaterThan(0);
    expect(router.state.location.pathname).toBe('/orders/new');
  });

  it('PRODUCT_UNAVAILABLE flags the line', async () => {
    serve();
    server.use(
      http.post('*/api/v1/orders', () =>
        HttpResponse.json(
          errorBody(409, 'PRODUCT_UNAVAILABLE', 'x', {
            meta: {
              lines: [
                {
                  productId: 'p-1',
                  description: 'House Espresso — 1 kg — Whole bean',
                  reason: 'PRODUCT_INACTIVE',
                },
              ],
            },
          }),
          { status: 409 },
        ),
      ),
    );
    await renderApp(URL_NEW);
    await addLine('House Espresso', '1');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText(/No longer available — remove it/)).toBeInTheDocument();
  });

  it('SCHEDULE_OVERRIDE_REQUIRED shows the cut-off message and "Use suggested dates" re-dates the form', async () => {
    serve();
    server.use(
      http.post('*/api/v1/orders', () =>
        HttpResponse.json(
          errorBody(409, 'SCHEDULE_OVERRIDE_REQUIRED', 'x', {
            meta: {
              reasons: ['CUTOFF_PASSED'],
              cutoff: { date: '2026-11-24', time: '12:00' },
              suggestion: { roastDate: '2026-11-26', deliveryDate: '2026-11-27' },
            },
          }),
          { status: 409 },
        ),
      ),
    );
    await renderApp(URL_NEW);
    await addLine('House Espresso', '1');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(
      (await screen.findAllByText(/cut-off for .* has passed — ask a manager/i)).length,
    ).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Use suggested dates' }));
    expect(screen.getByLabelText(/^Roast date/)).toHaveValue('2026-11-26');
    expect(screen.getByLabelText(/^Delivery date/)).toHaveValue('2026-11-27');
  });

  it('shows the off-schedule warning from the schedule endpoint', async () => {
    serve({ sched: { ...schedule, onSchedule: false, reasons: ['CUTOFF_PASSED'] } });
    await renderApp(URL_NEW);
    expect(await screen.findByText(/These dates are off schedule/)).toBeInTheDocument();
  });

  it('changing the delivery date asks the API for a roast date', async () => {
    serve();
    const asked: (string | null)[] = [];
    server.use(
      http.get('*/api/v1/orders/schedule', ({ request }) => {
        asked.push(new URL(request.url).searchParams.get('deliveryDate'));
        return HttpResponse.json({
          ...schedule,
          roastDate: '2026-11-26',
          deliveryDate: '2026-11-27',
        });
      }),
    );
    await renderApp(URL_NEW);
    const delivery = await screen.findByLabelText(/^Delivery date/, undefined, { timeout: 4000 });
    await userEvent.clear(delivery);
    await userEvent.type(delivery, '2026-11-27');
    await waitFor(() => expect(asked).toContain('2026-11-27'));
    await waitFor(() => expect(screen.getByLabelText(/^Roast date/)).toHaveValue('2026-11-26'));
  });

  it('warns when the delivery date is more than 90 days away', async () => {
    serve({ sched: { ...schedule, roastDate: '2027-03-30', deliveryDate: '2027-03-31' } });
    await renderApp(URL_NEW);
    expect(await screen.findByText(/more than 90 days away/)).toBeInTheDocument();
  });

  it('shows "Add products first" when nothing is orderable', async () => {
    serve({ products: [] });
    await renderApp(URL_NEW);
    expect(await screen.findByText(/Add products first/)).toBeInTheDocument();
  });

  it('shows an error with Retry when the schedule cannot load', async () => {
    serve();
    server.use(
      http.get('*/api/v1/orders/schedule', () =>
        HttpResponse.json(errorBody(500, 'X', 'b'), { status: 500 }),
      ),
    );
    await renderApp(URL_NEW);
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('ignores a slow schedule response for a delivery date the user has since changed', async () => {
    serve();
    let releaseSlow!: () => void;
    const gate = new Promise<void>((r) => (releaseSlow = r));
    server.use(
      http.get('*/api/v1/orders/schedule', async ({ request }) => {
        const d = new URL(request.url).searchParams.get('deliveryDate');
        if (d === '2026-11-27') {
          await gate;
          return HttpResponse.json({
            ...schedule,
            roastDate: '2026-11-26',
            deliveryDate: '2026-11-27',
          });
        }
        if (d === '2026-12-01')
          return HttpResponse.json({
            ...schedule,
            roastDate: '2026-11-30',
            deliveryDate: '2026-12-01',
          });
        return HttpResponse.json(schedule);
      }),
    );
    await renderApp(URL_NEW);
    const delivery = await screen.findByLabelText(/^Delivery date/, undefined, { timeout: 4000 });
    await userEvent.clear(delivery);
    await userEvent.type(delivery, '2026-11-27');
    await userEvent.clear(delivery);
    await userEvent.type(delivery, '2026-12-01');
    await waitFor(() => expect(screen.getByLabelText(/^Roast date/)).toHaveValue('2026-11-30'));
    releaseSlow();
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.getByLabelText(/^Roast date/)).toHaveValue('2026-11-30');
    expect(screen.getByLabelText(/^Delivery date/)).toHaveValue('2026-12-01');
  });

  it('a schedule error for a superseded delivery date is not shown', async () => {
    serve();
    let releaseSlow!: () => void;
    const gate = new Promise<void>((r) => (releaseSlow = r));
    server.use(
      http.get('*/api/v1/orders/schedule', async ({ request }) => {
        const d = new URL(request.url).searchParams.get('deliveryDate');
        if (d === '2026-11-27') {
          await gate;
          return HttpResponse.json(errorBody(500, 'X', 'b'), { status: 500 });
        }
        if (d === '2026-12-01')
          return HttpResponse.json({
            ...schedule,
            roastDate: '2026-11-30',
            deliveryDate: '2026-12-01',
          });
        return HttpResponse.json(schedule);
      }),
    );
    await renderApp(URL_NEW);
    const delivery = await screen.findByLabelText(/^Delivery date/, undefined, { timeout: 4000 });
    await userEvent.clear(delivery);
    await userEvent.type(delivery, '2026-11-27');
    await userEvent.clear(delivery);
    await userEvent.type(delivery, '2026-12-01');
    await waitFor(() => expect(screen.getByLabelText(/^Roast date/)).toHaveValue('2026-11-30'));
    releaseSlow();
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('off-schedule banner lists the reasons unless the sole reason is CUTOFF_PASSED', async () => {
    serve();
    server.use(
      http.post('*/api/v1/orders', () =>
        HttpResponse.json(
          errorBody(409, 'SCHEDULE_OVERRIDE_REQUIRED', 'x', {
            meta: {
              reasons: ['NOT_A_DELIVERY_DAY'],
              cutoff: { date: '2026-11-24', time: '12:00' },
              suggestion: { roastDate: '2026-11-26', deliveryDate: '2026-11-27' },
            },
          }),
          { status: 409 },
        ),
      ),
    );
    await renderApp(URL_NEW);
    await addLine('House Espresso', '1');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect((await screen.findAllByText(/These dates are off schedule \(/)).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText(/Cut-off for .* has passed/)).not.toBeInTheDocument();
  });

  it('is blocked without orders:write', async () => {
    loginAs({ ...staff, permissions: ['orders:read'] });
    serve();
    await renderApp(URL_NEW);
    expect(await screen.findByText("You don't have permission to do this")).toBeInTheDocument();
  });

  it('lines reject quantity 0 and over 999 client-side and Remove removes a line', async () => {
    serve();
    await renderApp(URL_NEW);
    await addLine('House Espresso', '0');
    expect(screen.queryByLabelText(/Quantity for House Espresso/)).not.toBeInTheDocument();
    await addLine('House Espresso', '1000');
    expect(screen.queryByLabelText(/Quantity for House Espresso/)).not.toBeInTheDocument();
    await addLine('House Espresso', '2');
    const row = await screen.findByLabelText('Quantity for House Espresso — 1 kg — Whole bean');
    expect(row).toHaveValue(2);
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove House Espresso — 1 kg — Whole bean' }),
    );
    expect(screen.queryByLabelText(/Quantity for House Espresso/)).not.toBeInTheDocument();
  });
});
