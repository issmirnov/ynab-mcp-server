import { describe, it, expect } from 'vitest';
import {
  activeSubtransactions,
  formatSplitLinesMarkdown,
  isSplitTransaction,
  summarizeSubtransactions,
  toSaveSubTransactions,
} from '../utils/splitTransactions';

const sub = (overrides: Record<string, unknown>) =>
  ({
    id: 's1',
    transaction_id: 't1',
    amount: -80000,
    memo: null,
    payee_id: null,
    payee_name: null,
    category_id: 'cat-groceries',
    category_name: 'Groceries',
    transfer_account_id: null,
    transfer_transaction_id: null,
    deleted: false,
    ...overrides,
  }) as any;

describe('split transaction helpers', () => {
  describe('activeSubtransactions / isSplitTransaction', () => {
    it('drops deleted lines', () => {
      const txn = { subtransactions: [sub({ id: 's1' }), sub({ id: 's2', deleted: true })] };

      expect(activeSubtransactions(txn).map((s) => s.id)).toEqual(['s1']);
      expect(isSplitTransaction(txn)).toBe(true);
    });

    it('treats missing, empty, or all-deleted lines as not split', () => {
      expect(isSplitTransaction({})).toBe(false);
      expect(isSplitTransaction({ subtransactions: [] })).toBe(false);
      expect(isSplitTransaction({ subtransactions: [sub({ deleted: true })] })).toBe(false);
    });
  });

  describe('toSaveSubTransactions', () => {
    it('converts dollar lines to milliunits in the API shape', () => {
      const result = toSaveSubTransactions(
        [
          { amount: -80, categoryId: 'cat-groceries' },
          { amount: -40.5, categoryId: 'cat-household', memo: 'paper towels', payeeName: 'Costco' },
        ],
        -120500
      );

      expect(result).toEqual({
        subtransactions: [
          { amount: -80000, category_id: 'cat-groceries' },
          { amount: -40500, category_id: 'cat-household', memo: 'paper towels', payee_name: 'Costco' },
        ],
      });
    });

    it('compares totals in milliunits so float dollar amounts still balance', () => {
      const result = toSaveSubTransactions([{ amount: -0.1 }, { amount: -0.2 }], -300);

      expect('error' in result).toBe(false);
    });

    it('rejects lines that do not add up to the total, naming both totals and the gap', () => {
      const result = toSaveSubTransactions([{ amount: -80 }, { amount: -25.5 }], -120500);

      expect('error' in result).toBe(true);
      const { error } = result as { error: string };
      expect(error).toContain('$-105.50');
      expect(error).toContain('$-120.50');
      expect(error).toContain('off by $15.00');
    });

    it('rejects fewer than two lines', () => {
      expect(toSaveSubTransactions([{ amount: -120.5 }], -120500)).toEqual({
        error: expect.stringContaining('at least 2 lines'),
      });
    });
  });

  describe('summarizeSubtransactions / formatSplitLinesMarkdown', () => {
    it('reports active lines in dollars with YNAB field names and no nulls', () => {
      const txn = {
        subtransactions: [
          sub({ id: 's1', amount: -80000 }),
          sub({
            id: 's2',
            amount: -40500,
            category_id: 'cat-household',
            category_name: 'Household',
            memo: 'paper towels',
          }),
          sub({ id: 's3', deleted: true }),
        ],
      };

      expect(summarizeSubtransactions(txn)).toEqual([
        { id: 's1', amount: -80, category_id: 'cat-groceries', category_name: 'Groceries' },
        { id: 's2', amount: -40.5, category_id: 'cat-household', category_name: 'Household', memo: 'paper towels' },
      ]);
    });

    it('formats one bullet per line and falls back to the payee for transfer lines', () => {
      const markdown = formatSplitLinesMarkdown(
        [
          { id: 's1', amount: -80, category_name: 'Groceries' },
          { id: 's2', amount: -40.5, payee_name: 'Transfer : Savings', memo: 'set aside' },
        ],
        '  '
      );

      expect(markdown).toBe('  - Groceries: $-80.00\n  - Transfer : Savings: $-40.50 (set aside)\n');
    });
  });
});
