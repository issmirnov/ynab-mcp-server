import { describe, it, expect, vi } from 'vitest';
import { createRetryableAPICall, describeAPIError } from '../utils/apiErrorHandler';

describe('createRetryableAPICall', () => {
  it('makes a single attempt when maxRetries is 1, even for a retryable network error', async () => {
    const call = vi.fn().mockRejectedValue(new Error('connection reset'));

    await expect(createRetryableAPICall(call, 'Create replacement transaction', 1)).rejects.toThrow('connection reset');
    expect(call).toHaveBeenCalledTimes(1);
  });
});

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
