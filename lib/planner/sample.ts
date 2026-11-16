/**
 * The example plan shown on a first visit.
 *
 * It describes an imaginary applicant from Vietnam applying to ten U.S.
 * colleges, one of them by binding Early Decision. Every number is invented
 * for illustration and can be edited or replaced; the interface labels the
 * plan as a sample for as long as it is one.
 */

import { DEFAULT_PROFILE, draftCosts } from "@/lib/planner/costs";
import { addMonths, dateOfTimestamp, defaultEntryMonth, monthOfTimestamp } from "@/lib/planner/months";
import type { Month, PlanSettings, PlanState, Transaction } from "@/types/planner";

/** A plan with nothing in it, used before the saved plan has been read. */
export const EMPTY_PLAN: PlanState = {
  version: 1,
  sample: false,
  settings: {
    homeCurrency: "USD",
    usdRate: 1,
    startMonth: "2000-01",
    entryMonth: "2000-08",
    openingBalance: 0,
    fxStressPct: 0,
  },
  costs: [],
  income: [],
  budget: [],
  transactions: [],
  goals: [],
};

const SAMPLE_BUDGET: readonly (readonly [string, number])[] = [
  ["Food", 1_200_000],
  ["Transport", 400_000],
  ["Study", 600_000],
  ["Phone & internet", 200_000],
  ["Entertainment", 400_000],
  ["Other", 200_000],
];

/** A small deterministic generator, so the sample looks the same on every visit. */
function sequence(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function sampleTransactions(start: Month, today: string): Transaction[] {
  const next = sequence(20270801);
  const transactions: Transaction[] = [];
  const spending: readonly (readonly [string, string, number, readonly number[]])[] = [
    ["Food", "Lunch and snacks", 95_000, [2, 5, 8, 11, 14, 17, 20, 23, 26]],
    ["Transport", "Bus pass and rides", 110_000, [3, 12, 21]],
    ["Study", "Books and printing", 240_000, [6, 19]],
    ["Phone & internet", "Mobile plan", 200_000, [4]],
    ["Entertainment", "Film and coffee with friends", 160_000, [9, 24]],
    ["Other", "Gift", 180_000, [15]],
  ];
  for (let back = 2; back >= 0; back -= 1) {
    const month = addMonths(start, -back);
    const day = (value: number): string => `${month}-${String(value).padStart(2, "0")}`;
    const push = (date: string, entry: Omit<Transaction, "id" | "date">): void => {
      if (date > today) return;
      transactions.push({ id: `sample-${transactions.length + 1}`, date, ...entry });
    };
    push(day(1), { description: "Family contribution to applications", amount: 7_000_000, kind: "income", category: "Allowance" });
    push(day(1), { description: "Monthly allowance", amount: 1_500_000, kind: "income", category: "Allowance" });
    push(day(5), { description: "Tutoring a younger student in math", amount: 2_500_000, kind: "income", category: "Part-time work" });
    for (const [category, description, base, days] of spending) {
      for (const value of days) {
        const amount = Math.round((base * (0.75 + 0.5 * next())) / 1000) * 1000;
        push(day(value), { description, amount, kind: "expense", category });
      }
    }
    if (back === 1) {
      push(day(18), { description: "SAT registration", amount: 2_886_000, kind: "expense", category: "Applications" });
    }
  }
  return transactions;
}

/** Build the example plan as of a moment in time. */
export function buildSamplePlan(now: number): PlanState {
  const startMonth = monthOfTimestamp(now);
  const settings: PlanSettings = {
    homeCurrency: "VND",
    usdRate: 26_000,
    startMonth,
    entryMonth: defaultEntryMonth(startMonth),
    openingBalance: 12_000_000,
    fxStressPct: 0,
  };
  const laptopDeadline = addMonths(settings.entryMonth, -1);
  const flightDeadline = addMonths(settings.entryMonth, -2);
  return {
    version: 1,
    sample: true,
    settings,
    costs: draftCosts(DEFAULT_PROFILE, settings, { pastAsPaid: true }),
    income: [
      { id: "income-family", label: "Family contribution to applications", monthly: 7_000_000 },
      { id: "income-allowance", label: "Monthly allowance", monthly: 1_500_000 },
      { id: "income-tutoring", label: "Tutoring (part-time)", monthly: 2_500_000 },
    ],
    budget: SAMPLE_BUDGET.map(([category, monthly], index) => ({ id: `budget-${index + 1}`, category, monthly })),
    transactions: sampleTransactions(startMonth, dateOfTimestamp(now)),
    goals: [
      { id: "goal-laptop", name: "Laptop for university", target: 25_000_000, saved: 9_000_000, deadline: laptopDeadline, monthly: 1_500_000 },
      { id: "goal-flight", name: "Flight to the U.S.", target: 30_000_000, saved: 4_000_000, deadline: flightDeadline, monthly: 2_000_000 },
    ],
  };
}

/** A blank plan that keeps the currency and dates of the current one. */
export function blankPlan(settings: PlanSettings): PlanState {
  return { ...EMPTY_PLAN, settings: { ...settings, openingBalance: 0, fxStressPct: 0 } };
}
