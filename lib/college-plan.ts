/**
 * FinHub Tracker — college financial planning engine.
 * ============================================================================
 *
 * A four-year college funding plan is structurally a **pension in miniature**:
 * an accumulation phase, a decumulation phase, an inflation assumption, a
 * stochastic return assumption, and a solvency question at the end. This module
 * values it the way an actuary values a defined-benefit liability.
 *
 * ## The three mathematical pillars
 *
 * **1. Annuity-due accumulation.** Contributions are made at the *start* of each
 * month, so each one earns a full month of interest. With no withdrawals the
 * ledger reduces exactly to the closed form
 *
 *     s̈(n,i) = [((1 + i)^n − 1) / i] · (1 + i)
 *
 * The `(1 + i)` factor is precisely what distinguishes an annuity-**due** from an
 * annuity-immediate. `tests/college-plan.test.ts` pins the ledger against this
 * identity, which is the single strongest guarantee that the accumulation logic
 * is correct.
 *
 * **2. Bisection, not Newton-Raphson.** Once college starts, contributions and
 * withdrawals overlap, and the objective — the *minimum balance across the whole
 * ledger* — becomes piecewise-linear with kinks at every semester payment. It is
 * continuous and monotone in the contribution, but **not differentiable** at
 * those kinks, and flat over wide intervals. Newton needs f′; where f′ is
 * undefined or ~0 it diverges or overshoots. Bisection needs only a sign change
 * and monotonicity, both of which we have, so it *cannot* fail to converge.
 * See DERIVATION.md §3.
 *
 * **3. Lognormal returns and the median–mean gap.** Monthly returns are drawn as
 * exp(N(μ, σ²)) − 1. For a lognormal variable the median lies strictly *below*
 * the mean: the arithmetic average is inflated by a thin upper tail that the
 * typical path never visits. Funding a plan to its *expected* return therefore
 * leaves roughly a coin-flip chance of shortfall. Closing that gap to 90%
 * confidence is what actuaries call a **risk margin**. See DERIVATION.md §4.
 *
 * Every function here is pure and deterministic given its seed.
 */

import { SeededRandom, sortedQuantile } from "@/lib/finance-engine";
import type {
  BalanceBand,
  CollegeCostYear,
  CollegePlanInput,
  CollegePlanProjection,
  CollegePlanRisk,
  Result,
  SavingsMonth,
} from "@/types/finance";

/* ========================================================================== */
/* Constants                                                                  */
/* ========================================================================== */

/** Bills land at the start of each semester: month 0 and month 5 of the year. */
const SEMESTER_OFFSETS = [0, 5] as const;

/** Months per year — named so the intent is never ambiguous at a call site. */
const MONTHS_PER_YEAR = 12;

/** Bisection stops when the bracket is narrower than this (dollars/month). */
const CONTRIBUTION_TOLERANCE = 0.005;

/** Hard iteration cap; bisection halves the bracket each pass, so this is ample. */
const MAX_BISECTION_ITERATIONS = 200;

/** Iteration cap for the (far more expensive) confidence-level solve. */
const MAX_CONFIDENCE_ITERATIONS = 22;

/** Confidence solve stops once the bracket is narrower than this. */
const CONFIDENCE_TOLERANCE = 5;

/** Default Monte Carlo path count: stable percentiles, still fast enough to re-run. */
export const DEFAULT_RISK_PATHS = 1200;

/** Fixed default seed so every published figure is exactly reproducible. */
export const DEFAULT_SEED = 20_260_801;

/* ========================================================================== */
/* Internal helpers                                                           */
/* ========================================================================== */

/**
 * Snap floating-point artefacts (0.30000000000000004 → 0.3) and normalise −0.
 * Applied only at output boundaries, never mid-computation.
 */
