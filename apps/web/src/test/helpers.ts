import { HttpResponse } from 'msw';

/** MSW resolver for requests that must never be sent: fails the test by returning 599 and recording it. */
export const calls = { unexpected: 0 };
export function shouldNotCall() {
  calls.unexpected++;
  return HttpResponse.json({ message: 'unexpected request' }, { status: 599 });
}
