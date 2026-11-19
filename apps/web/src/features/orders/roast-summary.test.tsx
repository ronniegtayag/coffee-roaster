import { screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { errorBody } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import { loginAs, renderApp, resetSession } from '@/test/render';

describe('roast summary', () => {
  beforeEach(() => loginAs());
  afterEach(resetSession);

  it('lists coffees with weight in kg and a total, for the date in the URL', async () => {
    let asked: string | null = null;
    server.use(
      http.get('*/api/v1/orders/roast-summary', ({ request }) => {
        asked = new URL(request.url).searchParams.get('roastDate');
        return HttpResponse.json({
          roastDate: '2026-11-25',
          coffees: [
            {
              coffeeId: 'cf-1',
              coffeeName: 'House Espresso',
              totalWeightGrams: 13000,
              orderCount: 3,
            },
          ],
          totalWeightGrams: 13000,
        });
      }),
    );
    await renderApp('/orders/roast-summary?roastDate=2026-11-25');
    expect(await screen.findByText('House Espresso')).toBeInTheDocument();
    expect(screen.getAllByText(/13 kg/).length).toBeGreaterThan(1);
    expect(asked).toBe('2026-11-25');
  });

  it('shows the empty message', async () => {
    server.use(
      http.get('*/api/v1/orders/roast-summary', () =>
        HttpResponse.json({ roastDate: '2026-11-25', coffees: [], totalWeightGrams: 0 }),
      ),
    );
    await renderApp('/orders/roast-summary?roastDate=2026-11-25');
    expect(await screen.findByText('No confirmed orders for this roast date')).toBeInTheDocument();
  });

  it('shows an error on 500', async () => {
    server.use(
      http.get('*/api/v1/orders/roast-summary', () =>
        HttpResponse.json(errorBody(500, 'X', 'b'), { status: 500 }),
      ),
    );
    await renderApp('/orders/roast-summary?roastDate=2026-11-25');
    expect(await screen.findByText('Something went wrong — try again')).toBeInTheDocument();
  });
});
