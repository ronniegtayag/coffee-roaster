import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { errorBody, order } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import { loginAs, renderApp, resetSession } from '@/test/render';

const ONE = '*/api/v1/orders/o-1';
const editable = {
  editLines: 'full' as const,
  editRoastDate: true,
  editDeliveryDate: true,
  editNotes: true,
};

describe('edit order', () => {
  beforeEach(() => {
    loginAs();
    server.use(http.get('*/api/v1/products/orderable', () => HttpResponse.json({ items: [] })));
  });
  afterEach(resetSession);

  it('sends only the changed fields with the version the form was loaded with', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.get(ONE, () => HttpResponse.json(order({ status: 'DRAFT', allowedActions: editable }))),
      http.patch(ONE, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          order({ status: 'DRAFT', version: 4, notes: 'Side door', allowedActions: editable }),
        );
      }),
    );
    await renderApp('/orders/o-1/edit');
    const notes = await screen.findByLabelText('Order notes');
    await userEvent.type(notes, 'Side door');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(body.notes).toBe('Side door'));
    expect(body.version).toBe(3);
    expect(body).not.toHaveProperty('lines');
    expect(body).not.toHaveProperty('deliveryDate');
  });

  it('a background refetch with a newer version keeps the typed edits, shows a notice, and Reload replaces the form', async () => {
    let version = 3;
    let notesOnServer: string | null = null;
    server.use(
      http.get(ONE, () =>
        HttpResponse.json(
          order({ status: 'DRAFT', version, notes: notesOnServer, allowedActions: editable }),
        ),
      ),
    );
    await renderApp('/orders/o-1/edit');
    await userEvent.type(await screen.findByLabelText('Order notes'), 'My unsaved note');
    expect(
      screen.queryByText(/changed by someone else since you opened it/),
    ).not.toBeInTheDocument();

    version = 4;
    notesOnServer = 'Changed by someone else';
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(
      await screen.findByText(/changed by someone else since you opened it/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Order notes')).toHaveValue('My unsaved note');

    await userEvent.click(screen.getByRole('button', { name: 'Reload order' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Order notes')).toHaveValue('Changed by someone else'),
    );
    expect(
      screen.queryByText(/changed by someone else since you opened it/),
    ).not.toBeInTheDocument();
  });

  it('a refetch with the same version shows no notice', async () => {
    server.use(
      http.get(ONE, () => HttpResponse.json(order({ status: 'DRAFT', allowedActions: editable }))),
    );
    await renderApp('/orders/o-1/edit');
    await userEvent.type(await screen.findByLabelText('Order notes'), 'x');
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(
      screen.queryByText(/changed by someone else since you opened it/),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Order notes')).toHaveValue('x');
  });

  it('"Reload order" after VERSION_CONFLICT refetches and restarts the form from the server copy', async () => {
    let version = 3;
    let notesOnServer: string | null = null;
    server.use(
      http.get(ONE, () =>
        HttpResponse.json(
          order({ status: 'DRAFT', version, notes: notesOnServer, allowedActions: editable }),
        ),
      ),
      http.patch(ONE, () => {
        version = 4;
        notesOnServer = 'Changed by someone else';
        return HttpResponse.json(
          errorBody(409, 'VERSION_CONFLICT', 'x', { meta: { currentVersion: 4, status: 'DRAFT' } }),
          { status: 409 },
        );
      }),
    );
    await renderApp('/orders/o-1/edit');
    await userEvent.type(await screen.findByLabelText('Order notes'), 'Mine');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Reload order' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Order notes')).toHaveValue('Changed by someone else'),
    );
    expect(screen.queryByRole('button', { name: 'Reload order' })).not.toBeInTheDocument();
  });

  it('VERSION_CONFLICT on save keeps the input and offers "Reload order"', async () => {
    server.use(
      http.get(ONE, () => HttpResponse.json(order({ status: 'DRAFT', allowedActions: editable }))),
      http.patch(ONE, () =>
        HttpResponse.json(
          errorBody(409, 'VERSION_CONFLICT', 'x', { meta: { currentVersion: 4, status: 'DRAFT' } }),
          { status: 409 },
        ),
      ),
    );
    await renderApp('/orders/o-1/edit');
    await userEvent.type(await screen.findByLabelText('Order notes'), 'Keep me');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('button', { name: 'Reload order' })).toBeInTheDocument();
    expect(screen.getByLabelText('Order notes')).toHaveValue('Keep me');
  });

  it('shows "can\'t be changed" when nothing is editable', async () => {
    server.use(http.get(ONE, () => HttpResponse.json(order({ status: 'DELIVERED' }))));
    await renderApp('/orders/o-1/edit');
    expect(
      await screen.findByText(/can't be changed in its current status or by your role/),
    ).toBeInTheDocument();
  });

  it('short supply: reduce-only lines cap the quantity at the original and require a reason', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.get(ONE, () =>
        HttpResponse.json(
          order({ status: 'PACKED', allowedActions: { editLines: 'reduceOnly', editNotes: true } }),
        ),
      ),
      http.patch(ONE, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(order({ status: 'PACKED', version: 4 }));
      }),
    );
    await renderApp('/orders/o-1/edit');
    const qty = await screen.findByLabelText('Quantity for House Espresso — 1 kg — Whole bean');
    expect(qty).toHaveAttribute('max', '12');
    expect(screen.queryByRole('button', { name: 'Add line' })).not.toBeInTheDocument();
    await userEvent.clear(qty);
    await userEvent.type(qty, '10');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/Add a short note/)).toBeInTheDocument();
    expect(body).toEqual({});
    await userEvent.type(screen.getByLabelText(/^Reason for the change/), 'Short of beans');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(body.reason).toBe('Short of beans'));
  });
});
