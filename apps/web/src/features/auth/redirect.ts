/** Only paths on this site are allowed as a post-login target (no open redirect). */
export function safeRedirect(value: unknown): string | undefined {
  return typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    // eslint-disable-next-line no-control-regex
    !/[\\\u0000-\u001f]/.test(value)
    ? value
    : undefined;
}
