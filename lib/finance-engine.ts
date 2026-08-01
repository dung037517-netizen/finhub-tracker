/**
 * FinHub Tracker — quantitative engine.
 *
 * A dependency-free implementation of the analytics the dashboard renders:
 *
 *   1. Descriptive statistics and the special functions they need (erf, the
 *      standard normal CDF, and its inverse)
 *   2. Return construction from OHLC bars, in both simple and log space
 *   3. Performance measurement: Sharpe, Sortino, Calmar, drawdown geometry
 *   4. Value at Risk and Tail VaR by four methods — historical, parametric,
 *      Cornish-Fisher (which corrects for skew and fat tails), and Monte Carlo
 *   5. Black-Scholes-Merton pricing with a full second- and third-order Greek
 *      surface, plus implied volatility by a bracketed Newton solve
 *   6. Technical indicators: SMA, EMA, RSI (Wilder), MACD, Bollinger bands
 *   7. Portfolio valuation with marginal risk contributions from the covariance
 *      matrix
 *   8. A seeded generator for the synthetic market history the demo runs on
 *
 * Every function is pure and total: it either returns a value or a typed
 * failure. That is what makes the whole surface unit-testable without a browser.
 */

import type {
  AllocationSlice,
  BollingerBands,
  Candle,
  DrawdownPoint,
  FinanceError,
  FinanceErrorCode,
  IndicatorPoint,
  IndicatorSeries,
  Instrument,
  OptionContract,
  OptionGreeks,
  OptionPricing,
  PayoffPoint,
  PerformanceMetrics,
  PortfolioSummary,
  Position,
  PositionValuation,
  Quote,
  Result,
  ReturnHistogramBin,
  ReturnStatistics,
  RiskMeasure,
  Timeframe,
  VarMethod,
} from "@/types/finance";
import { TIMEFRAME_DAYS } from "@/types/finance";

/* ================================================================== */
/* Result helpers                                                      */
/* ================================================================== */

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail<T>(
  code: FinanceErrorCode,
  message: string,
  context?: string,
): Result<T> {
  const error: FinanceError =
    context === undefined ? { code, message } : { code, message, context };
  return { ok: false, error };
}

/** Trading days in a year — the convention used for every annualisation here. */
export const TRADING_DAYS_PER_YEAR = 252;

/** Snap floating-point artefacts (0.30000000000000004 → 0.3). */
function clean(value: number): number {
  if (!Number.isFinite(value)) return value;
  const rounded = Number.parseFloat(value.toPrecision(12));
  return Object.is(rounded, -0) ? 0 : rounded;
}

/* ================================================================== */
/* 1. Special functions and descriptive statistics                     */
/* ================================================================== */

/** Natural log of the gamma function (Lanczos approximation). */
export function logGamma(x: number): number {
  if (x < 0.5) {
    return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - logGamma(1 - x);
  }
  const coefficients = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  const z = x - 1;
  let series = 0.99999999999980993;
  for (let i = 0; i < coefficients.length; i += 1) series += coefficients[i] / (z + i + 1);
  const t = z + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(series);
}

function lowerGammaSeries(a: number, x: number): number {
  let term = 1 / a;
  let sum = term;
  for (let n = 1; n < 400; n += 1) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 1e-16) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

function upperGammaContinuedFraction(a: number, x: number): number {
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 400; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/** Error function, accurate to near machine precision. */
export function erf(x: number): number {
  if (x === 0) return 0;
  const magnitude =
    x * x < 1.5 ? lowerGammaSeries(0.5, x * x) : 1 - upperGammaContinuedFraction(0.5, x * x);
  return x > 0 ? magnitude : -magnitude;
}

/** Complementary error function, evaluated directly to keep tail accuracy. */
export function erfc(x: number): number {
  if (x === 0) return 1;
  if (x > 0) {
    return x * x < 1.5 ? 1 - lowerGammaSeries(0.5, x * x) : upperGammaContinuedFraction(0.5, x * x);
  }
  return 2 - erfc(-x);
}

const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI);

/** Standard normal probability density φ(x). */
export function normalPdf(x: number, mu = 0, sigma = 1): number {
  if (sigma <= 0) return Number.NaN;
  const z = (x - mu) / sigma;
  return (INV_SQRT_2PI / sigma) * Math.exp(-0.5 * z * z);
}

/** Standard normal cumulative distribution Φ(x). */
export function normalCdf(x: number, mu = 0, sigma = 1): number {
  if (sigma <= 0) return Number.NaN;
  return 0.5 * erfc(-(x - mu) / (sigma * Math.SQRT2));
}

/** Inverse standard normal CDF (probit), refined by one Halley step. */
export function normalQuantile(p: number, mu = 0, sigma = 1): number {
  if (p <= 0) return Number.NEGATIVE_INFINITY;
  if (p >= 1) return Number.POSITIVE_INFINITY;

  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

  const pLow = 0.02425;
  let z: number;

  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    z =
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - pLow) {
    const q = p - 0.5;
    const r = q * q;
    z =
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    z =
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  const error = normalCdf(z) - p;
  const density = normalPdf(z);
  if (density > 0) {
    const u = error / density;
    z -= u / (1 + (z * u) / 2);
  }

  return mu + sigma * z;
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

/** Sample variance (Bessel-corrected). */
export function variance(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  let sum = 0;
  for (const value of values) {
    const deviation = value - average;
    sum += deviation * deviation;
  }
  return sum / (values.length - 1);
}

export function standardDeviation(values: readonly number[]): number {
  return Math.sqrt(Math.max(0, variance(values)));
}

/** Sample skewness (Fisher-Pearson, unbiased). */
export function skewness(values: readonly number[]): number {
  const n = values.length;
  if (n < 3) return 0;
  const average = mean(values);
  const sd = standardDeviation(values);
  if (sd === 0) return 0;
  let sum = 0;
  for (const value of values) sum += Math.pow((value - average) / sd, 3);
  return (n / ((n - 1) * (n - 2))) * sum;
}

/** Sample excess kurtosis (unbiased estimator). */
export function excessKurtosis(values: readonly number[]): number {
  const n = values.length;
  if (n < 4) return 0;
  const average = mean(values);
  const sd = standardDeviation(values);
  if (sd === 0) return 0;
  let sum = 0;
  for (const value of values) sum += Math.pow((value - average) / sd, 4);
  const numerator = (n * (n + 1) * sum) / ((n - 1) * (n - 2) * (n - 3));
  const correction = (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3));
  return numerator - correction;
}

