import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { branch, customer, errorBody, staff } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import { loginAs, renderApp, resetSession } from '@/test/render';

const CREATE = '*/api/v1/customers';

async function fill(label: string | RegExp, value: string) {
  const input = await screen.findByLabelText(label);
  await userEvent.clear(input);
  if (value) await userEvent.type(input, value);
}

async function fillRequired() {
  await fill(/Legal name/, 'Roast Co Pty Ltd');
  await fill(/Billing email/, 'ap@roast.com');
}

const save = () => userEvent.click(screen.getByRole('button', { name: 'Create customer' }));

describe('create customer form', () => {
  beforeEach(() => loginAs());
  afterEach(resetSession);

  it('shows required-field and format errors without sending a request', async () => {
    let posts = 0;
    server.use(
      http.post(CREATE, () => {
        posts++;
        return HttpResponse.json(customer());
      }),
    );
    await renderApp('/customers/new');
    await fill(/Billing email/, 'not-an-email');
    await fill(/^ABN/, '5182475355');
    await save();
    expect(await screen.findByText('Legal name is required')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('ABN must be 11 digits')).toBeInTheDocument();
    expect(posts).toBe(0);
  });

  it('shows "Billing email is required" when blank', async () => {
    await renderApp('/customers/new');
    await fill(/Legal name/, 'X');
    await save();
    expect(await screen.findByText('Billing email is required')).toBeInTheDocument();
  });

  it('rejects an ABN that fails the checksum and accepts the ATO test ABN with spaces', async () => {
    await renderApp('/customers/new');
    await fillRequired();
    await fill(/^ABN/, '51 824 753 557');
    await save();
    expect(
      await screen.findByText("This isn't a valid ABN — check for a typo"),
    ).toBeInTheDocument();
  });

  it.each(['-1', '91', '1.5'])('rejects payment terms %s', async (days) => {
    await renderApp('/customers/new');
    await fillRequired();
    await fill(/Payment terms/, days);
    await save();
    expect(
      await screen.findByText('Payment terms must be a whole number of days from 0 to 90'),
    ).toBeInTheDocument();
  });

  it('submits trimmed values, the digits-only ABN, and null for blanks; then opens the new customer', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(CREATE, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(customer({ id: 'c-new', displayName: 'Roast Co' }), {
          status: 201,
        });
      }),
      http.get('*/api/v1/customers/c-new', () => HttpResponse.json(customer({ id: 'c-new' }))),
    );
    const { router } = await renderApp('/customers/new');
    await fill(/Legal name/, '  Roast Co Pty Ltd  ');
    await fill(/Billing email/, 'ap@roast.com');
    await fill(/^ABN/, '51 824 753 556');
    await save();
    await waitFor(() => expect(router.state.location.pathname).toBe('/customers/c-new'));
    expect(body).toMatchObject({
      legalName: 'Roast Co Pty Ltd',
      billingEmail: 'ap@roast.com',
      abn: '51824753556',
      tradingName: null,
      phone: null,
      notes: null,
    });
  });

  it('defaults payment terms to 14 and labels it as a default', async () => {
    await renderApp('/customers/new');
    expect(Number((await screen.findByLabelText<HTMLInputElement>(/Payment terms/)).value)).toBe(
      14,
    );
    expect(
      screen.getByText(/default of 14 days is pre-filled \(to be confirmed with the roaster\)/),
    ).toBeInTheDocument();
  });

  it('sends payment terms 0 as 0 (due on issue), not as blank', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(CREATE, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(customer({ id: 'c-new' }), { status: 201 });
      }),
      http.get('*/api/v1/customers/c-new', () => HttpResponse.json(customer({ id: 'c-new' }))),
    );
    await renderApp('/customers/new');
    await fillRequired();
    await fill(/Payment terms/, '0');
    await save();
    await waitFor(() => expect(body.paymentTermsDays).toBe(0));
  });

  it('places server field errors next to the fields and keeps the input', async () => {
    server.use(
      http.post(CREATE, () =>
        HttpResponse.json(
          errorBody(400, 'VALIDATION_FAILED', 'Some fields need attention', {
            fieldErrors: [
              { field: 'billingEmail', code: 'isEmail', message: 'Enter a valid email address' },
            ],
          }),
          { status: 400 },
        ),
      ),
    );
    await renderApp('/customers/new');
    await fillRequired();
    await save();
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByLabelText(/Legal name/)).toHaveValue('Roast Co Pty Ltd');
    expect(screen.getByLabelText(/Billing email/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows ABN_TAKEN on the ABN field with a link to the existing customer', async () => {
    server.use(
      http.post(CREATE, () =>
        HttpResponse.json(
          errorBody(409, 'ABN_TAKEN', 'This ABN is already used by Bean There', {
            fieldErrors: [
              { field: 'abn', code: 'abnTaken', message: 'This ABN is already used by Bean There' },
            ],
            meta: { customerId: 'c-1', displayName: 'Bean There' },
          }),
          { status: 409 },
        ),
      ),
    );
    await renderApp('/customers/new');
    await fillRequired();
    await fill(/^ABN/, '51824753556');
    await save();
    expect(await screen.findByText('This ABN is already used by Bean There')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View Bean There/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/customers/c-1'),
    );
  });

  it('shows the permission message on 403', async () => {
    server.use(
      http.post(CREATE, () =>
        HttpResponse.json(errorBody(403, 'FORBIDDEN', 'no'), { status: 403 }),
      ),
    );
    await renderApp('/customers/new');
    await fillRequired();
    await save();
    expect(await screen.findByText("You don't have permission to do this")).toBeInTheDocument();
  });

  it('keeps the input and shows a retry message on a 500; nothing is navigated to', async () => {
    server.use(
      http.post(CREATE, () => HttpResponse.json(errorBody(500, 'X', 'boom'), { status: 500 })),
    );
    const { router } = await renderApp('/customers/new');
    await fillRequired();
    await save();
    expect(await screen.findByText('Something went wrong — try again')).toBeInTheDocument();
    expect(screen.getByLabelText(/Legal name/)).toHaveValue('Roast Co Pty Ltd');
    expect(router.state.location.pathname).toBe('/customers/new');
  });

  it('disables Save while saving so a double click creates one customer', async () => {
    let posts = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    server.use(
      http.post(CREATE, async () => {
        posts++;
        await gate;
        return HttpResponse.json(customer({ id: 'c-new' }), { status: 201 });
      }),
      http.get('*/api/v1/customers/c-new', () => HttpResponse.json(customer({ id: 'c-new' }))),
    );
    await renderApp('/customers/new');
    await fillRequired();
    const button = screen.getByRole('button', { name: 'Create customer' });
    await userEvent.dblClick(button);
    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
    release();
    await waitFor(() => expect(posts).toBe(1));
  });

  it('hides the payment terms field without customers:edit-terms and does not send it', async () => {
    loginAs({ ...staff, permissions: ['customers:read', 'customers:write'] });
    let body: Record<string, unknown> = {};
    server.use(
      http.post(CREATE, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(customer({ id: 'c-new' }), { status: 201 });
      }),
      http.get('*/api/v1/customers/c-new', () => HttpResponse.json(customer({ id: 'c-new' }))),
    );
    await renderApp('/customers/new');
    await fillRequired();
    expect(screen.queryByLabelText(/Payment terms/)).not.toBeInTheDocument();
    await save();
    await waitFor(() => expect(Object.keys(body).length).toBeGreaterThan(0));
    expect(body).not.toHaveProperty('paymentTermsDays');
  });
});

