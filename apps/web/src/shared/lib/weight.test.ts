import { describe, expect, it } from 'vitest';
import { formatKg } from './weight';

describe('formatKg', () => {
  it.each([
    [0, '0 kg'],
    [250, '0.25 kg'],
    [1000, '1 kg'],
    [1500, '1.5 kg'],
    [2270, '2.27 kg'],
    [12500, '12.5 kg'],
    [14500, '14.5 kg'],
    [1001, '1.001 kg'],
  ])('%i g -> %s', (g, text) => expect(formatKg(g)).toBe(text));
});
