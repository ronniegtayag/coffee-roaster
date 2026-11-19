import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { branch, customer, errorBody, staff } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import { loginAs, renderApp, resetSession } from '@/test/render';

const ONE = '*/api/v1/customers/c-1';

/** The branch card (list item) for a branch name; its buttons carry an sr-only suffix with the name. */
async function branchCard(name: string) {
  const heading = await screen.findByRole('heading', { name });
  return within(heading.closest('li') as HTMLElement);
}
const withBranches = customer({
  branches: [
    branch(),
    branch({
      id: 'b-2',
      name: 'Fitzroy Closed',
      isActive: false,
      deactivatedAt: '2026-11-01T00:00:00.000Z',
    }),
  ],
});

describe('customer detail', () => {
  beforeEach(() => loginAs());
  afterEach(resetSession);

  it('shows loading, then details and branch cards', async () => {
    server.use(
      http.get(ONE, async () => {
        await new Promise((r) => setTimeout(r, 30));
        return HttpResponse.json(withBranches);
      }),
    );
    await renderApp('/customers/c-1');
    expect(await screen.findByRole('status', { name: 'Loading customer' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Surry Hills' })).toBeInTheDocument();
    expect(screen.getByText('51 824 753 556')).toBeInTheDocument();
    expect(screen.getAllByText(/Back lane after 7am/).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Fitzroy Closed' })).toBeInTheDocument();
  });

  it('shows the 404 page for an unknown customer', async () => {
    server.use(
      http.get('*/api/v1/customers/nope', () =>
        HttpResponse.json(errorBody(404, 'CUSTOMER_NOT_FOUND', 'Customer not found'), {
          status: 404,
        }),
      ),
    );
    await renderApp('/customers/nope');
    expect(await screen.findByRole('heading', { name: 'Customer not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to customers' })).toBeInTheDocument();
  });

  it('shows an error with Retry on a server error', async () => {
    let fail = true;
    server.use(
      http.get(ONE, () =>
        fail
          ? HttpResponse.json(errorBody(500, 'X', 'boom'), { status: 500 })
          : HttpResponse.json(withBranches),
      ),
    );
    await renderApp('/customers/c-1');
    expect(await screen.findByText('Something went wrong — try again')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Surry Hills' })).toBeInTheDocument();
  });

  it('shows "No branches yet" with an Add branch link for a manager', async () => {
    server.use(http.get(ONE, () => HttpResponse.json(customer())));
    await renderApp('/customers/c-1');
    expect(await screen.findByText('No branches yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add branch' })).toBeInTheDocument();
  });

  it('shows "Ask a manager to add a branch." to STAFF with no Add branch link', async () => {
    loginAs(staff);
    server.use(http.get(ONE, () => HttpResponse.json(customer())));
    await renderApp('/customers/c-1');
    expect(await screen.findByText('No branches yet')).toBeInTheDocument();
    expect(screen.getByText('Ask a manager to add a branch.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add branch' })).not.toBeInTheDocument();
  });

  it('shows an Inactive banner and still offers Edit and Reactivate', async () => {
    server.use(
      http.get(ONE, () =>
        HttpResponse.json(customer({ isActive: false, deactivatedAt: '2026-11-01T00:00:00.000Z' })),
      ),
    );
    await renderApp('/customers/c-1');
    expect(await screen.findByText(/This customer is inactive since/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit customer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument();
  });

  it('shows the deactivated time in Sydney time (11pm 30 Nov Sydney is 12:00 UTC)', async () => {
    server.use(
      http.get(ONE, () =>
        HttpResponse.json(customer({ isActive: false, deactivatedAt: '2026-11-30T12:30:00.000Z' })),
      ),
    );
    await renderApp('/customers/c-1');
    const banner = await screen.findByText(/This customer is inactive since/);
    expect(banner).toHaveTextContent(/30 Nov/);
  });

  it('hides every write control from STAFF except branch contact editing', async () => {
    loginAs(staff);
    server.use(http.get(ONE, () => HttpResponse.json(withBranches)));
    await renderApp('/customers/c-1');
    await screen.findByRole('heading', { name: 'Surry Hills' });
    expect(screen.queryByRole('link', { name: 'Edit customer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reactivate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add branch' })).not.toBeInTheDocument();
    const card = await branchCard('Surry Hills');
    expect(card.queryByRole('button', { name: /^Deactivate/ })).not.toBeInTheDocument();
    expect(
      (await branchCard('Fitzroy Closed')).queryByRole('button', { name: /^Reactivate/ }),
    ).not.toBeInTheDocument();
    expect(card.getByRole('link', { name: /^Edit/ })).toBeInTheDocument();
  });

  it('does not offer to reactivate a branch while the customer is inactive', async () => {
    server.use(http.get(ONE, () => HttpResponse.json({ ...withBranches, isActive: false })));
    await renderApp('/customers/c-1');
    await screen.findByRole('heading', { name: 'Fitzroy Closed' });
    expect(
      (await branchCard('Fitzroy Closed')).queryByRole('button', { name: /^Reactivate/ }),
    ).not.toBeInTheDocument();
  });

  it('offers to reactivate an inactive branch of an active customer', async () => {
    server.use(http.get(ONE, () => HttpResponse.json(withBranches)));
    await renderApp('/customers/c-1');
    expect(
      (await branchCard('Fitzroy Closed')).getByRole('button', { name: /^Reactivate/ }),
    ).toBeInTheDocument();
  });

  describe('deactivate and reactivate customer', () => {
    it('asks for confirmation naming the customer, then posts and refreshes', async () => {
      let active = true;
      let posts = 0;
      server.use(
        http.get(ONE, () =>
          HttpResponse.json(
            customer({
              isActive: active,
              deactivatedAt: active ? null : '2026-11-01T00:00:00.000Z',
            }),
          ),
        ),
        http.post('*/api/v1/customers/c-1/deactivate', () => {
          posts++;
          active = false;
          return HttpResponse.json(customer({ isActive: false }));
        }),
      );
      await renderApp('/customers/c-1');
      await userEvent.click(await screen.findByRole('button', { name: 'Deactivate' }));
      const dialog = await screen.findByRole('alertdialog');
      expect(within(dialog).getByText('Deactivate Bean There?')).toBeInTheDocument();
      expect(posts).toBe(0);
      await userEvent.click(within(dialog).getByRole('button', { name: 'Deactivate customer' }));
      expect(await screen.findByText(/This customer is inactive since/)).toBeInTheDocument();
      expect(posts).toBe(1);
    });

    it('Cancel sends nothing', async () => {
      let posts = 0;
      server.use(
        http.get(ONE, () => HttpResponse.json(customer())),
        http.post('*/api/v1/customers/c-1/deactivate', () => {
          posts++;
          return HttpResponse.json(customer());
        }),
      );
      await renderApp('/customers/c-1');
      await userEvent.click(await screen.findByRole('button', { name: 'Deactivate' }));
      await userEvent.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }),
      );
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(posts).toBe(0);
    });

    it('shows the API error inside the dialog and keeps nothing shown as saved', async () => {
      server.use(
        http.get(ONE, () => HttpResponse.json(customer())),
        http.post('*/api/v1/customers/c-1/deactivate', () =>
          HttpResponse.json(errorBody(403, 'FORBIDDEN', 'no'), { status: 403 }),
        ),
      );
      await renderApp('/customers/c-1');
      await userEvent.click(await screen.findByRole('button', { name: 'Deactivate' }));
      const dialog = await screen.findByRole('alertdialog');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Deactivate customer' }));
      expect(
        await within(dialog).findByText(/You don't have permission to do this/),
      ).toBeInTheDocument();
      expect(screen.queryByText(/This customer is inactive/)).not.toBeInTheDocument();
    });
  });

  it('shows the API message when reactivating a branch fails with CUSTOMER_INACTIVE', async () => {
    server.use(
      http.get(ONE, () => HttpResponse.json(withBranches)),
      http.post('*/api/v1/branches/b-2/reactivate', () =>
        HttpResponse.json(
          errorBody(409, 'CUSTOMER_INACTIVE', 'Reactivate the customer first', {}),
          { status: 409 },
        ),
      ),
    );
    await renderApp('/customers/c-1');
    await userEvent.click(
      (await branchCard('Fitzroy Closed')).getByRole('button', { name: /^Reactivate/ }),
    );
    expect(await screen.findByText('Reactivate the customer first')).toBeInTheDocument();
  });

  it('shows "Branch not found" for an unknown branch id on the edit route', async () => {
    server.use(http.get(ONE, () => HttpResponse.json(withBranches)));
    await renderApp('/customers/c-1/branches/missing/edit');
    expect(await screen.findByRole('heading', { name: 'Branch not found' })).toBeInTheDocument();
  });

  describe('deactivate branch', () => {
    it('confirms then posts to the branch endpoint', async () => {
      let posted = false;
      server.use(
        http.get(ONE, () => HttpResponse.json(withBranches)),
        http.post('*/api/v1/branches/b-1/deactivate', () => {
          posted = true;
          return HttpResponse.json(branch({ isActive: false }));
        }),
      );
      await renderApp('/customers/c-1');
      await userEvent.click(
        (await branchCard('Surry Hills')).getByRole('button', { name: /^Deactivate/ }),
      );
      const dialog = await screen.findByRole('alertdialog');
      await userEvent.click(within(dialog).getByRole('button', { name: /Deactivate/ }));
      await waitFor(() => expect(posted).toBe(true));
    });
  });
});
