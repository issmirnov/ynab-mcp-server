# Goal Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the existing `ynab_set_category_goals` tool so it can create, update, and remove a category's goal (not just edit an existing one).

**Architecture:** A single PATCH-backed tool. `execute()` validates inputs, does one `getCategories` read to resolve the category (via the shared `findCategory` helper) and learn its current `goal_type`, builds a `SaveCategory`-shaped patch, and calls `categories.updateCategory`. It reports the goal type the API actually assigned. Goal creation works because the YNAB API infers the goal type from a bare `goal_target` (NEED by default; MF/DEBT for credit-card/loan categories); removal sends `goal_target: null`.

**Tech Stack:** TypeScript (ESNext), `ynab@4.5.0` SDK, `@modelcontextprotocol/sdk`, Vitest. Cloudflare Workers remote MCP server.

## Global Constraints

- SDK is `ynab@4.5.0` (confirmed latest); do NOT send `goal_frequency` — the SDK's `ExistingCategoryToJSON` whitelist drops it before the wire. Cadence is out of scope.
- `goal_target: null` removes a goal (whitelisted; survives serialization). Needs a local null-widen of the `ExistingCategory.goal_target: number` type.
- Tool name stays `ynab_set_category_goals`; keep the `ynab_` prefix, `response_format` (json/markdown), 25,000-char truncation, `isError: true` on errors, and write-tool annotations (`readOnlyHint: false`).
- `budgetId` input and default-budget resolution via `getBudgetId(input.budgetId, this.budgetId)` are unchanged.
- Keep `goalType` and `goalTargetMonth` as deprecated-but-accepted inputs (schema has `additionalProperties: false`, so removing them would hard-reject stale callers).
- Full test suite (`npm test`), type-check (`npm run type-check`), and build (`npm run build`) must stay green.

---

### Task 1: Rewrite `SetCategoryGoalsTool` (create/update/remove) with its test suite

**Files:**
- Modify (full rewrite): `src/tools/SetCategoryGoalsTool.ts`
- Modify (full rewrite): `src/tests/SetCategoryGoalsTool.test.ts`

**Interfaces:**
- Consumes: `findCategory(groups, { id?, name? })` from `src/utils/categoryLookup.ts` → `{ category: ynab.Category; group } | null`; `createRetryableAPICall(fn, label)` from `src/utils/apiErrorHandler.ts`; `getBudgetId`, `amountToMilliUnits`, `milliUnitsToAmount`, `formatCurrency`, `truncateResponse`, `CHARACTER_LIMIT` from `src/utils/commonUtils.ts`; `createToolRuntime`, `ToolRuntimeConfig` from `src/tools/runtime.ts`.
- Produces: default-exported class `SetCategoryGoalsTool` with `getToolDefinition(): Tool` (name `ynab_set_category_goals`) and `execute(input): Promise<{ content: [...]; isError?: boolean }>`. Constructor accepts `(budgetIdOrConfig?: string | ToolRuntimeConfig, ynabApi?: ynab.API)` (unchanged signature — registration passes a `ToolRuntimeConfig`). JSON result shape: `{ success, action: "created"|"updated"|"removed"|"noop", categoryId, categoryName, goalType, goalTarget, goalTargetDollars, goalTargetMonth, changes: string[], dryRun, message }`.

- [ ] **Step 1: Write the failing test file**

Replace the entire contents of `src/tests/SetCategoryGoalsTool.test.ts` with:

```typescript
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
  goal_target_month: null,
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
  goal_target_month: null,
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
  goal_target_month: null,
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

    it('errors when the category cannot be found', async () => {
      mockApi.categories.getCategories.mockResolvedValue(categoriesWith(NEED_CAT));
      const result = await tool.execute({ categoryName: 'Nope', goalTarget: 10 });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config vitest.config.ts src/tests/SetCategoryGoalsTool.test.ts`
Expected: FAIL (old tool returns `results[]` shape / refuses creation; new assertions unmet).

- [ ] **Step 3: Rewrite the tool**

Replace the entire contents of `src/tools/SetCategoryGoalsTool.ts` with:

