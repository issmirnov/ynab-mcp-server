import { describe, it, expect } from 'vitest';
import { describeAPIError } from '../utils/apiErrorHandler';

describe('describeAPIError', () => {
  it('uses an Error message as-is', () => {
    expect(describeAPIError(new Error('boom'))).toBe('boom');
  });

  it('reads the detail from a YNAB error body, which the SDK throws instead of an Error', () => {
    expect(
      describeAPIError({
        error: { id: '400', name: 'bad_request', detail: 'Splits are not allowed on tracking accounts' },
      })
    ).toBe('Splits are not allowed on tracking accounts (YNAB error 400)');
  });

  it('serializes other objects instead of printing [object Object]', () => {
    expect(describeAPIError({ code: 500 })).toBe('{"code":500}');
  });

  it('stringifies primitives', () => {
    expect(describeAPIError('plain')).toBe('plain');
  });
});
