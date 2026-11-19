import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { errorBody, page, product, staff } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import { loginAs, renderApp, resetSession } from '@/test/render';

const LIST = '*/api/v1/products';
const PRICE_MESSAGE = 'Price must be more than $0.00 with at most 2 decimal places';
const coffees = [
  {
    id: 'cf-1',
    name: 'House Espresso',
    type: 'BLEND',
    origin: null,
    description: null,
    isActive: true,
    activeProductCount: 2,
    deactivatedAt: null,
    createdAt: '',
    updatedAt: '',
  },
];
const grinds = [
  { id: 'g-1', name: 'Whole bean', sortOrder: 10, isActive: true },
  { id: 'g-2', name: 'Espresso', sortOrder: 20, isActive: true },
];

function serveCatalogue(items: unknown[] = coffees) {
  server.use(http.get('*/api/v1/coffees', () => HttpResponse.json({ items })));
}

describe('products list', () => {
  beforeEach(() => loginAs());
  afterEach(resetSession);

  it('shows loading, then products with SKU, price ex-GST and tax code', async () => {
    serveCatalogue();
    server.use(
      http.get(LIST, async () => {
        await new Promise((r) => setTimeout(r, 30));
        return HttpResponse.json(
          page([
            product(),
            product({
              id: 'p-9',
              sku: 'CT-100',
              kind: 'OTHER',
              displayName: 'Cleaning tablets',
              name: 'Cleaning tablets',
              coffee: null,
              bagSizeGrams: null,
              grind: null,
              listPriceExGst: '18.18',
              taxCode: 'GST',
            }),
          ]),
        );
      }),
    );
    await renderApp('/products');
    expect(await screen.findByRole('status', { name: 'Loading products' })).toBeInTheDocument();
    const row = (await screen.findByText('HE-1KG-WB')).closest('tr')!;
    expect(within(row).getByText('House Espresso — 1 kg — Whole bean')).toBeInTheDocument();
    expect(within(row).getByText('$34.00')).toBeInTheDocument();
    expect(within(row).getByText('GST-free')).toBeInTheDocument();
    const other = screen.getByText('CT-100').closest('tr')!;
    expect(within(other).getByText('$18.18')).toBeInTheDocument();
    expect(within(other).getByText('GST')).toBeInTheDocument();
  });

  it('badges inactive products and products of an inactive coffee', async () => {
    serveCatalogue();
    server.use(
      http.get(LIST, () =>
        HttpResponse.json(
          page([
            product({ id: 'p-a', sku: 'A-1', isActive: false, orderable: false }),
            product({
              id: 'p-b',
              sku: 'B-1',
              orderable: false,
              coffee: { id: 'cf-1', name: 'House Espresso', type: 'BLEND', isActive: false },
            }),
          ]),
        ),
      ),
    );
    await renderApp('/products?status=all');
    expect((await screen.findAllByText('Inactive')).length).toBeGreaterThan(0);
    expect(screen.getByText('Coffee inactive')).toBeInTheDocument();
  });

  it('passes URL filters to the API', async () => {
    const seen: Record<string, string>[] = [];
    serveCatalogue();
    server.use(
      http.get(LIST, ({ request }) => {
        const entry: Record<string, string> = {};
        new URL(request.url).searchParams.forEach((v, k) => (entry[k] = v));
        seen.push(entry);
        return HttpResponse.json(page([product()]));
      }),
    );
    await renderApp('/products?search=he&status=inactive&kind=coffee&coffeeId=cf-1&page=2');
    await screen.findByText('HE-1KG-WB');
    expect(seen).toContainEqual(
      expect.objectContaining({
        search: 'he',
        status: 'inactive',
        kind: 'coffee',
        coffeeId: 'cf-1',
        page: '2',
      }),
    );
  });

  it('empty: a manager sees an Add product link', async () => {
    serveCatalogue([]);
    server.use(http.get(LIST, () => HttpResponse.json(page([]))));
    await renderApp('/products');
    expect(await screen.findByText('No products yet')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Add product/ }).length).toBeGreaterThan(0);
  });

  it('empty: STAFF are told to ask a manager and have no Add product link', async () => {
    loginAs(staff);
    serveCatalogue([]);
    server.use(http.get(LIST, () => HttpResponse.json(page([]))));
    await renderApp('/products');
    expect(await screen.findByText(/Ask a manager to add products/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Add product/ })).not.toBeInTheDocument();
  });

  it('a filtered empty list says "No products match these filters"', async () => {
    serveCatalogue([]);
    server.use(http.get(LIST, () => HttpResponse.json(page([]))));
    await renderApp('/products?search=zzz');
    expect(await screen.findByText('No products match these filters')).toBeInTheDocument();
  });

  it('shows an error with Retry on 500', async () => {
    serveCatalogue([]);
    server.use(http.get(LIST, () => HttpResponse.json(errorBody(500, 'X', 'b'), { status: 500 })));
    await renderApp('/products');
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('new product form', () => {
  beforeEach(() => {
    loginAs();
    serveCatalogue();
    server.use(http.get('*/api/v1/grinds', () => HttpResponse.json({ items: grinds })));
  });
  afterEach(resetSession);

  const save = () => userEvent.click(screen.getByRole('button', { name: /^(Create|Add|Save)/ }));

  async function fillCoffeeProduct(sku = 'HE-2') {
    await userEvent.type(await screen.findByLabelText(/^SKU/), sku);
    await userEvent.selectOptions(screen.getByLabelText(/^Coffee/, { selector: 'select' }), 'cf-1');
    await userEvent.type(screen.getByLabelText(/^Bag size/), '1000');
    await userEvent.selectOptions(screen.getByLabelText(/^Grind/), 'g-1');
    await userEvent.type(screen.getByLabelText(/^List price/), '34.00');
  }

  it('is blocked without products:write', async () => {
    loginAs(staff);
    await renderApp('/products/new');
    expect(await screen.findByText("You don't have permission to do this")).toBeInTheDocument();
  });

  it('defaults the tax code to GST-free for coffee and GST for other, until the user picks one', async () => {
    await renderApp('/products/new');
    expect(await screen.findByLabelText(/^Tax code/)).toHaveValue('GST_FREE');
    await userEvent.click(screen.getByRole('radio', { name: /Other/ }));
    expect(screen.getByLabelText(/^Tax code/)).toHaveValue('GST');
    expect(screen.getByText(/confirm with your accountant/)).toBeInTheDocument();
  });

  it('keeps a tax code the user picked when the kind is switched', async () => {
    await renderApp('/products/new');
    await userEvent.click(await screen.findByRole('radio', { name: /Other/ }));
    await userEvent.selectOptions(screen.getByLabelText(/^Tax code/), 'GST_FREE');
    await userEvent.click(screen.getByRole('radio', { name: /^Coffee/ }));
    expect(screen.getByLabelText(/^Tax code/)).toHaveValue('GST_FREE');
  });

  it.each(['0', '0.00', '34.005', '-1', '10000', '1e3'])(
    'rejects the price %s client-side',
    async (price) => {
      await renderApp('/products/new');
      await userEvent.type(await screen.findByLabelText(/^List price/), price);
      await save();
      expect((await screen.findAllByText(PRICE_MESSAGE)).length).toBeGreaterThan(0);
    },
  );

  it('accepts the price limits 0.01 and 9999.99', async () => {
    await renderApp('/products/new');
    const price = await screen.findByLabelText(/^List price/);
    for (const ok of ['0.01', '9999.99']) {
      await userEvent.clear(price);
      await userEvent.type(price, ok);
      await save();
      await waitFor(() => expect(screen.queryByText(PRICE_MESSAGE)).not.toBeInTheDocument());
    }
  });

  it('shows required-field errors for a coffee product and sends nothing', async () => {
    let posts = 0;
    server.use(
      http.post(LIST, () => {
        posts++;
        return HttpResponse.json(product(), { status: 201 });
      }),
    );
    await renderApp('/products/new');
    await screen.findByLabelText(/^SKU/);
    await save();
    expect(await screen.findByText('Choose a coffee')).toBeInTheDocument();
    expect(screen.getByText('Choose a grind')).toBeInTheDocument();
    expect(
      screen.getByText('Bag size must be a whole number of grams above 0'),
    ).toBeInTheDocument();
    expect(posts).toBe(0);
  });

  it('rejects a bad SKU', async () => {
    await renderApp('/products/new');
    await userEvent.type(await screen.findByLabelText(/^SKU/), 'bad sku!');
    await save();
    expect(
      await screen.findByText('SKU can only use letters, numbers and dashes'),
    ).toBeInTheDocument();
  });

  it('posts a coffee product with the price as a string and the chosen tax code', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(LIST, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(product({ id: 'p-new' }), { status: 201 });
      }),
      http.get('*/api/v1/products/p-new', () => HttpResponse.json(product({ id: 'p-new' }))),
    );
    await renderApp('/products/new');
    await fillCoffeeProduct('he-1kg-wb');
    await save();
    await waitFor(() => expect(body.listPriceExGst).toBe('34.00'));
    expect(body).toMatchObject({
      coffeeId: 'cf-1',
      bagSizeGrams: 1000,
      grindId: 'g-1',
      taxCode: 'GST_FREE',
    });
    expect(typeof body.listPriceExGst).toBe('string');
  });

  it('PRODUCT_VARIANT_EXISTS shows a link to the existing product', async () => {
    server.use(
      http.post(LIST, () =>
        HttpResponse.json(
          errorBody(
            409,
            'PRODUCT_VARIANT_EXISTS',
            'House Espresso — 1 kg — Whole bean already exists',
            {
              meta: { productId: 'p-1', displayName: 'House Espresso — 1 kg — Whole bean' },
            },
          ),
          { status: 409 },
        ),
      ),
    );
    await renderApp('/products/new');
    await fillCoffeeProduct();
    await save();
    expect(await screen.findByRole('link', { name: /View House Espresso/ })).toBeInTheDocument();
  });

  it('SKU_TAKEN lands on the SKU field', async () => {
    server.use(
      http.post(LIST, () =>
        HttpResponse.json(
          errorBody(409, 'SKU_TAKEN', 'x', {
            fieldErrors: [
              { field: 'sku', code: 'skuTaken', message: 'SKU HE-1KG-WB is already used' },
            ],
          }),
          { status: 409 },
        ),
      ),
    );
    await renderApp('/products/new');
    await userEvent.click(await screen.findByRole('radio', { name: /Other/ }));
    await userEvent.type(screen.getByLabelText(/^SKU/), 'HE-1KG-WB');
    await userEvent.type(screen.getByLabelText(/^Name/), 'Widget');
    await userEvent.type(screen.getByLabelText(/^List price/), '5.00');
    await save();
    expect(await screen.findByText('SKU HE-1KG-WB is already used')).toBeInTheDocument();
  });
});

