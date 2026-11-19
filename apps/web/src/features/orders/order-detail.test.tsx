import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { errorBody, order, staff } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import { loginAs, renderApp, resetSession } from '@/test/render';

const ONE = '*/api/v1/orders/o-1';
const serve = (o = order()) => server.use(http.get(ONE, () => HttpResponse.json(o)));

describe('order detail', () => {
  beforeEach(() => loginAs());
  afterEach(resetSession);

  it('shows loading, then lines with tax codes, totals, branch address and delivery notes', async () => {
    server.use(
      http.get(ONE, async () => {
        await new Promise((r) => setTimeout(r, 30));
        return HttpResponse.json(order());
      }),
    );
    await renderApp('/orders/o-1');
    expect(await screen.findByRole('status', { name: 'Loading order' })).toBeInTheDocument();
    expect(await screen.findByText('House Espresso — 1 kg — Whole bean')).toBeInTheDocument();
    expect(screen.getByText('Cleaning tablets — tub of 100')).toBeInTheDocument();
    expect(screen.getAllByText('GST-free').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$444.36').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$3.64').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$448.00').length).toBeGreaterThan(0);
    expect(screen.getByText(/1 Crown St/)).toBeInTheDocument();
    expect(screen.getByText(/Back lane after 7am/)).toBeInTheDocument();
  });

  it('404 shows "Order not found"', async () => {
    server.use(
      http.get(ONE, () =>
        HttpResponse.json(errorBody(404, 'ORDER_NOT_FOUND', 'x'), { status: 404 }),
      ),
    );
    await renderApp('/orders/o-1');
    expect(await screen.findByRole('heading', { name: 'Order not found' })).toBeInTheDocument();
  });

  it('shows an error with Retry on 500', async () => {
    let fail = true;
    server.use(
      http.get(ONE, () =>
        fail
          ? HttpResponse.json(errorBody(500, 'X', 'b'), { status: 500 })
          : HttpResponse.json(order()),
      ),
    );
    await renderApp('/orders/o-1');
    expect(await screen.findByText('Something went wrong — try again')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('House Espresso — 1 kg — Whole bean')).toBeInTheDocument();
  });

  describe('buttons come only from allowedActions', () => {
    const cases: [string, Partial<ReturnType<typeof order>['allowedActions']>, string][] = [
      ['Confirm order', { confirm: true }, 'button'],
      ['Mark packed', { pack: true }, 'button'],
      ['Mark dispatched', { dispatch: true }, 'button'],
      ['Mark delivered', { deliver: true }, 'button'],
      ['Cancel order', { cancel: true }, 'button'],
      ['Move back a step', { revert: true }, 'button'],
      ['Delete draft', { delete: true }, 'button'],
      ['Copy order', { copy: true }, 'button'],
      ['Edit order', { editLines: 'full' }, 'link'],
    ];

    it.each(cases)('%s appears only when allowed', async (name, actions, role) => {
      serve(order({ allowedActions: actions }));
      await renderApp('/orders/o-1');
      await screen.findByText('House Espresso — 1 kg — Whole bean');
      expect(screen.getByRole(role, { name })).toBeInTheDocument();
      for (const [other, , otherRole] of cases) {
        if (other !== name)
          expect(screen.queryByRole(otherRole, { name: other })).not.toBeInTheDocument();
      }
    });

    it('shows no action buttons at all when nothing is allowed (delivered, or STAFF past cut-off)', async () => {
      loginAs(staff);
      serve(order({ status: 'DELIVERED' }));
      await renderApp('/orders/o-1');
      await screen.findByText('House Espresso — 1 kg — Whole bean');
      for (const [name, , role] of cases)
        expect(screen.queryByRole(role, { name })).not.toBeInTheDocument();
    });
  });

  describe('transitions', () => {
    it('Confirm posts the current version and shows the new status', async () => {
      let body: unknown;
      let status = 'DRAFT';
      server.use(
        http.get(ONE, () =>
          HttpResponse.json(
            order({ status: status as 'DRAFT', allowedActions: { confirm: status === 'DRAFT' } }),
          ),
        ),
        http.post('*/api/v1/orders/o-1/confirm', async ({ request }) => {
          body = await request.json();
          status = 'CONFIRMED';
          return HttpResponse.json(order({ status: 'CONFIRMED' }));
        }),
      );
      await renderApp('/orders/o-1');
      await userEvent.click(await screen.findByRole('button', { name: 'Confirm order' }));
      await waitFor(() => expect(body).toEqual({ version: 3 }));
      expect((await screen.findAllByText('Confirmed')).length).toBeGreaterThan(0);
    });

    it('VERSION_CONFLICT shows the reload message', async () => {
      serve(order({ allowedActions: { pack: true } }));
      server.use(
        http.post('*/api/v1/orders/o-1/pack', () =>
          HttpResponse.json(
            errorBody(409, 'VERSION_CONFLICT', 'x', {
              meta: { currentVersion: 4, status: 'CONFIRMED' },
            }),
            { status: 409 },
          ),
        ),
      );
      await renderApp('/orders/o-1');
      await userEvent.click(await screen.findByRole('button', { name: 'Mark packed' }));
      expect(await screen.findByText(/changed by someone else — reload/)).toBeInTheDocument();
    });

    it('INVALID_TRANSITION shows the current status', async () => {
      serve(order({ allowedActions: { pack: true } }));
      server.use(
        http.post('*/api/v1/orders/o-1/pack', () =>
          HttpResponse.json(
            errorBody(409, 'INVALID_TRANSITION', 'x', { meta: { status: 'PACKED' } }),
            { status: 409 },
          ),
        ),
      );
      await renderApp('/orders/o-1');
      await userEvent.click(await screen.findByRole('button', { name: 'Mark packed' }));
      expect(await screen.findByText(/This order is now Packed/)).toBeInTheDocument();
    });

    it('403 PAST_CUTOFF on cancel shows the cut-off message', async () => {
      serve(order({ allowedActions: { cancel: true } }));
      server.use(
        http.post('*/api/v1/orders/o-1/cancel', () =>
          HttpResponse.json(errorBody(403, 'FORBIDDEN', 'x', { meta: { reason: 'PAST_CUTOFF' } }), {
            status: 403,
          }),
        ),
      );
      await renderApp('/orders/o-1');
      await userEvent.click(await screen.findByRole('button', { name: 'Cancel order' }));
      const dialog = await screen.findByRole('alertdialog');
      await userEvent.type(within(dialog).getByLabelText(/^Reason for cancelling/), 'Called off');
      await userEvent.click(within(dialog).getByRole('button', { name: /Cancel order/ }));
      expect(await within(dialog).findByText(/cut-off has passed/)).toBeInTheDocument();
    });
  });

  describe('cancel and revert need a reason', () => {
    it('blocks an empty cancel reason, sends nothing, then posts the trimmed reason', async () => {
      let body: unknown;
      let posts = 0;
      serve(order({ allowedActions: { cancel: true } }));
      server.use(
        http.post('*/api/v1/orders/o-1/cancel', async ({ request }) => {
          posts++;
          body = await request.json();
          return HttpResponse.json(
            order({
              status: 'CANCELLED',
              cancelReason: 'Called off',
              cancelledAt: '2026-11-19T06:00:00.000Z',
            }),
          );
        }),
      );
      await renderApp('/orders/o-1');
      await userEvent.click(await screen.findByRole('button', { name: 'Cancel order' }));
      const dialog = await screen.findByRole('alertdialog');
      await userEvent.click(within(dialog).getByRole('button', { name: /Cancel order/ }));
      expect(await within(dialog).findByText(/Reason.* is required/)).toBeInTheDocument();
      expect(posts).toBe(0);
      await userEvent.type(
        within(dialog).getByLabelText(/^Reason for cancelling/),
        '  Called off  ',
      );
      await userEvent.click(within(dialog).getByRole('button', { name: /Cancel order/ }));
      await waitFor(() => expect(posts).toBe(1));
      expect(body).toEqual({ version: 3, reason: 'Called off' });
    });

    it('shows the cancel banner with the reason on a cancelled order', async () => {
      serve(
        order({
          status: 'CANCELLED',
          cancelReason: 'Cafe closed',
          cancelledAt: '2026-11-19T06:00:00.000Z',
        }),
      );
      await renderApp('/orders/o-1');
      expect(await screen.findByText(/Cafe closed/)).toBeInTheDocument();
    });
  });

  it('warns about an inactive customer or branch and an inactive product badge', async () => {
    const o = order();
    o.customer.isActive = false;
    o.branch.isActive = false;
    o.lines[0].productOrderable = false;
    serve(o);
    await renderApp('/orders/o-1');
    expect(await screen.findByText('Inactive product')).toBeInTheDocument();
    expect(screen.getAllByText(/inactive/i).length).toBeGreaterThan(1);
  });

  describe('copy order', () => {
    it('reuses one requestId across retries until a copy succeeds', async () => {
      serve(order({ allowedActions: { copy: true } }));
      const ids: string[] = [];
      let fail = true;
      server.use(
        http.post('*/api/v1/orders/o-1/copy', async ({ request }) => {
          ids.push(((await request.json()) as { requestId: string }).requestId);
          return fail
            ? HttpResponse.json(errorBody(500, 'X', 'boom'), { status: 500 })
            : HttpResponse.json({ order: order({ id: 'o-2' }), skippedLines: [] }, { status: 201 });
        }),
        http.get('*/api/v1/orders/o-2', () => HttpResponse.json(order({ id: 'o-2' }))),
      );
      await renderApp('/orders/o-1');
      await userEvent.click(await screen.findByRole('button', { name: 'Copy order' }));
      await waitFor(() => expect(ids).toHaveLength(1));
      await screen.findByText('Something went wrong — try again');
      fail = false;
      await userEvent.click(screen.getByRole('button', { name: 'Copy order' }));
      await waitFor(() => expect(ids).toHaveLength(2));
      expect(ids[1]).toBe(ids[0]);
      expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  it('the cancel reason is a labelled, required, described field', async () => {
    serve(order({ allowedActions: { cancel: true } }));
    await renderApp('/orders/o-1');
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel order' }));
    const dialog = await screen.findByRole('alertdialog');
    const field = within(dialog).getByLabelText(/^Reason for cancelling/);
    expect(field).toHaveAttribute('aria-required', 'true');
    await userEvent.click(within(dialog).getByRole('button', { name: /Cancel order/ }));
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
    const describedBy = field.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(describedBy.split(' ')[0])).toHaveTextContent(/is required/);
  });

  it('delete returns to the list', async () => {
    serve(order({ status: 'DRAFT', allowedActions: { delete: true } }));
    let version: string | null = null;
    server.use(
      http.delete(ONE, ({ request }) => {
        version = new URL(request.url).searchParams.get('version');
        return new HttpResponse(null, { status: 204 });
      }),
      http.get('*/api/v1/orders', () =>
        HttpResponse.json({ items: [], page: 1, pageSize: 25, totalItems: 0, totalPages: 0 }),
      ),
    );
    const { router } = await renderApp('/orders/o-1');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete draft' }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /Delete/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/orders'));
    expect(version).toBe('3');
  });
});
