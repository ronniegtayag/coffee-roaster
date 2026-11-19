import { describe, expect, it } from 'vitest';
import { safeRedirect } from './redirect';

describe('safeRedirect', () => {
  it.each(['/customers', '/customers?page=2&search=a%20b', '/customers/abc/edit', '/'])(
    'allows the same-site path %s',
    (v) => expect(safeRedirect(v)).toBe(v),
  );

  it.each([
    '//evil.example.com',
    '/\\evil.example',
    '\\\\evil.example',
    'https://evil.example.com',
    'javascript:alert(1)',
    'customers',
    '',
    '/ok\nLocation: x',
    '/ok\r\n',
    '/\u0000',
    '/\t/evil.example',
    undefined,
    null,
    42,
    ['/customers'],
  ])('rejects %j', (v) => expect(safeRedirect(v)).toBeUndefined());
});
