import { describe, it, expect, beforeEach, vi } from 'vitest';
import UpdateCategoryTool from '../tools/UpdateCategoryTool';

const categoriesResponse = {
  data: {
    category_groups: [
      {
        id: 'cg-1',
        name: 'Monthly Bills',
        deleted: false,
        categories: [
          { id: 'c1', name: 'Rent', deleted: false, note: null, category_group_id: 'cg-1' },
        ],
      },
      { id: 'cg-2', name: 'Savings', deleted: false, categories: [] },
    ],
  },
};

describe('UpdateCategoryTool', () => {
  let tool: UpdateCategoryTool;
  let mockApi: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi = {
      categories: {
        getCategories: vi.fn().mockResolvedValue(categoriesResponse),
        updateCategory: vi.fn(),
      },
    };
    tool = new UpdateCategoryTool({ ynabApi: mockApi, budgetId: 'test-budget-id' });
  });

  it('renames a category resolved by name', async () => {
    mockApi.categories.updateCategory.mockResolvedValue({
      data: { category: { id: 'c1', name: 'Rent & Utilities', category_group_id: 'cg-1' } },
    });

    const result = await tool.execute({
      categoryName: 'Rent',
      newName: 'Rent & Utilities',
      response_format: 'json',
    });

    expect(mockApi.categories.updateCategory).toHaveBeenCalledWith('test-budget-id', 'c1', {
      category: { name: 'Rent & Utilities' },
    });
    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.changes.join(' ')).toContain('name');
  });

  it('moves a category to a group resolved by name', async () => {
    mockApi.categories.updateCategory.mockResolvedValue({
      data: { category: { id: 'c1', name: 'Rent', category_group_id: 'cg-2' } },
    });

    const result = await tool.execute({ categoryName: 'Rent', categoryGroupName: 'Savings' });

    expect(mockApi.categories.updateCategory).toHaveBeenCalledWith('test-budget-id', 'c1', {
      category: { category_group_id: 'cg-2' },
    });
    expect(result.content[0].text).toContain('moved');
  });

  it('updates a note on a category resolved by id', async () => {
    mockApi.categories.updateCategory.mockResolvedValue({
      data: { category: { id: 'c1', name: 'Rent', category_group_id: 'cg-1' } },
    });

    await tool.execute({ categoryId: 'c1', note: 'Pay by the 1st' });

    expect(mockApi.categories.updateCategory).toHaveBeenCalledWith('test-budget-id', 'c1', {
      category: { note: 'Pay by the 1st' },
    });
  });

  it('errors when the category cannot be found', async () => {
    const result = await tool.execute({ categoryName: 'Nope', newName: 'X' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Category not found');
    expect(mockApi.categories.updateCategory).not.toHaveBeenCalled();
  });

  it('errors when the destination group cannot be found', async () => {
    const result = await tool.execute({ categoryName: 'Rent', categoryGroupName: 'Nope' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Destination category group not found');
    expect(mockApi.categories.updateCategory).not.toHaveBeenCalled();
  });

  it('errors when neither categoryId nor categoryName is provided', async () => {
    const result = await tool.execute({ newName: 'X' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/categoryId or categoryName/);
  });

  it('errors when no change fields are provided (before any read)', async () => {
    const result = await tool.execute({ categoryName: 'Rent' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Nothing to update/);
    expect(mockApi.categories.getCategories).not.toHaveBeenCalled();
  });

  it('reports no-op when the requested value already matches', async () => {
    const result = await tool.execute({ categoryName: 'Rent', newName: 'Rent' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/No changes needed/);
    expect(mockApi.categories.updateCategory).not.toHaveBeenCalled();
  });

  it('returns isError when the API call fails', async () => {
    mockApi.categories.updateCategory.mockRejectedValue(new Error('401 Unauthorized'));

    const result = await tool.execute({ categoryName: 'Rent', newName: 'X' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error updating category');
  });
});
