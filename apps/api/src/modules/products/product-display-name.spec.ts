import { formatBagSize, productDisplayName } from './product-display-name';

describe('formatBagSize', () => {
  it.each([
    [1, '1 g'],
    [250, '250 g'],
    [999, '999 g'],
    [1000, '1 kg'],
    [1500, '1.5 kg'],
    [2270, '2.27 kg'],
    [2005, '2.005 kg'],
    [12000, '12 kg'],
  ])('%i -> %s', (g, text) => expect(formatBagSize(g)).toBe(text));
});

describe('productDisplayName', () => {
  it('builds "<coffee> — <size> — <grind>" with em dashes for coffee products', () => {
    expect(
      productDisplayName({
        name: null,
        bagSizeGrams: 1000,
        coffee: { name: 'House Espresso' },
        grind: { name: 'Whole bean' },
      }),
    ).toBe('House Espresso — 1 kg — Whole bean');
    expect(
      productDisplayName({
        name: null,
        bagSizeGrams: 250,
        coffee: { name: 'Ethiopia Guji' },
        grind: { name: 'Filter' },
      }),
    ).toBe('Ethiopia Guji — 250 g — Filter');
  });

  it('uses the name for non-coffee products', () => {
    expect(
      productDisplayName({
        name: 'Cleaning tablets',
        bagSizeGrams: null,
        coffee: null,
        grind: null,
      }),
    ).toBe('Cleaning tablets');
  });
});
