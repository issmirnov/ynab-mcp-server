import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import SetTransactionSplitsTool, { runExclusive } from '../tools/SetTransactionSplitsTool';
import { jsonSchemaObjectToZodShape } from '../utils/jsonSchemaToZod';

// Run each API call once, without the retry wrapper's backoff delays, and
// record how the tool asked for retries.
const { retryableCall } = vi.hoisted(() => ({
  retryableCall: vi.fn((fn: () => Promise<unknown>, _context?: string, _maxRetries?: number) => fn()),
}));
vi.mock('../utils/apiErrorHandler.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/apiErrorHandler.js')>()),
  createRetryableAPICall: retryableCall,
}));

const line = (overrides: Record<string, unknown>) => ({
  transaction_id: 't1',
  memo: null,
  payee_id: null,
  payee_name: null,
  transfer_account_id: null,
  transfer_transaction_id: null,
  deleted: false,
  ...overrides,
});

const REGULAR = {
  id: 't1',
  date: '2026-10-20',
  amount: -120500,
  memo: 'Weekly run',
  cleared: 'cleared',
  approved: true,
  flag_color: 'blue',
  account_id: 'acct-1',
  account_name: 'Checking',
  payee_id: 'payee-costco',
  payee_name: 'Costco',
  category_id: 'cat-groceries',
  category_name: 'Groceries',
  import_id: 'YNAB:-120500:2026-10-20:1',
  deleted: false,
  subtransactions: [] as unknown[],
};

const SPLIT = {
  ...REGULAR,
  category_id: 'cat-split',
  category_name: 'Split (Multiple Categories)...',
  subtransactions: [
    line({ id: 's1', amount: -80000, category_id: 'cat-groceries', category_name: 'Groceries' }),
    line({ id: 's2', amount: -40500, category_id: 'cat-household', category_name: 'Household', memo: 'paper towels' }),
    line({ id: 's0', amount: -1000, category_id: 'cat-old', category_name: 'Old', deleted: true }),
  ],
};

const NEW_LINES = [
  { amount: -70, categoryId: 'cat-groceries' },
  { amount: -50.5, categoryId: 'cat-household', memo: 'paper towels' },
];

const NEW_LINES_API = [
  { amount: -70000, category_id: 'cat-groceries' },
  { amount: -50500, category_id: 'cat-household', memo: 'paper towels' },
];

// Echo saved lines back the way YNAB reports them (category name = id here).
const echoLines = (lines: any[] | undefined, transactionId: string) =>
  (lines ?? []).map((s, i) =>
    line({
      id: `n${i}`,
      transaction_id: transactionId,
      amount: s.amount,
      category_id: s.category_id,
      category_name: s.category_id,
      memo: s.memo ?? null,
    })
  );