/** Quantile of an unsorted sample by linear interpolation (type 7). */
export function quantile(values: readonly number[], level: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sortedQuantile(sorted, level);
}

/** Quantile of an already-sorted sample. */
export function sortedQuantile(sorted: readonly number[], level: number): number {
  if (sorted.length === 0) return Number.NaN;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * Math.min(1, Math.max(0, level));
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  if (lowerIndex === upperIndex) return sorted[lowerIndex];
  const weight = position - lowerIndex;
  return sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight;
}

/** Sample covariance between two equal-length series. */
export function covariance(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const meanA = mean(a.slice(0, n));
  const meanB = mean(b.slice(0, n));
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += (a[i] - meanA) * (b[i] - meanB);
  return sum / (n - 1);
}

/** Pearson correlation coefficient. */
export function correlation(a: readonly number[], b: readonly number[]): number {
  const sdA = standardDeviation(a);
  const sdB = standardDeviation(b);
  if (sdA === 0 || sdB === 0) return 0;
  return clean(covariance(a, b) / (sdA * sdB));
}

/** Covariance matrix of a set of equal-length return series. */
export function covarianceMatrix(series: readonly (readonly number[])[]): number[][] {
  return series.map((rowSeries) => series.map((colSeries) => covariance(rowSeries, colSeries)));
}

/* ================================================================== */
/* 2. Returns                                                          */
/* ================================================================== */

/** Simple period returns, (Pₜ − Pₜ₋₁)/Pₜ₋₁. */
export function simpleReturns(prices: readonly number[]): number[] {
  const output: number[] = [];
  for (let i = 1; i < prices.length; i += 1) {
    const previous = prices[i - 1];
    if (previous === 0) continue;
    output.push(prices[i] / previous - 1);
  }
  return output;
}

/** Continuously compounded (log) returns, ln(Pₜ/Pₜ₋₁). */
export function logReturns(prices: readonly number[]): number[] {
  const output: number[] = [];
  for (let i = 1; i < prices.length; i += 1) {
    const previous = prices[i - 1];
    if (previous <= 0 || prices[i] <= 0) continue;
    output.push(Math.log(prices[i] / previous));
  }
  return output;
}

export function closingPrices(candles: readonly Candle[]): number[] {
  return candles.map((candle) => candle.close);
}

/** Slice a candle series down to the window a timeframe selects. */
export function sliceTimeframe(
  candles: readonly Candle[],
  timeframe: Timeframe,
): readonly Candle[] {
  const days = TIMEFRAME_DAYS[timeframe];
  if (days === null || candles.length <= days) return candles;
  return candles.slice(candles.length - days);
}

/** Full descriptive summary of a return series. */
export function describeReturns(
  returns: readonly number[],
  periodsPerYear = TRADING_DAYS_PER_YEAR,
): ReturnStatistics {
  if (returns.length === 0) {
    return {
      observations: 0,
      meanReturn: 0,
      volatility: 0,
      annualizedReturn: 0,
      annualizedVolatility: 0,
      downsideDeviation: 0,
      skewness: 0,
      excessKurtosis: 0,
      bestPeriod: 0,
      worstPeriod: 0,
    };
  }

  const average = mean(returns);
  const sd = standardDeviation(returns);
  const negatives = returns.filter((value) => value < 0);
  const downside =
    negatives.length === 0
      ? 0
      : Math.sqrt(negatives.reduce((sum, value) => sum + value * value, 0) / returns.length);

  return {
    observations: returns.length,
    meanReturn: clean(average),
    volatility: clean(sd),
    annualizedReturn: clean(average * periodsPerYear),
    annualizedVolatility: clean(sd * Math.sqrt(periodsPerYear)),
    downsideDeviation: clean(downside * Math.sqrt(periodsPerYear)),
    skewness: clean(skewness(returns)),
    excessKurtosis: clean(excessKurtosis(returns)),
    bestPeriod: clean(Math.max(...returns)),
    worstPeriod: clean(Math.min(...returns)),
  };
}

/* ================================================================== */
/* 3. Drawdowns and performance ratios                                 */
/* ================================================================== */

/** Equity curve and running drawdown from a return series. */
export function drawdownSeries(
  returns: readonly number[],
  times: readonly number[],
  startingEquity = 1,
): DrawdownPoint[] {
  const points: DrawdownPoint[] = [];
  let equity = startingEquity;
  let peak = startingEquity;

  for (let i = 0; i < returns.length; i += 1) {
    equity *= 1 + returns[i];
    peak = Math.max(peak, equity);
    points.push({
      time: times[i] ?? i,
      equity: clean(equity),
      peak: clean(peak),
      drawdown: clean(equity / peak - 1),
    });
  }

  return points;
}

/** Deepest peak-to-trough decline, as a positive fraction. */
export function maxDrawdown(returns: readonly number[]): {
  depth: number;
  duration: number;
} {
  let equity = 1;
  let peak = 1;
  let deepest = 0;
  let currentDuration = 0;
  let longestDuration = 0;

  for (const periodReturn of returns) {
    equity *= 1 + periodReturn;
    if (equity >= peak) {
      peak = equity;
      currentDuration = 0;
    } else {
      currentDuration += 1;
      longestDuration = Math.max(longestDuration, currentDuration);
      deepest = Math.max(deepest, 1 - equity / peak);
    }
  }

  return { depth: clean(deepest), duration: longestDuration };
}

/**
 * Risk-adjusted performance ratios.
 *
 * `riskFreeRate` is an annual figure and is de-annualised before being netted
 * off each period's return, which is the part most naive implementations get
 * wrong.
 */
