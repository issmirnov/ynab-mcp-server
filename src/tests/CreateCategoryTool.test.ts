import { describe, it, expect, beforeEach, vi } from 'vitest';
import CreateCategoryTool from '../tools/CreateCategoryTool';

const categoriesResponse = {
  data: {
    category_groups: [
      {
        id: 'cg-1',
        name: 'Monthly Bills',
        deleted: false,
        categories: [{ id: 'c1', name: 'Rent', deleted: false }],
      },
      { id: 'cg-2', name: 'Savings', deleted: false, categories: [] },
    ],
  },
};

describe('CreateCategoryTool', () => {
  let tool: CreateCategoryTool;
  let mockApi: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi = {
      categories: {
        getCategories: vi.fn(),
        createCategory: vi.fn(),
      },
    };
    tool = new CreateCategoryTool({ ynabApi: mockApi, budgetId: 'test-budget-id' });
  });

  it('creates a category using categoryGroupId without listing categories', async () => {
    mockApi.categories.createCategory.mockResolvedValue({
      data: { category: { id: 'c-new', name: 'Groceries', category_group_id: 'cg-1' } },
    });

    const result = await tool.execute({
      name: 'Groceries',
      categoryGroupId: 'cg-1',
      response_format: 'json',
    });

    expect(mockApi.categories.getCategories).not.toHaveBeenCalled();
    expect(mockApi.categories.createCategory).toHaveBeenCalledWith('test-budget-id', {
      category: { name: 'Groceries', category_group_id: 'cg-1', note: undefined },
    });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      success: true,
      categoryId: 'c-new',
      categoryGroupId: 'cg-1',
    });
  });

  it('resolves categoryGroupName (partial, case-insensitive) to an id', async () => {
    mockApi.categories.getCategories.mockResolvedValue(categoriesResponse);
    mockApi.categories.createCategory.mockResolvedValue({
      data: { category: { id: 'c-new', name: 'Groceries', category_group_id: 'cg-1' } },
    });

    const result = await tool.execute({ name: 'Groceries', categoryGroupName: 'monthly' });

    expect(mockApi.categories.createCategory).toHaveBeenCalledWith('test-budget-id', {
      category: { name: 'Groceries', category_group_id: 'cg-1', note: undefined },
    });
    expect(result.content[0].text).toContain('Monthly Bills');
  });

  it('errors when the named group cannot be found', async () => {
    mockApi.categories.getCategories.mockResolvedValue(categoriesResponse);

    const result = await tool.execute({ name: 'Groceries', categoryGroupName: 'Nonexistent' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Category group not found');
    expect(mockApi.categories.createCategory).not.toHaveBeenCalled();
  });

  it('errors when neither group id nor name is provided', async () => {
    const result = await tool.execute({ name: 'Groceries' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/categoryGroupId or categoryGroupName/);
    expect(mockApi.categories.createCategory).not.toHaveBeenCalled();
  });

  it('rejects an empty name', async () => {
    const result = await tool.execute({ name: '  ', categoryGroupId: 'cg-1' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/non-empty 'name'/);
    expect(mockApi.categories.createCategory).not.toHaveBeenCalled();
  });

  it('returns isError when the API call fails', async () => {
    mockApi.categories.createCategory.mockRejectedValue(new Error('401 Unauthorized'));

    const result = await tool.execute({ name: 'Groceries', categoryGroupId: 'cg-1' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error creating category');
  });
});