describe('SetTransactionSplitsTool', () => {
  let tool: SetTransactionSplitsTool;
  let mockApi: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi = {
      transactions: {
        getTransactionById: vi.fn().mockResolvedValue({ data: { transaction: REGULAR } }),
        updateTransaction: vi.fn(),
        createTransaction: vi.fn(),
        deleteTransaction: vi.fn().mockResolvedValue({ data: { transaction: { ...SPLIT, deleted: true } } }),
      },
    };
    tool = new SetTransactionSplitsTool({ ynabApi: mockApi, budgetId: 'b1' });
  });

  const useExisting = (transaction: unknown) =>
    mockApi.transactions.getTransactionById.mockResolvedValue({ data: { transaction } });

  const parse = (result: any) => JSON.parse(result.content[0].text);

  describe('runExclusive', () => {
    it('runs tasks with the same key one at a time, in order', async () => {
      const events: string[] = [];
      const task = (name: string) => async () => {
        events.push(`${name} start`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        events.push(`${name} end`);
      };

      await Promise.all([runExclusive('b1:t1', task('a')), runExclusive('b1:t1', task('b'))]);

      expect(events).toEqual(['a start', 'a end', 'b start', 'b end']);
    });

    it('releases the key when a task fails', async () => {
      const failing = runExclusive('b1:t9', async () => {
        throw new Error('boom');
      });
      const next = runExclusive('b1:t9', async () => 'ran');

      await expect(failing).rejects.toThrow('boom');
      await expect(next).resolves.toBe('ran');
    });

    it('does not make different keys wait for each other', async () => {
      let release!: () => void;
      const blocked = runExclusive('b1:slow', () => new Promise<void>((resolve) => (release = resolve)));

      await expect(runExclusive('b1:other', async () => 'free')).resolves.toBe('free');
      release();
      await blocked;
    });
  });

  describe('tool definition', () => {
    const def = () => tool.getToolDefinition();

    it('is a destructive write tool named ynab_set_transaction_splits', () => {
      expect(def().name).toBe('ynab_set_transaction_splits');
      expect(def().annotations?.readOnlyHint).toBe(false);
      expect(def().annotations?.destructiveHint).toBe(true);
      expect((def().inputSchema as any).required).toEqual(['transactionId']);
    });

    it('converts to a zod schema that validates split lines', () => {
      const schema = z.object(jsonSchemaObjectToZodShape(def().inputSchema as any));

      expect(schema.safeParse({ transactionId: 't1', subtransactions: NEW_LINES }).success).toBe(true);
      expect(schema.safeParse({ transactionId: 't1', categoryId: 'cat-dining' }).success).toBe(true);
      expect(
        schema.safeParse({ transactionId: 't1', subtransactions: [{ categoryId: 'cat-groceries' }] }).success
      ).toBe(false);
    });
  });

  describe('input validation', () => {
    it('requires subtransactions or categoryId', async () => {
      const result = await tool.execute({ transactionId: 't1' });

      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('exactly one of subtransactions');
      expect(mockApi.transactions.getTransactionById).not.toHaveBeenCalled();
    });

    it('rejects subtransactions and categoryId together', async () => {
      const result = await tool.execute({ transactionId: 't1', subtransactions: NEW_LINES, categoryId: 'cat-dining' });

      expect(result).toHaveProperty('isError', true);
      expect(mockApi.transactions.getTransactionById).not.toHaveBeenCalled();
    });

    it('rejects lines that do not add up to the transaction amount', async () => {
      const result = await tool.execute({ transactionId: 't1', subtransactions: [{ amount: -70 }, { amount: -40 }] });

      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('off by $10.50');
      expect(mockApi.transactions.updateTransaction).not.toHaveBeenCalled();
    });

    it('rejects categoryId on a transaction that is not a split', async () => {
      const result = await tool.execute({ transactionId: 't1', categoryId: 'cat-dining' });

      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('ynab_update_transaction');
      expect(mockApi.transactions.createTransaction).not.toHaveBeenCalled();
    });

    it('refuses a deleted transaction', async () => {
      useExisting({ ...SPLIT, deleted: true });

      const result = await tool.execute({ transactionId: 't1', subtransactions: NEW_LINES });

      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('has been deleted');
      expect(mockApi.transactions.createTransaction).not.toHaveBeenCalled();
      expect(mockApi.transactions.deleteTransaction).not.toHaveBeenCalled();
    });
  });

  describe('splitting a regular transaction', () => {
    beforeEach(() => {
      mockApi.transactions.updateTransaction.mockImplementation(async (_b: string, _id: string, wrapper: any) => ({
        data: {
          transaction: {
            ...REGULAR,
            category_id: 'cat-split',
            category_name: 'Split (Multiple Categories)...',
            subtransactions: echoLines(wrapper.transaction.subtransactions, 't1'),
          },
        },
      }));
    });

    it('converts it in place with one PUT and keeps the ID', async () => {
      const result = await tool.execute({ transactionId: 't1', subtransactions: NEW_LINES, response_format: 'json' });

      expect(mockApi.transactions.updateTransaction).toHaveBeenCalledWith('b1', 't1', {
        transaction: { category_id: null, subtransactions: NEW_LINES_API },
      });
      expect(mockApi.transactions.createTransaction).not.toHaveBeenCalled();
      expect(mockApi.transactions.deleteTransaction).not.toHaveBeenCalled();
      const parsed = parse(result);
      expect(parsed).toMatchObject({ action: 'split', method: 'updated_in_place', transactionId: 't1' });
      expect(parsed.previousTransactionId).toBeUndefined();
      expect(parsed.subtransactions).toHaveLength(2);
    });

    it('sends a new amount and date along with the lines', async () => {
      await tool.execute({
        transactionId: 't1',
        amount: -130.5,
        date: '2026-10-21',
        subtransactions: [
          { amount: -80, categoryId: 'cat-groceries' },
          { amount: -50.5, categoryId: 'cat-household' },
        ],
      });

      const sent = mockApi.transactions.updateTransaction.mock.calls[0][2].transaction;
      expect(sent.amount).toBe(-130500);
      expect(sent.date).toBe('2026-10-21');
    });
  });

  describe('changing an existing split', () => {
    beforeEach(() => {
      useExisting(SPLIT);
      mockApi.transactions.createTransaction.mockImplementation(async (_b: string, wrapper: any) => ({
        data: {
          transaction_ids: ['t2'],
          transaction: {
            ...SPLIT,
            ...wrapper.transaction,
            id: 't2',
            import_id: null,
            category_name: wrapper.transaction.category_id ? 'Dining Out' : 'Split (Multiple Categories)...',
            subtransactions: echoLines(wrapper.transaction.subtransactions, 't2'),
          },
        },
      }));
    });

    it('recreates the transaction with the new lines, then deletes the original', async () => {
      const result = await tool.execute({ transactionId: 't1', subtransactions: NEW_LINES, response_format: 'json' });

      expect(mockApi.transactions.createTransaction).toHaveBeenCalledWith('b1', {
        transaction: {
          account_id: 'acct-1',
          date: '2026-10-20',
          amount: -120500,
          payee_id: 'payee-costco',
          memo: 'Weekly run',
          cleared: 'cleared',
          approved: true,
          flag_color: 'blue',
          subtransactions: NEW_LINES_API,
        },
      });
      const sent = mockApi.transactions.createTransaction.mock.calls[0][1].transaction;
      expect(sent).not.toHaveProperty('import_id');
      expect(sent.category_id).toBeUndefined();
      expect(mockApi.transactions.deleteTransaction).toHaveBeenCalledWith('b1', 't1');
      expect(mockApi.transactions.createTransaction.mock.invocationCallOrder[0]).toBeLessThan(
        mockApi.transactions.deleteTransaction.mock.invocationCallOrder[0]
      );
      expect(mockApi.transactions.updateTransaction).not.toHaveBeenCalled();

      const parsed = parse(result);
      expect(parsed).toMatchObject({
        action: 'resplit',
        method: 'recreated',
        transactionId: 't2',
        previousTransactionId: 't1',
      });
      expect(parsed.notes.join(' ')).toContain('New ID: t2');
      expect(parsed.notes.join(' ')).toContain('bank import');
    });

    it('merges the split into one category when given categoryId', async () => {
      const result = await tool.execute({ transactionId: 't1', categoryId: 'cat-dining', response_format: 'json' });

      const sent = mockApi.transactions.createTransaction.mock.calls[0][1].transaction;
      expect(sent.category_id).toBe('cat-dining');
      expect(sent.subtransactions).toBeUndefined();
      expect(sent.amount).toBe(-120500);
      expect(mockApi.transactions.deleteTransaction).toHaveBeenCalledWith('b1', 't1');
      expect(parse(result)).toMatchObject({ action: 'unsplit', transactionId: 't2', categoryName: 'Dining Out' });
    });

    it('applies a new amount and date to the replacement', async () => {
      await tool.execute({
        transactionId: 't1',
        amount: -130.5,
        date: '2026-10-22',
        subtransactions: [
          { amount: -80, categoryId: 'cat-groceries' },
          { amount: -50.5, categoryId: 'cat-household' },
        ],
      });

      const sent = mockApi.transactions.createTransaction.mock.calls[0][1].transaction;
      expect(sent.amount).toBe(-130500);
      expect(sent.date).toBe('2026-10-22');
    });

    it('writes nothing when the lines, amount, and date already match', async () => {
      const result = await tool.execute({
        transactionId: 't1',
        subtransactions: [
          { amount: -80, categoryId: 'cat-groceries' },
          { amount: -40.5, categoryId: 'cat-household', memo: 'paper towels' },
        ],
        response_format: 'json',
      });

      expect(mockApi.transactions.createTransaction).not.toHaveBeenCalled();
      expect(mockApi.transactions.deleteTransaction).not.toHaveBeenCalled();
      expect(parse(result)).toMatchObject({ action: 'unchanged', method: 'none', transactionId: 't1' });
    });

    it('reports both IDs when the original cannot be deleted', async () => {
      mockApi.transactions.deleteTransaction.mockRejectedValue({
        error: { id: '500', name: 'internal_server_error', detail: 'Something went wrong' },
      });

      const result = await tool.execute({ transactionId: 't1', subtransactions: NEW_LINES });

      expect(result).toHaveProperty('isError', true);
      const text = result.content[0].text;
      expect(text).toContain('t2');
      expect(text).toContain('t1');
      expect(text).toContain('Something went wrong');
      expect(text).toContain('ynab_delete_transaction');
    });

    it('leaves the original alone when the replacement cannot be created', async () => {
      mockApi.transactions.createTransaction.mockRejectedValue({
        error: { id: '400', name: 'bad_request', detail: 'Splits are not allowed on tracking accounts' },
      });

      const result = await tool.execute({ transactionId: 't1', subtransactions: NEW_LINES });

      expect(result).toHaveProperty('isError', true);
      const text = result.content[0].text;
      expect(text).toContain('Splits are not allowed on tracking accounts');
      expect(text).toContain('The original t1 was not changed');
      expect(text).toContain('check ynab_list_transactions before you retry');
      expect(mockApi.transactions.deleteTransaction).not.toHaveBeenCalled();
    });

    it('creates the replacement in one attempt, because a retried POST could add a second copy', async () => {
      await tool.execute({ transactionId: 't1', subtransactions: NEW_LINES });

      expect(retryableCall).toHaveBeenCalledWith(expect.any(Function), 'Create replacement transaction', 1);
      expect(mockApi.transactions.createTransaction).toHaveBeenCalledTimes(1);
    });

    it('lets only one of two concurrent calls replace the same split', async () => {
      let originalDeleted = false;
      mockApi.transactions.getTransactionById.mockImplementation(async () => ({
        data: { transaction: { ...SPLIT, deleted: originalDeleted } },
      }));
      const create = mockApi.transactions.createTransaction.getMockImplementation();
      mockApi.transactions.createTransaction.mockImplementation(async (...args: unknown[]) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return create(...args);
      });
      mockApi.transactions.deleteTransaction.mockImplementation(async () => {
        originalDeleted = true;
        return { data: { transaction: { ...SPLIT, deleted: true } } };
      });
      // registerYnabTools builds a new tool instance for every call.
      const otherTool = new SetTransactionSplitsTool({ ynabApi: mockApi, budgetId: 'b1' });

      const results = await Promise.all([
        tool.execute({ transactionId: 't1', subtransactions: NEW_LINES }),
        otherTool.execute({ transactionId: 't1', subtransactions: NEW_LINES }),
      ]);

      expect(mockApi.transactions.createTransaction).toHaveBeenCalledTimes(1);
      expect(results.filter((r: any) => r.isError)).toHaveLength(1);
      expect(results.find((r: any) => r.isError)!.content[0].text).toContain('has been deleted');
    });

    it('describes the result in markdown by default', async () => {
      const result = await tool.execute({ transactionId: 't1', subtransactions: NEW_LINES });

      const text = result.content[0].text;
      expect(text).toContain('# Split Lines Replaced');
      expect(text).toContain('(replaces `t1`)');
      expect(text).toContain('## Split lines');
      expect(text).toContain('- cat-household: $-50.50 (paper towels)');
    });
  });
});
