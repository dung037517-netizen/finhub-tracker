/**
 * Month-by-month cash flow from today to the first day of university.
 *
 * The question is not whether a student can afford the total. It is whether
 * the money is there in the month each bill arrives. Application costs are
 * lumpy — a quiet autumn, then several hundred dollars in a single week of
 * December — while income arrives evenly, so a plan that balances over the
 * year can still run dry in the middle of it.
 *
 * Within a month, income is received before anything is paid, and the balance
 * is measured at the end of the month.
 */

import { isContingent, itemUsd, usdToHome } from "@/lib/planner/costs";
import { clampMonth, monthIndex, monthRange } from "@/lib/planner/months";
import type { CostItem, Goal, Month, PlanState } from "@/types/planner";

/**
 * How contingencies are treated.
 *  - `planned`: ignored. Only what is certain.
 *  - `expected`: weighted by their probability. The best estimate.
 *  - `prudent`: all of them happen. The plan a careful student funds.
 */
export type CostMode = "planned" | "expected" | "prudent";

export const COST_MODE_LABELS: Readonly<Record<CostMode, string>> = {
  planned: "Planned only",
  expected: "Expected",
  prudent: "Prudent",
};

function weight(item: CostItem, mode: CostMode): number {
  if (item.paid) return 0;
  if (!isContingent(item)) return 1;
  if (mode === "planned") return 0;
  return mode === "expected" ? item.probability : 1;
}

export interface FlowItem {
  readonly label: string;
  /** Home currency, after the exchange rate and the stress. */
  readonly amount: number;
  readonly contingent: boolean;
}

export interface MonthFlow {
  readonly month: Month;
  readonly income: number;
  /** Budgeted living costs for the month. */
  readonly living: number;
  /** Set aside for savings goals. */
  readonly goals: number;
  /** Application costs falling due, in home currency. */
  readonly application: number;
  readonly net: number;
  /** Balance at the end of the month. */
  readonly balance: number;
  readonly items: readonly FlowItem[];
}

export interface CashFlowProjection {
  readonly months: readonly MonthFlow[];
  readonly minBalance: number;
  readonly minMonth: Month | null;
  /** The first month that ends below zero, if any. */
  readonly firstShortfall: Month | null;
  readonly endBalance: number;
  readonly totalIncome: number;
  readonly totalLiving: number;
  readonly totalGoals: number;
  readonly totalApplication: number;
}

function incomeIn(plan: PlanState, month: Month): number {
  const index = monthIndex(month);
  return plan.income.reduce((total, source) => {
    if (source.from !== undefined && index < monthIndex(source.from)) return total;
    if (source.until !== undefined && index > monthIndex(source.until)) return total;
    return total + source.monthly;
  }, 0);
}

function goalContribution(goal: Goal, month: Month): number {
  if (goal.saved >= goal.target) return 0;
  return monthIndex(month) <= monthIndex(goal.deadline) ? goal.monthly : 0;
}

export function plannedLiving(plan: PlanState): number {
  return plan.budget.reduce((total, line) => total + line.monthly, 0);
}

/**
 * Project the balance for every month from the start of the plan to the month
 * of entry. `extraMonthly` is added to income, to test a savings level.
 */
export function projectCashFlow(plan: PlanState, mode: CostMode = "planned", extraMonthly = 0): CashFlowProjection {
  const { settings } = plan;
  const months = monthRange(settings.startMonth, settings.entryMonth);
  const living = plannedLiving(plan);

  // Group what falls due by month. Anything overdue is due in the first month.
  const due = new Map<Month, FlowItem[]>();
  for (const item of plan.costs) {
    const share = weight(item, mode);
    if (share === 0 || months.length === 0) continue;
    const month = clampMonth(item.month, settings.startMonth, settings.entryMonth);
    const amount = usdToHome(itemUsd(item) * share, settings);
    const list = due.get(month);
    const entry: FlowItem = { label: item.label, amount, contingent: isContingent(item) };
    if (list === undefined) due.set(month, [entry]);
    else list.push(entry);
  }

  let balance = settings.openingBalance;
  let minBalance = Number.POSITIVE_INFINITY;
  let minMonth: Month | null = null;
  let firstShortfall: Month | null = null;
  let totalIncome = 0;
  let totalLiving = 0;
  let totalGoals = 0;
  let totalApplication = 0;

  const flows = months.map((month): MonthFlow => {
    const income = incomeIn(plan, month) + extraMonthly;
    const goals = plan.goals.reduce((total, goal) => total + goalContribution(goal, month), 0);
    const items = due.get(month) ?? [];
    const application = items.reduce((total, item) => total + item.amount, 0);
    const net = income - living - goals - application;
    balance += net;
    totalIncome += income;
    totalLiving += living;
    totalGoals += goals;
    totalApplication += application;
    if (balance < minBalance) {
      minBalance = balance;
      minMonth = month;
    }
    if (balance < -1e-9 && firstShortfall === null) firstShortfall = month;
    return { month, income, living, goals, application, net, balance, items };
  });

  return {
    months: flows,
    minBalance: flows.length === 0 ? settings.openingBalance : minBalance,
    minMonth,
    firstShortfall,
    endBalance: balance,
    totalIncome,
    totalLiving,
    totalGoals,
    totalApplication,
  };
}

/**
 * How much more the student would need at the start for the balance never to
 * go negative. Zero if the plan already holds.
 *
 * The balance at the end of month t is the opening balance plus the cumulative
 * net flow to t, so the requirement is the deepest point of that cumulative
 * flow below zero.
 */
export function openingShortfall(plan: PlanState, mode: CostMode = "planned"): number {
  return Math.max(0, -projectCashFlow(plan, mode).minBalance);
}

export interface SavingRequirement {
  /** Extra amount to add every month, from the first month on. */
  readonly amount: number;
  /** The month whose bills set the requirement. */
  readonly bindingMonth: Month | null;
}

/**
 * The smallest level amount that, added every month, keeps the balance from
 * ever going negative.
 *
 * Adding m per month raises the balance at the end of month t (counting from
 * zero) by (t + 1)·m. The balance must stay at or above zero in every month,
 * so m must be at least −balance_t / (t + 1) for each t, and the requirement
 * is the largest of those. The month that attains it is the binding one: the
 * requirement is set by a single month's bills, not by the year's total.
 */
export function requiredMonthlySaving(plan: PlanState, mode: CostMode = "planned"): SavingRequirement {
  const projection = projectCashFlow(plan, mode);
  let amount = 0;
  let bindingMonth: Month | null = null;
  projection.months.forEach((flow, index) => {
    const needed = -flow.balance / (index + 1);
    if (needed > amount + 1e-9) {
      amount = needed;
      bindingMonth = flow.month;
    }
  });
  return { amount, bindingMonth };
}

export interface FxPoint {
  readonly stressPct: number;
  readonly application: number;
  readonly minBalance: number;
  readonly shortfall: number;
}

/** How the plan responds as the dollar strengthens against the home currency. */
export function fxSensitivity(plan: PlanState, stresses: readonly number[], mode: CostMode = "expected"): FxPoint[] {
  return stresses.map((stressPct) => {
    const stressed: PlanState = { ...plan, settings: { ...plan.settings, fxStressPct: stressPct } };
    const projection = projectCashFlow(stressed, mode);
    return {
      stressPct,
      application: projection.totalApplication,
      minBalance: projection.minBalance,
      shortfall: Math.max(0, -projection.minBalance),
    };
  });
}
