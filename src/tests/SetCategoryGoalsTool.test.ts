import { describe, it, expect, beforeEach, vi } from 'vitest';
import SetCategoryGoalsTool from '../tools/SetCategoryGoalsTool';

// Pass-through the retry wrapper so error cases don't incur real backoff.
vi.mock('../utils/apiErrorHandler.js', () => ({
  handleAPIError: vi.fn(),
  createRetryableAPICall: (fn: any) => fn(),
}));

function categoriesWith(category: any) {
  return {
    data: {
      category_groups: [
        { id: 'g1', name: 'Monthly', deleted: false, categories: [category] },
      ],
    },
  };
}

const NEED_CAT = {
  id: 'cat-need',
  name: 'Groceries',
  deleted: false,
  hidden: false,
  goal_type: 'NEED',
  goal_target: 50000,
  goal_target_date: null,
  note: null,
  category_group_id: 'g1',
};

const GOALLESS_CC = {
  id: 'cat-cc',
  name: 'Credit Card Payment',
  deleted: false,
  hidden: false,
  goal_type: null,
  goal_target: null,
  goal_target_date: null,
  note: null,
  category_group_id: 'g1',
};

const DEBT_CAT = {
  id: 'cat-debt',
  name: 'Car Loan',
  deleted: false,
  hidden: false,
  goal_type: 'DEBT',
  goal_target: 1200000,
  goal_target_date: null,
  note: null,
  category_group_id: 'g1',
};

const HIDDEN_CAT = {
  id: 'cat-hidden',
  name: 'Old Fund',
  deleted: false,
  hidden: true,
  goal_type: 'NEED',
  goal_target: 50000,
  goal_target_date: null,
  note: null,
  category_group_id: 'g1',
};