export function performanceMetrics(
  returns: readonly number[],
  riskFreeRate = 0.04,
  periodsPerYear = TRADING_DAYS_PER_YEAR,
): PerformanceMetrics {
  if (returns.length < 2) {
    return {
      sharpeRatio: 0,
      sortinoRatio: 0,
      calmarRatio: 0,
      maxDrawdown: 0,
      maxDrawdownDuration: 0,
      hitRate: 0,
      gainToPainRatio: 0,
    };
  }

  const periodicRiskFree = Math.pow(1 + riskFreeRate, 1 / periodsPerYear) - 1;
  const excess = returns.map((value) => value - periodicRiskFree);

  const excessMean = mean(excess);
  const totalVolatility = standardDeviation(excess);

  // Sortino penalises only downside dispersion, measured against the target.
  const downsideSquares = excess.reduce(
    (sum, value) => sum + (value < 0 ? value * value : 0),
    0,
  );
  const downsideDeviation = Math.sqrt(downsideSquares / excess.length);

  const { depth, duration } = maxDrawdown(returns);
  const annualizedExcess = excessMean * periodsPerYear;
  const annualizedReturn = mean(returns) * periodsPerYear;

  const gains = returns.filter((value) => value > 0);
  const losses = returns.filter((value) => value < 0);
  const averageGain = gains.length > 0 ? mean(gains) : 0;
  const averageLoss = losses.length > 0 ? Math.abs(mean(losses)) : 0;

  return {
    sharpeRatio:
      totalVolatility > 0 ? clean(annualizedExcess / (totalVolatility * Math.sqrt(periodsPerYear))) : 0,
    sortinoRatio:
      downsideDeviation > 0
        ? clean(annualizedExcess / (downsideDeviation * Math.sqrt(periodsPerYear)))
        : 0,
    calmarRatio: depth > 0 ? clean(annualizedReturn / depth) : 0,
    maxDrawdown: depth,
    maxDrawdownDuration: duration,
    hitRate: clean(gains.length / returns.length),
    gainToPainRatio: averageLoss > 0 ? clean(averageGain / averageLoss) : 0,
  };
}

/* ================================================================== */
/* 4. Value at Risk and Tail VaR                                       */
/* ================================================================== */

/**
 * Historical VaR — the empirical quantile of the loss distribution. Makes no
 * distributional assumption, but cannot see a loss larger than the worst one
 * already observed.
 */
export function historicalVar(
  returns: readonly number[],
  confidence: number,
): { var: number; tvar: number } {
  if (returns.length === 0) return { var: 0, tvar: 0 };
  const sorted = [...returns].sort((a, b) => a - b);
  const cutoff = sortedQuantile(sorted, 1 - confidence);
  const tail = sorted.filter((value) => value <= cutoff);
  const tailMean = tail.length > 0 ? mean(tail) : cutoff;
  return { var: Math.max(0, -cutoff), tvar: Math.max(0, -tailMean) };
}

/**
 * Parametric (variance-covariance) VaR under a normal assumption.
 *
 * TVaR has the closed form E[X | X ≤ q] = μ − σ·φ(z)/(1−c), which is why the
 * expected shortfall here needs no simulation.
 */
export function parametricVar(
  returns: readonly number[],
  confidence: number,
): { var: number; tvar: number } {
  if (returns.length < 2) return { var: 0, tvar: 0 };
  const mu = mean(returns);
  const sigma = standardDeviation(returns);
  const z = normalQuantile(1 - confidence);
  const varValue = -(mu + sigma * z);
  const tvarValue = -(mu - (sigma * normalPdf(z)) / (1 - confidence));
  return { var: Math.max(0, varValue), tvar: Math.max(0, tvarValue) };
}

/**
 * Cornish-Fisher (modified) VaR.
 *
 * Expands the normal quantile in the sample's skewness and excess kurtosis,
 * which matters because equity returns are left-skewed and fat-tailed — a
 * plain normal VaR systematically understates the tail.
 */
export function cornishFisherVar(
  returns: readonly number[],
  confidence: number,
): { var: number; tvar: number } {
  if (returns.length < 4) return parametricVar(returns, confidence);

  const mu = mean(returns);
  const sigma = standardDeviation(returns);
  const s = skewness(returns);
  const k = excessKurtosis(returns);
  const z = normalQuantile(1 - confidence);

  const zAdjusted =
    z +
    ((z * z - 1) * s) / 6 +
    ((z * z * z - 3 * z) * k) / 24 -
    ((2 * z * z * z - 5 * z) * s * s) / 36;

  const varValue = -(mu + sigma * zAdjusted);

  // The expected shortfall is taken from the same expansion by averaging the
  // adjusted quantile over the tail, which keeps VaR and TVaR mutually
  // consistent rather than mixing two different distributional assumptions.
  const steps = 64;
  let tailSum = 0;
  for (let i = 1; i <= steps; i += 1) {
    const level = (1 - confidence) * (i / (steps + 1));
    const zi = normalQuantile(level);
    const ziAdjusted =
      zi +
      ((zi * zi - 1) * s) / 6 +
      ((zi * zi * zi - 3 * zi) * k) / 24 -
      ((2 * zi * zi * zi - 5 * zi) * s * s) / 36;
    tailSum += mu + sigma * ziAdjusted;
  }

  return {
    var: Math.max(0, varValue),
    tvar: Math.max(0, -(tailSum / steps)),
  };
}

/**
 * Monte Carlo VaR — resamples the fitted normal, seeded so the figure is
 * reproducible. Included mainly to show the three methods converging.
 */
export function monteCarloVar(
  returns: readonly number[],
  confidence: number,
  paths = 20_000,
  seed = 42,
): { var: number; tvar: number } {
  if (returns.length < 2) return { var: 0, tvar: 0 };
  const mu = mean(returns);
  const sigma = standardDeviation(returns);
  const random = new SeededRandom(seed);

  const sample: number[] = new Array<number>(paths);
  for (let i = 0; i < paths; i += 1) sample[i] = mu + sigma * random.nextNormal();

  return historicalVar(sample, confidence);
}