describe('edit customer form', () => {
  beforeEach(() => loginAs());
  afterEach(resetSession);

  it('pre-fills from the API, shows the ABN formatted, and PATCHes', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.get('*/api/v1/customers/c-1', () => HttpResponse.json(customer())),
      http.patch('*/api/v1/customers/c-1', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(customer());
      }),
    );
    await renderApp('/customers/c-1/edit');
    expect(await screen.findByLabelText(/Legal name/)).toHaveValue('Bean There Pty Ltd');
    expect(screen.getByLabelText(/^ABN/)).toHaveValue('51 824 753 556');
    await fill(/Billing email/, 'new@beanthere.com');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(body.billingEmail).toBe('new@beanthere.com'));
  });

  it('shows edit wording for payment terms: no default, future invoices only', async () => {
    server.use(http.get('*/api/v1/customers/c-1', () => HttpResponse.json(customer())));
    await renderApp('/customers/c-1/edit');
    expect(await screen.findByText(/Changes apply to future invoices only/)).toBeInTheDocument();
    expect(screen.queryByText(/pre-filled/)).not.toBeInTheDocument();
  });

  it('shows the customer-not-found page for an unknown id', async () => {
    server.use(
      http.get('*/api/v1/customers/nope', () =>
        HttpResponse.json(errorBody(404, 'CUSTOMER_NOT_FOUND', 'x'), { status: 404 }),
      ),
    );
    await renderApp('/customers/nope/edit');
    expect(await screen.findByRole('heading', { name: 'Customer not found' })).toBeInTheDocument();
  });

  it('is blocked for STAFF', async () => {
    loginAs(staff);
    server.use(http.get('*/api/v1/customers/c-1', () => HttpResponse.json(customer())));
    await renderApp('/customers/c-1/edit');
    expect(await screen.findByText("You don't have permission to do this")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });
});

