import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api/errors';
import { describeOrderError } from './errors';

function err(status: number, code: string, meta: Record<string, unknown> = {}, message = 'raw') {
  const e = new ApiError(status, message);
  Object.assign(e, { code, meta });
  return e;
}

describe('describeOrderError', () => {
  it.each([
    ['VERSION_CONFLICT', {}, /changed by someone else — reload/],
    ['INVALID_TRANSITION', { status: 'PACKED' }, /now Packed/],
    ['ORDER_NOT_EDITABLE', {}, /can't be changed/],
    ['ORDER_EMPTY', {}, /at least one line/],
    ['ORDER_NOT_DELETABLE', {}, /can't be deleted/],
    [
      'PRODUCT_UNAVAILABLE',
      { lines: [{ description: 'Decaf 1 kg' }] },
      /Decaf 1 kg is no longer available/,
    ],
    ['CUSTOMER_INACTIVE', {}, /customer is inactive/],
    ['BRANCH_INACTIVE', {}, /branch is inactive/],
    ['NO_SCHEDULE_AVAILABLE', {}, /roast calendar/],
    ['REQUEST_ID_REUSED', {}, /already started/],
  ])('%s', (code, meta, re) => {
    expect(describeOrderError(err(409, code, meta))).toMatch(re);
  });

  it('SCHEDULE_OVERRIDE_REQUIRED: cut-off wording only for a sole CUTOFF_PASSED, otherwise the reasons are listed', () => {
    const suggestion = { roastDate: '2026-11-26' };
    const sole = describeOrderError(
      err(409, 'SCHEDULE_OVERRIDE_REQUIRED', { reasons: ['CUTOFF_PASSED'], suggestion }),
    );
    expect(sole).toMatch(/[Cc]ut-off .*passed/);
    for (const reasons of [
      ['NOT_A_DELIVERY_DAY'],
      ['CUTOFF_PASSED', 'DELIVERY_TOO_SOON'],
      ['NOT_A_ROAST_DAY'],
    ]) {
      const text = describeOrderError(
        err(409, 'SCHEDULE_OVERRIDE_REQUIRED', { reasons, suggestion }),
      );
      expect(text).toMatch(/off schedule/);
      expect(text).not.toMatch(/[Cc]ut-off .*has passed — ask a manager/);
    }
  });

  it('SCHEDULE_OVERRIDE_REQUIRED names the suggested roast date', () => {
    expect(
      describeOrderError(
        err(409, 'SCHEDULE_OVERRIDE_REQUIRED', { suggestion: { roastDate: '2026-11-26' } }),
      ),
    ).toMatch(/Thu.*26 Nov/);
  });

  it.each([
    ['PAST_CUTOFF', /cut-off has passed/],
    ['SHORT_SUPPLY', /reduce lines on a packed order/],
    ['LATE_CHANGE', /late change/],
  ])('FORBIDDEN reason %s', (reason, re) => {
    expect(describeOrderError(err(403, 'FORBIDDEN', { reason }))).toMatch(re);
  });

  it('FORBIDDEN with no reason falls back to the generic permission message', () => {
    expect(describeOrderError(err(403, 'FORBIDDEN'))).toMatch(/permission/i);
  });
});
