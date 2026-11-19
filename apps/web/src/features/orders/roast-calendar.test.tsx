import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { admin, errorBody, manager } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import { loginAs, renderApp, resetSession } from '@/test/render';

const calendar = {
  roastDays: [1, 2, 3, 4, 5],
  deliveryDays: [1, 2, 3, 4, 5],
  businessDays: [1, 2, 3, 4, 5],
  cutoffTime: '12:00',
  cutoffLeadBusinessDays: 1,
  deliveryLagBusinessDays: 1,
  updatedAt: '2026-11-19T05:52:51.000Z',
};
const closures = [{ id: 'cl-1', date: '2026-12-25', description: 'Christmas Day' }];

function serve() {
  server.use(
    http.get('*/api/v1/roast-calendar', () => HttpResponse.json(calendar)),
    http.get('*/api/v1/roast-calendar/closures', () => HttpResponse.json({ items: closures })),
  );
}

describe('roast calendar settings', () => {
  beforeEach(() => loginAs(admin));
  afterEach(resetSession);

  it('is blocked for MANAGER (no settings:roast-calendar) and makes no settings request', async () => {
    loginAs(manager);
    let calls = 0;
    server.use(
      http.get('*/api/v1/roast-calendar', () => {
        calls++;
        return HttpResponse.json(calendar);
      }),
    );
    await renderApp('/settings/roast-calendar');
    expect(await screen.findByText(/You don't have permission to do this/)).toBeInTheDocument();
    expect(calls).toBe(0);
  });

  it('loads the current settings and closures', async () => {
    serve();
    await renderApp('/settings/roast-calendar');
    expect(await screen.findByLabelText(/Cut-off time/)).toHaveValue('12:00');
    expect((await screen.findAllByText(/Christmas Day/))[0]).toBeInTheDocument();
    expect(screen.getByText(/25 Dec 2026/)).toBeInTheDocument();
  });

  it('saves changed settings with PUT and confirms', async () => {
    serve();
    let body: Record<string, unknown> = {};
    server.use(
      http.put('*/api/v1/roast-calendar', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...calendar, ...body });
      }),
    );
    await renderApp('/settings/roast-calendar');
    const cutoff = await screen.findByLabelText(/Cut-off time/);
    await userEvent.clear(cutoff);
    await userEvent.type(cutoff, '10:30');
    await userEvent.click(screen.getByRole('button', { name: 'Save calendar' }));
    expect(await screen.findByText('Roast calendar saved.')).toBeInTheDocument();
    expect(body).toMatchObject({
      cutoffTime: '10:30',
      roastDays: [1, 2, 3, 4, 5],
      cutoffLeadBusinessDays: 1,
    });
  });

  it('shows server field errors on save and keeps the input', async () => {
    serve();
    server.use(
      http.put('*/api/v1/roast-calendar', () =>
        HttpResponse.json(
          errorBody(400, 'VALIDATION_FAILED', 'Some fields need attention', {
            fieldErrors: [
              { field: 'cutoffTime', code: 'matches', message: 'Cut-off must be HH:mm' },
            ],
          }),
          { status: 400 },
        ),
      ),
    );
    await renderApp('/settings/roast-calendar');
    await screen.findByLabelText(/Cut-off time/);
    await userEvent.click(screen.getByRole('button', { name: 'Save calendar' }));
    expect(await screen.findByText('Cut-off must be HH:mm')).toBeInTheDocument();
  });

  it('adds a closure day and shows CLOSURE_EXISTS on the date field', async () => {
    serve();
    let created: unknown;
    server.use(
      http.post('*/api/v1/roast-calendar/closures', async ({ request }) => {
        created = await request.json();
        return HttpResponse.json(errorBody(409, 'CLOSURE_EXISTS', 'x'), { status: 409 });
      }),
    );
    await renderApp('/settings/roast-calendar');
    await screen.findAllByText(/Christmas Day/);
    await userEvent.type(screen.getByLabelText('Date'), '2026-12-25');
    await userEvent.type(screen.getByLabelText('Description'), 'Christmas Day');
    await userEvent.click(screen.getByRole('button', { name: 'Add closure day' }));
    expect(await screen.findByText('That day is already a closure day')).toBeInTheDocument();
    expect(created).toEqual({ date: '2026-12-25', description: 'Christmas Day' });
  });

  it('removes a closure after confirmation', async () => {
    serve();
    let deleted = false;
    server.use(
      http.delete('*/api/v1/roast-calendar/closures/cl-1', () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await renderApp('/settings/roast-calendar');
    await userEvent.click(await screen.findByRole('button', { name: /^Remove/ }));
    const dialog = await screen.findByRole('alertdialog');
    expect(deleted).toBe(false);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove closure day' }));
    await waitFor(() => expect(deleted).toBe(true));
  });

  it('shows an error with Retry when settings fail to load', async () => {
    server.use(
      http.get('*/api/v1/roast-calendar', () =>
        HttpResponse.json(errorBody(500, 'X', 'b'), { status: 500 }),
      ),
      http.get('*/api/v1/roast-calendar/closures', () => HttpResponse.json({ items: [] })),
    );
    await renderApp('/settings/roast-calendar');
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('the sidebar link appears only with the permission', async () => {
    serve();
    await renderApp('/settings/roast-calendar');
    await screen.findByLabelText(/Cut-off time/);
    expect(screen.getAllByRole('link', { name: 'Roast calendar' }).length).toBeGreaterThan(0);
  });
});
