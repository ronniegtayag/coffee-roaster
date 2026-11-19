import { describe, expect, it } from 'vitest';
import { formatAbn, isValidAbn, normaliseAbn } from './abn';

describe('normaliseAbn', () => {
  it('strips spaces and returns 11 digits', () => {
    expect(normaliseAbn('51 824 753 556')).toBe('51824753556');
    expect(normaliseAbn('  51824753556 ')).toBe('51824753556');
  });

  it.each(['', '5182475355', '518247535567', '51A24753556', '51-824-753-556'])(
    'returns null for %j',
    (input) => {
      expect(normaliseAbn(input)).toBeNull();
    },
  );
});

describe('isValidAbn', () => {
  it('accepts the ATO test ABN with or without spaces', () => {
    expect(isValidAbn('51824753556')).toBe(true);
    expect(isValidAbn('51 824 753 556')).toBe(true);
  });

  it('rejects a checksum failure (one digit changed)', () => {
    expect(isValidAbn('51824753557')).toBe(false);
    expect(isValidAbn('52824753556')).toBe(false);
  });

  it('rejects wrong length and non-digits', () => {
    expect(isValidAbn('5182475355')).toBe(false);
    expect(isValidAbn('518247535560')).toBe(false);
    expect(isValidAbn('abcdefghijk')).toBe(false);
    expect(isValidAbn('')).toBe(false);
  });
});

describe('formatAbn', () => {
  it('formats as 12 345 678 901', () => {
    expect(formatAbn('51824753556')).toBe('51 824 753 556');
    expect(formatAbn('51 824 753 556')).toBe('51 824 753 556');
  });

  it('shows a dash for missing ABNs and passes through malformed input', () => {
    expect(formatAbn(null)).toBe('—');
    expect(formatAbn(undefined)).toBe('—');
    expect(formatAbn('')).toBe('—');
    expect(formatAbn('123')).toBe('123');
  });
});