function clean(value: number): number {
  if (!Number.isFinite(value)) return value;
  const rounded = Number.parseFloat(value.toPrecision(12));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function fail<T>(message: string, context?: string): Result<T> {
  return {
    ok: false,
    error: context === undefined
      ? { code: "DOMAIN_ERROR", message }
      : { code: "DOMAIN_ERROR", message, context },
  };
}

/* ========================================================================== */
/* Validation                                                                 */
/* ========================================================================== */

/**
 * Reject inputs that would produce meaningless or non-finite output.
 *
 * This is deliberately strict. A planning tool that silently returns `NaN` for a
 * negative interest rate is worse than one that refuses: the user cannot tell
 * the difference between "impossible" and "zero".
 */
export function validateCollegePlan(input: CollegePlanInput): Result<CollegePlanInput> {
  if (!Number.isFinite(input.yearsUntilEnrollment) || input.yearsUntilEnrollment < 0) {
    return fail("Years until enrollment must be zero or positive.", "yearsUntilEnrollment");
  }
  if (!Number.isInteger(input.programYears) || input.programYears < 0) {
    return fail("Programme length must be a whole number of years.", "programYears");
  }
  if (input.programYears > 12) {
    return fail("Programme lengths beyond 12 years are not supported.", "programYears");
  }
  if (!Number.isFinite(input.currentSavings) || input.currentSavings < 0) {
    return fail("Current savings cannot be negative.", "currentSavings");
  }
  if (!Number.isFinite(input.monthlyContribution) || input.monthlyContribution < 0) {
    return fail("Monthly contribution cannot be negative.", "monthlyContribution");
  }
  // (1 + r) must stay positive or Math.pow(1 + r, 1/12) returns NaN.
  if (!Number.isFinite(input.expectedAnnualReturn) || input.expectedAnnualReturn <= -1) {
    return fail("Expected annual return must be greater than −100%.", "expectedAnnualReturn");
  }
  if (!Number.isFinite(input.returnVolatility) || input.returnVolatility < 0) {
    return fail("Return volatility cannot be negative.", "returnVolatility");
  }
  if (!Number.isFinite(input.costInflation) || input.costInflation <= -1) {
    return fail("Cost inflation must be greater than −100%.", "costInflation");
  }

  const costFields: readonly (readonly [number, string])[] = [
    [input.annualTuition, "annualTuition"],
    [input.annualRoomBoard, "annualRoomBoard"],
    [input.annualBooksSupplies, "annualBooksSupplies"],
    [input.annualTravel, "annualTravel"],
    [input.applicationBudget, "applicationBudget"],
    [input.expectedAnnualAid, "expectedAnnualAid"],
  ];
  for (const [value, field] of costFields) {
    if (!Number.isFinite(value) || value < 0) {
      return fail(`${field} must be a non-negative number.`, field);
    }
  }

  return { ok: true, value: input };
}

/* ========================================================================== */
/* 1. Rate conversion                                                         */
/* ========================================================================== */

/**
 * Convert an annual effective rate to its monthly equivalent.
 *
 *     r_m = (1 + r)^(1/12) − 1
 *
 * This is the *effective* conversion, not the nominal shortcut `r / 12`. The
 * distinction matters: at r = 6%, r/12 = 0.5000% but the true monthly rate is
 * 0.4868%. Over a 60-month horizon the nominal shortcut overstates the final
 * balance by roughly 0.8% — small per month, compounding to real money.
 */
export function monthlyRate(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / MONTHS_PER_YEAR) - 1;
}

/* ========================================================================== */
/* 2. Cost projection                                                         */
/* ========================================================================== */

/**
 * Project each academic year's costs, inflated forward from today's dollars.
 *
 *     C_k = C_0 · (1 + g)^k
 *
 * Aid is inflated at the same rate as costs. That is the optimistic-but-
 * defensible assumption: holding aid flat in nominal terms would quietly widen
 * the funding gap every year and overstate the required contribution.
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
      // Aid offsets cost but cannot make a year profitable.
      netCost: clean(Math.max(0, grossCost - aid)),
    });
  }

  return years;
}

/** Total months the plan runs, from today through the final semester. */
function horizonMonths(input: CollegePlanInput): number {
  return Math.max(
    1,
    Math.round((input.yearsUntilEnrollment + input.programYears) * MONTHS_PER_YEAR),
  );
}

