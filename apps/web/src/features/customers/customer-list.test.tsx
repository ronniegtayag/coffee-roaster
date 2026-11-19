import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { errorBody, listItem, page, staff } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import { loginAs, renderApp, resetSession } from '@/test/render';

const LIST = '*/api/v1/customers';

describe('customers list', () => {
  beforeEach(() => loginAs());
  afterEach(resetSession);

  it('shows a loading status, then rows with formatted ABN, email and branch count', async () => {
    server.use(
      http.get(LIST, async () => {
        await new Promise((r) => setTimeout(r, 30));
        return HttpResponse.json(
          page([
            listItem(),
            listItem({
              id: 'c-2',
              displayName: 'No Abn Cafe',
              legalName: 'No Abn Cafe',
              tradingName: null,
              abn: null,
              isActive: false,
              activeBranchCount: 0,
            }),
          ]),
        );
      }),
    );
    await renderApp('/customers');
    expect(await screen.findByRole('status', { name: 'Loading customers' })).toBeInTheDocument();
    const row = (await screen.findByText('Bean There Pty Ltd')).closest('tr')!;
    expect(within(row).getByText('51 824 753 556')).toBeInTheDocument();
    expect(within(row).getByText('ap@beanthere.com')).toBeInTheDocument();
    expect(within(row).getByText('2')).toBeInTheDocument();
    const inactive = screen.getByText('No Abn Cafe').closest('tr')!;
    expect(within(inactive).getByText('No ABN')).toBeInTheDocument();
    expect(within(inactive).getByText('Inactive')).toBeInTheDocument();
  });

  it('requests active customers, page 1, by default', async () => {
    let params: URLSearchParams | undefined;
    server.use(
      http.get(LIST, ({ request }) => {
        params = new URL(request.url).searchParams;
        return HttpResponse.json(page([listItem()]));
      }),
    );
    await renderApp('/customers');
    await screen.findByText('Bean There Pty Ltd');
    expect(params?.get('status') ?? 'active').toBe('active');
    expect(params?.get('page') ?? '1').toBe('1');
  });

  it('passes URL search params to the API (page, search, status, state)', async () => {
    const seen: Record<string, string>[] = [];
    server.use(
      http.get(LIST, ({ request }) => {
        const entry: Record<string, string> = {};
        new URL(request.url).searchParams.forEach((v, k) => (entry[k] = v));
        seen.push(entry);
        return HttpResponse.json(page([listItem()], { page: 2, totalItems: 30, totalPages: 2 }));
      }),
    );
    await renderApp('/customers?page=2&search=bean&status=all&state=NSW');
    await screen.findByText('Bean There Pty Ltd');
    expect(seen).toContainEqual(
      expect.objectContaining({ page: '2', search: 'bean', status: 'all', state: 'NSW' }),
    );
  });

  it('puts the search term in the URL and returns to page 1', async () => {
    server.use(
      http.get(LIST, () =>
        HttpResponse.json(page([listItem()], { page: 2, totalPages: 3, totalItems: 60 })),
      ),
    );
    const { router } = await renderApp('/customers?page=2&status=all');
    await screen.findByText('Bean There Pty Ltd');
    const form = screen.getByRole('search');
    await userEvent.type(within(form).getByLabelText('Search'), 'surry{enter}');
    await waitFor(() => expect(router.state.location.search).toMatchObject({ search: 'surry' }));
    expect(router.state.location.search).toMatchObject({ status: 'all' });
    expect(router.state.location.search).not.toHaveProperty('page', 2);
  });

  it('paginates through the Next button and shows the page summary', async () => {
    server.use(
      http.get(LIST, ({ request }) => {
        const p = Number(new URL(request.url).searchParams.get('page') ?? 1);
        return HttpResponse.json(
          page(
            [
              listItem({
                id: `c-${p}`,
                legalName: `Page ${p} Cafe`,
                displayName: `Page ${p} Cafe`,
              }),
            ],
            {
              page: p,
              totalItems: 60,
              totalPages: 3,
            },
          ),
        );
      }),
    );
    const { router } = await renderApp('/customers');
    expect(await screen.findByText('Page 1 Cafe')).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 3 · 60 customers/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Page 2 Cafe')).toBeInTheDocument();
    expect(router.state.location.search).toMatchObject({ page: 2 });
  });

  it.each(['1e300', '100001', '9007199254740993', 'Infinity', '-3', 'abc'])(
    'falls back to page 1 for the URL page %s',
    async (bad) => {
      const seen: string[] = [];
      server.use(
        http.get(LIST, ({ request }) => {
          seen.push(new URL(request.url).searchParams.get('page') ?? '1');
          return HttpResponse.json(page([listItem()]));
        }),
      );
      await renderApp(`/customers?page=${bad}`);
      await screen.findByText('Bean There Pty Ltd');
      expect(seen.length).toBeGreaterThan(0);
      expect(new Set(seen)).toEqual(new Set(['1']));
    },
  );

  it('goes to the last page when the URL page is past the end', async () => {
    server.use(
      http.get(LIST, ({ request }) => {
        const p = Number(new URL(request.url).searchParams.get('page') ?? 1);
        return HttpResponse.json(
          p > 3
            ? page([], { page: p, totalItems: 60, totalPages: 3 })
            : page([listItem({ legalName: `Page ${p} Cafe`, displayName: `Page ${p} Cafe` })], {
                page: p,
                totalItems: 60,
                totalPages: 3,
              }),
        );
      }),
    );
    const { router } = await renderApp('/customers?page=9');
    expect(await screen.findByText('Page 3 Cafe')).toBeInTheDocument();
    expect(router.state.location.search).toMatchObject({ page: 3 });
  });

  describe('empty states', () => {
    it('search with no match names the term and offers Clear search', async () => {
      server.use(http.get(LIST, () => HttpResponse.json(page([]))));
      const { router } = await renderApp('/customers?search=zzz');
      expect(await screen.findByText('No customers match "zzz"')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
      await waitFor(() => expect(router.state.location.search).not.toHaveProperty('search', 'zzz'));
    });

    it('no active customers: manager sees Create customer and a Show inactive button', async () => {
      server.use(http.get(LIST, () => HttpResponse.json(page([]))));
      await renderApp('/customers');
      expect(await screen.findByText('No active customers')).toBeInTheDocument();
      expect(screen.getAllByRole('link', { name: 'Create customer' }).length).toBeGreaterThan(0);
      expect(
        screen.getByRole('button', { name: 'Show inactive customers too' }),
      ).toBeInTheDocument();
    });

    it('no active customers: STAFF is told to ask a manager and has no Create link', async () => {
      loginAs(staff);
      server.use(http.get(LIST, () => HttpResponse.json(page([]))));
      await renderApp('/customers');
      expect(await screen.findByText('No active customers')).toBeInTheDocument();
      expect(screen.getByText(/Ask a manager to add customers/)).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Create customer' })).not.toBeInTheDocument();
    });

    it('no customers at all (status All)', async () => {
      server.use(http.get(LIST, () => HttpResponse.json(page([]))));
      await renderApp('/customers?status=all');
      expect(await screen.findByText('No customers yet')).toBeInTheDocument();
    });

    it('inactive filter with none', async () => {
      server.use(http.get(LIST, () => HttpResponse.json(page([]))));
      await renderApp('/customers?status=inactive');
      expect(await screen.findByText('No inactive customers')).toBeInTheDocument();
    });

    it('state filter with none names the state', async () => {
      server.use(http.get(LIST, () => HttpResponse.json(page([]))));
      await renderApp('/customers?state=NSW&status=all');
      expect(
        await screen.findByText(/No customers with an active branch in NSW/),
      ).toBeInTheDocument();
    });
  });

  describe('errors', () => {
    it('shows an error with Retry on 500, and Retry refetches successfully', async () => {
      let fail = true;
      server.use(
        http.get(LIST, () =>
          fail
            ? HttpResponse.json(errorBody(500, 'INTERNAL', 'boom'), { status: 500 })
            : HttpResponse.json(page([listItem()])),
        ),
      );
      await renderApp('/customers');
      expect(await screen.findByText('Something went wrong — try again')).toBeInTheDocument();
      fail = false;
      await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(await screen.findByText('Bean There Pty Ltd')).toBeInTheDocument();
    });

    it('shows the error state when the network is down', async () => {
      server.use(http.get(LIST, () => HttpResponse.error()));
      await renderApp('/customers');
      expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('400 on a bad query is shown as an error, not a crash', async () => {
      server.use(
        http.get(LIST, () =>
          HttpResponse.json(errorBody(400, 'VALIDATION_FAILED', 'Some fields need attention'), {
            status: 400,
          }),
        ),
      );
      await renderApp('/customers?page=1');
      expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });
  });

  describe('permissions', () => {
    it('hides Create customer from STAFF', async () => {
      server.use(http.get(LIST, () => HttpResponse.json(page([listItem()]))));
      loginAs(staff);
      await renderApp('/customers');
      await screen.findByText('Bean There Pty Ltd');
      expect(screen.queryByRole('link', { name: 'Create customer' })).not.toBeInTheDocument();
    });

    it('shows Create customer to MANAGER', async () => {
      server.use(http.get(LIST, () => HttpResponse.json(page([listItem()]))));
      await renderApp('/customers');
      await screen.findByText('Bean There Pty Ltd');
      expect(screen.getAllByRole('link', { name: 'Create customer' }).length).toBeGreaterThan(0);
    });

    it('shows no-permission text on /customers/new for STAFF', async () => {
      loginAs(staff);
      await renderApp('/customers/new');
      expect(await screen.findByText(/You don't have permission to do this/)).toBeInTheDocument();
    });
  });
});
