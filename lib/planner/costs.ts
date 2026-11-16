/**
 * The cost of applying, as a schedule and as a distribution.
 *
 * Most application costs are certain: a student who applies to ten colleges
 * pays ten application fees. Some are not. A retake happens only if the first
 * score disappoints; under binding Early Decision, every later application is
 * needed only if the early one fails. Treating those as certain overstates the
 * budget, and ignoring them understates the reserve.
 *
 * So the schedule carries a probability on each contingent item, and this
 * module turns it into an exact distribution of the total by enumerating every
 * combination of contingencies. The expected total is the best estimate; the
 * 90th percentile is what a careful student should be able to fund. The gap
 * between them is a risk margin, in the same sense an insurer holds one above
 * its best-estimate liability.
 */

import { CATEGORY_ORDER, feeAmount } from "@/lib/planner/fees";
import { addMonths, clampMonth, monthIndex } from "@/lib/planner/months";
import type { ApplicantProfile, CostCategory, CostItem, Month, PlanSettings } from "@/types/planner";

export function itemUsd(item: CostItem): number {
  return item.unitUsd * item.quantity;
}

export function isContingent(item: CostItem): boolean {
  return item.probability < 1;
}

/** Dollars to home currency at the plan's rate, with the stress applied. */
export function usdToHome(usd: number, settings: PlanSettings, stressed = true): number {
  const stress = stressed ? 1 + settings.fxStressPct / 100 : 1;
  return usd * settings.usdRate * stress;
}

export interface CategoryTotals {
  readonly paid: number;
  readonly planned: number;
  /** Probability-weighted cost of the contingencies. */
  readonly contingent: number;
}

export interface CostTotals {
  readonly paidUsd: number;
  /** Unpaid and certain. */
  readonly plannedUsd: number;
  readonly contingentExpectedUsd: number;
  readonly contingentMaxUsd: number;
  readonly byCategory: Readonly<Record<CostCategory, CategoryTotals>>;
}

export function costTotals(costs: readonly CostItem[]): CostTotals {
  const byCategory = Object.fromEntries(
    CATEGORY_ORDER.map((category) => [category, { paid: 0, planned: 0, contingent: 0 }]),
  ) as Record<CostCategory, { paid: number; planned: number; contingent: number }>;
  let paidUsd = 0;
  let plannedUsd = 0;
  let contingentExpectedUsd = 0;
  let contingentMaxUsd = 0;
  for (const item of costs) {
    const usd = itemUsd(item);
    const bucket = byCategory[item.category];
    if (item.paid) {
      paidUsd += usd;
      bucket.paid += usd;
    } else if (isContingent(item)) {
      contingentExpectedUsd += usd * item.probability;
      contingentMaxUsd += usd;
      bucket.contingent += usd * item.probability;
    } else {
      plannedUsd += usd;
      bucket.planned += usd;
    }
  }
  return { paidUsd, plannedUsd, contingentExpectedUsd, contingentMaxUsd, byCategory };
}

export interface ContingencyGroup {
  readonly key: string;
  readonly label: string;
  readonly probability: number;
  readonly usd: number;
  readonly items: readonly CostItem[];
}

/** Unpaid contingent items, gathered into the events that trigger them. */
export function contingencyGroups(costs: readonly CostItem[]): ContingencyGroup[] {
  const groups = new Map<string, CostItem[]>();
  for (const item of costs) {
    if (item.paid || !isContingent(item) || item.probability <= 0) continue;
    const key = item.group ?? item.id;
    const list = groups.get(key);
    if (list === undefined) groups.set(key, [item]);
    else list.push(item);
  }
  return [...groups.entries()].map(([key, items]) => ({
    key,
    label: items.length === 1 ? items[0].label : GROUP_LABELS[key] ?? items[0].label,
    probability: items[0].probability,
    usd: items.reduce((total, item) => total + itemUsd(item), 0),
    items,
  }));
}

const GROUP_LABELS: Readonly<Record<string, string>> = {
  "regular-round": "Regular-round applications (if not admitted early)",
};

export interface CostScenario {
  readonly usd: number;
  readonly probability: number;
}

