import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import * as ynab from 'ynab';
import ListBudgetsTool from '../tools/ListBudgetsTool';

vi.mock('ynab');

// No need to mock mcp-framework anymore

describe('ListBudgetsTool', () => {
  let tool: ListBudgetsTool;
  let mockApi: {
    budgets: {
      getBudgets: Mock;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockApi = {
      budgets: {
        getBudgets: vi.fn(),
      },
    };

    (ynab.API as any).mockImplementation(() => mockApi);

    process.env.YNAB_API_TOKEN = 'test-token';

    tool = new ListBudgetsTool();
  });

  describe('execute', () => {
    const mockBudgetsData = [
      {
        id: 'budget-1',
        name: 'My Personal Budget',
        last_modified_on: '2023-01-01T00:00:00Z',
        first_month: '2023-01-01',
        last_month: '2023-12-01',
        date_format: {
          format: 'MM/DD/YYYY',
        },
        currency_format: {
          iso_code: 'USD',
          example_format: '123,456.78',
          decimal_digits: 2,
          decimal_separator: '.',
          symbol_first: true,
          group_separator: ',',
          currency_symbol: '$',
          display_symbol: true,
        },
      },
      {
        id: 'budget-2',
        name: 'Family Budget',
        last_modified_on: '2023-01-02T00:00:00Z',
        first_month: '2023-01-01',
        last_month: '2023-12-01',
        date_format: {
          format: 'DD/MM/YYYY',
        },
        currency_format: {
          iso_code: 'EUR',
          example_format: '123.456,78',
          decimal_digits: 2,
          decimal_separator: ',',
          symbol_first: false,
          group_separator: '.',
          currency_symbol: '€',
          display_symbol: true,
        },
      },
      {
        id: 'budget-3',
        name: 'Business Budget',
        last_modified_on: '2023-01-03T00:00:00Z',
        first_month: '2023-01-01',
        last_month: '2023-12-01',
        date_format: {
          format: 'YYYY-MM-DD',
        },
        currency_format: {
          iso_code: 'GBP',
          example_format: '£123,456.78',
          decimal_digits: 2,
          decimal_separator: '.',
          symbol_first: true,
          group_separator: ',',
          currency_symbol: '£',
          display_symbol: true,
        },
      },
    ];

    it('should successfully list all budgets', async () => {
      mockApi.budgets.getBudgets.mockResolvedValue({
        data: { budgets: mockBudgetsData },
      });

      const result = await tool.execute({});

      expect(mockApi.budgets.getBudgets).toHaveBeenCalledWith();
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify([
              {
                id: 'budget-1',
                name: 'My Personal Budget',
              },
              {
                id: 'budget-2',
                name: 'Family Budget',
              },
              {
                id: 'budget-3',
                name: 'Business Budget',
              },
            ], null, 2),
          },
        ],
      });
    });

    it('should handle empty budget list', async () => {
      mockApi.budgets.getBudgets.mockResolvedValue({
        data: { budgets: [] },
      });

      const result = await tool.execute({});

      expect(mockApi.budgets.getBudgets).toHaveBeenCalledWith();
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify([], null, 2),
          },
        ],
      });
    });

    it('should handle single budget', async () => {
      const singleBudget = [mockBudgetsData[0]];
      
      mockApi.budgets.getBudgets.mockResolvedValue({
        data: { budgets: singleBudget },
      });

      const result = await tool.execute();

      expect(result).toEqual([
        {
          id: 'budget-1',
          name: 'My Personal Budget',
        },
      ]);
    });

    it('should return error message when YNAB API token is not set', async () => {
      delete process.env.YNAB_API_TOKEN;
      tool = new ListBudgetsTool();

      const result = await tool.execute({});

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "YNAB API Token is not set",
          },
        ],
      });
      expect(mockApi.budgets.getBudgets).not.toHaveBeenCalled();
    });

    it('should return error message when YNAB API token is empty string', async () => {
      process.env.YNAB_API_TOKEN = '';
      tool = new ListBudgetsTool();

      const result = await tool.execute();

      expect(result).toBe('YNAB API Token is not set');
      expect(mockApi.budgets.getBudgets).not.toHaveBeenCalled();
    });

    it('should handle API error', async () => {
      const apiError = new Error('API Error: Unauthorized');
      mockApi.budgets.getBudgets.mockRejectedValue(apiError);

      const result = await tool.execute();

      expect(result).toBe('Error listing budgets: {}');
    });

    it('should handle API error with error object', async () => {
      const apiError = {
        message: 'Network Error',
        code: 'NETWORK_ERROR',
        status: 500,
      };
      mockApi.budgets.getBudgets.mockRejectedValue(apiError);

      const result = await tool.execute();

      expect(result).toBe(
        'Error listing budgets: {"message":"Network Error","code":"NETWORK_ERROR","status":500}'
      );
    });

    it('should handle axios error', async () => {
      const axiosError = {
        isAxiosError: true,
        message: 'Request failed with status code 401',
        response: {
          status: 401,
          data: { error: { name: 'unauthorized' } },
        },
      };
      mockApi.budgets.getBudgets.mockRejectedValue(axiosError);

      const result = await tool.execute();

      expect(result).toContain('Error listing budgets:');
      expect(result).toContain('isAxiosError');
    });

    it('should handle budgets with special characters in names', async () => {
      const specialBudgets = [
        {
          id: 'budget-special-1',
          name: 'Budget with "Quotes" & Symbols!',
          last_modified_on: '2023-01-01T00:00:00Z',
          first_month: '2023-01-01',
          last_month: '2023-12-01',
          date_format: { format: 'MM/DD/YYYY' },
          currency_format: {
            iso_code: 'USD',
            example_format: '123,456.78',
            decimal_digits: 2,
            decimal_separator: '.',
            symbol_first: true,
            group_separator: ',',
            currency_symbol: '$',
            display_symbol: true,
          },
        },
        {
          id: 'budget-special-2',
          name: 'émojis 🎯 & ünîcødé',
          last_modified_on: '2023-01-02T00:00:00Z',
          first_month: '2023-01-01',
          last_month: '2023-12-01',
          date_format: { format: 'DD/MM/YYYY' },
          currency_format: {
            iso_code: 'EUR',
            example_format: '123.456,78',
            decimal_digits: 2,
            decimal_separator: ',',
            symbol_first: false,
            group_separator: '.',
            currency_symbol: '€',
            display_symbol: true,
          },
        },
      ];

      mockApi.budgets.getBudgets.mockResolvedValue({
        data: { budgets: specialBudgets },
      });

      const result = await tool.execute();

      expect(result).toEqual([
        {
          id: 'budget-special-1',
          name: 'Budget with "Quotes" & Symbols!',
        },
        {
          id: 'budget-special-2',
          name: 'émojis 🎯 & ünîcødé',
        },
      ]);
    });

    it('should handle budgets with empty names', async () => {
      const budgetsWithEmptyNames = [
        {
          id: 'budget-empty-1',
          name: '',
          last_modified_on: '2023-01-01T00:00:00Z',
          first_month: '2023-01-01',
          last_month: '2023-12-01',
          date_format: { format: 'MM/DD/YYYY' },
          currency_format: {
            iso_code: 'USD',
            example_format: '123,456.78',
            decimal_digits: 2,
            decimal_separator: '.',
            symbol_first: true,
            group_separator: ',',
            currency_symbol: '$',
            display_symbol: true,
          },
        },
        {
          id: 'budget-null-name',
          name: null,
          last_modified_on: '2023-01-02T00:00:00Z',
          first_month: '2023-01-01',
          last_month: '2023-12-01',
          date_format: { format: 'DD/MM/YYYY' },
          currency_format: {
            iso_code: 'EUR',
            example_format: '123.456,78',
            decimal_digits: 2,
            decimal_separator: ',',
            symbol_first: false,
            group_separator: '.',
            currency_symbol: '€',
            display_symbol: true,
          },
        },
      ];

      mockApi.budgets.getBudgets.mockResolvedValue({
        data: { budgets: budgetsWithEmptyNames },
      });

      const result = await tool.execute();

      expect(result).toEqual([
        {
          id: 'budget-empty-1',
          name: '',
        },
        {
          id: 'budget-null-name',
          name: null,
        },
      ]);
    });

    it('should handle very long budget names', async () => {
      const longName = 'A'.repeat(500); // Very long budget name
      const budgetWithLongName = [
        {
          id: 'budget-long-name',
          name: longName,
          last_modified_on: '2023-01-01T00:00:00Z',
          first_month: '2023-01-01',
          last_month: '2023-12-01',
          date_format: { format: 'MM/DD/YYYY' },
          currency_format: {
            iso_code: 'USD',
            example_format: '123,456.78',
            decimal_digits: 2,
            decimal_separator: '.',
            symbol_first: true,
            group_separator: ',',
            currency_symbol: '$',
            display_symbol: true,
          },
        },
      ];

      mockApi.budgets.getBudgets.mockResolvedValue({
        data: { budgets: budgetWithLongName },
      });

      const result = await tool.execute();

      expect(result).toEqual([
        {
          id: 'budget-long-name',
          name: longName,
        },
      ]);
    });
  });

  describe('tool configuration', () => {
    it('should have correct name and description', () => {
      const toolDef = tool.getToolDefinition();
      expect(toolDef.name).toBe('list_budgets');
      expect(toolDef.description).toBe('Lists all available budgets from YNAB API');
    });

    it('should have correct input schema', () => {
      const toolDef = tool.getToolDefinition();
      expect(toolDef.inputSchema).toEqual({
        type: "object",
        properties: {},
        additionalProperties: false,
      });
    });
  });
});