/** Compute a risk measure by the requested method, scaled to a horizon. */
export function computeRiskMeasure(
  returns: readonly number[],
  method: VarMethod,
  confidence: number,
  portfolioValue: number,
  horizonDays = 1,
): RiskMeasure {
  const base =
    method === "historical"
      ? historicalVar(returns, confidence)
      : method === "parametric"
        ? parametricVar(returns, confidence)
        : method === "cornish-fisher"
          ? cornishFisherVar(returns, confidence)
          : monteCarloVar(returns, confidence);

  // Square-root-of-time scaling: valid when returns are i.i.d., which is the
  // same assumption the parametric measure already makes.
  const scale = Math.sqrt(Math.max(1, horizonDays));
  const varFraction = base.var * scale;
  const tvarFraction = base.tvar * scale;

  return {
    method,
    confidence,
    valueAtRisk: clean(varFraction),
    tailValueAtRisk: clean(tvarFraction),
    valueAtRiskAmount: clean(varFraction * portfolioValue),
    tailValueAtRiskAmount: clean(tvarFraction * portfolioValue),
    horizonDays,
  };
}

/** Histogram of a return series, flagging the bins beyond the VaR threshold. */
export function returnHistogram(
  returns: readonly number[],
  varThreshold: number,
  bins = 40,
): ReturnHistogramBin[] {
  if (returns.length === 0) return [];
  const min = Math.min(...returns);
  const max = Math.max(...returns);
  if (max === min) return [{ start: min, end: max, count: returns.length, isTail: false }];

  const width = (max - min) / bins;
  const counts = new Array<number>(bins).fill(0);
  for (const value of returns) {
    const index = Math.min(bins - 1, Math.floor((value - min) / width));
    counts[index] += 1;
  }

  return counts.map((count, index) => {
    const start = min + index * width;
    const end = start + width;
    return {
      start: clean(start),
      end: clean(end),
      count,
      // A bin is "tail" when it lies entirely at or below the VaR loss level.
      isTail: end <= -varThreshold,
    };
  });
}

/* ================================================================== */
/* 5. Black-Scholes-Merton                                             */
/* ================================================================== */

/** Validate an option contract before pricing it. */
export function validateContract(contract: OptionContract): Result<OptionContract> {
  if (contract.spot <= 0) return fail("DOMAIN_ERROR", "Spot price must be positive.", "spot");
  if (contract.strike <= 0) return fail("DOMAIN_ERROR", "Strike must be positive.", "strike");
  if (contract.timeToExpiry < 0) {
    return fail("DOMAIN_ERROR", "Time to expiry cannot be negative.", "timeToExpiry");
  }
  if (contract.volatility < 0) {
    return fail("DOMAIN_ERROR", "Volatility cannot be negative.", "volatility");
  }
  return ok(contract);
}

/**
 * Price a European option and its Greek surface under Black-Scholes-Merton
 * with a continuous dividend yield q:
 *
 *   d₁ = [ln(S/K) + (r − q + σ²/2)T] / (σ√T)
 *   d₂ = d₁ − σ√T
 *   C  = S·e^{−qT}·N(d₁) − K·e^{−rT}·N(d₂)
 *   P  = K·e^{−rT}·N(−d₂) − S·e^{−qT}·N(−d₁)
 *
 * At expiry (T = 0) or zero volatility the formula degenerates, so those cases
 * fall back to the discounted intrinsic value with the limiting Greeks.
 */
export function priceOption(contract: OptionContract): Result<OptionPricing> {
  const validated = validateContract(contract);
  if (!validated.ok) return validated;

  const { spot, strike, timeToExpiry, riskFreeRate, volatility, dividendYield, type } = contract;

  const isCall = type === "call";
  const intrinsic = Math.max(0, isCall ? spot - strike : strike - spot);
  const sqrtT = Math.sqrt(timeToExpiry);
  const discount = Math.exp(-riskFreeRate * timeToExpiry);
  const carry = Math.exp(-dividendYield * timeToExpiry);

  // Degenerate boundary: the option is worth its intrinsic value and delta is
  // a step function.
  if (timeToExpiry <= 0 || volatility <= 0 || sqrtT === 0) {
    const inTheMoney = isCall ? spot > strike : spot < strike;
    const price = timeToExpiry <= 0 ? intrinsic : Math.max(0, isCall ? spot * carry - strike * discount : strike * discount - spot * carry);
    return ok({
      contract,
      price: clean(price),
      intrinsicValue: clean(intrinsic),
      timeValue: clean(price - intrinsic),
      greeks: {
        delta: inTheMoney ? (isCall ? 1 : -1) : 0,
        gamma: 0,
        vega: 0,
        theta: 0,
        rho: 0,
        speed: 0,
        vanna: 0,
        volga: 0,
      },
      d1: Number.POSITIVE_INFINITY,
      d2: Number.POSITIVE_INFINITY,
      probabilityItm: inTheMoney ? 1 : 0,
      breakEven: isCall ? strike + price : strike - price,
    });
  }

  const sigmaSqrtT = volatility * sqrtT;
  const d1 =
    (Math.log(spot / strike) + (riskFreeRate - dividendYield + (volatility * volatility) / 2) * timeToExpiry) /
    sigmaSqrtT;
  const d2 = d1 - sigmaSqrtT;

  const nd1 = normalCdf(d1);
  const nd2 = normalCdf(d2);
  const pdfD1 = normalPdf(d1);

  const price = isCall
    ? spot * carry * nd1 - strike * discount * nd2
    : strike * discount * normalCdf(-d2) - spot * carry * normalCdf(-d1);

  // Delta: ∂V/∂S
  const delta = isCall ? carry * nd1 : carry * (nd1 - 1);

  // Gamma: ∂²V/∂S² — identical for calls and puts.
  const gamma = (carry * pdfD1) / (spot * sigmaSqrtT);

  // Vega: ∂V/∂σ, reported per 1 percentage point of volatility.
  const vegaRaw = spot * carry * pdfD1 * sqrtT;

  // Theta: ∂V/∂t, reported per calendar day.
  const thetaRaw = isCall
    ? -(spot * carry * pdfD1 * volatility) / (2 * sqrtT) +
      dividendYield * spot * carry * nd1 -
      riskFreeRate * strike * discount * nd2
    : -(spot * carry * pdfD1 * volatility) / (2 * sqrtT) -
      dividendYield * spot * carry * normalCdf(-d1) +
      riskFreeRate * strike * discount * normalCdf(-d2);

  // Rho: ∂V/∂r, reported per 1 percentage point of rates.
  const rhoRaw = isCall
    ? strike * timeToExpiry * discount * nd2
    : -strike * timeToExpiry * discount * normalCdf(-d2);

  // Third order and cross Greeks.
  const speed = -(gamma / spot) * (d1 / sigmaSqrtT + 1);
  const vanna = (vegaRaw / spot) * (1 - d1 / sigmaSqrtT);
  const volga = vegaRaw * ((d1 * d2) / volatility);

  const greeks: OptionGreeks = {
    delta: clean(delta),
    gamma: clean(gamma),
    vega: clean(vegaRaw / 100),
    theta: clean(thetaRaw / 365),
    rho: clean(rhoRaw / 100),
    speed: clean(speed),
    vanna: clean(vanna / 100),
    volga: clean(volga / 10_000),
  };

  return ok({
    contract,
    price: clean(price),
    intrinsicValue: clean(intrinsic),
    timeValue: clean(price - intrinsic),
    greeks,
    d1: clean(d1),
    d2: clean(d2),
    probabilityItm: clean(isCall ? nd2 : normalCdf(-d2)),
    breakEven: clean(isCall ? strike + price : strike - price),
  });
}

