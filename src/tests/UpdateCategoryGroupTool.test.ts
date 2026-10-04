import { describe, it, expect, beforeEach, vi } from 'vitest';
import UpdateCategoryGroupTool from '../tools/UpdateCategoryGroupTool';

const categoriesResponse = {
  data: {
    category_groups: [
      { id: 'cg-1', name: 'Monthly Bills', deleted: false, categories: [] },
      { id: 'cg-2', name: 'Savings', deleted: false, categories: [] },
    ],
  },
};

describe('UpdateCategoryGroupTool', () => {
  let tool: UpdateCategoryGroupTool;
  let mockApi: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi = {
      categories: {
        getCategories: vi.fn().mockResolvedValue(categoriesResponse),
        updateCategoryGroup: vi.fn(),
      },
    };
    tool = new UpdateCategoryGroupTool({ ynabApi: mockApi, budgetId: 'test-budget-id' });
  });

  it('renames a group resolved by name', async () => {
    mockApi.categories.updateCategoryGroup.mockResolvedValue({
      data: { category_group: { id: 'cg-1', name: 'Bills' } },
    });

    const result = await tool.execute({
      categoryGroupName: 'Monthly',
      name: 'Bills',
      response_format: 'json',
    });

    expect(mockApi.categories.updateCategoryGroup).toHaveBeenCalledWith('test-budget-id', 'cg-1', {
      category_group: { name: 'Bills' },
    });
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      success: true,
      categoryGroupId: 'cg-1',
      name: 'Bills',
      previousName: 'Monthly Bills',
    });
  });

  it('renames a group resolved by id', async () => {
    mockApi.categories.updateCategoryGroup.mockResolvedValue({
      data: { category_group: { id: 'cg-2', name: 'Rainy Day' } },
    });

    await tool.execute({ categoryGroupId: 'cg-2', name: 'Rainy Day' });

    expect(mockApi.categories.updateCategoryGroup).toHaveBeenCalledWith(
      'test-budget-id',
      'cg-2',
      { category_group: { name: 'Rainy Day' } }
    );
  });

  it('errors when the group cannot be found', async () => {
    const result = await tool.execute({ categoryGroupName: 'Nope', name: 'X' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Category group not found');
    expect(mockApi.categories.updateCategoryGroup).not.toHaveBeenCalled();
  });

  it('rejects an empty name before any read', async () => {
    const result = await tool.execute({ categoryGroupId: 'cg-1', name: '  ' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/non-empty 'name'/);
    expect(mockApi.categories.getCategories).not.toHaveBeenCalled();
  });

  it('rejects names longer than 50 characters', async () => {
    const result = await tool.execute({ categoryGroupId: 'cg-1', name: 'a'.repeat(51) });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/50 characters/);
  });

  it('errors when neither group id nor name is provided', async () => {
    const result = await tool.execute({ name: 'X' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/categoryGroupId or categoryGroupName/);
  });

  it('returns isError when the API call fails', async () => {
    mockApi.categories.updateCategoryGroup.mockRejectedValue(new Error('401 Unauthorized'));

    const result = await tool.execute({ categoryGroupId: 'cg-1', name: 'Bills' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error updating category group');
  });
});
