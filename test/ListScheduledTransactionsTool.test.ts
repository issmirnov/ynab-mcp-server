import { describe, it, expect, vi } from 'vitest';
import ListScheduledTransactionsTool from '../src/tools/ListScheduledTransactionsTool';

function createMockApi(mockFns: Record<string, any>) {
  return {
    scheduledTransactions: mockFns,
  } as any;
}

const mockScheduledTransactions = [
  {
    id: 'scheduled-1',
    account_id: 'account-1',
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
    flag_name: null,
    deleted: false,
    subtransactions: [],
  },
  {
    id: 'scheduled-2',
    account_id: 'account-1',
    account_name: 'Checking',
    payee_name: 'Gym',
    amount: -49990,
    category_id: 'cat-2',
    category_name: 'Fitness',
    memo: null,
    date_first: '2024-02-01',
    date_next: '2024-04-15',
    frequency: 'monthly',
    flag_color: 'blue',
    flag_name: 'Blue',
    deleted: false,
    subtransactions: [],
  },
  {
    id: 'scheduled-deleted',
    account_id: 'account-1',
    account_name: 'Checking',
    payee_name: 'Old Service',
    amount: -9990,
    category_id: 'cat-1',
    category_name: 'Subscriptions',
    memo: null,
    date_first: '2023-01-01',
    date_next: '2024-04-01',
    frequency: 'monthly',
    flag_color: null,
    flag_name: null,
    deleted: true,
    subtransactions: [],
  },
];

describe('ListScheduledTransactionsTool', () => {
  function createTool(overrides?: Record<string, any>) {
    const getScheduledTransactions = vi.fn(async () => ({
      data: { scheduled_transactions: mockScheduledTransactions },
    }));
    const api = createMockApi({ getScheduledTransactions, ...overrides });
    const tool = new ListScheduledTransactionsTool({
      ynabApi: api,
      budgetId: 'test-budget-id',
    });
    return { tool, getScheduledTransactions };
  }

  describe('execute', () => {
    it('should list scheduled transactions excluding deleted ones', async () => {
      const { tool } = createTool();
      const result = await tool.execute({ response_format: 'json' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.scheduled_transactions).toHaveLength(2);
      expect(parsed.scheduled_transactions[0].id).toBe('scheduled-1');
      expect(parsed.scheduled_transactions[1].id).toBe('scheduled-2');
      expect(parsed.pagination.total).toBe(2);
    });

    it('should convert milliunits to dollars', async () => {
      const { tool } = createTool();
      const result = await tool.execute({ response_format: 'json' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.scheduled_transactions[0].amount).toBe(-15.99);
      expect(parsed.scheduled_transactions[1].amount).toBe(-49.99);
    });

    it('should apply pagination', async () => {
      const { tool } = createTool();
      const result = await tool.execute({ response_format: 'json', limit: 1, offset: 0 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.scheduled_transactions).toHaveLength(1);
      expect(parsed.pagination.has_more).toBe(true);
      expect(parsed.pagination.next_offset).toBe(1);
    });

    it('should return markdown format by default', async () => {
      const { tool } = createTool();
      const result = await tool.execute({});

      expect(result.content[0].text).toContain('# Scheduled Transactions');
      expect(result.content[0].text).toContain('Netflix');
      expect(result.content[0].text).toContain('Gym');
      expect(result.content[0].text).not.toContain('Old Service');
    });

    it('should handle empty results', async () => {
      const api = createMockApi({
        getScheduledTransactions: vi.fn(async () => ({
          data: { scheduled_transactions: [] },
        })),
      });
      const tool = new ListScheduledTransactionsTool({
        ynabApi: api,
        budgetId: 'test-budget-id',
      });
      const result = await tool.execute({ response_format: 'json' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.scheduled_transactions).toHaveLength(0);
      expect(parsed.pagination.total).toBe(0);
    });

    it('should handle API errors gracefully', async () => {
      const api = createMockApi({
        getScheduledTransactions: vi.fn(async () => { throw new Error('Network error'); }),
      });
      const tool = new ListScheduledTransactionsTool({
        ynabApi: api,
        budgetId: 'test-budget-id',
      });
      const result = await tool.execute({});

      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('Error listing scheduled transactions');
      expect(result.content[0].text).toContain('Network error');
    });

    it('should cap limit at 100', async () => {
      const { tool } = createTool();
      const result = await tool.execute({ response_format: 'json', limit: 200 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.limit).toBe(100);
    });
  });

  describe('tool configuration', () => {
    it('should have correct name and description', () => {
      const { tool } = createTool();
      const def = tool.getToolDefinition();
      expect(def.name).toBe('ynab_list_scheduled_transactions');
      expect(def.description).toContain('scheduled');
      expect(def.description).toContain('recurring');
    });

    it('should have correct annotations for a read-only tool', () => {
      const { tool } = createTool();
      const def = tool.getToolDefinition();
      expect(def.annotations?.readOnlyHint).toBe(true);
      expect(def.annotations?.destructiveHint).toBe(false);
      expect(def.annotations?.idempotentHint).toBe(true);
    });
  });
});