/**
 * Implied volatility by Newton-Raphson on vega, bracketed by bisection.
 *
 * Newton alone is fragile for deep in- or out-of-the-money options where vega
 * collapses toward zero; keeping a bracket means the solve either converges or
 * reports failure honestly, and never returns a wild number.
 */
export function impliedVolatility(
  contract: Omit<OptionContract, "volatility">,
  marketPrice: number,
  tolerance = 1e-8,
  maxIterations = 100,
): Result<number> {
  if (marketPrice <= 0) {
    return fail("DOMAIN_ERROR", "The market price must be positive.", "marketPrice");
  }

  const priceAt = (volatility: number): number => {
    const result = priceOption({ ...contract, volatility });
    return result.ok ? result.value.price : Number.NaN;
  };

  const isCall = contract.type === "call";
  const discount = Math.exp(-contract.riskFreeRate * contract.timeToExpiry);
  const carry = Math.exp(-contract.dividendYield * contract.timeToExpiry);
  const lowerBound = Math.max(
    0,
    isCall
      ? contract.spot * carry - contract.strike * discount
      : contract.strike * discount - contract.spot * carry,
  );
  const upperBound = isCall ? contract.spot * carry : contract.strike * discount;

  if (marketPrice < lowerBound - 1e-10 || marketPrice > upperBound + 1e-10) {
    return fail(
      "DOMAIN_ERROR",
      "The quoted price violates the no-arbitrage bounds, so no implied volatility exists.",
      "marketPrice",
    );
  }

  let low = 1e-6;
  let high = 5;
  let sigma = 0.25;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const priced = priceOption({ ...contract, volatility: sigma });
    if (!priced.ok) break;

    const difference = priced.value.price - marketPrice;
    if (Math.abs(difference) < tolerance) return ok(clean(sigma));

    // Maintain the bracket regardless of which step we take.
    if (difference > 0) high = sigma;
    else low = sigma;

    // Vega is reported per percentage point; undo that for the Newton step.
    const vega = priced.value.greeks.vega * 100;
    const newtonStep = vega > 1e-8 ? sigma - difference / vega : Number.NaN;

    sigma =
      Number.isFinite(newtonStep) && newtonStep > low && newtonStep < high
        ? newtonStep
        : (low + high) / 2;

    if (high - low < tolerance) return ok(clean(sigma));
  }

  const finalPrice = priceAt(sigma);
  if (Number.isFinite(finalPrice) && Math.abs(finalPrice - marketPrice) < 1e-4) {
    return ok(clean(sigma));
  }

  return fail(
    "CONVERGENCE_FAILURE",
    "Implied volatility did not converge — the quote may be stale or arbitrageable.",
  );
}

/** Payoff and mark-to-market curves across a range of underlying prices. */
export function optionPayoffCurve(
  contract: OptionContract,
  premium: number,
  points = 120,
): PayoffPoint[] {
  const lower = Math.max(0.01, contract.strike * 0.5);
  const upper = contract.strike * 1.6;
  const step = (upper - lower) / (points - 1);
  const isCall = contract.type === "call";

  const curve: PayoffPoint[] = [];
  for (let i = 0; i < points; i += 1) {
    const spot = lower + i * step;
    const expiryPayoff = Math.max(0, isCall ? spot - contract.strike : contract.strike - spot);
    const priced = priceOption({ ...contract, spot });
    curve.push({
      spot: clean(spot),
      payoff: clean(expiryPayoff - premium),
      currentValue: clean((priced.ok ? priced.value.price : 0) - premium),
    });
  }
  return curve;
}

/** Price the same contract across a grid of strikes — the volatility smile axis. */
export function strikeLadder(
  contract: OptionContract,
  strikes: readonly number[],
): { strike: number; call: number; put: number; callDelta: number; putDelta: number }[] {
  return strikes.map((strike) => {
    const call = priceOption({ ...contract, strike, type: "call" });
    const put = priceOption({ ...contract, strike, type: "put" });
    return {
      strike: clean(strike),
      call: call.ok ? call.value.price : 0,
      put: put.ok ? put.value.price : 0,
      callDelta: call.ok ? call.value.greeks.delta : 0,
      putDelta: put.ok ? put.value.greeks.delta : 0,
    };
  });
}

/**
 * Put-call parity residual: C − P − S·e^{−qT} + K·e^{−rT}, which must be zero.
 * Surfacing it turns the pricer into a self-checking component.
 */
export function putCallParityResidual(contract: OptionContract): number {
  const call = priceOption({ ...contract, type: "call" });
  const put = priceOption({ ...contract, type: "put" });
  if (!call.ok || !put.ok) return Number.NaN;
  const { spot, strike, riskFreeRate, dividendYield, timeToExpiry } = contract;
  return clean(
    call.value.price -
      put.value.price -
      spot * Math.exp(-dividendYield * timeToExpiry) +
      strike * Math.exp(-riskFreeRate * timeToExpiry),
  );
}