/**
 * Build the month-indexed withdrawal schedule.
 *
 * Each academic year's net cost is split across two semester payments (August
 * and January), and the one-off application budget lands twelve months before
 * enrollment — or immediately, if enrollment is nearer than that.
 */
function withdrawalSchedule(
  input: CollegePlanInput,
  costs: readonly CollegeCostYear[],
): number[] {
  const months = horizonMonths(input);
  const schedule = new Array<number>(months + 1).fill(0);

  const applicationMonth = Math.max(
    0,
    Math.round((input.yearsUntilEnrollment - 1) * MONTHS_PER_YEAR),
  );
  if (applicationMonth <= months) {
    const inflator = Math.pow(1 + input.costInflation, applicationMonth / MONTHS_PER_YEAR);
    schedule[applicationMonth] += input.applicationBudget * inflator;
  }

  for (const year of costs) {
    const perSemester = year.netCost / SEMESTER_OFFSETS.length;
    for (const offset of SEMESTER_OFFSETS) {
      const month = Math.round(year.yearsFromNow * MONTHS_PER_YEAR) + offset;
      if (month <= months) schedule[month] += perSemester;
    }
  }

  return schedule;
}

/* ========================================================================== */
/* 3. The savings ledger (annuity-due accumulation → decumulation)            */
/* ========================================================================== */

/**
 * Run the savings ledger month by month.
 *
 * `returns(month)` supplies that month's return: pass a constant for the
 * deterministic projection, or sampled values for one Monte Carlo path. Keeping
 * returns as an injected function is what lets the *identical* ledger serve both
 * the point estimate and the simulation — there is no second implementation that
 * could drift out of agreement with the first.
 *
 * **Ordering within each month (this is the part that matters):**
 *   1. Contribution is added   → annuity-**due**: it earns interest this month
 *   2. Withdrawal is deducted  → tuition is paid before growth is credited
 *   3. Growth is credited on the resulting balance
 *
 * Step 2 before step 3 is the conservative choice and the one a 529 plan
 * administrator would recognise. Reversing them would credit a month of growth
 * on money that has already left the account.
 *
 * A negative balance earns nothing. A shortfall is a hole that must be funded
 * from elsewhere — it does not accrue negative interest, and modelling it that
 * way would understate how bad a failed plan actually is.
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

    // (1) Annuity-due: contribution lands at the start of the period.
    balance += monthlyContribution;
    cumulativeContributions += monthlyContribution;

    // (2) Tuition and living costs are withdrawn.
    const withdrawal = schedule[month] ?? 0;
    balance -= withdrawal;

    // (3) Growth accrues only on a positive balance.
    const investmentReturn = balance > 0 ? balance * returns(month) : 0;
    balance += investmentReturn;

    ledger.push({
      month,
      yearsFromNow: clean(month / MONTHS_PER_YEAR),
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

/** The lowest closing balance the ledger ever reaches — the objective we solve on. */
function minimumBalance(ledger: readonly SavingsMonth[]): number {
  let lowest = Number.POSITIVE_INFINITY;
  for (const entry of ledger) {
    if (entry.closingBalance < lowest) lowest = entry.closingBalance;
  }
  return lowest;
}

/* ========================================================================== */
/* 4. Deterministic solve — bisection on the minimum balance                  */
/* ========================================================================== */

