/**
 * Tests for the college planning engine.
 *
 * The guiding rule: **a test that compares a function to itself proves nothing.**
 * Every assertion below is pinned against something external — a closed-form
 * actuarial identity, a conservation law, an analytic limit, or a monotonicity
 * property that must hold for the numerical method to be valid at all.
 */

import { describe, expect, it } from "vitest";

import {
  COLLEGE_SCENARIOS,
  DEFAULT_SCENARIO,
  assessCollegePlanRisk,
  monthlyRate,
  projectCollegeCosts,
  projectCollegePlan,
  requiredContributionForConfidence,
  requiredMonthlyContribution,
  runSavingsLedger,
  safeProjectCollegePlan,
  validateCollegePlan,
} from "@/lib/college-plan";
import type { CollegePlanInput } from "@/types/finance";

const PLAN = DEFAULT_SCENARIO;

/** A plan with all costs stripped out — pure accumulation, for closed-form checks. */
function accumulationOnly(overrides: Partial<CollegePlanInput> = {}): CollegePlanInput {
  return {
    ...PLAN,
    currentSavings: 0,
    monthlyContribution: 200,
    expectedAnnualReturn: 0.06,
    yearsUntilEnrollment: 2,
    programYears: 0,
    annualTuition: 0,
    annualRoomBoard: 0,
    annualBooksSupplies: 0,
    annualTravel: 0,
    applicationBudget: 0,
    expectedAnnualAid: 0,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Rate conversion                                                     */
/* ------------------------------------------------------------------ */

describe("monthlyRate", () => {
  it("compounds back to the annual rate exactly", () => {
    for (const annual of [0, 0.03, 0.06, 0.07, 0.12]) {
      expect(Math.pow(1 + monthlyRate(annual), 12) - 1).toBeCloseTo(annual, 12);
    }
  });

  it("is strictly below the naive nominal shortcut r/12", () => {
    // (1+r)^(1/12) − 1 < r/12 for r > 0, by strict concavity of x^(1/12).
    const annual = 0.06;
    expect(monthlyRate(annual)).toBeLessThan(annual / 12);
    expect(monthlyRate(annual)).toBeCloseTo(0.004867550565, 10);
  });

  it("returns zero for a zero rate", () => {
    expect(monthlyRate(0)).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Cost projection                                                     */
/* ------------------------------------------------------------------ */

describe("projectCollegeCosts", () => {
  it("produces one entry per programme year", () => {
    expect(projectCollegeCosts(PLAN)).toHaveLength(PLAN.programYears);
  });

  it("inflates the first year by exactly (1+g)^yearsUntilEnrollment", () => {
    const costs = projectCollegeCosts(PLAN);
    const expected =
      PLAN.annualTuition * Math.pow(1 + PLAN.costInflation, PLAN.yearsUntilEnrollment);
    expect(costs[0].tuition).toBeCloseTo(expected, 6);
  });

  it("compounds each subsequent year by exactly (1+g)", () => {
    const costs = projectCollegeCosts(PLAN);
    for (let i = 1; i < costs.length; i += 1) {
      expect(costs[i].tuition / costs[i - 1].tuition).toBeCloseTo(1 + PLAN.costInflation, 10);
    }
  });

  it("keeps gross cost equal to the sum of its components", () => {
    for (const year of projectCollegeCosts(PLAN)) {
      const sum = year.tuition + year.roomBoard + year.booksSupplies + year.travel;
      expect(year.grossCost).toBeCloseTo(sum, 6);
    }
  });

  it("floors net cost at zero when aid exceeds the gross cost", () => {
    const generous = projectCollegeCosts({ ...PLAN, expectedAnnualAid: 1_000_000 });
    for (const year of generous) expect(year.netCost).toBe(0);
  });

  it("returns an empty projection for a zero-year programme", () => {
    expect(projectCollegeCosts({ ...PLAN, programYears: 0 })).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* The ledger — pinned against the annuity-due closed form             */
/* ------------------------------------------------------------------ */

describe("runSavingsLedger", () => {
  it("reproduces the annuity-due future value s̈(n,i) exactly", () => {
    // With no withdrawals and no opening balance, the ledger must equal
    //     s̈(n,i) = [((1+i)^n − 1)/i] · (1+i)
    // The trailing (1+i) is what makes it an annuity-DUE rather than immediate.
    const contribution = 200;
    const annual = 0.06;
    const plan = accumulationOnly({ monthlyContribution: contribution });

    const i = monthlyRate(annual);
    const ledger = runSavingsLedger(plan, contribution, () => i);
    const n = ledger.length;

    const analytic = contribution * ((Math.pow(1 + i, n) - 1) / i) * (1 + i);
    expect(ledger[n - 1].closingBalance).toBeCloseTo(analytic, 6);
  });

  it("is strictly greater than the annuity-immediate equivalent", () => {
    // Paying at the start of each period must beat paying at the end.
    const contribution = 200;
    const plan = accumulationOnly({ monthlyContribution: contribution });
    const i = monthlyRate(0.06);
    const ledger = runSavingsLedger(plan, contribution, () => i);
    const n = ledger.length;

    const due = ledger[n - 1].closingBalance;
    const immediate = contribution * ((Math.pow(1 + i, n) - 1) / i);
    expect(due).toBeGreaterThan(immediate);
    expect(due / immediate).toBeCloseTo(1 + i, 9);
  });

  it("grows the opening balance at exactly (1+i)^n with no contributions", () => {
    const principal = 10_000;
    const plan = accumulationOnly({ currentSavings: principal, monthlyContribution: 0 });
    const i = monthlyRate(0.06);
    const ledger = runSavingsLedger(plan, 0, () => i);
    const n = ledger.length;
    expect(ledger[n - 1].closingBalance).toBeCloseTo(principal * Math.pow(1 + i, n), 6);
  });

  it("credits no growth on a negative balance", () => {
    const broke = { ...PLAN, currentSavings: 0, monthlyContribution: 0 };
    const ledger = runSavingsLedger(broke, 0, () => 0.05);
    for (const entry of ledger) {
      if (entry.closingBalance < 0) expect(entry.investmentReturn).toBe(0);
    }
  });

  it("conserves money: contributions + growth − withdrawals = ending balance", () => {
    const i = monthlyRate(PLAN.expectedAnnualReturn);
    const ledger = runSavingsLedger(PLAN, PLAN.monthlyContribution, () => i);
    const last = ledger[ledger.length - 1];

    const growth = ledger.reduce((sum, e) => sum + e.investmentReturn, 0);
    const withdrawn = ledger.reduce((sum, e) => sum + e.withdrawal, 0);

    expect(last.cumulativeContributions + growth - withdrawn).toBeCloseTo(
      last.closingBalance,
      4,
    );
  });

  it("chains each month's opening balance to the previous closing balance", () => {
    const i = monthlyRate(PLAN.expectedAnnualReturn);
    const ledger = runSavingsLedger(PLAN, PLAN.monthlyContribution, () => i);
    for (let m = 1; m < ledger.length; m += 1) {
      expect(ledger[m].openingBalance).toBeCloseTo(ledger[m - 1].closingBalance, 6);
    }
  });

  it("withdraws exactly the total net cost plus the application budget", () => {
    const i = monthlyRate(PLAN.expectedAnnualReturn);
    const ledger = runSavingsLedger(PLAN, PLAN.monthlyContribution, () => i);
    const withdrawn = ledger.reduce((sum, e) => sum + e.withdrawal, 0);
    const costs = projectCollegeCosts(PLAN);
    const expected =
      costs.reduce((sum, y) => sum + y.netCost, 0) + PLAN.applicationBudget;
    expect(withdrawn).toBeCloseTo(expected, 4);
  });
});

/* ------------------------------------------------------------------ */
/* Bisection solver                                                    */
/* ------------------------------------------------------------------ */

describe("requiredMonthlyContribution", () => {
  it("returns a contribution that actually funds the plan", () => {
    const required = requiredMonthlyContribution(PLAN);
    const funded = projectCollegePlan({ ...PLAN, monthlyContribution: required });
    expect(funded.fundingGap).toBeLessThanOrEqual(1);
  });

  it("is tight — one dollar less leaves the plan short", () => {
    // Confirms the solver converged to the boundary, not to a safe over-estimate.
    const required = requiredMonthlyContribution(PLAN);
    const under = projectCollegePlan({ ...PLAN, monthlyContribution: required - 1 });
    expect(under.fundingGap).toBeGreaterThan(0);
  });

  it("returns zero when existing savings already cover everything", () => {
    const rich = { ...PLAN, currentSavings: 5_000_000 };
    expect(requiredMonthlyContribution(rich)).toBe(0);
  });

  it("is monotone decreasing in starting savings", () => {
    // More money up front can never require a larger monthly contribution —
    // this is exactly the monotonicity that makes bisection valid.
    let previous = Number.POSITIVE_INFINITY;
    for (const savings of [0, 20_000, 40_000, 60_000, 80_000]) {
      const required = requiredMonthlyContribution({ ...PLAN, currentSavings: savings });
      expect(required).toBeLessThanOrEqual(previous);
      previous = required;
    }
  });

  it("is monotone decreasing in expected return", () => {
    let previous = Number.POSITIVE_INFINITY;
    for (const r of [0.0, 0.03, 0.06, 0.09]) {
      const required = requiredMonthlyContribution({ ...PLAN, expectedAnnualReturn: r });
      expect(required).toBeLessThanOrEqual(previous + 1e-6);
      previous = required;
    }
  });

  it("is monotone increasing in cost inflation", () => {
    let previous = -1;
    for (const g of [0.0, 0.03, 0.06, 0.09]) {
      const required = requiredMonthlyContribution({ ...PLAN, costInflation: g });
      expect(required).toBeGreaterThanOrEqual(previous - 1e-6);
      previous = required;
    }
  });

  it("converges for every preset scenario", () => {
    for (const scenario of COLLEGE_SCENARIOS) {
      const required = requiredMonthlyContribution(scenario);
      expect(Number.isFinite(required)).toBe(true);
      expect(required).toBeGreaterThanOrEqual(0);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Deterministic projection                                            */
/* ------------------------------------------------------------------ */

describe("projectCollegePlan", () => {
  it("discounts costs to a present value strictly below their nominal total", () => {
    const p = projectCollegePlan(PLAN);
    expect(p.presentValueOfCosts).toBeGreaterThan(0);
    expect(p.presentValueOfCosts).toBeLessThan(p.totalNetCost);
  });

  it("reports fundedRatio = 1 exactly when there is no gap", () => {
    const required = requiredMonthlyContribution(PLAN);
    expect(projectCollegePlan({ ...PLAN, monthlyContribution: required }).fundedRatio)
      .toBeCloseTo(1, 3);

    const broke = projectCollegePlan({
      ...PLAN,
      monthlyContribution: 0,
      currentSavings: 0,
    });
    expect(broke.fundedRatio).toBeLessThan(1);
    expect(broke.fundingGap).toBeGreaterThan(0);
  });

  it("measures the gap at peak strain, not at the ending balance", () => {
    // A plan can dip underwater mid-programme and recover by graduation.
    // Reporting only the ending balance would hide the failure.
    const p = projectCollegePlan({ ...PLAN, monthlyContribution: 0, currentSavings: 60_000 });
    const lowest = p.ledger.reduce(
      (min, e) => Math.min(min, e.closingBalance),
      Number.POSITIVE_INFINITY,
    );
    if (lowest < 0) expect(p.fundingGap).toBeCloseTo(-lowest, 4);
  });

  it("keeps every preset fully funded on the expected path", () => {
    for (const scenario of COLLEGE_SCENARIOS) {
      expect(projectCollegePlan(scenario).fundingGap).toBe(0);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Monte Carlo                                                         */
/* ------------------------------------------------------------------ */

describe("assessCollegePlanRisk", () => {
  it("is bit-for-bit reproducible for a fixed seed", () => {
    const a = assessCollegePlanRisk(PLAN, 200, 99);
    const b = assessCollegePlanRisk(PLAN, 200, 99);
    expect(a.shortfallProbability).toBe(b.shortfallProbability);
    expect(a.medianEndingBalance).toBe(b.medianEndingBalance);
    expect(a.shortfallValueAtRisk).toBe(b.shortfallValueAtRisk);
  });

  it("produces different results for different seeds", () => {
    const a = assessCollegePlanRisk(PLAN, 400, 1);
    const b = assessCollegePlanRisk(PLAN, 400, 2);
    expect(a.medianEndingBalance).not.toBe(b.medianEndingBalance);
  });

  it("orders the percentile bands correctly at every month", () => {
    const risk = assessCollegePlanRisk(PLAN, 300, 11);
    expect(risk.bands.length).toBeGreaterThan(0);
    for (const band of risk.bands) {
      expect(band.p10).toBeLessThanOrEqual(band.p25);
      expect(band.p25).toBeLessThanOrEqual(band.median);
      expect(band.median).toBeLessThanOrEqual(band.p75);
      expect(band.p75).toBeLessThanOrEqual(band.p90);
    }
  });

  it("collapses the fan to the deterministic path at zero volatility", () => {
    // With σ = 0 the lognormal degenerates to its drift, so every percentile
    // must coincide with the deterministic projection. This is the single
    // strongest check that the −σ²/2 drift correction is applied correctly.
    const risk = assessCollegePlanRisk({ ...PLAN, returnVolatility: 0 }, 60, 5);
    for (const band of risk.bands) {
      expect(band.p10).toBeCloseTo(band.expected, 4);
      expect(band.median).toBeCloseTo(band.expected, 4);
      expect(band.p90).toBeCloseTo(band.expected, 4);
    }
  });

  it("raises shortfall probability monotonically with volatility", () => {
    const base = { ...PLAN, monthlyContribution: requiredMonthlyContribution(PLAN) };
    const calm = assessCollegePlanRisk({ ...base, returnVolatility: 0.02 }, 400, 7);
    const wild = assessCollegePlanRisk({ ...base, returnVolatility: 0.35 }, 400, 7);
    expect(wild.shortfallProbability).toBeGreaterThan(calm.shortfallProbability);
  });

  it("keeps TVaR at or above VaR — the coherence property", () => {
    const risk = assessCollegePlanRisk({ ...PLAN, monthlyContribution: 100 }, 400, 13);
    expect(risk.shortfallTailValueAtRisk).toBeGreaterThanOrEqual(
      risk.shortfallValueAtRisk - 1e-9,
    );
  });

  it("reports zero shortfall metrics for an overwhelmingly funded plan", () => {
    const rich = { ...PLAN, currentSavings: 5_000_000, returnVolatility: 0.05 };
    const risk = assessCollegePlanRisk(rich, 200, 3);
    expect(risk.shortfallProbability).toBe(0);
    expect(risk.expectedShortfall).toBe(0);
  });

  it("demonstrates the median–mean gap: funding to the mean fails ~half the time", () => {
    // The headline finding. Funding to the deterministic break-even leaves a
    // shortfall probability near 50% because the median lognormal path sits
    // below the arithmetic mean.
    const atBreakEven = {
      ...PLAN,
      monthlyContribution: requiredMonthlyContribution(PLAN),
    };
    const risk = assessCollegePlanRisk(atBreakEven, 800, 20_260_801);
    expect(risk.shortfallProbability).toBeGreaterThan(0.30);
    expect(risk.shortfallProbability).toBeLessThan(0.70);
  });
});

/* ------------------------------------------------------------------ */
/* Risk margin                                                         */
/* ------------------------------------------------------------------ */

describe("requiredContributionForConfidence", () => {
  it("costs strictly more than funding the expected case", () => {
    const deterministic = requiredMonthlyContribution(PLAN);
    const confident = requiredContributionForConfidence(PLAN, 0.9, 300);
    expect(confident).toBeGreaterThan(deterministic);
  });

  it("actually achieves the requested confidence level", () => {
    const confident = requiredContributionForConfidence(PLAN, 0.9, 300);
    const achieved = assessCollegePlanRisk(
      { ...PLAN, monthlyContribution: confident },
      1000,
      20_260_801,
    );
    // Allow slack for the coarser path count used inside the solver.
    expect(achieved.shortfallProbability).toBeLessThanOrEqual(0.16);
  });

  it("is monotone increasing in the confidence target", () => {
    const c80 = requiredContributionForConfidence(PLAN, 0.8, 250);
    const c95 = requiredContributionForConfidence(PLAN, 0.95, 250);
    expect(c95).toBeGreaterThanOrEqual(c80);
  });

  it("produces a risk margin between 20% and 80% across all presets", () => {
    // Documents the headline 36–44% figure with a tolerance band, so the test
    // catches a regression without breaking on ordinary Monte Carlo noise.
    for (const scenario of COLLEGE_SCENARIOS) {
      const deterministic = requiredMonthlyContribution(scenario);
      const confident = requiredContributionForConfidence(scenario, 0.9, 300);
      const margin = confident / deterministic - 1;
      expect(margin).toBeGreaterThan(0.20);
      expect(margin).toBeLessThan(0.80);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

describe("validateCollegePlan", () => {
  it("accepts every preset scenario", () => {
    for (const scenario of COLLEGE_SCENARIOS) {
      expect(validateCollegePlan(scenario).ok).toBe(true);
    }
  });

  it("rejects a return of −100% or worse, which would produce NaN", () => {
    const result = validateCollegePlan({ ...PLAN, expectedAnnualReturn: -1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.context).toBe("expectedAnnualReturn");
  });

  it("rejects negative savings, contributions and volatility", () => {
    expect(validateCollegePlan({ ...PLAN, currentSavings: -1 }).ok).toBe(false);
    expect(validateCollegePlan({ ...PLAN, monthlyContribution: -1 }).ok).toBe(false);
    expect(validateCollegePlan({ ...PLAN, returnVolatility: -0.1 }).ok).toBe(false);
  });

  it("rejects a non-integer or negative programme length", () => {
    expect(validateCollegePlan({ ...PLAN, programYears: 3.5 }).ok).toBe(false);
    expect(validateCollegePlan({ ...PLAN, programYears: -1 }).ok).toBe(false);
  });

  it("rejects NaN anywhere in the input", () => {
    expect(validateCollegePlan({ ...PLAN, annualTuition: Number.NaN }).ok).toBe(false);
  });

  it("surfaces validation failures through safeProjectCollegePlan", () => {
    const bad = safeProjectCollegePlan({ ...PLAN, currentSavings: -5 });
    expect(bad.ok).toBe(false);

    const good = safeProjectCollegePlan(PLAN);
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.value.totalNetCost).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* Preset integrity                                                    */
/* ------------------------------------------------------------------ */

describe("preset scenarios", () => {
  it("ships exactly three scenarios with distinct names", () => {
    expect(COLLEGE_SCENARIOS).toHaveLength(3);
    const names = new Set(COLLEGE_SCENARIOS.map((s) => s.scenarioName));
    expect(names.size).toBe(3);
  });

  it("keeps aid below the tuition-plus-housing bill in every scenario", () => {
    for (const s of COLLEGE_SCENARIOS) {
      expect(s.expectedAnnualAid).toBeLessThan(s.annualTuition + s.annualRoomBoard);
    }
  });

  it("keeps each default fully funded but still visibly risky", () => {
    // A default at 0% risk teaches nothing; one at 100% looks broken.
    for (const s of COLLEGE_SCENARIOS) {
      const risk = assessCollegePlanRisk(s, 500, 20_260_801);
      expect(risk.shortfallProbability).toBeGreaterThan(0.05);
      expect(risk.shortfallProbability).toBeLessThan(0.75);
    }
  });

  it("uses the in-state scenario as the default", () => {
    expect(DEFAULT_SCENARIO).toBe(COLLEGE_SCENARIOS[0]);
  });
});