```typescript
import * as ynab from "ynab";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  truncateResponse,
  CHARACTER_LIMIT,
  getBudgetId,
  amountToMilliUnits,
  milliUnitsToAmount,
  formatCurrency,
} from "../utils/commonUtils.js";
import { createRetryableAPICall } from "../utils/apiErrorHandler.js";
import { findCategory } from "../utils/categoryLookup.js";
import { createToolRuntime, type ToolRuntimeConfig } from "./runtime.js";

interface SetCategoryGoalsInput {
  budgetId?: string;
  categoryId?: string;
  categoryName?: string;
  goalTarget?: number; // dollars
  goalTargetDate?: string; // YYYY-MM-DD
  needsWholeAmount?: boolean;
  removeGoal?: boolean;
  note?: string;
  dryRun?: boolean;
  response_format?: "json" | "markdown";
  // Deprecated, accepted for backward compatibility:
  goalType?: string; // ignored — YNAB infers the goal type
  goalTargetMonth?: string; // aliased to goalTargetDate
}

type GoalAction = "created" | "updated" | "removed" | "noop";

interface SetCategoryGoalsResult {
  success: boolean;
  action: GoalAction;
  categoryId: string;
  categoryName: string;
  goalType: string | null;
  goalTarget: number | null; // milliunits
  goalTargetDollars: number | null;
  goalTargetMonth: string | null;
  changes: string[];
  dryRun: boolean;
  message: string;
}

// ynab@4.5.0 types ExistingCategory.goal_target as number only, but the YNAB API
// accepts goal_target: null to remove a goal, and null survives the SDK's
// whitelist serializer + JSON.stringify. Widen locally — same pattern as payee_id
// in UpdateTransactionTool. goal_frequency is intentionally NOT handled: the SDK's
// ExistingCategoryToJSON drops any non-whitelisted field, so it never reaches the
// wire (see docs/superpowers/specs/2026-10-03-goal-management-design.md).
type CategoryGoalPatch = Omit<ynab.ExistingCategory, "goal_target"> & {
  goal_target?: number | null;
};

export default class SetCategoryGoalsTool {
  private api: ynab.API;
  private budgetId?: string;

  constructor(budgetIdOrConfig?: string | ToolRuntimeConfig, ynabApi?: ynab.API) {
    const runtime = createToolRuntime(
      typeof budgetIdOrConfig === "string"
        ? { budgetId: budgetIdOrConfig, ynabApi }
        : budgetIdOrConfig
    );
    this.api = runtime.api;
    this.budgetId = runtime.budgetId;
  }

  getToolDefinition(): Tool {
    return {
      name: "ynab_set_category_goals",
      description:
        "Create, update, or remove a category's goal in YNAB. Set goalTarget (in dollars) to create a goal on a category that has none, or to change the target on an existing goal; set goalTargetDate and/or needsWholeAmount to adjust it; set removeGoal to clear it. Important: the YNAB API infers the goal type and only supports the NEED family — a plain target creates a 'Needed for Spending' (NEED) goal, while Credit Card Payment and loan categories get MF/DEBT automatically. Target-Balance (TB) and Target-Balance-by-Date (TBD) goals cannot be created via the API; a requested TB/TBD goal becomes a NEED goal. Recurring cadence is not supported here. Identify the category by categoryId or categoryName (case-insensitive, exact then partial).",
      inputSchema: {
        type: "object",
        properties: {
          budgetId: {
            type: "string",
            description:
              "The ID of the budget to update. Optional when a default budget is set or only one budget exists.",
          },
          categoryId: {
            type: "string",
            description: "The ID of the category to update (optional if categoryName is provided).",
          },
          categoryName: {
            type: "string",
            description:
              "The name of the category to update (optional if categoryId is provided). Supports partial matching.",
          },
          goalTarget: {
            type: "number",
            description:
              "The goal target amount in dollars (e.g., 1000.00). On a category with no goal this CREATES a goal (type inferred by YNAB). Use 0 for a zero target; to clear a goal use removeGoal instead.",
          },
          goalTargetDate: {
            type: "string",
            description:
              "Target date in YYYY-MM-DD format (e.g., '2024-12-31'). Not supported for loan/debt categories.",
          },
          needsWholeAmount: {
            type: "boolean",
            description:
              "NEED-goal behavior: true = 'Set aside another <amount>' each period; false = 'Refill up to <amount>'. Only valid for NEED goals (not credit-card or loan categories).",
          },
          removeGoal: {
            type: "boolean",
            description:
              "If true, removes the category's existing goal. Cannot be combined with goalTarget, goalTargetDate, or needsWholeAmount.",
          },
          note: {
            type: "string",
            description: "Optional note to set on the category (applied alongside a goal change).",
          },
          dryRun: {
            type: "boolean",
            description: "If true, reports what would change without calling the API.",
            default: false,
          },
          goalType: {
            type: "string",
            enum: ["TB", "TBD", "MF", "NEED", "DEBT"],
            description:
              "DEPRECATED and ignored — the YNAB API infers the goal type. Accepted for backward compatibility; has no effect.",
          },
          goalTargetMonth: {
            type: "string",
            description: "DEPRECATED — use goalTargetDate. If provided, it is treated as goalTargetDate.",
          },
          response_format: {
            type: "string",
            enum: ["json", "markdown"],
            description:
              "Response format: 'json' for machine-readable output, 'markdown' for human-readable output (default: markdown)",
          },
        },
        required: [],
        additionalProperties: false,
      },
      annotations: {
        title: "Set Category Goals",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    };
  }

  async execute(
    input: SetCategoryGoalsInput
  ): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    try {
      const budgetId = getBudgetId(input.budgetId, this.budgetId);

      if (!input.categoryId && !input.categoryName) {
        return this.error("Provide a categoryId or categoryName to identify the category.");
      }

      const targetDate = input.goalTargetDate ?? input.goalTargetMonth;
      const removing = input.removeGoal === true;
      const settingTarget = input.goalTarget !== undefined;
      const settingDate = targetDate !== undefined;
      const settingNeeds = input.needsWholeAmount !== undefined;
      const settingNote = input.note !== undefined;

      if (removing && (settingTarget || settingDate || settingNeeds)) {
        return this.error(
          "removeGoal cannot be combined with goalTarget, goalTargetDate, or needsWholeAmount."
        );
      }

      if (!removing && !settingTarget && !settingDate && !settingNeeds) {
        return this.error(
          "Nothing to do. Provide goalTarget, goalTargetDate, needsWholeAmount, or removeGoal (note alone is not a goal change — use ynab_update_category for notes)."
        );
      }

      const categoriesResponse = await createRetryableAPICall(
        () => this.api.categories.getCategories(budgetId),
        "Get categories for goal update"
      );
      const groups = categoriesResponse.data.category_groups;

      const resolved = findCategory(groups, { id: input.categoryId, name: input.categoryName });
      if (!resolved) {
        const which = input.categoryId ? `id "${input.categoryId}"` : `name "${input.categoryName}"`;
        return this.error(
          `Category not found by ${which}. Use ynab_list_categories or ynab_budget_summary to see available categories.`
        );
      }

      const cat = resolved.category;
      const hadGoal = Boolean(cat.goal_type);
      const currentType = cat.goal_type ? String(cat.goal_type) : null;

      // Pre-flight guards for documented API-only constraints (avoid raw 400s).
      // Only enforce when the goal type is known; for a goal-less category being
      // created, let the API infer and decide.
      if (settingNeeds && hadGoal && currentType !== "NEED") {
        return this.error(
          `needsWholeAmount is only supported for NEED goals; "${cat.name}" has a ${currentType} goal.`
        );
      }
      if (settingDate && hadGoal && currentType === "DEBT") {
        return this.error(
          `goalTargetDate is not supported for loan/debt categories; "${cat.name}" has a DEBT goal.`
        );
      }

      const update: CategoryGoalPatch = {};
      const changes: string[] = [];
      let action: GoalAction;

      if (removing) {
        if (!hadGoal) {
          return this.result(
            {
              success: true,
              action: "noop",
              categoryId: cat.id,
              categoryName: cat.name,
              goalType: null,
              goalTarget: null,
              goalTargetDollars: null,
              goalTargetMonth: null,
              changes: [],
              dryRun: Boolean(input.dryRun),
              message: `"${cat.name}" has no goal to remove.`,
            },
            input.response_format
          );
        }
        update.goal_target = null;
        changes.push(`Removed ${currentType} goal`);
        action = "removed";
      } else {
        if (settingTarget) {
          const milli = amountToMilliUnits(input.goalTarget!);
          update.goal_target = milli;
          const prev = cat.goal_target ?? null;
          changes.push(
            `Goal target: ${prev !== null ? formatCurrency(milliUnitsToAmount(prev)) : "(none)"} → ${formatCurrency(input.goalTarget!)}`
          );
        }
        if (settingDate) {
          update.goal_target_date = targetDate;
          changes.push(`Goal target date → ${targetDate}`);
        }
        if (settingNeeds) {
          update.goal_needs_whole_amount = input.needsWholeAmount;
          changes.push(
            `Needs whole amount → ${input.needsWholeAmount ? "set aside another" : "refill up to"}`
          );
        }
        action = hadGoal ? "updated" : "created";
      }

      if (settingNote) {
        update.note = input.note;
        changes.push("note updated");
      }

      if (input.dryRun) {
        const milliForDisplay = update.goal_target ?? cat.goal_target ?? null;
        return this.result(
          {
            success: true,
            action,
            categoryId: cat.id,
            categoryName: cat.name,
            goalType: action === "created" ? null : currentType,
            goalTarget: milliForDisplay,
            goalTargetDollars: milliForDisplay !== null ? milliUnitsToAmount(milliForDisplay) : null,
            goalTargetMonth: cat.goal_target_month ?? null,
            changes,
            dryRun: true,
            message:
              action === "created"
                ? "Dry run: would create a goal (YNAB infers the type — NEED, or MF/DEBT for credit-card/loan categories)."
                : `Dry run: would ${action} — ${changes.join(", ")}.`,
          },
          input.response_format
        );
      }

      const data: ynab.PatchCategoryWrapper = { category: update as ynab.ExistingCategory };
      const response = await createRetryableAPICall(
        () => this.api.categories.updateCategory(budgetId, cat.id, data),
        "Update category goal"
      );
      const updated = response.data.category ?? cat;

      return this.result(
        {
          success: true,
          action,
          categoryId: updated.id,
          categoryName: updated.name,
          goalType: updated.goal_type ? String(updated.goal_type) : null,
          goalTarget: updated.goal_target ?? null,
          goalTargetDollars: updated.goal_target != null ? milliUnitsToAmount(updated.goal_target) : null,
          goalTargetMonth: updated.goal_target_month ?? null,
          changes,
          dryRun: false,
          message:
            action === "removed"
              ? `Removed the goal from "${updated.name}".`
              : `${action === "created" ? "Created" : "Updated"} the ${updated.goal_type ? String(updated.goal_type) + " " : ""}goal on "${updated.name}".`,
        },
        input.response_format
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: "text", text: `Failed to set category goal: ${errorMessage}` }],
      };
    }
  }

  private result(
    result: SetCategoryGoalsResult,
    format?: "json" | "markdown"
  ): { content: Array<{ type: string; text: string }> } {
    const responseText =
      (format || "markdown") === "json"
        ? JSON.stringify(result, null, 2)
        : this.formatMarkdown(result);
    const { text } = truncateResponse(responseText, CHARACTER_LIMIT);
    return { content: [{ type: "text", text }] };
  }

  private error(message: string) {
    return { isError: true, content: [{ type: "text", text: message }] };
  }

  private formatMarkdown(result: SetCategoryGoalsResult): string {
    const title =
      result.action === "noop"
        ? "No Change"
        : result.dryRun
        ? `Dry Run — Would ${this.titleCase(result.action)} Goal`
        : `Goal ${this.titleCase(result.action)}`;
    let output = `# ${title}\n\n`;
    output += `${result.dryRun ? "🔎" : "✅"} ${result.message}\n\n`;
    output += `**Category:** ${result.categoryName}\n`;
    output += `**Category ID:** \`${result.categoryId}\`\n`;
    output += `**Goal Type:** ${result.goalType || "None"}\n`;
    if (result.goalTargetDollars !== null) {
      output += `**Goal Target:** ${formatCurrency(result.goalTargetDollars)}\n`;
    }
    if (result.goalTargetMonth) {
      output += `**Target Month:** ${result.goalTargetMonth}\n`;
    }
    if (result.changes.length > 0) {
      output += `\n## Changes\n`;
      for (const change of result.changes) {
        output += `- ${change}\n`;
      }
    }
    return output;
  }

  private titleCase(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
```

- [ ] **Step 4: Run the tool's tests to verify they pass**

Run: `npx vitest run --config vitest.config.ts src/tests/SetCategoryGoalsTool.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: no errors. If the `update as ynab.ExistingCategory` cast errors on the `goal_target: number | null` mismatch, change it to `update as unknown as ynab.ExistingCategory`.

- [ ] **Step 6: Commit**

```bash
git add src/tools/SetCategoryGoalsTool.ts src/tests/SetCategoryGoalsTool.test.ts
git commit -m "feat: ynab_set_category_goals creates/updates/removes goals"
```

---

### Task 2: Update CLAUDE.md goal-tool description

**Files:**
- Modify: `CLAUDE.md` (the `ynab_set_category_goals` bullet under "Additional Tools")

**Interfaces:** none (docs only).

- [ ] **Step 1: Edit the tool description**

Change the existing bullet:

```
- **ynab_set_category_goals**: Set or update category goals (target, monthly funding, etc.)
```

to:

```
- **ynab_set_category_goals**: Create, update, or remove a category's goal (target, target date, NEED behavior). Creates NEED-family goals only — the YNAB API infers the type (NEED, or MF/DEBT for credit-card/loan categories); TB/TBD creation and recurring cadence are not supported via the API.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update ynab_set_category_goals description for create/remove"
```

---

### Task 3: Full verification, push, and open the PR

**Files:** none (verification + git).

**Interfaces:** none.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: unit + worker suites pass. If an unrelated pre-existing failure appears, note it but do not fix out of scope.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Push the branch**

```bash
git push -u origin feat/goal-management
```

- [ ] **Step 4: Open the PR**

```bash
gh pr create --base main --head feat/goal-management \
  --title "feat: goal management — create/update/remove category goals" \
  --body "<summary + spec link + test notes + 🤖 attribution>"
```

- [ ] **Step 5: Read bot reviews and iterate**

Wait for automated reviewers, then `gh pr view --comments` / `gh api` to read them; address actionable findings with follow-up commits; repeat until clean.

---

## Self-Review

**1. Spec coverage:**
- Create goal on goal-less category → Task 1 "creates a goal…" test + `action: created`. ✓
- Change target/date → update-target test; date via back-compat alias test + `goal_target_date`. ✓
- needsWholeAmount → test + guard. ✓
- Remove goal (`goal_target: null`) → test asserts exact body. ✓
- Report API-assigned goal_type (not NEED) → `goalType: 'MF'` assertion + `updated.goal_type`. ✓
- Deprecated goalType ignored / goalTargetMonth aliased → back-compat tests. ✓
- Validation (exclusivity, nothing-actionable, incompatible-type guards, not-found, missing budget, API error) → validation block. ✓
- dryRun / markdown → tests. ✓
- goal_frequency NOT sent → omitted from inputs and patch; documented in code comment + Global Constraints. ✓
- findCategory consolidation → tool imports and uses it. ✓
- CLAUDE.md update → Task 2. ✓

**2. Placeholder scan:** PR body `<summary…>` is filled at creation time (Task 3 Step 4), not a code placeholder. No TBD/TODO in code. ✓

**3. Type consistency:** `CategoryGoalPatch` used for `update`; cast to `ynab.ExistingCategory` at the SDK boundary; result shape (`action`/`goalType`/`goalTargetDollars`/…) identical between `execute` and `SetCategoryGoalsResult` and the test assertions (`action`, `goalType`, `dryRun`). `findCategory` return (`.category`) matches usage. ✓
