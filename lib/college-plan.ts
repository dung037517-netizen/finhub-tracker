/**
 * FinHub Tracker — college financial planning engine.
 *
 * This is the student-facing half of the application, and it is the same
 * actuarial machinery the risk dashboard uses, pointed at a problem a high
 * school senior actually has: *will the money be there when the tuition bill
 * arrives, and what happens if the market does not cooperate?*
 *
 * The mathematics is standard life-contingency-free actuarial practice:
 *
 *   - Costs are inflated forward from today's dollars at a compound rate,
 *     because college inflation has historically outrun CPI.
 *   - Savings accumulate as an **annuity-due with monthly compounding**, then
 *     are drawn down semi-annually as bills land — an accumulation phase
 *     followed by a decumulation phase, exactly like a pension in miniature.
 *   - The required contribution is solved by **bisection** rather than by a
 *     closed-form annuity formula, because withdrawals overlap contributions
 *     and no clean closed form exists once they do.
 *   - Uncertainty is handled by Monte Carlo over lognormal returns, producing
 *     a shortfall probability and a VaR-style worst-case shortfall.
 *
 * Every function is pure and deterministic given its seed.
 */

import { SeededRandom, sortedQuantile } from "@/lib/finance-engine";
import type {
  BalanceBand,
  CollegeCostYear,
  CollegePlanInput,
  CollegePlanProjection,
  CollegePlanRisk,
  SavingsMonth,
} from "@/types/finance";

