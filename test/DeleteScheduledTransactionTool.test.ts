import { describe, it, expect, vi } from 'vitest';
import DeleteScheduledTransactionTool from '../src/tools/DeleteScheduledTransactionTool';

function createMockApi(mockFns: Record<string, any>) {
  return {
    scheduledTransactions: mockFns,
  } as any;
}

const mockScheduledTransaction = {
  id: 'scheduled-123',
  account_id: 'account-456',
  account_name: 'Checking',
  payee_name: 'Netflix',
  amount: -15990,
  category_id: 'cat-1',
  category_name: 'Subscriptions',
  memo: 'Monthly subscription',
  date_first: '2024-01-01',
  date_next: '2024-04-01',
  frequency: 'monthly',
  flag_color: null,
  deleted: false,
  subtransactions: [],
};

describe('DeleteScheduledTransactionTool', () => {
  function createTool(overrides?: Record<string, any>) {
    const getScheduledTransactionById = vi.fn(async () => ({
      data: { scheduled_transaction: mockScheduledTransaction },
    }));
    const deleteScheduledTransaction = vi.fn(async () => ({
      data: { scheduled_transaction: { ...mockScheduledTransaction, deleted: true } },
    }));
    const api = createMockApi({
      getScheduledTransactionById,
      deleteScheduledTransaction,
      ...overrides,
    });
    const tool = new DeleteScheduledTransactionTool({
      ynabApi: api,
      budgetId: 'test-budget-id',
    });
    return { tool, getScheduledTransactionById, deleteScheduledTransaction };
  }

  describe('execute', () => {
    it('should delete a scheduled transaction and return its details', async () => {
      const { tool } = createTool();
      const result = await tool.execute({
        scheduledTransactionId: 'scheduled-123',
        response_format: 'json',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.deleted.id).toBe('scheduled-123');
      expect(parsed.deleted.payeeName).toBe('Netflix');
      expect(parsed.deleted.amount).toBe(-15.99);
      expect(parsed.deleted.frequency).toBe('monthly');
    });

    it('should call both get and delete API methods', async () => {
      const { tool, getScheduledTransactionById, deleteScheduledTransaction } = createTool();

      await tool.execute({ scheduledTransactionId: 'scheduled-123' });

      expect(getScheduledTransactionById).toHaveBeenCalledWith(
        'test-budget-id',
        'scheduled-123'
      );
      expect(deleteScheduledTransaction).toHaveBeenCalledWith(
        'test-budget-id',
        'scheduled-123'
      );
    });

    it('should return markdown format by default', async () => {
      const { tool } = createTool();
      const result = await tool.execute({ scheduledTransactionId: 'scheduled-123' });

      expect(result.content[0].text).toContain('# Scheduled Transaction Deleted');
      expect(result.content[0].text).toContain('Netflix');
      expect(result.content[0].text).toContain('monthly');
    });

    it('should handle API errors when transaction not found', async () => {
      const getScheduledTransactionById = vi.fn(async () => { throw new Error('Not found'); });
      const api = createMockApi({ getScheduledTransactionById });
      const tool = new DeleteScheduledTransactionTool({
        ynabApi: api,
        budgetId: 'test-budget-id',
      });

      const result = await tool.execute({ scheduledTransactionId: 'nonexistent' });

      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('Error deleting scheduled transaction');
      expect(result.content[0].text).toContain('Not found');
    });

    it('should handle delete API failure', async () => {
      const deleteScheduledTransaction = vi.fn(async () => { throw new Error('Permission denied'); });
      const { tool } = createTool({ deleteScheduledTransaction });

      const result = await tool.execute({ scheduledTransactionId: 'scheduled-123' });

      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('Permission denied');
    });
  });

  describe('tool configuration', () => {
    it('should have correct name and description', () => {
      const { tool } = createTool();
      const def = tool.getToolDefinition();
      expect(def.name).toBe('ynab_delete_scheduled_transaction');
      expect(def.description).toContain('Deletes');
      expect(def.description).toContain('permanent');
    });

    it('should require only scheduledTransactionId', () => {
      const { tool } = createTool();
      const def = tool.getToolDefinition();
      expect(def.inputSchema.required).toEqual(['scheduledTransactionId']);
    });

    it('should have correct annotations for a destructive tool', () => {
      const { tool } = createTool();
      const def = tool.getToolDefinition();
      expect(def.annotations?.readOnlyHint).toBe(false);
      expect(def.annotations?.destructiveHint).toBe(true);
      expect(def.annotations?.idempotentHint).toBe(true);
    });
  });
});