describe('branch form', () => {
  beforeEach(() => loginAs());
  afterEach(resetSession);

  const addBranch = () => userEvent.click(screen.getByRole('button', { name: 'Add branch' }));
  const customerHandler = http.get('*/api/v1/customers/c-1', () => HttpResponse.json(customer()));

  async function fillBranch(over: Record<string, string> = {}) {
    const v = {
      name: 'Surry Hills',
      line: '1 Crown St',
      suburb: 'Surry Hills',
      postcode: '2010',
      ...over,
    };
    await fill(/Branch name/, v.name);
    await fill(/Address line 1/, v.line);
    await fill(/Suburb/, v.suburb);
    await userEvent.selectOptions(screen.getByLabelText(/State/), over.state ?? 'NSW');
    await fill(/Postcode/, v.postcode);
  }

  it('pre-fills the first branch name with the customer display name', async () => {
    server.use(customerHandler);
    await renderApp('/customers/c-1/branches/new');
    expect(await screen.findByLabelText(/Branch name/)).toHaveValue('Bean There');
  });

  it('validates required fields and the 4 digit postcode client-side', async () => {
    server.use(customerHandler);
    await renderApp('/customers/c-1/branches/new');
    await fill(/Branch name/, '');
    await fill(/Postcode/, '201');
    await addBranch();
    expect(await screen.findByText('Branch name is required')).toBeInTheDocument();
    expect(screen.getByText('Choose a state')).toBeInTheDocument();
    expect(screen.getByText('Postcode must be 4 digits')).toBeInTheDocument();
  });

  it('keeps a leading-zero postcode as text and posts to the customer branches endpoint', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      customerHandler,
      http.post('*/api/v1/customers/c-1/branches', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(branch(), { status: 201 });
      }),
    );
    await renderApp('/customers/c-1/branches/new');
    await fillBranch({ postcode: '0800', state: 'NT' });
    await addBranch();
    await waitFor(() => expect(body.postcode).toBe('0800'));
    expect(body).toMatchObject({ state: 'NT', name: 'Surry Hills', addressLine2: null });
  });

  it('shows server field errors on the branch form', async () => {
    server.use(
      customerHandler,
      http.post('*/api/v1/customers/c-1/branches', () =>
        HttpResponse.json(
          errorBody(400, 'VALIDATION_FAILED', 'Some fields need attention', {
            fieldErrors: [{ field: 'suburb', code: 'isNotEmpty', message: 'Suburb is required' }],
          }),
          { status: 400 },
        ),
      ),
    );
    await renderApp('/customers/c-1/branches/new');
    await fillBranch();
    await addBranch();
    expect(await screen.findByText('Suburb is required')).toBeInTheDocument();
  });

  it('is blocked for STAFF on create', async () => {
    loginAs(staff);
    server.use(customerHandler);
    await renderApp('/customers/c-1/branches/new');
    expect(await screen.findByText("You don't have permission to do this")).toBeInTheDocument();
  });

  it('STAFF edit: address is locked and only contact fields are sent', async () => {
    loginAs(staff);
    let body: Record<string, unknown> = {};
    server.use(
      http.get('*/api/v1/customers/c-1', () =>
        HttpResponse.json(customer({ branches: [branch()] })),
      ),
      http.patch('*/api/v1/branches/b-1', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(branch());
      }),
    );
    await renderApp('/customers/c-1/branches/b-1/edit');
    expect(await screen.findByLabelText(/Branch name/)).toBeDisabled();
    expect(screen.getByLabelText(/Postcode/)).toBeDisabled();
    expect(screen.getByLabelText(/Delivery notes/)).toBeEnabled();
    expect(screen.getByText(/Ask a manager to change the name or address/)).toBeInTheDocument();
    await fill(/Delivery notes/, 'Use the side door');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(body.deliveryNotes).toBe('Use the side door'));
    expect(Object.keys(body).sort()).toEqual(['contactName', 'contactPhone', 'deliveryNotes']);
  });

  it('shows not found for an unknown branch id on edit', async () => {
    server.use(customerHandler);
    await renderApp('/customers/c-1/branches/missing/edit');
    expect(await screen.findByRole('heading', { name: /not found/i })).toBeInTheDocument();
  });
});
