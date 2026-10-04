import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import UpdateScheduledTransactionTool from '../tools/UpdateScheduledTransactionTool';
import { jsonSchemaObjectToZodShape } from '../utils/jsonSchemaToZod';

vi.mock('../utils/apiErrorHandler.js', () => ({
  handleAPIError: vi.fn(),
  createRetryableAPICall: (fn: any) => fn(),
}));

const EXISTING = {
  data: {
    scheduled_transaction: {
      id: 's1',
      account_id: 'a1',
      date_next: '2026-02-01',
      amount: -5000,
      frequency: 'monthly',
      payee_id: 'p1',
      payee_name: 'Rent',
      category_id: 'c1',
      memo: null,
      flag_color: 'red',
    },
  },
};

describe('UpdateScheduledTransactionTool', () => {
  let tool: UpdateScheduledTransactionTool;
  let mockApi: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi = {
      scheduledTransactions: {
        getScheduledTransactionById: vi.fn().mockResolvedValue(EXISTING),
        updateScheduledTransaction: vi.fn(),
      },
    };
    tool = new UpdateScheduledTransactionTool({ ynabApi: mockApi, budgetId: 'b1' });
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
      expect(obj.safeParse({ scheduledTransactionId: 's1', flagColor: 'red' }).success).toBe(true);
      expect(obj.safeParse({ scheduledTransactionId: 's1', flagColor: 'none' }).success).toBe(true);
      expect(obj.safeParse({ scheduledTransactionId: 's1', flagColor: 'chartreuse' }).success).toBe(false);
    });
  });

  describe('execute flag handling', () => {
    it('clears the flag when flagColor is "none"', async () => {
      mockApi.scheduledTransactions.updateScheduledTransaction.mockResolvedValue({
        data: { scheduled_transaction: { ...EXISTING.data.scheduled_transaction, flag_color: null } },
      });

      await tool.execute({ scheduledTransactionId: 's1', flagColor: 'none' });

      expect(mockApi.scheduledTransactions.updateScheduledTransaction).toHaveBeenCalledWith(
        'b1',
        's1',
        { scheduled_transaction: expect.objectContaining({ flag_color: null }) }
      );
    });

    it('sets a color flag', async () => {
      mockApi.scheduledTransactions.updateScheduledTransaction.mockResolvedValue({
        data: { scheduled_transaction: { ...EXISTING.data.scheduled_transaction, flag_color: 'blue' } },
      });

      await tool.execute({ scheduledTransactionId: 's1', flagColor: 'blue' });

      expect(mockApi.scheduledTransactions.updateScheduledTransaction).toHaveBeenCalledWith(
        'b1',
        's1',
        { scheduled_transaction: expect.objectContaining({ flag_color: 'blue' }) }
      );
    });
  });
});