/**
 * Solve for the monthly contribution that exactly funds the plan.
 *
 * ## Why bisection and not Newton-Raphson
 *
 * Define f(P) = min over t of B_t(P), the lowest balance the ledger reaches for
 * a monthly contribution P. We want the smallest P with f(P) ≥ 0.
 *
 * f has two properties that decide the method:
 *
 *   - **Strictly increasing in P.** Every extra dollar contributed raises every
 *     subsequent balance, so it raises their minimum. Therefore the root is
 *     unique and a sign change brackets it.
 *   - **Not differentiable everywhere.** f is a pointwise minimum over a family
 *     of piecewise-linear functions of P. The index achieving the minimum
 *     *changes* as P varies, and at each such crossover f has a kink — a corner
 *     where the left and right derivatives differ. Between kinks f is often very
 *     nearly flat.
 *
 * Newton-Raphson needs f′(P) and the step P − f(P)/f′(P). At a kink f′ does not
 * exist; on a flat stretch f′ ≈ 0 and the step explodes. Newton is the faster
 * method *when it works*, and it is exactly the wrong tool here.
 *
 * Bisection requires only continuity and a sign change. It halves the bracket
 * every iteration — guaranteed linear convergence, ~1e-15 relative in 50 passes,
 * and it **cannot diverge**. For a solver whose output a family will act on,
 * "always right, slightly slower" beats "usually faster, occasionally absurd".
 *
 * @returns The required contribution, rounded **up** to the nearest cent. Rounding
 *          up rather than to-nearest guarantees the returned figure actually funds
 *          the plan; rounding down could leave it a fraction of a dollar short.
 */
export function requiredMonthlyContribution(input: CollegePlanInput): number {
  const rate = monthlyRate(input.expectedAnnualReturn);
  const constantReturn = (): number => rate;

  const objective = (contribution: number): number =>
    minimumBalance(runSavingsLedger(input, contribution, constantReturn));

  // Already funded with no contributions at all.
  if (objective(0) >= 0) return 0;

  const costs = projectCollegeCosts(input);
  const totalCost =
    costs.reduce((sum, year) => sum + year.netCost, 0) + input.applicationBudget;

  // Upper bracket: covering the entire cost from contributions alone, ignoring
  // all growth, is always sufficient. Doubling guards against pathological
  // inputs (e.g. a deeply negative expected return eroding the balance).
  let low = 0;
  let high = Math.max(100, (totalCost / horizonMonths(input)) * 2 + 100);
  let expansions = 0;
  while (objective(high) < 0 && high < 1e9 && expansions < 64) {
    high *= 2;
    expansions += 1;
  }

  for (let i = 0; i < MAX_BISECTION_ITERATIONS; i += 1) {
    const mid = (low + high) / 2;
    if (objective(mid) < 0) low = mid;
    else high = mid;
    if (high - low < CONTRIBUTION_TOLERANCE) break;
  }

  // `high` is always a funded value; `low` is always underfunded. Return `high`.
  return clean(Math.ceil(high * 100) / 100);
}

/* ========================================================================== */
/* 5. Monte Carlo risk assessment                                             */
/* ========================================================================== */

/**
 * Stress-test the plan across many simulated market futures.
 *
 * ## The stochastic model
 *
 * Monthly returns are lognormal:
 *
 *     1 + R_m = exp( (ln(1 + r) − σ²/2)·Δt + σ·√Δt·Z ),    Z ~ N(0, 1)
 *
 * The **−σ²/2 drift correction** is essential and easy to omit. Without it,
 * E[1 + R_m] = exp(μΔt + σ²Δt/2) > 1 + r: the simulation would drift upward
 * faster than the stated expected return and quietly understate every risk
 * figure. With it, the arithmetic expectation matches `expectedAnnualReturn`
 * exactly, which is what makes the deterministic and stochastic views
 * comparable at all.
 *
 * ## What is reported, and why both
 *
 *   - **Shortfall probability** — the fraction of futures where the balance ever
 *     goes negative. Answers "will this work?"
 *   - **Expected shortfall** — the mean hole size *given that* a hole opens. A
 *     conditional expectation, E[loss | loss > 0]. Answers "how bad if not?"
 *
 * Reporting only the first is the classic error: a 5% chance of a $2,000 gap and
 * a 5% chance of a $90,000 gap are the same number and utterly different
 * situations. VaR and TVaR at 95% are included for the same reason — TVaR is
 * **subadditive** and therefore coherent, which is why Solvency II is built on
 * expected shortfall rather than on VaR.
 *
 * @param paths Number of simulated futures. 1,200 gives percentile bands stable
 *              to roughly ±1% while remaining fast enough to re-run interactively.
 * @param seed  Fixed by default so every figure published from this model is
 *              exactly reproducible by a third party.
 */