/* ================================================================== */
/* 6. Technical indicators                                             */
/* ================================================================== */

/** Simple moving average over a trailing window. */
export function simpleMovingAverage(candles: readonly Candle[], period: number): IndicatorSeries {
  const points: IndicatorPoint[] = [];
  let rollingSum = 0;

  for (let i = 0; i < candles.length; i += 1) {
    rollingSum += candles[i].close;
    if (i >= period) rollingSum -= candles[i - period].close;
    points.push({
      time: candles[i].time,
      value: i >= period - 1 ? clean(rollingSum / period) : null,
    });
  }

  return { id: `sma-${period}`, label: `SMA ${period}`, period, points };
}

/** Exponential moving average, seeded with the first `period` bars' SMA. */
export function exponentialMovingAverage(
  candles: readonly Candle[],
  period: number,
): IndicatorSeries {
  const points: IndicatorPoint[] = [];
  const multiplier = 2 / (period + 1);
  let ema: number | null = null;
  let seedSum = 0;

  for (let i = 0; i < candles.length; i += 1) {
    const close = candles[i].close;
    if (i < period - 1) {
      seedSum += close;
      points.push({ time: candles[i].time, value: null });
      continue;
    }
    if (ema === null) {
      seedSum += close;
      ema = seedSum / period;
    } else {
      ema = (close - ema) * multiplier + ema;
    }
    points.push({ time: candles[i].time, value: clean(ema) });
  }

  return { id: `ema-${period}`, label: `EMA ${period}`, period, points };
}

/**
 * Wilder's Relative Strength Index.
 *
 * Wilder smoothing (a 1/period exponential average) rather than a plain SMA of
 * gains and losses — the two differ materially after the first window, and
 * every trading platform quotes the Wilder version.
 */
export function relativeStrengthIndex(
  candles: readonly Candle[],
  period = 14,
): IndicatorSeries {
  const points: IndicatorPoint[] = [];
  if (candles.length === 0) {
    return { id: `rsi-${period}`, label: `RSI ${period}`, period, points };
  }

  points.push({ time: candles[0].time, value: null });

  let averageGain = 0;
  let averageLoss = 0;

  for (let i = 1; i < candles.length; i += 1) {
    const change = candles[i].close - candles[i - 1].close;
    const gain = Math.max(0, change);
    const loss = Math.max(0, -change);

    if (i <= period) {
      averageGain += gain / period;
      averageLoss += loss / period;
      points.push({ time: candles[i].time, value: i === period ? rsiFrom(averageGain, averageLoss) : null });
      continue;
    }

    averageGain = (averageGain * (period - 1) + gain) / period;
    averageLoss = (averageLoss * (period - 1) + loss) / period;
    points.push({ time: candles[i].time, value: rsiFrom(averageGain, averageLoss) });
  }

  return { id: `rsi-${period}`, label: `RSI ${period}`, period, points };
}

function rsiFrom(averageGain: number, averageLoss: number): number {
  if (averageLoss === 0) return averageGain === 0 ? 50 : 100;
  const rs = averageGain / averageLoss;
  return clean(100 - 100 / (1 + rs));
}

/** Bollinger bands: an SMA with ±k sample standard deviations. */
export function bollingerBands(
  candles: readonly Candle[],
  period = 20,
  deviations = 2,
): BollingerBands {
  const middle: IndicatorPoint[] = [];
  const upper: IndicatorPoint[] = [];
  const lower: IndicatorPoint[] = [];

  for (let i = 0; i < candles.length; i += 1) {
    if (i < period - 1) {
      middle.push({ time: candles[i].time, value: null });
      upper.push({ time: candles[i].time, value: null });
      lower.push({ time: candles[i].time, value: null });
      continue;
    }
    const window = candles.slice(i - period + 1, i + 1).map((candle) => candle.close);
    const average = mean(window);
    const sd = standardDeviation(window);
    middle.push({ time: candles[i].time, value: clean(average) });
    upper.push({ time: candles[i].time, value: clean(average + deviations * sd) });
    lower.push({ time: candles[i].time, value: clean(average - deviations * sd) });
  }

  return { middle, upper, lower };
}

export interface MacdResult {
  readonly macd: readonly IndicatorPoint[];
  readonly signal: readonly IndicatorPoint[];
  readonly histogram: readonly IndicatorPoint[];
}