describe('SetCategoryGoalsTool', () => {
  let tool: SetCategoryGoalsTool;
  let mockApi: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi = {
      categories: {
        getCategories: vi.fn(),
        updateCategory: vi.fn(),
      },
    };
    tool = new SetCategoryGoalsTool({ ynabApi: mockApi, budgetId: 'test-budget-id' });
  });

  describe('tool configuration', () => {
    it('is a write tool named ynab_set_category_goals mentioning goals', () => {
      const def = tool.getToolDefinition();
      expect(def.name).toBe('ynab_set_category_goals');
      expect(def.description.toLowerCase()).toContain('goal');
      expect(def.annotations?.readOnlyHint).toBe(false);
      // removeGoal can permanently clear a goal, so the tool is destructive.
      expect(def.annotations?.destructiveHint).toBe(true);
    });

    it('exposes the new goal-management inputs', () => {
      const props = tool.getToolDefinition().inputSchema.properties as any;
      expect(props).toHaveProperty('goalTarget');
      expect(props).toHaveProperty('goalTargetDate');
      expect(props).toHaveProperty('needsWholeAmount');
      expect(props).toHaveProperty('removeGoal');
    });

    it('keeps goalType and goalTargetMonth as deprecated-accepted inputs', () => {
      const props = tool.getToolDefinition().inputSchema.properties as any;
      expect(props).toHaveProperty('goalType');
      expect(props).toHaveProperty('goalTargetMonth');
      expect(props.goalType.description.toLowerCase()).toContain('deprecated');
      expect(props.goalTargetMonth.description.toLowerCase()).toContain('deprecated');
    });
  });

  describe('create / update / remove', () => {
    it('creates a goal on a goal-less category and reports the API-assigned type', async () => {
      mockApi.categories.getCategories.mockResolvedValue(categoriesWith(GOALLESS_CC));
      mockApi.categories.updateCategory.mockResolvedValue({
        data: { category: { ...GOALLESS_CC, goal_type: 'MF', goal_target: 500000 } },
      });

      const result = await tool.execute({
        categoryId: 'cat-cc',
        goalTarget: 500,
        response_format: 'json',
      });

      expect(mockApi.categories.updateCategory).toHaveBeenCalledWith('test-budget-id', 'cat-cc', {
        category: { goal_target: 500000 },
      });
      const payload = JSON.parse(result.content[0].text);
      expect(payload.action).toBe('created');
      expect(payload.goalType).toBe('MF');
    });

    it('updates the target on an existing goal', async () => {
      mockApi.categories.getCategories.mockResolvedValue(categoriesWith(NEED_CAT));
      mockApi.categories.updateCategory.mockResolvedValue({
        data: { category: { ...NEED_CAT, goal_target: 75000 } },
      });

      const result = await tool.execute({
        categoryName: 'Groceries',
        goalTarget: 75,
        response_format: 'json',
      });

      expect(mockApi.categories.updateCategory).toHaveBeenCalledWith('test-budget-id', 'cat-need', {
        category: { goal_target: 75000 },
      });
      expect(JSON.parse(result.content[0].text).action).toBe('updated');
    });

    it('returns no-op without calling the API when the target is unchanged', async () => {
      mockApi.categories.getCategories.mockResolvedValue(categoriesWith(NEED_CAT));

      const result = await tool.execute({
        categoryId: 'cat-need',
        goalTarget: 50, // NEED_CAT.goal_target is 50000 milliunits = $50
        response_format: 'json',
      });

      expect(mockApi.categories.updateCategory).not.toHaveBeenCalled();
      expect(JSON.parse(result.content[0].text).action).toBe('noop');
    });

    it('treats a same-month, different-day target date as a real change', async () => {
      const dated = { ...NEED_CAT, goal_target_date: '2026-12-01' };
      mockApi.categories.getCategories.mockResolvedValue(categoriesWith(dated));
      mockApi.categories.updateCategory.mockResolvedValue({
        data: { category: { ...dated, goal_target_date: '2026-12-31' } },
      });

      const result = await tool.execute({
        categoryId: 'cat-need',
        goalTargetDate: '2026-12-31',
        response_format: 'json',
      });

      expect(mockApi.categories.updateCategory).toHaveBeenCalledWith('test-budget-id', 'cat-need', {
        category: { goal_target_date: '2026-12-31' },
      });
      expect(JSON.parse(result.content[0].text).action).toBe('updated');
    });

    it('treats an identical target date as a no-op', async () => {
      const dated = { ...NEED_CAT, goal_target_date: '2026-12-31' };
      mockApi.categories.getCategories.mockResolvedValue(categoriesWith(dated));

      const result = await tool.execute({
        categoryId: 'cat-need',
        goalTargetDate: '2026-12-31',
        response_format: 'json',
      });

      expect(mockApi.categories.updateCategory).not.toHaveBeenCalled();
      expect(JSON.parse(result.content[0].text).action).toBe('noop');
    });

    it('reports goal_target_date from the API response (not the deprecated month)', async () => {
      mockApi.categories.getCategories.mockResolvedValue(categoriesWith(NEED_CAT));
      mockApi.categories.updateCategory.mockResolvedValue({
        data: { category: { ...NEED_CAT, goal_target_date: '2026-12-01' } },
      });

      const result = await tool.execute({
        categoryId: 'cat-need',
        goalTargetDate: '2026-12-31',
        response_format: 'json',
      });

      expect(mockApi.categories.updateCategory).toHaveBeenCalledWith('test-budget-id', 'cat-need', {
        category: { goal_target_date: '2026-12-31' },
      });
      expect(JSON.parse(result.content[0].text).goalTargetDate).toBe('2026-12-01');
    });

    it('sets needsWholeAmount on a NEED goal', async () => {
      mockApi.categories.getCategories.mockResolvedValue(categoriesWith(NEED_CAT));
      mockApi.categories.updateCategory.mockResolvedValue({
        data: { category: { ...NEED_CAT, goal_needs_whole_amount: true } },
      });

      await tool.execute({ categoryId: 'cat-need', needsWholeAmount: true });

      expect(mockApi.categories.updateCategory).toHaveBeenCalledWith('test-budget-id', 'cat-need', {
        category: { goal_needs_whole_amount: true },
      });
    });

    it('removes a goal by sending goal_target: null', async () => {
      mockApi.categories.getCategories.mockResolvedValue(categoriesWith(NEED_CAT));
      mockApi.categories.updateCategory.mockResolvedValue({
        data: { category: { ...NEED_CAT, goal_type: null, goal_target: null } },
      });

      const result = await tool.execute({
        categoryId: 'cat-need',
        removeGoal: true,
        response_format: 'json',
      });

      expect(mockApi.categories.updateCategory).toHaveBeenCalledWith('test-budget-id', 'cat-need', {
        category: { goal_target: null },
      });
      expect(JSON.parse(result.content[0].text).action).toBe('removed');
    });

    it('no-ops when removing a goal from a goal-less category', async () => {
      mockApi.categories.getCategories.mockResolvedValue(categoriesWith(GOALLESS_CC));

      const result = await tool.execute({
        categoryId: 'cat-cc',
        removeGoal: true,
        response_format: 'json',
      });

      expect(mockApi.categories.updateCategory).not.toHaveBeenCalled();
      expect(JSON.parse(result.content[0].text).action).toBe('noop');
    });
  });

  describe('validation', () => {
    it('rejects removeGoal combined with goal-setting fields (before any API call)', async () => {
      const result = await tool.execute({ categoryId: 'cat-need', removeGoal: true, goalTarget: 10 });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('cannot be combined');
      expect(mockApi.categories.getCategories).not.toHaveBeenCalled();
    });

    it('rejects a call with no actionable field (before any API call)', async () => {
      const result = await tool.execute({ categoryName: 'Groceries' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Nothing to do');
      expect(mockApi.categories.getCategories).not.toHaveBeenCalled();
    });

    it('rejects needsWholeAmount on a non-NEED goal', async () => {
      mockApi.categories.getCategories.mockResolvedValue(categoriesWith(DEBT_CAT));
      const result = await tool.execute({ categoryId: 'cat-debt', needsWholeAmount: true });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('only supported for NEED');
      expect(mockApi.categories.updateCategory).not.toHaveBeenCalled();
    });

    it('rejects goalTargetDate on a loan/debt category', async () => {
      mockApi.categories.getCategories.mockResolvedValue(categoriesWith(DEBT_CAT));
      const result = await tool.execute({ categoryId: 'cat-debt', goalTargetDate: '2026-12-31' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('loan/debt');
      expect(mockApi.categories.updateCategory).not.toHaveBeenCalled();
    });

    it('requires goalTarget to create a goal (goalTargetDate alone on a goal-less category)', async () => {
      mockApi.categories.getCategories.mockResolvedValue(categoriesWith(GOALLESS_CC));
      const result = await tool.execute({ categoryId: 'cat-cc', goalTargetDate: '2026-12-31' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('requires goalTarget');
      expect(mockApi.categories.updateCategory).not.toHaveBeenCalled();
    });

    it('requires goalTarget to create a goal (needsWholeAmount alone on a goal-less category)', async () => {
      mockApi.categories.getCategories.mockResolvedValue(categoriesWith(GOALLESS_CC));
      const result = await tool.execute({ categoryId: 'cat-cc', needsWholeAmount: true });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('requires goalTarget');
      expect(mockApi.categories.updateCategory).not.toHaveBeenCalled();
    });

    it('errors when the category cannot be found', async () => {
      mockApi.categories.getCategories.mockResolvedValue(categoriesWith(NEED_CAT));
      const result = await tool.execute({ categoryName: 'Nope', goalTarget: 10 });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });

    it('does not resolve a hidden category by name', async () => {
      mockApi.categories.getCategories.mockResolvedValue(categoriesWith(HIDDEN_CAT));
      const result = await tool.execute({ categoryName: 'Old Fund', goalTarget: 100 });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
      expect(mockApi.categories.updateCategory).not.toHaveBeenCalled();
    });

    it('still resolves a hidden category by explicit id', async () => {
      mockApi.categories.getCategories.mockResolvedValue(categoriesWith(HIDDEN_CAT));
      mockApi.categories.updateCategory.mockResolvedValue({
        data: { category: { ...HIDDEN_CAT, goal_target: 100000 } },
      });
      const result = await tool.execute({
        categoryId: 'cat-hidden',
        goalTarget: 100,
        response_format: 'json',
      });
      expect(mockApi.categories.updateCategory).toHaveBeenCalledWith('test-budget-id', 'cat-hidden', {
        category: { goal_target: 100000 },
      });
      expect(JSON.parse(result.content[0].text).action).toBe('updated');
    });

    it('errors when neither categoryId nor categoryName is provided', async () => {
      const result = await tool.execute({ goalTarget: 10 });
      expect(result.isError).toBe(true);
      expect(mockApi.categories.getCategories).not.toHaveBeenCalled();
    });

    it('returns isError on a missing budget id', async () => {
      const noBudget = new SetCategoryGoalsTool({ ynabApi: mockApi });
      const result = await noBudget.execute({ categoryId: 'cat-need', goalTarget: 10 });
      expect(result.isError).toBe(true);
    });

    it('returns isError when the API read fails', async () => {
      mockApi.categories.getCategories.mockRejectedValue(new Error('API Error'));
      const result = await tool.execute({ categoryId: 'cat-need', goalTarget: 10 });
      expect(result.isError).toBe(true);
    });
  });

  describe('backward compatibility', () => {
    it('ignores a deprecated goalType', async () => {
      mockApi.categories.getCategories.mockResolvedValue(categoriesWith(NEED_CAT));
      mockApi.categories.updateCategory.mockResolvedValue({
        data: { category: { ...NEED_CAT, goal_target: 90000 } },
      });

      await tool.execute({ categoryId: 'cat-need', goalType: 'TB', goalTarget: 90 });

      expect(mockApi.categories.updateCategory).toHaveBeenCalledWith('test-budget-id', 'cat-need', {
        category: { goal_target: 90000 },
      });
    });

    it('treats goalTargetMonth as goalTargetDate', async () => {
      mockApi.categories.getCategories.mockResolvedValue(categoriesWith(NEED_CAT));
      mockApi.categories.updateCategory.mockResolvedValue({
        data: { category: { ...NEED_CAT } },
      });

      await tool.execute({ categoryId: 'cat-need', goalTargetMonth: '2026-12-01' });

      expect(mockApi.categories.updateCategory).toHaveBeenCalledWith('test-budget-id', 'cat-need', {
        category: { goal_target_date: '2026-12-01' },
      });
    });
  });

  describe('dry run & formatting', () => {
    it('does not call the API on a dry run', async () => {
      mockApi.categories.getCategories.mockResolvedValue(categoriesWith(GOALLESS_CC));
      const result = await tool.execute({
        categoryId: 'cat-cc',
        goalTarget: 500,
        dryRun: true,
        response_format: 'json',
      });
      expect(mockApi.categories.updateCategory).not.toHaveBeenCalled();
      const payload = JSON.parse(result.content[0].text);
      expect(payload.action).toBe('created');
      expect(payload.dryRun).toBe(true);
    });

    it('uses grammatical verbs in dry-run messages (would remove, not "removed")', async () => {
      mockApi.categories.getCategories.mockResolvedValue(categoriesWith(NEED_CAT));
      const result = await tool.execute({
        categoryId: 'cat-need',
        removeGoal: true,
        dryRun: true,
        response_format: 'json',
      });
      expect(mockApi.categories.updateCategory).not.toHaveBeenCalled();
      const payload = JSON.parse(result.content[0].text);
      expect(payload.action).toBe('removed');
      expect(payload.message).toContain('would remove');
      expect(payload.message).not.toContain('would removed');
      // Dry-run removal must project null goal fields, not the stale current ones.
      expect(payload.goalTarget).toBeNull();
      expect(payload.goalTargetDollars).toBeNull();
      expect(payload.goalType).toBeNull();
      expect(payload.goalTargetDate).toBeNull();
    });

    it('projects the requested date in a dry-run update', async () => {
      mockApi.categories.getCategories.mockResolvedValue(categoriesWith(NEED_CAT));
      const result = await tool.execute({
        categoryId: 'cat-need',
        goalTargetDate: '2026-12-31',
        dryRun: true,
        response_format: 'json',
      });
      expect(mockApi.categories.updateCategory).not.toHaveBeenCalled();
      const payload = JSON.parse(result.content[0].text);
      expect(payload.action).toBe('updated');
      expect(payload.goalTargetDate).toBe('2026-12-31');
    });

    it('returns markdown when requested', async () => {
      mockApi.categories.getCategories.mockResolvedValue(categoriesWith(NEED_CAT));
      mockApi.categories.updateCategory.mockResolvedValue({
        data: { category: { ...NEED_CAT, goal_target: 60000 } },
      });
      const result = await tool.execute({ categoryId: 'cat-need', goalTarget: 60, response_format: 'markdown' });
      expect(result.content[0].text).toContain('#');
    });
  });
});
