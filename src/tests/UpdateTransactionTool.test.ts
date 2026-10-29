import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import UpdateTransactionTool from '../tools/UpdateTransactionTool';
import { jsonSchemaObjectToZodShape } from '../utils/jsonSchemaToZod';

vi.mock('../utils/apiErrorHandler.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/apiErrorHandler.js')>()),
  handleAPIError: vi.fn(),
  createRetryableAPICall: (fn: any) => fn(),
}));

const EXISTING = {
  data: {
    transaction: {
      id: 't1',
      date: '2026-01-01',
      amount: -5000,
      payee_name: 'Coffee',
      category_name: 'Dining',
      account_name: 'Checking',
      memo: null,
      approved: true,
      cleared: 'cleared',
      flag_color: 'red',
    },
  },
};

describe('UpdateTransactionTool', () => {
  let tool: UpdateTransactionTool;
  let mockApi: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi = {
      transactions: {
        getTransactionById: vi.fn().mockResolvedValue(EXISTING),
        updateTransaction: vi.fn(),
      },
    };
    tool = new UpdateTransactionTool({ ynabApi: mockApi, budgetId: 'b1' });
  });

  describe('flagColor schema', () => {
    const props = () => tool.getToolDefinition().inputSchema.properties as any;

    it('declares flagColor as a scalar string type (not a type array/union)', () => {
      expect(props().flagColor.type).toBe('string');
    });

    it('enumerates the colors plus a "none" clear option', () => {
      expect(props().flagColor.enum).toEqual(
        expect.arrayContaining(['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'none'])
      );
      expect(props().flagColor.enum).not.toContain(null);
    });

    it('converts to a typed zod enum — rejects invalid values (regression guard against z.any)', () => {
      const shape = jsonSchemaObjectToZodShape(tool.getToolDefinition().inputSchema as any);
      const obj = z.object(shape);
      expect(obj.safeParse({ transactionId: 't1', flagColor: 'red' }).success).toBe(true);
      expect(obj.safeParse({ transactionId: 't1', flagColor: 'none' }).success).toBe(true);
      expect(obj.safeParse({ transactionId: 't1', flagColor: 'chartreuse' }).success).toBe(false);
    });
  });

  describe('execute flag handling', () => {
    it('clears the flag when flagColor is "none"', async () => {
      mockApi.transactions.updateTransaction.mockResolvedValue({
        data: { transaction: { ...EXISTING.data.transaction, flag_color: null } },
      });

      await tool.execute({ transactionId: 't1', flagColor: 'none' });

      expect(mockApi.transactions.updateTransaction).toHaveBeenCalledWith('b1', 't1', {
        transaction: { flag_color: null },
      });
    });

    it('sets a color flag', async () => {
      mockApi.transactions.updateTransaction.mockResolvedValue({
        data: { transaction: { ...EXISTING.data.transaction, flag_color: 'blue' } },
      });

      await tool.execute({ transactionId: 't1', flagColor: 'blue' });

      expect(mockApi.transactions.updateTransaction).toHaveBeenCalledWith('b1', 't1', {
        transaction: { flag_color: 'blue' },
      });
    });
  });

  describe('split transactions', () => {
    const SPLIT = {
      data: {
        transaction: {
          ...EXISTING.data.transaction,
          category_id: 'cat-split',
          category_name: 'Split (Multiple Categories)...',
          subtransactions: [
            { id: 's1', amount: -3000, category_id: 'c1', category_name: 'Dining', deleted: false },
            { id: 's2', amount: -2000, category_id: 'c2', category_name: 'Gifts', deleted: false },
          ],
        },
      },
    };

    beforeEach(() => {
      mockApi.transactions.getTransactionById.mockResolvedValue(SPLIT);
    });

    it.each([
      ['amount', { amount: -60 }],
      ['date', { date: '2026-01-02' }],
      ['category', { categoryId: 'c3' }],
    ])("rejects changing a split's %s and points to ynab_set_transaction_splits", async (field, change) => {
      const result = await tool.execute({ transactionId: 't1', ...change });

      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain(`split's ${field}`);
      expect(result.content[0].text).toContain('ynab_set_transaction_splits');
      expect(mockApi.transactions.updateTransaction).not.toHaveBeenCalled();
    });

    it('still updates fields YNAB allows on a split, such as the memo', async () => {
      mockApi.transactions.updateTransaction.mockResolvedValue({
        data: { transaction: { ...SPLIT.data.transaction, memo: 'Dinner and a gift' } },
      });

      const result = await tool.execute({ transactionId: 't1', memo: 'Dinner and a gift' });

      expect(result).not.toHaveProperty('isError');
      expect(mockApi.transactions.updateTransaction).toHaveBeenCalledWith('b1', 't1', {
        transaction: { memo: 'Dinner and a gift' },
      });
    });

    it('allows an unchanged amount and date alongside other edits', async () => {
      mockApi.transactions.updateTransaction.mockResolvedValue(SPLIT);

      const result = await tool.execute({ transactionId: 't1', amount: -5, date: '2026-01-01', approved: true });

      expect(result).not.toHaveProperty('isError');
      expect(mockApi.transactions.updateTransaction).toHaveBeenCalled();
    });
  });

  it('shows the YNAB error detail instead of [object Object]', async () => {
    mockApi.transactions.updateTransaction.mockRejectedValue({
      error: { id: '400', name: 'bad_request', detail: 'Invalid category' },
    });

    const result = await tool.execute({ transactionId: 't1', memo: 'x' });

    expect(result).toHaveProperty('isError', true);
    expect(result.content[0].text).toContain('Invalid category (YNAB error 400)');
  });
});
