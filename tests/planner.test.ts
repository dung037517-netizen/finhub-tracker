import { describe, expect, it } from "vitest";

import { monthBudget, monthlyHistory, monthsWithActivity } from "@/lib/planner/budget";
import {
  fxSensitivity,
  openingShortfall,
  plannedLiving,
  projectCashFlow,
  requiredMonthlySaving,
} from "@/lib/planner/cashflow";
import {
  contingencyGroups,
  costDistribution,
  costTotals,
  DEFAULT_PROFILE,
  draftCosts,
  itemUsd,
  normalizeProfile,
  usdToHome,
} from "@/lib/planner/costs";
import { CATEGORY_LABELS, CATEGORY_ORDER, feeAmount, findFee, REFERENCE_FEES } from "@/lib/planner/fees";
import { formatMoney, formatShare, parseAmount } from "@/lib/planner/format";
import { goalStatus, monthlyGoalCommitment } from "@/lib/planner/goals";
import {
  addMonths,
  clampMonth,
  dateOfTimestamp,
  defaultEntryMonth,
  formatMonth,
  fromIndex,
  isMonth,
  monthIndex,
  monthOfDate,
  monthOfTimestamp,
  monthRange,
  monthsBetween,
} from "@/lib/planner/months";
import { blankPlan, buildSamplePlan, EMPTY_PLAN } from "@/lib/planner/sample";
import {
  exportPlan,
  importPlan,
  LEGACY_TRANSACTIONS_KEY,
  loadPlan,
  readLegacyTransactions,
  sanitizePlan,
  savePlan,
  STORAGE_KEY,
  type KeyValueStore,
} from "@/lib/planner/storage";
import type { CostItem, Goal, PlanSettings, PlanState } from "@/types/planner";

const SETTINGS: PlanSettings = {
  homeCurrency: "USD",
  usdRate: 1,
  startMonth: "2026-09",
  entryMonth: "2027-08",
  openingBalance: 500,
  fxStressPct: 0,
};

function cost(overrides: Partial<CostItem>): CostItem {
  return {
    id: "c",
    category: "applications",
    label: "Cost",
    unitUsd: 100,
    quantity: 1,
    month: "2026-12",
    paid: false,
    probability: 1,
    ...overrides,
  };
}

function plan(overrides: Partial<PlanState> = {}): PlanState {
  return { ...EMPTY_PLAN, settings: SETTINGS, ...overrides };
}

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

/* ------------------------------------------------------------------ */