export interface CostDistribution {
  /** What is certain and still unpaid. */
  readonly baseUsd: number;
  /** Probability-weighted total: the best estimate. */
  readonly expectedUsd: number;
  /** The total that is enough in 90% of outcomes. */
  readonly p90Usd: number;
  /** Every contingency happens. */
  readonly worstUsd: number;
  /** p90 minus the expected total. */
  readonly marginUsd: number;
  /** Distinct totals in increasing order, with their probabilities. */
  readonly scenarios: readonly CostScenario[];
  readonly groups: readonly ContingencyGroup[];
}

/** Enumeration is exact up to this many independent contingencies. */
const MAX_ENUMERATED = 14;

function quantile(scenarios: readonly CostScenario[], level: number): number {
  let cumulative = 0;
  for (const scenario of scenarios) {
    cumulative += scenario.probability;
    if (cumulative >= level - 1e-12) return scenario.usd;
  }
  return scenarios.length > 0 ? scenarios[scenarios.length - 1].usd : 0;
}

/**
 * The exact distribution of the remaining application cost.
 *
 * Contingency groups are assumed independent of one another. With k groups
 * there are 2^k outcomes, each with a probability that is a product of p or
 * 1 − p; outcomes with the same total are merged.
 */
export function costDistribution(costs: readonly CostItem[]): CostDistribution {
  const baseUsd = costs.reduce(
    (total, item) => total + (!item.paid && !isContingent(item) ? itemUsd(item) : 0),
    0,
  );
  const groups = contingencyGroups(costs).sort((a, b) => b.usd * b.probability - a.usd * a.probability);
  const enumerated = groups.slice(0, MAX_ENUMERATED);
  // Beyond the cap, the remaining small contingencies enter at their expected value.
  const tailExpected = groups.slice(MAX_ENUMERATED).reduce((total, group) => total + group.usd * group.probability, 0);

  const totals = new Map<number, number>();
  const count = 1 << enumerated.length;
  for (let mask = 0; mask < count; mask += 1) {
    let usd = baseUsd + tailExpected;
    let probability = 1;
    for (let bit = 0; bit < enumerated.length; bit += 1) {
      const group = enumerated[bit];
      if ((mask & (1 << bit)) !== 0) {
        usd += group.usd;
        probability *= group.probability;
      } else {
        probability *= 1 - group.probability;
      }
    }
    if (probability <= 0) continue;
    const key = Math.round(usd * 100) / 100;
    totals.set(key, (totals.get(key) ?? 0) + probability);
  }

  const scenarios = [...totals.entries()]
    .map(([usd, probability]) => ({ usd, probability }))
    .sort((a, b) => a.usd - b.usd);
  const expectedUsd = scenarios.reduce((total, scenario) => total + scenario.usd * scenario.probability, 0);
  const p90Usd = quantile(scenarios, 0.9);
  const worstUsd = baseUsd + groups.reduce((total, group) => total + group.usd, 0);
  return { baseUsd, expectedUsd, p90Usd, worstUsd, marginUsd: Math.max(0, p90Usd - expectedUsd), scenarios, groups };
}

/* ------------------------------------------------------------------ */
/* Drafting a schedule from a profile                                  */
/* ------------------------------------------------------------------ */

export const DEFAULT_PROFILE: ApplicantProfile = {
  colleges: 10,
  earlyDecision: true,
  earlyAdmitChancePct: 25,
  satSittings: 2,
  satRetakeChancePct: 40,
  apExams: 4,
  englishTests: 1,
  cssColleges: 8,
  needsVisa: true,
};

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function normalizeProfile(profile: ApplicantProfile): ApplicantProfile {
  const colleges = clampInt(profile.colleges, 1, 30);
  return {
    colleges,
    earlyDecision: profile.earlyDecision && colleges > 1,
    earlyAdmitChancePct: clampInt(profile.earlyAdmitChancePct, 0, 100),
    satSittings: clampInt(profile.satSittings, 0, 5),
    satRetakeChancePct: clampInt(profile.satRetakeChancePct, 0, 100),
    apExams: clampInt(profile.apExams, 0, 12),
    englishTests: clampInt(profile.englishTests, 0, 4),
    cssColleges: clampInt(profile.cssColleges, 0, colleges),
    needsVisa: profile.needsVisa,
  };
}

