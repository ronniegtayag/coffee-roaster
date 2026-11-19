import { isAbnChecksumValid, isAbnFormat, normaliseAbn } from './abn';

describe('abn', () => {
  it('strips all whitespace', () => {
    expect(normaliseAbn(' 51 824  753 556 ')).toBe('51824753556');
  });

  it.each(['51824753556', '00000000000'])('accepts 11-digit format %s', (abn) => {
    expect(isAbnFormat(abn)).toBe(true);
  });

  it.each(['', '5182475355', '518247535560', '5182475355a', '51-824-753-556', '51 824 753 556'])(
    'rejects format %j',
    (abn) => {
      expect(isAbnFormat(abn)).toBe(false);
    },
  );

  it('accepts the ATO test ABN', () => {
    expect(isAbnChecksumValid('51824753556')).toBe(true);
  });

  it('rejects every single-digit change of the ATO test ABN', () => {
    const base = '51824753556';
    for (let i = 0; i < base.length; i++) {
      for (const d of '0123456789') {
        if (d === base[i]) continue;
        const mutated = base.slice(0, i) + d + base.slice(i + 1);
        // A single-digit change can only stay valid if the weight is a multiple of 89, which none is.
        expect(isAbnChecksumValid(mutated)).toBe(false);
      }
    }
  });

  it('rejects malformed input rather than throwing', () => {
    expect(isAbnChecksumValid('')).toBe(false);
    expect(isAbnChecksumValid('abc')).toBe(false);
  });
});