/** MACD: the difference of two EMAs, with its own EMA as the signal line. */
export function macd(
  candles: readonly Candle[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MacdResult {
  const fast = exponentialMovingAverage(candles, fastPeriod).points;
  const slow = exponentialMovingAverage(candles, slowPeriod).points;

  const macdLine: IndicatorPoint[] = candles.map((candle, index) => {
    const fastValue = fast[index]?.value;
    const slowValue = slow[index]?.value;
    return {
      time: candle.time,
      value:
        fastValue !== null && fastValue !== undefined && slowValue !== null && slowValue !== undefined
          ? clean(fastValue - slowValue)
          : null,
    };
  });

  // The signal line is an EMA of the MACD line, so it only starts once the
  // MACD line itself has enough defined points.
  const signalLine: IndicatorPoint[] = [];
  const multiplier = 2 / (signalPeriod + 1);
  let ema: number | null = null;
  let seed: number[] = [];

  for (const point of macdLine) {
    if (point.value === null) {
      signalLine.push({ time: point.time, value: null });
      continue;
    }
    if (ema === null) {
      seed = [...seed, point.value];
      if (seed.length < signalPeriod) {
        signalLine.push({ time: point.time, value: null });
        continue;
      }
      ema = mean(seed);
    } else {
      ema = (point.value - ema) * multiplier + ema;
    }
    signalLine.push({ time: point.time, value: clean(ema) });
  }

  const histogram: IndicatorPoint[] = macdLine.map((point, index) => {
    const signalValue = signalLine[index]?.value;
    return {
      time: point.time,
      value:
        point.value !== null && signalValue !== null && signalValue !== undefined
          ? clean(point.value - signalValue)
          : null,
    };
  });

  return { macd: macdLine, signal: signalLine, histogram };
}

/* ================================================================== */
/* 7. Portfolio valuation                                              */
/* ================================================================== */

/** Weighted-average cost per unit across a position's open lots. */
export function averageCost(position: Position): number {
  const quantity = position.lots.reduce((sum, lot) => sum + lot.quantity, 0);
  if (quantity === 0) return 0;
  const basis = position.lots.reduce((sum, lot) => sum + lot.quantity * lot.costBasis, 0);
  return clean(basis / quantity);
}

/**
 * Value the whole book.
 *
 * Risk contributions come from the covariance matrix: position i's share of
 * portfolio variance is wᵢ·(Σw)ᵢ / (wᵀΣw). These sum to one by construction,
 * which is exactly why they are the right way to say "where does my risk
 * actually live" — weights alone cannot answer that.
 */
export function valuePortfolio(
  positions: readonly Position[],
  quotes: Readonly<Record<string, Quote>>,
  returnsBySymbol: Readonly<Record<string, readonly number[]>> = {},
): PortfolioSummary {
  const rows: {
    position: Position;
    quantity: number;
    lastPrice: number;
    marketValue: number;
    costBasis: number;
    dayChange: number;
  }[] = [];

  for (const position of positions) {
    const quantity = position.lots.reduce((sum, lot) => sum + lot.quantity, 0);
    const quote = quotes[position.instrument.symbol];
    const lastPrice = quote?.price ?? averageCost(position);
    const costBasis = position.lots.reduce((sum, lot) => sum + lot.quantity * lot.costBasis, 0);
    const previousClose = quote?.previousClose ?? lastPrice;

    rows.push({
      position,
      quantity,
      lastPrice,
      marketValue: quantity * lastPrice,
      costBasis,
      dayChange: quantity * (lastPrice - previousClose),
    });
  }

  const totalMarketValue = rows.reduce((sum, row) => sum + row.marketValue, 0);
  const totalCostBasis = rows.reduce((sum, row) => sum + row.costBasis, 0);
  const totalDayChange = rows.reduce((sum, row) => sum + row.dayChange, 0);
  const totalRealized = positions.reduce((sum, position) => sum + position.realizedPnl, 0);

  const weights = rows.map((row) => (totalMarketValue > 0 ? row.marketValue / totalMarketValue : 0));
  const riskContributions = computeRiskContributions(
    rows.map((row) => row.position.instrument.symbol),
    weights,
    returnsBySymbol,
  );

  const valuations: PositionValuation[] = rows.map((row, index) => {
    const unrealized = row.marketValue - row.costBasis;
    const previousValue = row.marketValue - row.dayChange;
    return {
      symbol: row.position.instrument.symbol,
      name: row.position.instrument.name,
      assetClass: row.position.instrument.assetClass,
      sector: row.position.instrument.sector,
      quantity: clean(row.quantity),
      averageCost: averageCost(row.position),
      lastPrice: clean(row.lastPrice),
      marketValue: clean(row.marketValue),
      costBasis: clean(row.costBasis),
      unrealizedPnl: clean(unrealized),
      unrealizedPnlPercent: row.costBasis !== 0 ? clean(unrealized / row.costBasis) : 0,
      realizedPnl: clean(row.position.realizedPnl),
      totalPnl: clean(unrealized + row.position.realizedPnl),
      weight: clean(weights[index]),
      riskContribution: clean(riskContributions[index]),
      dayChange: clean(row.dayChange),
      dayChangePercent: previousValue !== 0 ? clean(row.dayChange / previousValue) : 0,
    };
  });

  const totalUnrealized = totalMarketValue - totalCostBasis;
  const previousTotal = totalMarketValue - totalDayChange;

  return {
    marketValue: clean(totalMarketValue),
    costBasis: clean(totalCostBasis),
    unrealizedPnl: clean(totalUnrealized),
    realizedPnl: clean(totalRealized),
    totalPnl: clean(totalUnrealized + totalRealized),
    totalPnlPercent:
      totalCostBasis !== 0 ? clean((totalUnrealized + totalRealized) / totalCostBasis) : 0,
    dayChange: clean(totalDayChange),
    dayChangePercent: previousTotal !== 0 ? clean(totalDayChange / previousTotal) : 0,
    positions: valuations,
  };
}

function computeRiskContributions(
  symbols: readonly string[],
  weights: readonly number[],
  returnsBySymbol: Readonly<Record<string, readonly number[]>>,
): number[] {
  const series = symbols.map((symbol) => returnsBySymbol[symbol] ?? []);
  const usable = series.every((entry) => entry.length > 2);

  // Without return history there is no covariance to work from, so fall back to
  // weights rather than inventing a number.
  if (!usable) return [...weights];

  const shortest = Math.min(...series.map((entry) => entry.length));
  const aligned = series.map((entry) => entry.slice(entry.length - shortest));
  const sigma = covarianceMatrix(aligned);

  const sigmaW = sigma.map((row) =>
    row.reduce((sum, entry, index) => sum + entry * weights[index], 0),
  );
  const portfolioVariance = sigmaW.reduce((sum, entry, index) => sum + entry * weights[index], 0);

  if (portfolioVariance <= 0) return [...weights];
  return weights.map((weight, index) => (weight * sigmaW[index]) / portfolioVariance);
}

/** Portfolio return series implied by fixed weights and per-asset returns. */
export function portfolioReturns(
  weights: readonly number[],
  returnsBySymbol: readonly (readonly number[])[],
): number[] {
  if (returnsBySymbol.length === 0) return [];
  const length = Math.min(...returnsBySymbol.map((entry) => entry.length));
  if (!Number.isFinite(length) || length <= 0) return [];

  const output: number[] = [];
  for (let t = 0; t < length; t += 1) {
    let total = 0;
    for (let asset = 0; asset < returnsBySymbol.length; asset += 1) {
      const entry = returnsBySymbol[asset];
      total += weights[asset] * entry[entry.length - length + t];
    }
    output.push(total);
  }
  return output;
}

const ALLOCATION_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
] as const;

/** Group holdings by any categorical field into allocation slices. */
export function allocationBy(
  positions: readonly PositionValuation[],
  key: "assetClass" | "sector" | "symbol",
): AllocationSlice[] {
  const totals = new Map<string, number>();
  for (const position of positions) {
    const label = position[key];
    totals.set(label, (totals.get(label) ?? 0) + position.marketValue);
  }

  const grandTotal = [...totals.values()].reduce((sum, value) => sum + value, 0);

  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], index) => ({
      label,
      value: clean(value),
      weight: grandTotal > 0 ? clean(value / grandTotal) : 0,
      color: ALLOCATION_COLORS[index % ALLOCATION_COLORS.length],
    }));
}

