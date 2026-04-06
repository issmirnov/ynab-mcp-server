import { describe, it, expect, vi, beforeEach } from 'vitest';
import DeleteTransactionTool from '../src/tools/DeleteTransactionTool';

const mockTransaction = {
  id: 'txn-123',
  account_id: 'account-456',
  account_name: 'Checking',
  payee_name: 'Amazon',
  amount: -42500,
  category_id: 'cat-1',
  category_name: 'Shopping',
  memo: 'Household supplies',
  date: '2024-03-15',
  approved: true,
  cleared: 'cleared',
  flag_color: null,
  deleted: false,
  subtransactions: [],
};

// Mock global fetch for the raw DELETE call
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('DeleteTransactionTool', () => {
  function createTool(overrides?: Record<string, any>) {
    const getTransactionById = vi.fn(async () => ({
      data: { transaction: mockTransaction },
    }));
    const api = {
      transactions: { getTransactionById, ...overrides },
    } as any;
    const tool = new DeleteTransactionTool({
      ynabApi: api,
      budgetId: 'test-budget-id',
      accessToken: 'test-token',
    });
    return { tool, getTransactionById };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { transaction: { ...mockTransaction, deleted: true } } }),
    });
  });

  describe('execute', () => {
    it('should delete a transaction and return its details', async () => {
      const { tool } = createTool();
      const result = await tool.execute({
        transactionId: 'txn-123',
        response_format: 'json',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.deleted.id).toBe('txn-123');
      expect(parsed.deleted.payeeName).toBe('Amazon');
      expect(parsed.deleted.amount).toBe(-42.50);
    });

    it('should call fetch with correct URL and auth header', async () => {
      const { tool } = createTool();
      await tool.execute({ transactionId: 'txn-123' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.ynab.com/v1/budgets/test-budget-id/transactions/txn-123',
        {
          method: 'DELETE',
          headers: {
            Authorization: 'Bearer test-token',
          },
        }
      );
    });

    it('should return markdown format by default', async () => {
      const { tool } = createTool();
      const result = await tool.execute({ transactionId: 'txn-123' });

      expect(result.content[0].text).toContain('# Transaction Deleted');
      expect(result.content[0].text).toContain('Amazon');
    });

    it('should handle fetch errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => '{"error":{"id":"404","name":"not_found","detail":"Transaction not found"}}',
      });

      const { tool } = createTool();
      const result = await tool.execute({ transactionId: 'txn-missing' });

      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('Error deleting transaction');
    });

    it('should handle get transaction errors', async () => {
      const getTransactionById = vi.fn(async () => { throw new Error('Not found'); });
      const api = { transactions: { getTransactionById } } as any;
      const tool = new DeleteTransactionTool({
        ynabApi: api,
        budgetId: 'test-budget-id',
        accessToken: 'test-token',
      });

      const result = await tool.execute({ transactionId: 'nonexistent' });

      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('Not found');
    });
  });

  describe('tool configuration', () => {
    it('should have correct name', () => {
      const { tool } = createTool();
      expect(tool.getToolDefinition().name).toBe('ynab_delete_transaction');
    });

    it('should require only transactionId', () => {
      const { tool } = createTool();
      expect(tool.getToolDefinition().inputSchema.required).toEqual(['transactionId']);
    });

    it('should have destructiveHint true', () => {
      const { tool } = createTool();
      const def = tool.getToolDefinition();
      expect(def.annotations?.destructiveHint).toBe(true);
      expect(def.annotations?.readOnlyHint).toBe(false);
    });
  });
});