describe('product detail', () => {
  beforeEach(() => loginAs());
  afterEach(resetSession);

  it('404 shows "Product not found"', async () => {
    server.use(
      http.get('*/api/v1/products/nope', () =>
        HttpResponse.json(errorBody(404, 'PRODUCT_NOT_FOUND', 'x'), { status: 404 }),
      ),
    );
    await renderApp('/products/nope');
    expect(await screen.findByRole('heading', { name: 'Product not found' })).toBeInTheDocument();
  });

  it('warns how many open orders carry the product, and PATCHes only the changed price', async () => {
    let body: Record<string, unknown> = {};
    let productIdParam: string | null = null;
    server.use(
      http.get('*/api/v1/products/p-1', () => HttpResponse.json(product())),
      http.get('*/api/v1/orders', ({ request }) => {
        productIdParam = new URL(request.url).searchParams.get('productId');
        return HttpResponse.json(page([], { totalItems: 3 }));
      }),
      http.patch('*/api/v1/products/p-1', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(product({ listPriceExGst: '36.00' }));
      }),
    );
    await renderApp('/products/p-1');
    expect(await screen.findByText(/3 open orders/)).toBeInTheDocument();
    expect(productIdParam).toBe('p-1');
    const price = await screen.findByLabelText(/^List price/);
    await userEvent.clear(price);
    await userEvent.type(price, '36.00');
    await userEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(body.listPriceExGst).toBe('36.00'));
    expect(body).not.toHaveProperty('coffeeId');
    expect(body).not.toHaveProperty('bagSizeGrams');
  });

  it('STAFF see the product read-only with no edit form or deactivate button', async () => {
    loginAs(staff);
    server.use(http.get('*/api/v1/products/p-1', () => HttpResponse.json(product())));
    await renderApp('/products/p-1');
    await screen.findAllByText(/House Espresso — 1 kg — Whole bean/);
    expect(screen.queryByLabelText(/^List price/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Deactivate/ })).not.toBeInTheDocument();
  });

  it('deactivate asks for confirmation then posts', async () => {
    let posted = false;
    server.use(
      http.get('*/api/v1/products/p-1', () => HttpResponse.json(product())),
      http.get('*/api/v1/orders', () => HttpResponse.json(page([]))),
      http.post('*/api/v1/products/p-1/deactivate', () => {
        posted = true;
        return HttpResponse.json(product({ isActive: false, orderable: false }));
      }),
    );
    await renderApp('/products/p-1');
    await userEvent.click(await screen.findByRole('button', { name: /Deactivate/ }));
    const dialog = await screen.findByRole('alertdialog');
    expect(posted).toBe(false);
    await userEvent.click(within(dialog).getByRole('button', { name: /Deactivate/ }));
    await waitFor(() => expect(posted).toBe(true));
  });

  it('reactivating onto an existing active variant shows the 409 message', async () => {
    server.use(
      http.get('*/api/v1/products/p-1', () =>
        HttpResponse.json(product({ isActive: false, orderable: false })),
      ),
      http.get('*/api/v1/orders', () => HttpResponse.json(page([]))),
      http.post('*/api/v1/products/p-1/reactivate', () =>
        HttpResponse.json(
          errorBody(
            409,
            'PRODUCT_VARIANT_EXISTS',
            'House Espresso — 1 kg — Whole bean already exists',
          ),
          { status: 409 },
        ),
      ),
    );
    await renderApp('/products/p-1');
    await userEvent.click(await screen.findByRole('button', { name: /Reactivate/ }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /Reactivate/ }));
    expect(await within(dialog).findByText(/already exists/)).toBeInTheDocument();
  });
});