/**
 * Draft a cost schedule on the calendar of a U.S. application year.
 *
 * For a student entering in August of year Y: tests run through the autumn of
 * Y − 1, early applications are due at the start of November, regular ones at
 * the start of January, the enrollment deposit around May 1, and the visa
 * follows once the college issues its I-20. Months that have already passed
 * are moved to the first month of the plan.
 */
export function draftCosts(
  input: ApplicantProfile,
  settings: PlanSettings,
  options: { readonly pastAsPaid?: boolean } = {},
): CostItem[] {
  const profile = normalizeProfile(input);
  const entry = settings.entryMonth;
  const at = (monthsBeforeEntry: number): Month => addMonths(entry, -monthsBeforeEntry);

  const items: CostItem[] = [];
  let sequence = 0;
  const add = (
    feeId: string,
    category: CostCategory,
    label: string,
    quantity: number,
    natural: Month,
    probability = 1,
    group?: string,
  ): void => {
    if (quantity <= 0) return;
    const past = monthIndex(natural) < monthIndex(settings.startMonth);
    // A planned payment whose month has gone by was presumably made; a
    // contingency whose month has gone by did not happen.
    if (past && options.pastAsPaid === true && probability < 1) return;
    sequence += 1;
    items.push({
      id: `${feeId}-${sequence}`,
      category,
      label,
      unitUsd: feeAmount(feeId),
      quantity,
      month: past && options.pastAsPaid === true ? natural : clampMonth(natural, settings.startMonth, entry),
      paid: past && options.pastAsPaid === true,
      probability,
      group,
      feeId,
    });
  };

  // Tests: sittings spread through the autumn before applications are due.
  const satMonths = [12, 10, 9, 8, 11];
  for (let sitting = 0; sitting < profile.satSittings; sitting += 1) {
    add("sat", "testing", `SAT sitting ${sitting + 1}`, 1, at(satMonths[sitting % satMonths.length]));
  }
  if (profile.satRetakeChancePct > 0) {
    add("sat", "testing", "SAT retake, if the score falls short", 1, at(8), profile.satRetakeChancePct / 100);
  }
  if (profile.englishTests > 0) add("english", "testing", "English proficiency test", profile.englishTests, at(11));
  if (profile.apExams > 0) add("ap", "testing", "AP exams", profile.apExams, at(9));

  const early = profile.earlyDecision ? 1 : 0;
  const regular = profile.colleges - early;
  const regularChance = profile.earlyDecision ? 1 - profile.earlyAdmitChancePct / 100 : 1;
  const regularGroup = profile.earlyDecision && regularChance < 1 ? "regular-round" : undefined;
  // Four SAT reports are free, so only colleges beyond the fourth are charged.
  const paidReports = Math.max(0, profile.colleges - 4);
  const earlyCss = Math.min(early, profile.cssColleges);
  const regularCss = profile.cssColleges - earlyCss;

  if (early === 1) {
    add("application", "applications", "Early Decision application", 1, at(10));
    if (earlyCss > 0) add("css-first", "aid", "CSS Profile, first college", 1, at(10));
  }
  add("application", "applications", "Regular-round applications", regular, at(8), regularChance, regularGroup);
  add("sat-report", "scores", "SAT score reports beyond the four free ones", paidReports, at(8), regularChance, regularGroup);
  if (profile.englishTests > 0) {
    add("english-report", "scores", "English test score reports beyond the free ones", paidReports, at(8), regularChance, regularGroup);
  }
  if (regularCss > 0) {
    if (earlyCss === 0) {
      add("css-first", "aid", "CSS Profile, first college", 1, at(7), regularChance, regularGroup);
      add("css-more", "aid", "CSS Profile, additional colleges", regularCss - 1, at(7), regularChance, regularGroup);
    } else {
      add("css-more", "aid", "CSS Profile, additional colleges", regularCss, at(7), regularChance, regularGroup);
    }
  }
  add("documents", "other", "Transcript translation and courier", 1, at(10));
  add("deposit", "enrollment", "Enrollment deposit", 1, at(3));
  if (profile.needsVisa) {
    add("sevis", "visa", "SEVIS I-901 fee", 1, at(2));
    add("visa", "visa", "Visa application fee", 1, at(2));
    add("visa-integrity", "visa", "Visa integrity fee, if collected", 1, at(2), 0.5);
  }

  return items.sort((a, b) => monthIndex(a.month) - monthIndex(b.month));
}