/* ================================================================== */
/* 8. Seeded RNG and synthetic market history                          */
/* ================================================================== */

/** mulberry32 — small, fast, and seeded so every figure is reproducible. */
export class SeededRandom {
  private state: number;
  private spareNormal: number | null = null;

  constructor(seed: number) {
    this.state = (Math.floor(seed) || 0x2f6e2b1) >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Standard normal via the polar Box-Muller transform. */
  nextNormal(): number {
    if (this.spareNormal !== null) {
      const value = this.spareNormal;
      this.spareNormal = null;
      return value;
    }
    let u: number;
    let v: number;
    let s: number;
    do {
      u = this.next() * 2 - 1;
      v = this.next() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const factor = Math.sqrt((-2 * Math.log(s)) / s);
    this.spareNormal = v * factor;
    return u * factor;
  }
}

export interface SyntheticSeriesConfig {
  readonly symbol: string;
  readonly startPrice: number;
  readonly annualDrift: number;
  readonly annualVolatility: number;
  readonly days: number;
  readonly seed: number;
  /** Baseline average daily volume. */
  readonly baseVolume: number;
}

/**
 * Generate a deterministic OHLC history from geometric Brownian motion.
 *
 * Intraday high and low are drawn from the same diffusion at a finer step so
 * the bars are internally consistent (low ≤ open, close ≤ high), which matters
 * because the candlestick renderer and the indicators both assume it.
 */
export function generateSyntheticSeries(config: SyntheticSeriesConfig): Candle[] {
  const { startPrice, annualDrift, annualVolatility, days, seed, baseVolume } = config;
  const random = new SeededRandom(seed);
  const dt = 1 / TRADING_DAYS_PER_YEAR;
  const driftTerm = (annualDrift - (annualVolatility * annualVolatility) / 2) * dt;
  const diffusion = annualVolatility * Math.sqrt(dt);

  const dayMs = 24 * 60 * 60 * 1000;
  // Anchor to a fixed date so server and client render identical series.
  const endTime = Date.UTC(2026, 6, 31);

  const candles: Candle[] = [];
  let price = startPrice;

  for (let i = 0; i < days; i += 1) {
    const open = price;

    // Four intraday sub-steps give a realistic high/low spread.
    let running = open;
    let high = open;
    let low = open;
    for (let step = 0; step < 4; step += 1) {
      running *= Math.exp(driftTerm / 4 + (diffusion / 2) * random.nextNormal());
      high = Math.max(high, running);
      low = Math.min(low, running);
    }
    const close = running;

    // Volume rises with the day's realised range — a crude but honest proxy.
    const range = (high - low) / open;
    const volume = Math.round(baseVolume * (0.6 + 1.8 * random.next() + 12 * range));

    candles.push({
      time: endTime - (days - 1 - i) * dayMs,
      open: clean(open),
      high: clean(Math.max(high, open, close)),
      low: clean(Math.min(low, open, close)),
      close: clean(close),
      volume,
    });

    price = close;
  }

  return candles;
}

/** Build a quote from the last two bars of a series. */
export function quoteFromCandles(symbol: string, candles: readonly Candle[]): Quote {
  const last = candles[candles.length - 1];
  const previous = candles[candles.length - 2] ?? last;

  if (last === undefined) {
    return {
      symbol,
      price: 0,
      previousClose: 0,
      change: 0,
      changePercent: 0,
      dayHigh: 0,
      dayLow: 0,
      volume: 0,
      timestamp: Date.now(),
    };
  }

  const change = last.close - previous.close;
  return {
    symbol,
    price: clean(last.close),
    previousClose: clean(previous.close),
    change: clean(change),
    changePercent: previous.close !== 0 ? clean(change / previous.close) : 0,
    dayHigh: clean(last.high),
    dayLow: clean(last.low),
    volume: last.volume,
    timestamp: last.time,
  };
}

/* ================================================================== */
/* 9. Formatting helpers used across the dashboard                     */
/* ================================================================== */

/** Format a currency amount, abbreviating above a million. */
export function formatCurrency(value: number, currency = "USD", compact = false): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: compact && Math.abs(value) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 1000 || compact ? 0 : 2,
    minimumFractionDigits: Math.abs(value) >= 1000 || compact ? 0 : 2,
  }).format(value);
}

/** Format a decimal ratio as a signed percentage. */
export function formatSignedPercent(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(decimals)}%`;
}

/** Format a decimal ratio as an unsigned percentage. */
export function formatPercent(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(decimals)}%`;
}

/** Human-readable label for each VaR method. */
export const VAR_METHOD_LABELS: Readonly<Record<VarMethod, string>> = {
  historical: "Historical",
  parametric: "Parametric",
  "cornish-fisher": "Cornish-Fisher",
  "monte-carlo": "Monte Carlo",
};

/** One-line description of what each VaR method assumes. */
export const VAR_METHOD_DESCRIPTIONS: Readonly<Record<VarMethod, string>> = {
  historical:
    "The empirical quantile of realised returns. Assumes nothing about the shape of the " +
    "distribution, but cannot exceed the worst loss already in the sample.",
  parametric:
    "Assumes returns are normal and reads the quantile from μ and σ. Fast and smooth, but it " +
    "understates tails whenever returns are fat-tailed — which they are.",
  "cornish-fisher":
    "Expands the normal quantile in the sample's skewness and excess kurtosis, so a left-skewed, " +
    "fat-tailed series produces a correspondingly larger loss estimate.",
  "monte-carlo":
    "Resamples a fitted normal with a fixed seed. Included as a convergence check on the " +
    "parametric figure rather than as an independent model.",
};

/** Instruments the demo portfolio is built from. */
export function instrumentKey(instrument: Instrument): string {
  return `${instrument.symbol}:${instrument.assetClass}`;
}