describe("calendar months", () => {
  it("round-trips through the integer index", () => {
    for (const month of ["2026-01", "2026-12", "2027-08", "1999-06"]) {
      expect(fromIndex(monthIndex(month))).toBe(month);
    }
    expect(() => monthIndex("2026-13")).toThrow();
  });

  it("adds and subtracts across a year boundary", () => {
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(addMonths("2027-01", -1)).toBe("2026-12");
    expect(monthsBetween("2026-11", "2027-08")).toBe(9);
    expect(monthsBetween("2027-08", "2026-11")).toBe(-9);
  });

  it("lists an inclusive range", () => {
    expect(monthRange("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(monthRange("2027-02", "2026-11")).toEqual([]);
  });

  it("recognizes well-formed months and dates only", () => {
    expect(isMonth("2026-09")).toBe(true);
    expect(isMonth("2026-9")).toBe(false);
    expect(isMonth(202609)).toBe(false);
    expect(monthOfDate("2026-09-15")).toBe("2026-09");
    expect(monthOfDate("2026-13-01")).toBeNull();
    expect(monthOfDate("15/09/2026")).toBeNull();
  });

  it("formats and clamps", () => {
    expect(formatMonth("2026-11")).toBe("Nov 2026");
    expect(formatMonth("2027-08", "long")).toBe("August 2027");
    expect(clampMonth("2026-01", "2026-09", "2027-08")).toBe("2026-09");
    expect(clampMonth("2028-01", "2026-09", "2027-08")).toBe("2027-08");
  });

  it("picks the next August that is at least six months away", () => {
    expect(defaultEntryMonth("2026-11")).toBe("2027-08");
    expect(defaultEntryMonth("2027-02")).toBe("2027-08");
    expect(defaultEntryMonth("2027-03")).toBe("2028-08");
    expect(defaultEntryMonth("2027-08")).toBe("2028-08");
  });

  it("reads the local month and date of a timestamp", () => {
    const stamp = new Date(2026, 10, 5, 9).getTime();
    expect(monthOfTimestamp(stamp)).toBe("2026-11");
    expect(dateOfTimestamp(stamp)).toBe("2026-11-05");
  });
});

describe("reference fees", () => {
  it("covers every category with positive, sourced amounts", () => {
    for (const fee of REFERENCE_FEES) {
      expect(fee.usd, fee.id).toBeGreaterThan(0);
      expect(fee.source.length, fee.id).toBeGreaterThan(0);
      expect(CATEGORY_LABELS[fee.category], fee.id).toBeDefined();
    }
    const categories = new Set(REFERENCE_FEES.map((fee) => fee.category));
    for (const category of CATEGORY_ORDER) expect(categories.has(category), category).toBe(true);
    expect(new Set(REFERENCE_FEES.map((fee) => fee.id)).size).toBe(REFERENCE_FEES.length);
  });

  it("carries the published standard fees", () => {
    expect(feeAmount("sat")).toBe(68 + 43);
    expect(feeAmount("ap")).toBe(129);
    expect(feeAmount("css-first")).toBe(25);
    expect(feeAmount("css-more")).toBe(16);
    expect(feeAmount("sevis")).toBe(350);
    expect(feeAmount("visa")).toBe(185);
    expect(findFee("nope")).toBeNull();
    expect(feeAmount("nope")).toBe(0);
  });
});

describe("cost totals and distribution", () => {
  it("separates paid, planned and contingent amounts", () => {
    const totals = costTotals([
      cost({ id: "a", unitUsd: 75, quantity: 4 }),
      cost({ id: "b", unitUsd: 111, paid: true, category: "testing" }),
      cost({ id: "c", unitUsd: 200, probability: 0.25, category: "testing" }),
    ]);
    expect(totals.plannedUsd).toBe(300);
    expect(totals.paidUsd).toBe(111);
    expect(totals.contingentExpectedUsd).toBe(50);
    expect(totals.contingentMaxUsd).toBe(200);
    expect(totals.byCategory.applications.planned).toBe(300);
    expect(totals.byCategory.testing).toEqual({ paid: 111, planned: 0, contingent: 50 });
    expect(itemUsd(cost({ unitUsd: 16, quantity: 7 }))).toBe(112);
  });

  it("is a single certain outcome when nothing is contingent", () => {
    const distribution = costDistribution([cost({ id: "a", unitUsd: 75, quantity: 2 }), cost({ id: "b", paid: true })]);
    expect(distribution.scenarios).toEqual([{ usd: 150, probability: 1 }]);
    expect(distribution.baseUsd).toBe(150);
    expect(distribution.expectedUsd).toBe(150);
    expect(distribution.p90Usd).toBe(150);
    expect(distribution.worstUsd).toBe(150);
    expect(distribution.marginUsd).toBe(0);
  });

  it("enumerates independent contingencies exactly", () => {
    const distribution = costDistribution([
      cost({ id: "base", unitUsd: 1000 }),
      cost({ id: "retake", unitUsd: 100, probability: 0.4 }),
      cost({ id: "extra", unitUsd: 300, probability: 0.5 }),
    ]);
    // Outcomes: 1000 (0.3), 1100 (0.2), 1300 (0.3), 1400 (0.2).
    expect(distribution.scenarios.map((scenario) => scenario.usd)).toEqual([1000, 1100, 1300, 1400]);
    const probabilities = distribution.scenarios.map((scenario) => scenario.probability);
    expect(probabilities[0]).toBeCloseTo(0.3, 12);
    expect(probabilities[1]).toBeCloseTo(0.2, 12);
    expect(probabilities[2]).toBeCloseTo(0.3, 12);
    expect(probabilities[3]).toBeCloseTo(0.2, 12);
    expect(probabilities.reduce((total, value) => total + value, 0)).toBeCloseTo(1, 12);
    expect(distribution.expectedUsd).toBeCloseTo(1000 + 0.4 * 100 + 0.5 * 300, 9);
    // Cumulative: 0.3, 0.5, 0.8, 1.0 — the 90th percentile is the last outcome.
    expect(distribution.p90Usd).toBe(1400);
    expect(distribution.worstUsd).toBe(1400);
    expect(distribution.marginUsd).toBeCloseTo(1400 - 1190, 9);
  });

  it("treats items in the same group as one event", () => {
    const items = [
      cost({ id: "apps", unitUsd: 75, quantity: 9, probability: 0.75, group: "regular-round" }),
      cost({ id: "reports", unitUsd: 14, quantity: 6, probability: 0.75, group: "regular-round" }),
    ];
    const groups = contingencyGroups(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].usd).toBe(675 + 84);
    const distribution = costDistribution(items);
    expect(distribution.scenarios).toHaveLength(2);
    expect(distribution.scenarios[0]).toEqual({ usd: 0, probability: 0.25 });
    expect(distribution.scenarios[1].usd).toBe(759);
    expect(distribution.scenarios[1].probability).toBeCloseTo(0.75, 12);
    expect(distribution.expectedUsd).toBeCloseTo(0.75 * 759, 9);
  });

  it("ignores paid and impossible contingencies", () => {
    const distribution = costDistribution([
      cost({ id: "a", unitUsd: 100, probability: 0.5, paid: true }),
      cost({ id: "b", unitUsd: 100, probability: 0 }),
    ]);
    expect(distribution.scenarios).toEqual([{ usd: 0, probability: 1 }]);
    expect(distribution.groups).toEqual([]);
  });

  it("never reports a 90th percentile below the expected-case base or above the worst case", () => {
    for (const probability of [0.05, 0.1, 0.11, 0.5, 0.9, 0.95]) {
      const distribution = costDistribution([cost({ id: "a", unitUsd: 500 }), cost({ id: "b", unitUsd: 200, probability })]);
      expect(distribution.p90Usd).toBeGreaterThanOrEqual(distribution.baseUsd);
      expect(distribution.p90Usd).toBeLessThanOrEqual(distribution.worstUsd);
      // A contingency of at most 10% does not move the 90th percentile.
      expect(distribution.p90Usd).toBe(probability <= 0.1 ? 500 : 700);
    }
  });

  it("converts dollars at the plan's rate, with and without stress", () => {
    const settings = { ...SETTINGS, usdRate: 26_000, fxStressPct: 5 };
    expect(usdToHome(100, settings, false)).toBe(2_600_000);
    expect(usdToHome(100, settings)).toBeCloseTo(2_730_000, 6);
  });
});

describe("drafting a cost schedule", () => {
  const settings = { ...SETTINGS, startMonth: "2026-07" };

  it("follows the calendar of the application year", () => {
    const items = draftCosts(DEFAULT_PROFILE, settings);
    const months = items.map((item) => monthIndex(item.month));
    expect([...months].sort((a, b) => a - b)).toEqual(months);
    for (const item of items) {
      expect(monthIndex(item.month)).toBeGreaterThanOrEqual(monthIndex(settings.startMonth));
      expect(monthIndex(item.month)).toBeLessThanOrEqual(monthIndex(settings.entryMonth));
      expect(item.paid).toBe(false);
    }
    const byLabel = (text: string): CostItem | undefined => items.find((item) => item.label.includes(text));
    expect(byLabel("Early Decision")?.month).toBe("2026-10");
    expect(byLabel("Regular-round")?.month).toBe("2026-12");
    expect(byLabel("Enrollment deposit")?.month).toBe("2027-05");
    expect(byLabel("SEVIS")?.month).toBe("2027-06");
  });

  it("makes regular-round costs contingent on the early decision", () => {
    const items = draftCosts(DEFAULT_PROFILE, settings);
    const regular = items.filter((item) => item.group === "regular-round");
    expect(regular.length).toBeGreaterThanOrEqual(3);
    for (const item of regular) expect(item.probability).toBeCloseTo(0.75, 12);
    expect(regular.find((item) => item.feeId === "application")?.quantity).toBe(9);
    // Ten colleges, four free SAT reports.
    expect(regular.find((item) => item.feeId === "sat-report")?.quantity).toBe(6);
  });

  it("charges the CSS Profile as one first college plus the rest", () => {
    for (const earlyDecision of [true, false]) {
      const items = draftCosts({ ...DEFAULT_PROFILE, earlyDecision, cssColleges: 8 }, settings);
      const first = items.filter((item) => item.feeId === "css-first").reduce((total, item) => total + item.quantity, 0);
      const more = items.filter((item) => item.feeId === "css-more").reduce((total, item) => total + item.quantity, 0);
      expect(first).toBe(1);
      expect(more).toBe(7);
    }
    expect(draftCosts({ ...DEFAULT_PROFILE, cssColleges: 0 }, settings).some((item) => item.category === "aid")).toBe(false);
  });

  it("has no contingent applications without an early decision", () => {
    const items = draftCosts({ ...DEFAULT_PROFILE, earlyDecision: false, satRetakeChancePct: 0, needsVisa: false }, settings);
    expect(items.every((item) => item.probability === 1)).toBe(true);
    expect(items.find((item) => item.feeId === "application")?.quantity).toBe(10);
    expect(items.some((item) => item.category === "visa")).toBe(false);
  });

  it("marks what has already passed as paid when asked to", () => {
    const late = { ...SETTINGS, startMonth: "2026-12" };
    const clamped = draftCosts(DEFAULT_PROFILE, late);
    expect(clamped.every((item) => !item.paid && monthIndex(item.month) >= monthIndex("2026-12"))).toBe(true);
    const realistic = draftCosts(DEFAULT_PROFILE, late, { pastAsPaid: true });
    const paid = realistic.filter((item) => item.paid);
    expect(paid.length).toBeGreaterThan(0);
    expect(paid.every((item) => monthIndex(item.month) < monthIndex("2026-12") && item.probability === 1)).toBe(true);
    expect(realistic.filter((item) => !item.paid).every((item) => monthIndex(item.month) >= monthIndex("2026-12"))).toBe(true);
  });

  it("keeps a profile within sensible bounds", () => {
    const profile = normalizeProfile({ ...DEFAULT_PROFILE, colleges: 99, cssColleges: 50, apExams: -3, earlyAdmitChancePct: 140 });
    expect(profile.colleges).toBe(30);
    expect(profile.cssColleges).toBe(30);
    expect(profile.apExams).toBe(0);
    expect(profile.earlyAdmitChancePct).toBe(100);
    expect(normalizeProfile({ ...DEFAULT_PROFILE, colleges: 1 }).earlyDecision).toBe(false);
  });
});

describe("cash flow", () => {
  const base = plan({
    income: [{ id: "i", label: "Allowance", monthly: 300 }],
    budget: [
      { id: "b1", category: "Food", monthly: 150 },
      { id: "b2", category: "Transport", monthly: 50 },
    ],
    costs: [
      cost({ id: "ed", unitUsd: 75, month: "2026-10" }),
      cost({ id: "rd", unitUsd: 75, quantity: 9, month: "2026-12", probability: 0.75, group: "regular-round" }),
      cost({ id: "dep", unitUsd: 500, month: "2027-05", category: "enrollment" }),
      cost({ id: "old", unitUsd: 111, month: "2026-08", paid: true, category: "testing" }),
    ],
  });

  it("carries the balance forward month by month", () => {
    const projection = projectCashFlow(base, "planned");
    expect(projection.months).toHaveLength(12);
    expect(plannedLiving(base)).toBe(200);
    let balance = base.settings.openingBalance;
    for (const flow of projection.months) {
      expect(flow.net).toBeCloseTo(flow.income - flow.living - flow.goals - flow.application, 9);
      balance += flow.net;
      expect(flow.balance).toBeCloseTo(balance, 9);
    }
    expect(projection.endBalance).toBeCloseTo(balance, 9);
    expect(projection.totalApplication).toBe(575);
    expect(projection.months[1].items.map((item) => item.label)).toEqual(["Cost"]);
  });

  it("orders the three ways of treating contingencies", () => {
    const planned = projectCashFlow(base, "planned");
    const expected = projectCashFlow(base, "expected");
    const prudent = projectCashFlow(base, "prudent");
    expect(expected.totalApplication).toBeCloseTo(575 + 0.75 * 675, 9);
    expect(prudent.totalApplication).toBe(575 + 675);
    expect(planned.minBalance).toBeGreaterThanOrEqual(expected.minBalance);
    expect(expected.minBalance).toBeGreaterThanOrEqual(prudent.minBalance);
    expect(planned.endBalance).toBeGreaterThan(prudent.endBalance);
  });

  it("ignores what is already paid and pulls overdue items into the first month", () => {
    const overdue = plan({ costs: [cost({ id: "late", unitUsd: 90, month: "2026-06" }), cost({ id: "p", paid: true })] });
    const projection = projectCashFlow(overdue);
    expect(projection.months[0].application).toBe(90);
    expect(projection.totalApplication).toBe(90);
  });

  it("finds the first month the balance goes negative", () => {
    const tight = plan({
      settings: { ...SETTINGS, openingBalance: 100 },
      costs: [cost({ id: "a", unitUsd: 80, month: "2026-10" }), cost({ id: "b", unitUsd: 400, month: "2026-12" })],
    });
    const projection = projectCashFlow(tight);
    expect(projection.firstShortfall).toBe("2026-12");
    expect(projection.minBalance).toBe(-380);
    expect(projection.minMonth).toBe("2026-12");
    expect(openingShortfall(tight)).toBe(380);
    expect(projectCashFlow({ ...tight, settings: { ...tight.settings, openingBalance: 480 } }).minBalance).toBeCloseTo(0, 9);
    expect(openingShortfall(base)).toBe(0);
  });

  it("solves for the smallest level saving and names the month that sets it", () => {
    const tight = plan({
      settings: { ...SETTINGS, openingBalance: 0 },
      costs: [
        cost({ id: "a", unitUsd: 100, month: "2026-09" }),
        cost({ id: "b", unitUsd: 700, month: "2026-12" }),
        cost({ id: "c", unitUsd: 500, month: "2027-05" }),
      ],
    });
    const requirement = requiredMonthlySaving(tight);
    // By the end of December (4 months) 800 is due; by May (9 months) 1300.
    // 800 / 4 = 200 exceeds 1300 / 9 ≈ 144 and 100 / 1, so December binds.
    expect(requirement.amount).toBeCloseTo(200, 9);
    expect(requirement.bindingMonth).toBe("2026-12");
    expect(projectCashFlow(tight, "planned", requirement.amount).minBalance).toBeGreaterThanOrEqual(-1e-9);
    expect(projectCashFlow(tight, "planned", requirement.amount - 1).minBalance).toBeLessThan(0);
    expect(requiredMonthlySaving(base)).toEqual({ amount: 0, bindingMonth: null });
  });

  it("shows that a plan can balance over the year and still run dry in the middle", () => {
    const lumpy = plan({
      settings: { ...SETTINGS, openingBalance: 0 },
      income: [{ id: "i", label: "Allowance", monthly: 100 }],
      costs: [cost({ id: "dec", unitUsd: 900, month: "2026-12" })],
    });
    const projection = projectCashFlow(lumpy);
    expect(projection.endBalance).toBe(300);
    expect(projection.firstShortfall).toBe("2026-12");
    expect(openingShortfall(lumpy)).toBe(500);
  });

  it("respects the dates on an income source", () => {
    const seasonal = plan({
      income: [{ id: "job", label: "Summer job", monthly: 400, from: "2027-06", until: "2027-07" }],
    });
    const projection = projectCashFlow(seasonal);
    expect(projection.totalIncome).toBe(800);
    expect(projection.months.filter((flow) => flow.income > 0).map((flow) => flow.month)).toEqual(["2027-06", "2027-07"]);
  });

  it("sets money aside for a goal until its deadline or until it is reached", () => {
    const goals: Goal[] = [
      { id: "g1", name: "Laptop", target: 1000, saved: 200, deadline: "2026-12", monthly: 100 },
      { id: "g2", name: "Done", target: 300, saved: 300, deadline: "2027-06", monthly: 50 },
    ];
    const projection = projectCashFlow(plan({ goals }));
    expect(projection.totalGoals).toBe(400);
    expect(projection.months.map((flow) => flow.goals).slice(0, 5)).toEqual([100, 100, 100, 100, 0]);
  });

  it("scales dollar costs with the exchange-rate stress and nothing else", () => {
    const home = plan({
      settings: { ...SETTINGS, usdRate: 26_000, openingBalance: 5_000_000 },
      income: [{ id: "i", label: "Allowance", monthly: 2_000_000 }],
      costs: [cost({ id: "a", unitUsd: 1000, month: "2026-12" })],
    });
    const points = fxSensitivity(home, [0, 5, 10], "planned");
    expect(points.map((point) => point.application)).toEqual([26_000_000, 27_300_000, 28_600_000].map((value) => expect.closeTo(value, 3)));
    expect(points[0].minBalance).toBeGreaterThan(points[2].minBalance);
    expect(points[2].shortfall).toBeGreaterThan(points[0].shortfall);
    expect(projectCashFlow(home).totalIncome).toBe(24_000_000);
  });

  it("handles an empty horizon", () => {
    const empty = projectCashFlow(plan({ settings: { ...SETTINGS, startMonth: "2027-09", entryMonth: "2027-08" } }));
    expect(empty.months).toEqual([]);
    expect(empty.minBalance).toBe(500);
    expect(empty.firstShortfall).toBeNull();
  });
});

describe("budget", () => {
  const withSpending = plan({
    budget: [
      { id: "b1", category: "Food", monthly: 200 },
      { id: "b2", category: "Transport", monthly: 60 },
    ],
    transactions: [
      { id: "t1", date: "2026-10-01", description: "Allowance", amount: 500, kind: "income", category: "Allowance" },
      { id: "t2", date: "2026-10-03", description: "Lunch", amount: 120, kind: "expense", category: "Food" },
      { id: "t3", date: "2026-10-20", description: "Dinner", amount: 110, kind: "expense", category: "Food" },
      { id: "t4", date: "2026-10-09", description: "Cinema", amount: 40, kind: "expense", category: "Entertainment" },
      { id: "t5", date: "2026-09-09", description: "Bus", amount: 30, kind: "expense", category: "Transport" },
    ],
  });

  it("compares planned with actual, category by category", () => {
    const month = monthBudget(withSpending, "2026-10");
    expect(month.income).toBe(500);
    expect(month.spent).toBe(270);
    expect(month.planned).toBe(260);
    expect(month.net).toBe(230);
    expect(month.savingsRate).toBeCloseTo(0.46, 12);
    expect(month.categories.map((entry) => entry.category)).toEqual(["Food", "Transport", "Entertainment"]);
    const food = month.categories[0];
    expect(food).toMatchObject({ planned: 200, actual: 230, remaining: -30 });
    expect(food.ratio).toBeCloseTo(1.15, 12);
    // Spending with no budget line is shown, with nothing planned against it.
    expect(month.categories[2]).toMatchObject({ planned: 0, actual: 40, ratio: null });
    expect(month.transactions.map((entry) => entry.id)).toEqual(["t3", "t4", "t2", "t1"]);
  });

  it("reports no savings rate for a month without income", () => {
    expect(monthBudget(withSpending, "2026-09").savingsRate).toBeNull();
    expect(monthBudget(withSpending, "2026-11").spent).toBe(0);
  });

  it("summarizes history and finds the months with activity", () => {
    expect(monthlyHistory(withSpending.transactions, ["2026-09", "2026-10", "2026-11"])).toEqual([
      { month: "2026-09", income: 0, expense: 30, net: -30 },
      { month: "2026-10", income: 500, expense: 270, net: 230 },
      { month: "2026-11", income: 0, expense: 0, net: 0 },
    ]);
    expect(monthsWithActivity(withSpending.transactions)).toEqual(["2026-10", "2026-09"]);
  });
});

describe("savings goals", () => {
  const goal: Goal = { id: "g", name: "Laptop", target: 1200, saved: 300, deadline: "2027-02", monthly: 150 };

  it("computes the level amount that arrives exactly on the deadline", () => {
    const status = goalStatus(goal, "2026-09");
    expect(status.remaining).toBe(900);
    expect(status.monthsLeft).toBe(6);
    expect(status.requiredMonthly).toBe(150);
    expect(status.progress).toBe(0.25);
    expect(status.state).toBe("on-track");
    expect(status.projectedMonth).toBe("2027-02");
    expect(status.shortfallAtDeadline).toBe(0);
  });

  it("flags a contribution that is too small and says by how much", () => {
    const status = goalStatus({ ...goal, monthly: 100 }, "2026-09");
    expect(status.state).toBe("behind");
    expect(status.shortfallAtDeadline).toBe(300);
    expect(status.projectedMonth).toBe("2027-05");
    expect(goalStatus({ ...goal, monthly: 0 }, "2026-09").projectedMonth).toBeNull();
  });

  it("recognizes reached and overdue goals", () => {
    expect(goalStatus({ ...goal, saved: 1200 }, "2026-09").state).toBe("reached");
    expect(goalStatus({ ...goal, saved: 5000 }, "2026-09").progress).toBe(1);
    const overdue = goalStatus(goal, "2027-03");
    expect(overdue.state).toBe("overdue");
    expect(overdue.monthsLeft).toBe(0);
    expect(overdue.requiredMonthly).toBe(900);
  });

  it("adds up what unfinished goals take each month", () => {
    const goals: Goal[] = [goal, { ...goal, id: "h", saved: 1200, monthly: 500 }, { ...goal, id: "i", deadline: "2026-01", monthly: 70 }];
    expect(monthlyGoalCommitment(goals, "2026-09")).toBe(150);
  });
});

describe("formatting", () => {
  it("formats money without spurious decimals", () => {
    expect(formatMoney(1234.5, "USD")).toBe("$1,235");
    expect(formatMoney(12.5, "USD")).toBe("$12.50");
    expect(formatMoney(26_000_000, "VND")).toBe("₫26,000,000");
    expect(formatMoney(-0.001, "USD")).toBe("$0.00");
    expect(formatMoney(Number.NaN, "USD")).toBe("—");
    expect(formatMoney(100, "ZZZ")).toContain("100");
  });

  it("formats shares and parses typed amounts", () => {
    expect(formatShare(0.125, 1)).toBe("12.5%");
    expect(formatShare(null)).toBe("—");
    expect(parseAmount("1,250,000")).toBe(1_250_000);
    expect(parseAmount(" 75.50 ")).toBe(75.5);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
    expect(parseAmount("12abc")).toBeNull();
  });
});

describe("saved plans", () => {
  const sample = buildSamplePlan(new Date(2026, 10, 16, 10).getTime());

  it("builds a coherent example plan", () => {
    expect(sample.sample).toBe(true);
    expect(sample.settings.startMonth).toBe("2026-11");
    expect(sample.settings.entryMonth).toBe("2027-08");
    expect(sample.costs.some((item) => item.paid)).toBe(true);
    expect(sample.costs.some((item) => item.group === "regular-round")).toBe(true);
    expect(sample.transactions.every((entry) => entry.date <= "2026-11-16")).toBe(true);
    expect(new Set(sample.transactions.map((entry) => entry.id)).size).toBe(sample.transactions.length);
    expect(buildSamplePlan(new Date(2026, 10, 16, 10).getTime())).toEqual(sample);
    // The example is meant to teach something: it holds if nothing goes wrong, and not otherwise.
    expect(projectCashFlow(sample, "planned").firstShortfall).toBeNull();
    expect(projectCashFlow(sample, "prudent").firstShortfall).not.toBeNull();
    expect(costDistribution(sample.costs).marginUsd).toBeGreaterThan(0);
  });

  it("round-trips through storage unchanged", () => {
    const store = memoryStore();
    expect(savePlan(store, sample)).toBe(true);
    expect(loadPlan(store)).toEqual(sample);
    expect(loadPlan(memoryStore())).toBeNull();
    expect(loadPlan(null)).toBeNull();
    expect(savePlan(null, sample)).toBe(false);
  });

  it("rejects what is not a plan and repairs what is damaged", () => {
    expect(sanitizePlan(null)).toBeNull();
    expect(sanitizePlan({ version: 2 })).toBeNull();
    expect(sanitizePlan({ version: 1, settings: { startMonth: "bad" } })).toBeNull();
    const store = memoryStore();
    store.data.set(STORAGE_KEY, "{broken");
    expect(loadPlan(store)).toBeNull();

    const repaired = sanitizePlan({
      version: 1,
      settings: { homeCurrency: "dollars", usdRate: -4, startMonth: "2026-11", entryMonth: "2026-01", openingBalance: "lots", fxStressPct: 900 },
      costs: [
        { id: "a", category: "nonsense", label: "", unitUsd: -5, quantity: 2.6, month: "2026-12", probability: 7 },
        { id: "a", category: "visa", label: "Duplicate id", unitUsd: 1, quantity: 1, month: "2026-12" },
        { label: "No month" },
      ],
      transactions: [
        { id: "t", date: "2026-11-02", amount: 50, kind: "expense", category: "Food", description: "Lunch" },
        { id: "u", date: "2026-11-02", amount: -50, kind: "expense" },
        { id: "v", date: "not a date", amount: 50, kind: "expense" },
        { id: "w", date: "2026-11-02", amount: 50, kind: "transfer" },
      ],
      goals: "none",
    });
    expect(repaired).not.toBeNull();
    expect(repaired?.settings).toEqual({
      homeCurrency: "USD",
      usdRate: 1,
      startMonth: "2026-11",
      entryMonth: "2026-11",
      openingBalance: 0,
      fxStressPct: 100,
    });
    expect(repaired?.costs).toEqual([
      { id: "a", category: "other", label: "Cost", unitUsd: 0, quantity: 3, month: "2026-12", paid: false, probability: 1, group: undefined, feeId: undefined },
    ]);
    expect(repaired?.transactions.map((entry) => entry.id)).toEqual(["t"]);
    expect(repaired?.goals).toEqual([]);
  });

  it("exports and imports a backup, and explains a bad file", () => {
    const imported = importPlan(exportPlan(sample, 0));
    expect(imported.ok && imported.plan).toEqual({ ...sample, sample: false });
    expect(importPlan("nope")).toEqual({ ok: false, error: "That file is not valid JSON." });
    expect(importPlan("{}").ok).toBe(false);
    expect(importPlan(JSON.stringify({ app: "finhub-tracker", data: { version: 3 } })).ok).toBe(false);
  });

  it("carries over transactions from the first version of the app", () => {
    const store = memoryStore();
    store.data.set(
      LEGACY_TRANSACTIONS_KEY,
      JSON.stringify([
        { id: 1, date: "2026-07-04", description: "Salary", amount: 5_000_000, type: "income", category: "Salary" },
        { id: 2, date: "2026-07-05", description: "Pho", amount: 45_000, type: "expense", category: "Food" },
        { id: 3, date: "2026-07-06", description: "Broken", amount: "x", type: "expense", category: "Food" },
      ]),
    );
    expect(readLegacyTransactions(store)).toEqual([
      { id: "legacy-1", date: "2026-07-04", description: "Salary", amount: 5_000_000, kind: "income", category: "Salary" },
      { id: "legacy-2", date: "2026-07-05", description: "Pho", amount: 45_000, kind: "expense", category: "Food" },
    ]);
    store.data.set(LEGACY_TRANSACTIONS_KEY, "not json");
    expect(readLegacyTransactions(store)).toEqual([]);
    expect(readLegacyTransactions(null)).toEqual([]);
  });

  it("starts a blank plan that keeps the currency and dates", () => {
    const blank = blankPlan(sample.settings);
    expect(blank.sample).toBe(false);
    expect(blank.costs).toEqual([]);
    expect(blank.settings.homeCurrency).toBe("VND");
    expect(blank.settings.entryMonth).toBe(sample.settings.entryMonth);
    expect(blank.settings.openingBalance).toBe(0);
  });
});
