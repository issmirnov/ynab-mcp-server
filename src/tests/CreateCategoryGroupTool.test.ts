import { describe, it, expect, beforeEach, vi } from 'vitest';
import CreateCategoryGroupTool from '../tools/CreateCategoryGroupTool';

describe('CreateCategoryGroupTool', () => {
  let tool: CreateCategoryGroupTool;
  let mockApi: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi = {
      categories: {
        createCategoryGroup: vi.fn(),
      },
    };
    tool = new CreateCategoryGroupTool({ ynabApi: mockApi, budgetId: 'test-budget-id' });
  });

  it('creates a category group and returns json', async () => {
    mockApi.categories.createCategoryGroup.mockResolvedValue({
      data: { category_group: { id: 'cg-1', name: 'Savings Goals' } },
    });

    const result = await tool.execute({ name: 'Savings Goals', response_format: 'json' });

    expect(mockApi.categories.createCategoryGroup).toHaveBeenCalledWith('test-budget-id', {
      category_group: { name: 'Savings Goals' },
    });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      success: true,
      categoryGroupId: 'cg-1',
      name: 'Savings Goals',
    });
  });

  it('formats markdown by default', async () => {
    mockApi.categories.createCategoryGroup.mockResolvedValue({
      data: { category_group: { id: 'cg-2', name: 'Monthly Bills' } },
    });

    const result = await tool.execute({ name: 'Monthly Bills' });

    expect(result.content[0].text).toContain('Category Group Created');
    expect(result.content[0].text).toContain('cg-2');
    expect(result.content[0].text).toContain('Monthly Bills');
  });

  it('honors a budgetId override', async () => {
    mockApi.categories.createCategoryGroup.mockResolvedValue({
      data: { category_group: { id: 'cg-3', name: 'X' } },
    });

    await tool.execute({ budgetId: 'custom-budget', name: 'X' });

    expect(mockApi.categories.createCategoryGroup).toHaveBeenCalledWith(
      'custom-budget',
      expect.anything()
    );
  });

  it('rejects an empty name without calling the API', async () => {
    const result = await tool.execute({ name: '   ' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/non-empty 'name'/);
    expect(mockApi.categories.createCategoryGroup).not.toHaveBeenCalled();
  });

  it('rejects names longer than 50 characters', async () => {
    const result = await tool.execute({ name: 'a'.repeat(51) });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/50 characters/);
    expect(mockApi.categories.createCategoryGroup).not.toHaveBeenCalled();
  });

  it('returns isError when the API call fails', async () => {
    mockApi.categories.createCategoryGroup.mockRejectedValue(new Error('401 Unauthorized'));

    const result = await tool.execute({ name: 'Savings' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error creating category group');
  });
});
