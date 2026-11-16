/**
 * Saving a plan in the browser.
 *
 * There is no account and no server: a plan lives in the student's own
 * browser. Whatever is read back is rebuilt field by field, because stored
 * data outlives the code that wrote it and can be edited by hand.
 */

import { isMonth, monthOfDate } from "@/lib/planner/months";
import type {
  BudgetLine,
  CostCategory,
  CostItem,
  Goal,
  IncomeSource,
  PlanSettings,
  PlanState,
  Transaction,
} from "@/types/planner";

export const STORAGE_KEY = "finhub:plan:v1";
/** Where the original FinanceFlow app kept its transactions. */
export const LEGACY_TRANSACTIONS_KEY = "financeflow-transactions";

const MAX_TRANSACTIONS = 5000;
const CATEGORIES: readonly CostCategory[] = ["testing", "scores", "applications", "aid", "enrollment", "visa", "other"];

type Dict = Record<string, unknown>;

function isDict(value: unknown): value is Dict {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function amount(value: unknown, fallback = 0, max = 1e13): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : fallback;
}

function text(value: unknown, fallback: string, max = 80): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, max) : fallback;
}

function identifier(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 && value.length <= 64 ? value : fallback;
}

function readSettings(value: unknown): PlanSettings | null {
  if (!isDict(value) || !isMonth(value.startMonth) || !isMonth(value.entryMonth)) return null;
  const currency = typeof value.homeCurrency === "string" && /^[A-Z]{3}$/.test(value.homeCurrency) ? value.homeCurrency : "USD";
  const usdRate = amount(value.usdRate, 1);
  return {
    homeCurrency: currency,
    usdRate: usdRate > 0 ? usdRate : 1,
    startMonth: value.startMonth,
    entryMonth: value.entryMonth >= value.startMonth ? value.entryMonth : value.startMonth,
    openingBalance: amount(value.openingBalance),
    fxStressPct: amount(value.fxStressPct, 0, 100),
  };
}

function readCost(value: unknown, index: number): CostItem | null {
  if (!isDict(value) || !isMonth(value.month)) return null;
  const category = CATEGORIES.find((entry) => entry === value.category) ?? "other";
  const probability = typeof value.probability === "number" && Number.isFinite(value.probability) ? value.probability : 1;
  return {
    id: identifier(value.id, `cost-${index}`),
    category,
    label: text(value.label, "Cost"),
    unitUsd: amount(value.unitUsd, 0, 1e7),
    quantity: Math.round(amount(value.quantity, 1, 1000)),
    month: value.month,
    paid: value.paid === true,
    probability: Math.min(1, Math.max(0, probability)),
    group: typeof value.group === "string" && value.group.length <= 64 ? value.group : undefined,
    feeId: typeof value.feeId === "string" && value.feeId.length <= 64 ? value.feeId : undefined,
  };
}

function readIncome(value: unknown, index: number): IncomeSource | null {
  if (!isDict(value)) return null;
  return {
    id: identifier(value.id, `income-${index}`),
    label: text(value.label, "Income"),
    monthly: amount(value.monthly),
    from: isMonth(value.from) ? value.from : undefined,
    until: isMonth(value.until) ? value.until : undefined,
  };
}

function readBudgetLine(value: unknown, index: number): BudgetLine | null {
  if (!isDict(value)) return null;
  return { id: identifier(value.id, `budget-${index}`), category: text(value.category, "Other", 40), monthly: amount(value.monthly) };
}

function readTransaction(value: unknown, index: number): Transaction | null {
  if (!isDict(value) || typeof value.date !== "string" || monthOfDate(value.date) === null) return null;
  const kind = value.kind === "income" || value.kind === "expense" ? value.kind : null;
  if (kind === null) return null;
  const size = amount(value.amount);
  if (size <= 0) return null;
  return {
    id: identifier(value.id, `tx-${index}`),
    date: value.date,
    description: text(value.description, kind === "income" ? "Income" : "Expense", 120),
    amount: size,
    kind,
    category: text(value.category, "Other", 40),
  };
}

function readGoal(value: unknown, index: number): Goal | null {
  if (!isDict(value) || !isMonth(value.deadline)) return null;
  return {
    id: identifier(value.id, `goal-${index}`),
    name: text(value.name, "Goal"),
    target: amount(value.target),
    saved: amount(value.saved),
    deadline: value.deadline,
    monthly: amount(value.monthly),
  };
}

function readList<T>(value: unknown, read: (entry: unknown, index: number) => T | null, limit: number): T[] {
  if (!Array.isArray(value)) return [];
  const list: T[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length && list.length < limit; index += 1) {
    const parsed = read(value[index], index);
    if (parsed === null) continue;
    const id = (parsed as { id?: string }).id;
    if (id !== undefined) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    list.push(parsed);
  }
  return list;
}

/** Rebuild a trustworthy plan from untrusted data, or null if it is not a plan. */
export function sanitizePlan(value: unknown): PlanState | null {
  if (!isDict(value) || value.version !== 1) return null;
  const settings = readSettings(value.settings);
  if (settings === null) return null;
  return {
    version: 1,
    sample: value.sample === true,
    settings,
    costs: readList(value.costs, readCost, 200),
    income: readList(value.income, readIncome, 40),
    budget: readList(value.budget, readBudgetLine, 60),
    transactions: readList(value.transactions, readTransaction, MAX_TRANSACTIONS),
    goals: readList(value.goals, readGoal, 40),
  };
}

/** The subset of the Web Storage API this module needs. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function loadPlan(store: KeyValueStore | null): PlanState | null {
  if (store === null) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    return raw === null ? null : sanitizePlan(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/** Returns false when the browser refused the write. */
export function savePlan(store: KeyValueStore | null, plan: PlanState): boolean {
  if (store === null) return false;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(plan));
    return true;
  } catch {
    return false;
  }
}

export function clearPlan(store: KeyValueStore | null): void {
  try {
    store?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

export function exportPlan(plan: PlanState, now: number): string {
  return JSON.stringify({ app: "finhub-tracker", version: 1, exportedAt: new Date(now).toISOString(), data: plan }, null, 2);
}

export type ImportResult =
  | { readonly ok: true; readonly plan: PlanState }
  | { readonly ok: false; readonly error: string };

export function importPlan(textValue: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(textValue) as unknown;
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }
  if (!isDict(parsed) || parsed.app !== "finhub-tracker") {
    return { ok: false, error: "That file was not exported from FinHub Tracker." };
  }
  const plan = sanitizePlan(parsed.data);
  return plan === null
    ? { ok: false, error: "That backup uses a format this version cannot read." }
    : { ok: true, plan: { ...plan, sample: false } };
}

/**
 * Transactions saved by FinanceFlow, the first version of this app, which
 * stored `{ id, date, description, amount, type, category }` in the same
 * browser. Returns the ones that can be carried over.
 */
export function readLegacyTransactions(store: KeyValueStore | null): Transaction[] {
  if (store === null) return [];
  try {
    const raw = store.getItem(LEGACY_TRANSACTIONS_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return readList(
      parsed.map((entry: unknown) => (isDict(entry) ? { ...entry, kind: entry.type, id: `legacy-${String(entry.id)}` } : entry)),
      readTransaction,
      MAX_TRANSACTIONS,
    );
  } catch {
    return [];
  }
}