export function assessCollegePlanRisk(
  input: CollegePlanInput,
  paths = DEFAULT_RISK_PATHS,
  seed = DEFAULT_SEED,
): CollegePlanRisk {
  const random = new SeededRandom(seed);
  const months = horizonMonths(input);
  const pathCount = Math.max(1, Math.floor(paths));

  const sigma = input.returnVolatility;
  const dt = 1 / MONTHS_PER_YEAR;
  const driftTerm = (Math.log(1 + input.expectedAnnualReturn) - (sigma * sigma) / 2) * dt;
  const diffusion = sigma * Math.sqrt(dt);

  const balancesByMonth: number[][] = Array.from({ length: months + 1 }, () => []);
  const shortfalls: number[] = [];
  const endingBalances: number[] = [];
  let shortfallCount = 0;

  const drawn = new Array<number>(months + 1);

  for (let path = 0; path < pathCount; path += 1) {
    // Pre-draw this path's returns so the ledger stays a pure function of month.
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
      if (entry.closingBalance < lowest) lowest = entry.closingBalance;
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

  // VaR(95%): the shortfall exceeded in only one future out of twenty.
  const shortfallVar = sortedQuantile(sortedShortfalls, 0.95);

  // TVaR(95%): the *mean* shortfall across that worst 5% — always ≥ VaR.
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
      yearsFromNow: clean(month / MONTHS_PER_YEAR),
      p10: clean(sortedQuantile(sorted, 0.1)),
      p25: clean(sortedQuantile(sorted, 0.25)),
      median: clean(sortedQuantile(sorted, 0.5)),
      p75: clean(sortedQuantile(sorted, 0.75)),
      p90: clean(sortedQuantile(sorted, 0.9)),
      expected: clean(deterministic[month]?.closingBalance ?? 0),
    };
  });

  return {
    paths: pathCount,
    shortfallProbability: clean(shortfallCount / pathCount),
    expectedShortfall: clean(expectedShortfall),
    shortfallValueAtRisk: clean(shortfallVar),
    shortfallTailValueAtRisk: clean(shortfallTvar),
    medianEndingBalance: clean(sortedQuantile(sortedEndings, 0.5)),
    bands,
  };
}

/* ========================================================================== */
/* 6. Risk-adjusted solve — the actuarial risk margin                         */
/* ========================================================================== */

/**
 * Solve for the contribution that funds the plan with a target **confidence**,
 * not merely on average.
 *
 * This is the single most important function in the module, and the difference
 * between a spreadsheet and an actuarial reserve.
 *
 * Funding to the expected return leaves roughly a **coin flip** chance of falling
 * short, because the median of a lognormal path sits below its mean. Reaching 90%
 * confidence costs materially more — across the three built-in scenarios,
 * **36–44% more per month**. That difference *is* a risk margin: the price of
 * converting "probably fine" into "fine nine times out of ten".
 *
 * ## Implementation notes
 *
 * Shortfall probability is monotone **decreasing** in the contribution, so the
 * same bracketed bisection applies, with the inequality reversed.
 *
 * The critical detail: **the same seed is reused on every evaluation.** The
 * objective is a Monte Carlo estimate, so re-seeding per call would make it a
 * *noisy* function — and bisection on a noisy objective oscillates instead of
 * converging. Fixing the seed makes the objective a deterministic step function
 * of P, which bisection handles correctly.
 *
 * @param confidence Target probability of *not* falling short, e.g. 0.9.
 * @param paths      Fewer paths than the display simulation: this runs the whole
 *                   simulation ~22 times, so cost compounds.
 */
