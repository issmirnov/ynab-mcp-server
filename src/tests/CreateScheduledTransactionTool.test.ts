import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import * as ynab from 'ynab';
import CreateScheduledTransactionTool from '../tools/CreateScheduledTransactionTool';

vi.mock('ynab');

describe('CreateScheduledTransactionTool', () => {
  let tool: CreateScheduledTransactionTool;
  let mockApi: {
    scheduledTransactions: {
      createScheduledTransaction: Mock;
    };
  };

  const mockScheduledTransaction = {
    id: 'scheduled-123',
    account_id: 'account-456',
    payee_name: 'Netflix',
    amount: -15990,
    category_id: 'category-789',
    memo: 'Monthly subscription',
    date_first: '2024-04-01',
    date_next: '2024-04-01',
    frequency: 'monthly',
    flag_color: null,
    deleted: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockApi = {
      scheduledTransactions: {
        createScheduledTransaction: vi.fn(),
      },
    };

    (ynab.API as any).mockImplementation(() => mockApi);

    process.env.YNAB_API_TOKEN = 'test-token';
    process.env.YNAB_BUDGET_ID = 'test-budget-id';

    tool = new CreateScheduledTransactionTool();
  });

  describe('execute', () => {
    it('should create a scheduled transaction with payeeName', async () => {
      mockApi.scheduledTransactions.createScheduledTransaction.mockResolvedValue({
        data: { scheduled_transaction: mockScheduledTransaction },
      });

      const input = {
        budgetId: 'test-budget-id',
        accountId: 'account-456',
        date: '2024-04-01',
        amount: -15.99,
        frequency: 'monthly',
        payeeName: 'Netflix',
        categoryId: 'category-789',
        memo: 'Monthly subscription',
        response_format: 'json' as const,
      };

      const result = await tool.execute(input);

      expect(mockApi.scheduledTransactions.createScheduledTransaction).toHaveBeenCalledWith(
        'test-budget-id',
        {
          scheduled_transaction: {
            account_id: 'account-456',
            date: '2024-04-01',
            amount: -15990,
            frequency: 'monthly',
            payee_id: undefined,
            payee_name: 'Netflix',
            category_id: 'category-789',
            memo: 'Monthly subscription',
            flag_color: undefined,
          },
        }
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.scheduledTransactionId).toBe('scheduled-123');
      expect(parsed.frequency).toBe('monthly');
    });

    it('should create a scheduled transaction with payeeId', async () => {
      mockApi.scheduledTransactions.createScheduledTransaction.mockResolvedValue({
        data: { scheduled_transaction: mockScheduledTransaction },
      });

      const input = {
        accountId: 'account-456',
        date: '2024-04-01',
        amount: -15.99,
        frequency: 'monthly',
        payeeId: 'payee-123',
        response_format: 'json' as const,
      };

      const result = await tool.execute(input);

      expect(mockApi.scheduledTransactions.createScheduledTransaction).toHaveBeenCalledWith(
        'test-budget-id',
        expect.objectContaining({
          scheduled_transaction: expect.objectContaining({
            payee_id: 'payee-123',
            payee_name: undefined,
          }),
        })
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it('should use budget ID from environment when not provided', async () => {
      mockApi.scheduledTransactions.createScheduledTransaction.mockResolvedValue({
        data: { scheduled_transaction: mockScheduledTransaction },
      });

      const result = await tool.execute({
        accountId: 'account-456',
        date: '2024-04-01',
        amount: -15.99,
        frequency: 'weekly',
        payeeName: 'Gym',
      });

      expect(mockApi.scheduledTransactions.createScheduledTransaction).toHaveBeenCalledWith(
        'test-budget-id',
        expect.any(Object)
      );
      expect(result.content[0]).toBeTruthy();
    });

    it('should support all frequency values', async () => {
      const frequencies = [
        'never', 'daily', 'weekly', 'everyOtherWeek', 'twiceAMonth',
        'every4Weeks', 'monthly', 'everyOtherMonth', 'every3Months',
        'every4Months', 'twiceAYear', 'yearly', 'everyOtherYear',
      ];

      for (const frequency of frequencies) {
        mockApi.scheduledTransactions.createScheduledTransaction.mockResolvedValue({
          data: { scheduled_transaction: { ...mockScheduledTransaction, frequency } },
        });

        const result = await tool.execute({
          accountId: 'account-456',
          date: '2024-04-01',
          amount: -10,
          frequency,
          payeeName: 'Test',
          response_format: 'json',
        });

        expect(result).not.toHaveProperty('isError');
      }
    });

    it('should return markdown format by default', async () => {
      mockApi.scheduledTransactions.createScheduledTransaction.mockResolvedValue({
        data: { scheduled_transaction: mockScheduledTransaction },
      });

      const result = await tool.execute({
        accountId: 'account-456',
        date: '2024-04-01',
        amount: -15.99,
        frequency: 'monthly',
        payeeName: 'Netflix',
      });

      expect(result.content[0].text).toContain('# Scheduled Transaction Created Successfully');
      expect(result.content[0].text).toContain('scheduled-123');
      expect(result.content[0].text).toContain('monthly');
    });

    it('should include flagColor when provided', async () => {
      mockApi.scheduledTransactions.createScheduledTransaction.mockResolvedValue({
        data: { scheduled_transaction: mockScheduledTransaction },
      });

      await tool.execute({
        accountId: 'account-456',
        date: '2024-04-01',
        amount: -15.99,
        frequency: 'monthly',
        payeeName: 'Netflix',
        flagColor: 'red',
      });

      expect(mockApi.scheduledTransactions.createScheduledTransaction).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          scheduled_transaction: expect.objectContaining({
            flag_color: 'red',
          }),
        })
      );
    });

    it('should error when neither payeeId nor payeeName is provided', async () => {
      const result = await tool.execute({
        accountId: 'account-456',
        date: '2024-04-01',
        amount: -15.99,
        frequency: 'monthly',
      });

      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('payeeId or payeeName must be provided');
    });

    it('should error when no budget ID is available', async () => {
      delete process.env.YNAB_BUDGET_ID;
      tool = new CreateScheduledTransactionTool();

      const result = await tool.execute({
        accountId: 'account-456',
        date: '2024-04-01',
        amount: -15.99,
        frequency: 'monthly',
        payeeName: 'Netflix',
      });

      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('Error creating scheduled transaction:');
      expect(result.content[0].text).toContain('Budget ID is required');
    });

    it('should error when API returns no data', async () => {
      mockApi.scheduledTransactions.createScheduledTransaction.mockResolvedValue({
        data: { scheduled_transaction: null },
      });

      const result = await tool.execute({
        budgetId: 'test-budget-id',
        accountId: 'account-456',
        date: '2024-04-01',
        amount: -15.99,
        frequency: 'monthly',
        payeeName: 'Netflix',
      });

      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('Failed to create scheduled transaction');
    });

    it('should handle API errors gracefully', async () => {
      mockApi.scheduledTransactions.createScheduledTransaction.mockRejectedValue(
        new Error('Network error')
      );

      const result = await tool.execute({
        budgetId: 'test-budget-id',
        accountId: 'account-456',
        date: '2024-04-01',
        amount: -15.99,
        frequency: 'monthly',
        payeeName: 'Netflix',
      });

      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('Error creating scheduled transaction:');
      expect(result.content[0].text).toContain('Network error');
    });

    it('should correctly convert dollar amounts to milliunits', async () => {
      mockApi.scheduledTransactions.createScheduledTransaction.mockResolvedValue({
        data: { scheduled_transaction: mockScheduledTransaction },
      });

      await tool.execute({
        budgetId: 'test-budget-id',
        accountId: 'account-456',
        date: '2024-04-01',
        amount: -99.99,
        frequency: 'monthly',
        payeeName: 'Rent',
      });

      expect(mockApi.scheduledTransactions.createScheduledTransaction).toHaveBeenCalledWith(
        'test-budget-id',
        expect.objectContaining({
          scheduled_transaction: expect.objectContaining({
            amount: -99990,
          }),
        })
      );
    });
  });

  describe('tool configuration', () => {
    it('should have correct name and description', () => {
      const def = tool.getToolDefinition();
      expect(def.name).toBe('ynab_create_scheduled_transaction');
      expect(def.description).toContain('scheduled');
      expect(def.description).toContain('recurring');
    });

    it('should list required fields correctly', () => {
      const def = tool.getToolDefinition();
      expect(def.inputSchema.required).toContain('accountId');
      expect(def.inputSchema.required).toContain('date');
      expect(def.inputSchema.required).toContain('amount');
      expect(def.inputSchema.required).toContain('frequency');
    });

    it('should list all frequency enum values', () => {
      const def = tool.getToolDefinition();
      const freq = (def.inputSchema.properties as any).frequency;
      expect(freq.enum).toContain('monthly');
      expect(freq.enum).toContain('weekly');
      expect(freq.enum).toContain('yearly');
      expect(freq.enum).toContain('never');
    });

    it('should have correct annotations', () => {
      const def = tool.getToolDefinition();
      expect(def.annotations?.readOnlyHint).toBe(false);
      expect(def.annotations?.destructiveHint).toBe(false);
      expect(def.annotations?.openWorldHint).toBe(true);
    });
  });
});
