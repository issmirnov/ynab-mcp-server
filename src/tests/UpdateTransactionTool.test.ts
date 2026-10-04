import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import UpdateTransactionTool from '../tools/UpdateTransactionTool';
import { jsonSchemaObjectToZodShape } from '../utils/jsonSchemaToZod';

vi.mock('../utils/apiErrorHandler.js', () => ({
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
});
