/**
 * Budgeting: what was planned for a month against what actually happened.
 */

import { monthOfDate } from "@/lib/planner/months";
import type { Month, PlanState, Transaction } from "@/types/planner";

export const EXPENSE_CATEGORIES: readonly string[] = [
  "Food",
  "Transport",
  "Study",
  "Phone & internet",
  "Entertainment",
  "Shopping",
  "Applications",
  "Other",
];

export const INCOME_CATEGORIES: readonly string[] = ["Allowance", "Part-time work", "Scholarship", "Gift", "Other"];

export interface CategoryStatus {
  readonly category: string;
  readonly planned: number;
  readonly actual: number;
  /** Planned minus actual; negative when the category is over budget. */
  readonly remaining: number;
  /** Actual as a share of planned; null when nothing was planned. */
  readonly ratio: number | null;
}

export interface MonthBudget {
  readonly month: Month;
  readonly income: number;
  readonly spent: number;
  readonly planned: number;
  /** Income minus spending. */
  readonly net: number;
  /** Net as a share of income; null when there was no income. */
  readonly savingsRate: number | null;
  readonly categories: readonly CategoryStatus[];
  readonly transactions: readonly Transaction[];
}

export function transactionsIn(transactions: readonly Transaction[], month: Month): Transaction[] {
  return transactions.filter((transaction) => monthOfDate(transaction.date) === month);
}

/** Planned against actual for one month, category by category. */
export function monthBudget(plan: PlanState, month: Month): MonthBudget {
  const inMonth = transactionsIn(plan.transactions, month);
  const actualByCategory = new Map<string, number>();
  let income = 0;
  let spent = 0;
  for (const transaction of inMonth) {
    if (transaction.kind === "income") {
      income += transaction.amount;
    } else {
      spent += transaction.amount;
      actualByCategory.set(
        transaction.category,
        (actualByCategory.get(transaction.category) ?? 0) + transaction.amount,
      );
    }
  }

  const plannedByCategory = new Map<string, number>();
  for (const line of plan.budget) {
    plannedByCategory.set(line.category, (plannedByCategory.get(line.category) ?? 0) + line.monthly);
  }

  // Budgeted categories first, in the order they were entered, then any
  // category that was spent on without a budget.
  const names = [...plannedByCategory.keys()];
  for (const name of actualByCategory.keys()) if (!plannedByCategory.has(name)) names.push(name);

  const categories = names.map((category): CategoryStatus => {
    const planned = plannedByCategory.get(category) ?? 0;
    const actual = actualByCategory.get(category) ?? 0;
    return { category, planned, actual, remaining: planned - actual, ratio: planned > 0 ? actual / planned : null };
  });

  const planned = [...plannedByCategory.values()].reduce((total, value) => total + value, 0);
  const net = income - spent;
  return {
    month,
    income,
    spent,
    planned,
    net,
    savingsRate: income > 0 ? net / income : null,
    categories,
    transactions: [...inMonth].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
  };
}

export interface MonthTotals {
  readonly month: Month;
  readonly income: number;
  readonly expense: number;
  readonly net: number;
}

/** Income, spending and net for each of the given months. */
export function monthlyHistory(transactions: readonly Transaction[], months: readonly Month[]): MonthTotals[] {
  const totals = new Map<Month, { income: number; expense: number }>(
    months.map((month) => [month, { income: 0, expense: 0 }]),
  );
  for (const transaction of transactions) {
    const month = monthOfDate(transaction.date);
    const bucket = month === null ? undefined : totals.get(month);
    if (bucket === undefined) continue;
    if (transaction.kind === "income") bucket.income += transaction.amount;
    else bucket.expense += transaction.amount;
  }
  return months.map((month) => {
    const bucket = totals.get(month) ?? { income: 0, expense: 0 };
    return { month, income: bucket.income, expense: bucket.expense, net: bucket.income - bucket.expense };
  });
}

/** Months that have at least one transaction, most recent first. */
export function monthsWithActivity(transactions: readonly Transaction[]): Month[] {
  const months = new Set<Month>();
  for (const transaction of transactions) {
    const month = monthOfDate(transaction.date);
    if (month !== null) months.add(month);
  }
  return [...months].sort().reverse();
}
