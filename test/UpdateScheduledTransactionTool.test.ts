import { describe, it, expect, vi } from 'vitest';
import UpdateScheduledTransactionTool from '../src/tools/UpdateScheduledTransactionTool';

function createMockApi(mockFns: Record<string, any>) {
  return {
    scheduledTransactions: mockFns,
  } as any;
}

const mockExistingTransaction = {
  id: 'scheduled-123',
  account_id: 'account-456',
  account_name: 'Checking',
  payee_id: 'payee-1',
  payee_name: 'Netflix',
  amount: -15990,
  category_id: 'cat-1',
  category_name: 'Subscriptions',
  memo: 'Monthly subscription',
  date_first: '2024-01-01',
  date_next: '2024-04-01',
  frequency: 'monthly',
  flag_color: null,
  flag_name: null,
  deleted: false,
  subtransactions: [],
};

describe('UpdateScheduledTransactionTool', () => {
  function createTool(overrides?: Record<string, any>) {
    const getScheduledTransactionById = vi.fn(async () => ({
      data: { scheduled_transaction: mockExistingTransaction },
    }));
    const updateScheduledTransaction = vi.fn(async (_budgetId: string, _id: string, wrapper: any) => ({
      data: {
        scheduled_transaction: {
          ...mockExistingTransaction,
          ...wrapper.scheduled_transaction,
          // Simulate API resolving names
          account_name: 'Checking',
          payee_name: wrapper.scheduled_transaction.payee_name ?? mockExistingTransaction.payee_name,
          category_name: wrapper.scheduled_transaction.category_id === mockExistingTransaction.category_id
            ? mockExistingTransaction.category_name
            : 'New Category',
        },
      },
    }));
    const api = createMockApi({
      getScheduledTransactionById,
      updateScheduledTransaction,
      ...overrides,
    });
    const tool = new UpdateScheduledTransactionTool({
      ynabApi: api,
      budgetId: 'test-budget-id',
    });
    return { tool, getScheduledTransactionById, updateScheduledTransaction };
  }

  describe('execute', () => {
    it('should update amount on a scheduled transaction', async () => {
      const updateScheduledTransaction = vi.fn(async () => ({
        data: {
          scheduled_transaction: {
            ...mockExistingTransaction,
            amount: -19990,
          },
        },
      }));
      const { tool } = createTool({ updateScheduledTransaction });

      const result = await tool.execute({
        scheduledTransactionId: 'scheduled-123',
        amount: -19.99,
        response_format: 'json',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.amount).toBe(-19.99);
      expect(parsed.changes).toContain('Amount: $-15.99 → $-19.99');
    });

    it('should update memo on a scheduled transaction', async () => {
      const updateScheduledTransaction = vi.fn(async () => ({
        data: {
          scheduled_transaction: {
            ...mockExistingTransaction,
            memo: 'New memo',
          },
        },
      }));
      const { tool } = createTool({ updateScheduledTransaction });

      const result = await tool.execute({
        scheduledTransactionId: 'scheduled-123',
        memo: 'New memo',
        response_format: 'json',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.memo).toBe('New memo');
    });

    it('should merge with existing fields when only some fields provided', async () => {
      const { tool, updateScheduledTransaction } = createTool();

      await tool.execute({
        scheduledTransactionId: 'scheduled-123',
        memo: 'Updated memo',
      });

      expect(updateScheduledTransaction).toHaveBeenCalledWith(
        'test-budget-id',
        'scheduled-123',
        {
          scheduled_transaction: expect.objectContaining({
            account_id: 'account-456',
            date: '2024-04-01',
            amount: -15990,
            frequency: 'monthly',
            payee_id: 'payee-1',
            payee_name: 'Netflix',
            category_id: 'cat-1',
            memo: 'Updated memo',
            flag_color: null,
          }),
        }
      );
    });

    it('should null out payee_id when payeeName is provided without payeeId', async () => {
      const { tool, updateScheduledTransaction } = createTool();

      await tool.execute({
        scheduledTransactionId: 'scheduled-123',
        payeeName: 'New Payee',
      });

      expect(updateScheduledTransaction).toHaveBeenCalledWith(
        'test-budget-id',
        'scheduled-123',
        expect.objectContaining({
          scheduled_transaction: expect.objectContaining({
            payee_id: null,
            payee_name: 'New Payee',
          }),
        })
      );
    });

    it('should preserve payee_id when neither payeeName nor payeeId is provided', async () => {
      const { tool, updateScheduledTransaction } = createTool();

      await tool.execute({
        scheduledTransactionId: 'scheduled-123',
        memo: 'Just a memo change',
      });

      expect(updateScheduledTransaction).toHaveBeenCalledWith(
        'test-budget-id',
        'scheduled-123',
        expect.objectContaining({
          scheduled_transaction: expect.objectContaining({
            payee_id: 'payee-1',
            payee_name: 'Netflix',
          }),
        })
      );
    });

    it('should allow clearing flagColor with null', async () => {
      const existingWithFlag = { ...mockExistingTransaction, flag_color: 'red' };
      const getScheduledTransactionById = vi.fn(async () => ({
        data: { scheduled_transaction: existingWithFlag },
      }));
      const updateScheduledTransaction = vi.fn(async () => ({
        data: {
          scheduled_transaction: { ...existingWithFlag, flag_color: null },
        },
      }));
      const { tool } = createTool({ getScheduledTransactionById, updateScheduledTransaction });

      const result = await tool.execute({
        scheduledTransactionId: 'scheduled-123',
        flagColor: null,
        response_format: 'json',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it('should return markdown format by default', async () => {
      const updateScheduledTransaction = vi.fn(async () => ({
        data: {
          scheduled_transaction: { ...mockExistingTransaction, amount: -19990 },
        },
      }));
      const { tool } = createTool({ updateScheduledTransaction });

      const result = await tool.execute({
        scheduledTransactionId: 'scheduled-123',
        amount: -19.99,
      });

      expect(result.content[0].text).toContain('# Scheduled Transaction Updated Successfully');
      expect(result.content[0].text).toContain('Changes');
    });

    it('should error when API returns no data', async () => {
      const updateScheduledTransaction = vi.fn(async () => ({
        data: { scheduled_transaction: null },
      }));
      const { tool } = createTool({ updateScheduledTransaction });

      const result = await tool.execute({
        scheduledTransactionId: 'scheduled-123',
        amount: -19.99,
      });

      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('Failed to update scheduled transaction');
    });

    it('should handle API errors gracefully', async () => {
      const getScheduledTransactionById = vi.fn(async () => { throw new Error('Not found'); });
      const api = createMockApi({ getScheduledTransactionById });
      const tool = new UpdateScheduledTransactionTool({
        ynabApi: api,
        budgetId: 'test-budget-id',
      });

      const result = await tool.execute({
        scheduledTransactionId: 'nonexistent',
      });

      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('Error updating scheduled transaction');
      expect(result.content[0].text).toContain('Not found');
    });
  });

  describe('tool configuration', () => {
    it('should have correct name and description', () => {
      const { tool } = createTool();
      const def = tool.getToolDefinition();
      expect(def.name).toBe('ynab_update_scheduled_transaction');
      expect(def.description).toContain('Updates');
      expect(def.description).toContain('scheduled');
    });

    it('should require only scheduledTransactionId', () => {
      const { tool } = createTool();
      const def = tool.getToolDefinition();
      expect(def.inputSchema.required).toEqual(['scheduledTransactionId']);
    });

    it('should have correct annotations for a write tool', () => {
      const { tool } = createTool();
      const def = tool.getToolDefinition();
      expect(def.annotations?.readOnlyHint).toBe(false);
      expect(def.annotations?.destructiveHint).toBe(false);
      expect(def.annotations?.idempotentHint).toBe(true);
    });
  });
});