/** Snap floating-point artefacts so displayed figures stay clean. */
function clean(value: number): number {
  if (!Number.isFinite(value)) return value;
  const rounded = Number.parseFloat(value.toPrecision(12));
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** Bills land at the start of each semester: month 0 and month 5 of the year. */
const SEMESTER_OFFSETS = [0, 5] as const;

/** Convert an annual effective rate into its monthly equivalent. */
export function monthlyRate(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

/**
 * Project each academic year's costs, inflated from today's dollars.
 *
 * Aid is inflated at the same rate as costs, which is the optimistic-but-
 * defensible assumption; holding aid flat in nominal terms would quietly
 * inflate the funding gap year on year.
 */
export function projectCollegeCosts(input: CollegePlanInput): CollegeCostYear[] {
  const years: CollegeCostYear[] = [];

  for (let academicYear = 1; academicYear <= input.programYears; academicYear += 1) {
    const yearsFromNow = input.yearsUntilEnrollment + (academicYear - 1);
    const inflator = Math.pow(1 + input.costInflation, yearsFromNow);

    const tuition = input.annualTuition * inflator;
    const roomBoard = input.annualRoomBoard * inflator;
    const booksSupplies = input.annualBooksSupplies * inflator;
    const travel = input.annualTravel * inflator;
    const aid = input.expectedAnnualAid * inflator;

    const grossCost = tuition + roomBoard + booksSupplies + travel;

    years.push({
      academicYear,
      yearsFromNow,
      tuition: clean(tuition),
      roomBoard: clean(roomBoard),
      booksSupplies: clean(booksSupplies),
      travel: clean(travel),
      aid: clean(aid),
      grossCost: clean(grossCost),
      // Aid cannot make a year profitable.
      netCost: clean(Math.max(0, grossCost - aid)),
    });
  }

  return years;
}

/** Total months the plan runs, from today through the final semester. */
function horizonMonths(input: CollegePlanInput): number {
  return Math.max(1, Math.round((input.yearsUntilEnrollment + input.programYears) * 12));
}

/**
 * Build the month-by-month withdrawal schedule.
 *
 * Each academic year's net cost is split across two semester payments, and the
 * one-off application budget lands twelve months before enrollment (or
 * immediately, if enrollment is nearer than that).
 */
function withdrawalSchedule(input: CollegePlanInput, costs: readonly CollegeCostYear[]): number[] {
  const months = horizonMonths(input);
  const schedule = new Array<number>(months + 1).fill(0);

  const applicationMonth = Math.max(
    0,
    Math.round((input.yearsUntilEnrollment - 1) * 12),
  );
  if (applicationMonth <= months) {
    const inflator = Math.pow(1 + input.costInflation, applicationMonth / 12);
    schedule[applicationMonth] += input.applicationBudget * inflator;
  }

  for (const year of costs) {
    const perSemester = year.netCost / SEMESTER_OFFSETS.length;
    for (const offset of SEMESTER_OFFSETS) {
      const month = Math.round(year.yearsFromNow * 12) + offset;
      if (month <= months) schedule[month] += perSemester;
    }
  }

  return schedule;
}

/**
 * Run the savings ledger month by month.
 *
 * `returns` supplies the monthly return for each month; passing a constant
 * gives the deterministic projection, passing sampled values gives one Monte
 * Carlo path. Contributions are applied at the start of the month
 * (annuity-due) and withdrawals immediately after, before growth is credited —
 * the conservative ordering, and the one a 529 administrator would recognise.
 */
export function runSavingsLedger(
  input: CollegePlanInput,
  monthlyContribution: number,
  returns: (month: number) => number,
): SavingsMonth[] {
  const costs = projectCollegeCosts(input);
  const schedule = withdrawalSchedule(input, costs);
  const months = horizonMonths(input);

  const ledger: SavingsMonth[] = [];
  let balance = input.currentSavings;
  let cumulativeContributions = input.currentSavings;

  for (let month = 0; month <= months; month += 1) {
    const openingBalance = balance;

    balance += monthlyContribution;
    cumulativeContributions += monthlyContribution;

    const withdrawal = schedule[month] ?? 0;
    balance -= withdrawal;

    // Only a positive balance earns a return; a shortfall does not accrue
    // negative interest, it simply has to be funded some other way.
    const investmentReturn = balance > 0 ? balance * returns(month) : 0;
    balance += investmentReturn;

    ledger.push({
      month,
      yearsFromNow: clean(month / 12),
      openingBalance: clean(openingBalance),
      contribution: clean(monthlyContribution),
      investmentReturn: clean(investmentReturn),
      withdrawal: clean(withdrawal),
      closingBalance: clean(balance),
      cumulativeContributions: clean(cumulativeContributions),
    });
  }

  return ledger;
}

/**
 * Solve for the monthly contribution that exactly funds the plan.
 *
 * Bisection on the minimum balance across the whole ledger: the minimum is
 * monotonically increasing in the contribution, so a bracketed search cannot
 * diverge and always converges to the boundary where the plan stops running dry.
 */
export function requiredMonthlyContribution(input: CollegePlanInput): number {
  const rate = monthlyRate(input.expectedAnnualReturn);
  const constantReturn = (): number => rate;

  const minimumBalance = (contribution: number): number => {
    const ledger = runSavingsLedger(input, contribution, constantReturn);
    return ledger.reduce(
      (lowest, entry) => Math.min(lowest, entry.closingBalance),
      Number.POSITIVE_INFINITY,
    );
  };

  if (minimumBalance(0) >= 0) return 0;

  const costs = projectCollegeCosts(input);
  const totalCost =
    costs.reduce((sum, year) => sum + year.netCost, 0) + input.applicationBudget;

  let low = 0;
  // A contribution covering the entire cost with no growth is always sufficient.
  let high = Math.max(100, (totalCost / horizonMonths(input)) * 2 + 100);
  while (minimumBalance(high) < 0 && high < 1e9) high *= 2;

  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2;
    if (minimumBalance(mid) < 0) low = mid;
    else high = mid;
    if (high - low < 0.005) break;
  }

  return clean(Math.ceil(high * 100) / 100);
}

/**
 * Solve for the contribution that funds the plan with a target *confidence*,
 * not merely on average.
 *
 * This is the difference between a spreadsheet and an actuarial reserve.
 * Funding to the expected return leaves roughly a coin-flip chance of falling
 * short, because the median of a lognormal return path sits below its mean —
 * the arithmetic average is pulled up by a thin upper tail the median investor
 * never sees. Reaching 90% confidence therefore costs materially more than
 * reaching the deterministic break-even, and this function prices that gap.
 *
 * Shortfall probability is monotone decreasing in the contribution, so the same
 * bracketed bisection applies. A fixed seed is reused across every evaluation
 * so the objective is deterministic and the search cannot oscillate on noise.
 */
export function requiredContributionForConfidence(
  input: CollegePlanInput,
  confidence = 0.9,
  paths = 400,
  seed = 20_260_801,
): number {
  const target = 1 - Math.min(0.999, Math.max(0, confidence));

  const shortfallAt = (contribution: number): number =>
    assessCollegePlanRisk({ ...input, monthlyContribution: contribution }, paths, seed)
      .shortfallProbability;

  if (shortfallAt(0) <= target) return 0;

  let low = 0;
  let high = Math.max(500, requiredMonthlyContribution(input) * 2);
  let guard = 0;
  while (shortfallAt(high) > target && high < 1e7 && guard < 12) {
    high *= 1.6;
    guard += 1;
  }

  for (let i = 0; i < 22; i += 1) {
    const mid = (low + high) / 2;
    if (shortfallAt(mid) > target) low = mid;
    else high = mid;
    if (high - low < 5) break;
  }

  return clean(Math.ceil(high / 5) * 5);
}

/** Deterministic projection of the plan under the expected return. */
export function projectCollegePlan(input: CollegePlanInput): CollegePlanProjection {
  const rate = monthlyRate(input.expectedAnnualReturn);
  const costs = projectCollegeCosts(input);
  const ledger = runSavingsLedger(input, input.monthlyContribution, () => rate);

  const totalNetCost =
    costs.reduce((sum, year) => sum + year.netCost, 0) + input.applicationBudget;

  // Discount each semester payment back to today at the expected return.
  const presentValueOfCosts = ledger.reduce(
    (sum, entry) =>
      entry.withdrawal > 0 ? sum + entry.withdrawal / Math.pow(1 + rate, entry.month) : sum,
    0,
  );

  const enrollmentMonth = Math.round(input.yearsUntilEnrollment * 12);
  const balanceAtEnrollment =
    ledger[Math.min(enrollmentMonth, ledger.length - 1)]?.closingBalance ?? 0;
  const endingBalance = ledger[ledger.length - 1]?.closingBalance ?? 0;

  const lowestBalance = ledger.reduce(
    (lowest, entry) => Math.min(lowest, entry.closingBalance),
    Number.POSITIVE_INFINITY,
  );

  const totalContributions = ledger[ledger.length - 1]?.cumulativeContributions ?? 0;
  const totalInvestmentGrowth = ledger.reduce(
    (sum, entry) => sum + entry.investmentReturn,
    0,
  );

  // The gap is measured at the point of greatest strain, discounted to today —
  // reporting only the ending balance would hide a plan that runs dry in year
  // three and recovers afterwards.
  const fundingGap = lowestBalance >= 0 ? 0 : -lowestBalance;

  return {
    costs,
    ledger,
    totalNetCost: clean(totalNetCost),
    presentValueOfCosts: clean(presentValueOfCosts),
    balanceAtEnrollment: clean(balanceAtEnrollment),
    endingBalance: clean(endingBalance),
    fundingGap: clean(fundingGap),
    fundedRatio:
      totalNetCost > 0
        ? clean(Math.min(1, Math.max(0, 1 - fundingGap / totalNetCost)))
        : 1,
    requiredMonthlyContribution: requiredMonthlyContribution(input),
    totalContributions: clean(totalContributions),
    totalInvestmentGrowth: clean(totalInvestmentGrowth),
  };
}

/**
 * Monte Carlo assessment of the same plan.
 *
 * Monthly returns are lognormal with the stated annual drift and volatility.
 * Two figures matter to a family and both are reported: the probability the
 * plan runs dry at any point, and — conditional on that happening — how large
 * the hole is. The latter is expected shortfall applied to a savings goal
 * rather than to a trading book, which is the same coherent risk measure
 * Solvency II uses.
 */
export function assessCollegePlanRisk(
  input: CollegePlanInput,
  paths = 2000,
  seed = 20_260_801,
): CollegePlanRisk {
  const random = new SeededRandom(seed);
  const months = horizonMonths(input);

  const annualDrift = input.expectedAnnualReturn;
  const sigma = input.returnVolatility;
  const dt = 1 / 12;
  // Lognormal monthly step with the drift correction, so the *arithmetic*
  // expectation matches the stated expected return.
  const driftTerm = (Math.log(1 + annualDrift) - (sigma * sigma) / 2) * dt;
  const diffusion = sigma * Math.sqrt(dt);

  const balancesByMonth: number[][] = Array.from({ length: months + 1 }, () => []);
  const shortfalls: number[] = [];
  const endingBalances: number[] = [];
  let shortfallCount = 0;

  for (let path = 0; path < paths; path += 1) {
    // Pre-draw this path's returns so the ledger stays a pure function.
    const drawn = new Array<number>(months + 1);
    for (let month = 0; month <= months; month += 1) {
      drawn[month] = Math.exp(driftTerm + diffusion * random.nextNormal()) - 1;
    }

    const ledger = runSavingsLedger(
      input,
      input.monthlyContribution,
      (month) => drawn[month] ?? 0,
    );

    let lowest = Number.POSITIVE_INFINITY;
    for (const entry of ledger) {
      balancesByMonth[entry.month].push(entry.closingBalance);
      lowest = Math.min(lowest, entry.closingBalance);
    }

    endingBalances.push(ledger[ledger.length - 1]?.closingBalance ?? 0);

    const shortfall = lowest < 0 ? -lowest : 0;
    shortfalls.push(shortfall);
    if (shortfall > 0) shortfallCount += 1;
  }

  const sortedShortfalls = [...shortfalls].sort((a, b) => a - b);
  const sortedEndings = [...endingBalances].sort((a, b) => a - b);

  const breaching = shortfalls.filter((value) => value > 0);
  const expectedShortfall =
    breaching.length > 0
      ? breaching.reduce((sum, value) => sum + value, 0) / breaching.length
      : 0;

  // VaR at 95%: the shortfall exceeded in only 5% of futures.
  const shortfallVar = sortedQuantile(sortedShortfalls, 0.95);
  const tailStart = Math.floor(sortedShortfalls.length * 0.95);
  const tail = sortedShortfalls.slice(tailStart);
  const shortfallTvar =
    tail.length > 0 ? tail.reduce((sum, value) => sum + value, 0) / tail.length : 0;

  const deterministic = runSavingsLedger(
    input,
    input.monthlyContribution,
    () => monthlyRate(input.expectedAnnualReturn),
  );

  const bands: BalanceBand[] = balancesByMonth.map((values, month) => {
    const sorted = [...values].sort((a, b) => a - b);
    return {
      month,
      yearsFromNow: clean(month / 12),
      p10: clean(sortedQuantile(sorted, 0.1)),
      p25: clean(sortedQuantile(sorted, 0.25)),
      median: clean(sortedQuantile(sorted, 0.5)),
      p75: clean(sortedQuantile(sorted, 0.75)),
      p90: clean(sortedQuantile(sorted, 0.9)),
      expected: clean(deterministic[month]?.closingBalance ?? 0),
    };
  });

  return {
    paths,
    shortfallProbability: clean(shortfallCount / paths),
    expectedShortfall: clean(expectedShortfall),
    shortfallValueAtRisk: clean(shortfallVar),
    shortfallTailValueAtRisk: clean(shortfallTvar),
    medianEndingBalance: clean(sortedQuantile(sortedEndings, 0.5)),
    bands,
  };
}

/* ------------------------------------------------------------------ */
/* Preset scenarios                                                    */
/* ------------------------------------------------------------------ */

/**
 * Representative US cost scenarios, in today's dollars.
 *
 * Figures are round, illustrative planning numbers rather than quotes for any
 * named institution — the point of the tool is the modelling, and a family
 * would substitute their own school's published cost of attendance.
 */
export const COLLEGE_SCENARIOS: readonly CollegePlanInput[] = [
  {
    scenarioName: "In-state public university",
    yearsUntilEnrollment: 1,
    programYears: 4,
    currentSavings: 52_000,
    monthlyContribution: 950,
    expectedAnnualReturn: 0.06,
    returnVolatility: 0.12,
    costInflation: 0.05,
    annualTuition: 11_500,
    annualRoomBoard: 13_000,
    annualBooksSupplies: 1_250,
    annualTravel: 1_000,
    applicationBudget: 1_200,
    expectedAnnualAid: 4_000,
  },
  {
    scenarioName: "Out-of-state public university",
    yearsUntilEnrollment: 1,
    programYears: 4,
    currentSavings: 78_000,
    monthlyContribution: 1_500,
    expectedAnnualReturn: 0.065,
    returnVolatility: 0.13,
    costInflation: 0.05,
    annualTuition: 29_000,
    annualRoomBoard: 14_500,
    annualBooksSupplies: 1_300,
    annualTravel: 2_200,
    applicationBudget: 1_800,
    expectedAnnualAid: 9_000,
  },
  {
    scenarioName: "Private university",
    yearsUntilEnrollment: 1,
    programYears: 4,
    currentSavings: 95_000,
    monthlyContribution: 1_800,
    expectedAnnualReturn: 0.07,
    returnVolatility: 0.15,
    costInflation: 0.055,
    annualTuition: 46_000,
    annualRoomBoard: 17_000,
    annualBooksSupplies: 1_400,
    annualTravel: 2_500,
    applicationBudget: 2_400,
    expectedAnnualAid: 22_000,
  },
];

/** The scenario the dashboard loads with, so the page is never empty. */
export const DEFAULT_SCENARIO: CollegePlanInput = COLLEGE_SCENARIOS[0];