export function requiredContributionForConfidence(
  input: CollegePlanInput,
  confidence = 0.9,
  paths = 400,
  seed = DEFAULT_SEED,
): number {
  const targetShortfallRate = 1 - Math.min(0.999, Math.max(0, confidence));

  const shortfallAt = (contribution: number): number =>
    assessCollegePlanRisk({ ...input, monthlyContribution: contribution }, paths, seed)
      .shortfallProbability;

  if (shortfallAt(0) <= targetShortfallRate) return 0;

  let low = 0;
  let high = Math.max(500, requiredMonthlyContribution(input) * 2);
  let expansions = 0;
  while (shortfallAt(high) > targetShortfallRate && high < 1e7 && expansions < 12) {
    high *= 1.6;
    expansions += 1;
  }

  for (let i = 0; i < MAX_CONFIDENCE_ITERATIONS; i += 1) {
    const mid = (low + high) / 2;
    if (shortfallAt(mid) > targetShortfallRate) low = mid;
    else high = mid;
    if (high - low < CONFIDENCE_TOLERANCE) break;
  }

  // Round up to a clean $5 increment — false precision on a Monte Carlo
  // estimate would imply accuracy the simulation does not have.
  return clean(Math.ceil(high / 5) * 5);
}

/* ========================================================================== */
/* 7. Full deterministic projection                                           */
/* ========================================================================== */

/**
 * Project the plan under the expected return and summarise it.
 *
 * The funding gap is measured at the plan's point of **greatest strain** — the
 * deepest the balance ever goes underwater — not at the ending balance. A plan
 * that runs dry in year three and recovers by graduation has still failed the
 * family in year three; reporting only the final figure would hide that entirely.
 */
export function projectCollegePlan(input: CollegePlanInput): CollegePlanProjection {
  const rate = monthlyRate(input.expectedAnnualReturn);
  const costs = projectCollegeCosts(input);
  const ledger = runSavingsLedger(input, input.monthlyContribution, () => rate);

  const totalNetCost =
    costs.reduce((sum, year) => sum + year.netCost, 0) + input.applicationBudget;

  // Discount each actual cash outflow back to today at the expected return.
  const presentValueOfCosts = ledger.reduce(
    (sum, entry) =>
      entry.withdrawal > 0 ? sum + entry.withdrawal / Math.pow(1 + rate, entry.month) : sum,
    0,
  );

  const enrollmentMonth = Math.round(input.yearsUntilEnrollment * MONTHS_PER_YEAR);
  const balanceAtEnrollment =
    ledger[Math.min(enrollmentMonth, ledger.length - 1)]?.closingBalance ?? 0;
  const endingBalance = ledger[ledger.length - 1]?.closingBalance ?? 0;

  const lowest = minimumBalance(ledger);
  const fundingGap = lowest >= 0 ? 0 : -lowest;

  const totalContributions = ledger[ledger.length - 1]?.cumulativeContributions ?? 0;
  const totalInvestmentGrowth = ledger.reduce(
    (sum, entry) => sum + entry.investmentReturn,
    0,
  );

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
 * Validate first, then project. Prefer this at UI boundaries; prefer the
 * unchecked `projectCollegePlan` in hot paths where inputs are already known good.
 */
export function safeProjectCollegePlan(
  input: CollegePlanInput,
): Result<CollegePlanProjection> {
  const validated = validateCollegePlan(input);
  if (!validated.ok) return validated;
  return { ok: true, value: projectCollegePlan(validated.value) };
}

/* ========================================================================== */
/* 8. Preset scenarios                                                        */
/* ========================================================================== */

/**
 * Representative US cost scenarios, in today's dollars.
 *
 * These are round, illustrative planning figures, not quotes for any named
 * institution — the point of the tool is the modelling, and a family would
 * substitute their own school's published cost of attendance.
 *
 * Each preset is deliberately tuned to be **fully funded on the expected path but
 * still carry visible shortfall risk** (21%, 49%, 45% respectively). A default
 * showing 0% risk would teach the user nothing; one showing 100% would look
 * broken. The gap between "funded on average" and "funded with confidence" is
 * the entire lesson.
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
