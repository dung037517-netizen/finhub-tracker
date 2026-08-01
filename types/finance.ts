/**
 * FinHub Tracker — core domain types.
 *
 * The whole risk stack is typed here: instruments and positions, OHLC price
 * series, technical indicators, the option-pricing surface, and the actuarial
 * risk measures (VaR, TVaR) applied to portfolio return distributions.
 *
 * No `any` appears in this file or in any module that consumes it. Failure
 * states are modelled as discriminated unions rather than thrown strings, so
 * the UI is forced to handle a singular covariance matrix or an out-of-domain
 * volatility instead of rendering `NaN`.
 */

/* ------------------------------------------------------------------ */
/* Result envelope                                                     */
/* ------------------------------------------------------------------ */

export type Result<TValue, TError = FinanceError> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly error: TError };

export type FinanceErrorCode =
  | "DOMAIN_ERROR"
  | "INSUFFICIENT_DATA"
  | "CONVERGENCE_FAILURE"
  | "DIMENSION_ERROR"
  | "UNSUPPORTED_INSTRUMENT";

export interface FinanceError {
  readonly code: FinanceErrorCode;
  readonly message: string;
  /** The field or symbol that caused the failure, when known. */
  readonly context?: string;
}

/* ------------------------------------------------------------------ */
/* Instruments and market data                                         */
/* ------------------------------------------------------------------ */

export type AssetClass = "equity" | "etf" | "crypto" | "bond" | "commodity" | "cash";

export type Currency = "USD" | "EUR" | "GBP" | "JPY" | "VND";

export interface Instrument {
  readonly symbol: string;
  readonly name: string;
  readonly assetClass: AssetClass;
  readonly currency: Currency;
  /** GICS-style sector, or a coarse label for non-equity classes. */
  readonly sector: string;
  /** Annualised dividend or carry yield as a decimal. */
  readonly dividendYield: number;
}

/** A single open-high-low-close bar. */
export interface Candle {
  /** Epoch milliseconds at the bar's open. */
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export type Timeframe = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "ALL";

/** Number of trading days each timeframe spans; `ALL` means the full series. */
export const TIMEFRAME_DAYS: Readonly<Record<Timeframe, number | null>> = {
  "1D": 1,
  "1W": 5,
  "1M": 21,
  "3M": 63,
  "6M": 126,
  "1Y": 252,
  ALL: null,
};

export interface PriceSeries {
  readonly symbol: string;
  readonly candles: readonly Candle[];
}

/** A live quote as delivered by the streaming feed. */
export interface Quote {
  readonly symbol: string;
  readonly price: number;
  readonly previousClose: number;
  readonly change: number;
  readonly changePercent: number;
  readonly dayHigh: number;
  readonly dayLow: number;
  readonly volume: number;
  readonly timestamp: number;
}

/* ------------------------------------------------------------------ */
/* Technical indicators                                                */
/* ------------------------------------------------------------------ */

/** A point on an indicator overlay; `null` before the lookback window fills. */
export interface IndicatorPoint {
  readonly time: number;
  readonly value: number | null;
}

export interface IndicatorSeries {
  readonly id: string;
  readonly label: string;
  readonly period: number;
  readonly points: readonly IndicatorPoint[];
}

export interface BollingerBands {
  readonly middle: readonly IndicatorPoint[];
  readonly upper: readonly IndicatorPoint[];
  readonly lower: readonly IndicatorPoint[];
}

/* ------------------------------------------------------------------ */
/* Portfolio                                                           */
/* ------------------------------------------------------------------ */

export interface Lot {
  readonly id: string;
  /** Epoch milliseconds at acquisition. */
  readonly acquiredAt: number;
  readonly quantity: number;
  readonly costBasis: number;
}

export interface Position {
  readonly instrument: Instrument;
  readonly lots: readonly Lot[];
  /** Realised proceeds net of basis from closed lots, in portfolio currency. */
  readonly realizedPnl: number;
}

export interface PositionValuation {
  readonly symbol: string;
  readonly name: string;
  readonly assetClass: AssetClass;
  readonly sector: string;
  readonly quantity: number;
  /** Weighted-average cost per unit across open lots. */
  readonly averageCost: number;
  readonly lastPrice: number;
  readonly marketValue: number;
  readonly costBasis: number;
  readonly unrealizedPnl: number;
  readonly unrealizedPnlPercent: number;
  readonly realizedPnl: number;
  readonly totalPnl: number;
  /** Share of total portfolio market value, in [0, 1]. */
  readonly weight: number;
  /** Contribution to portfolio variance, in [0, 1] when weights sum to 1. */
  readonly riskContribution: number;
  readonly dayChange: number;
  readonly dayChangePercent: number;
}

export interface PortfolioSummary {
  readonly marketValue: number;
  readonly costBasis: number;
  readonly unrealizedPnl: number;
  readonly realizedPnl: number;
  readonly totalPnl: number;
  readonly totalPnlPercent: number;
  readonly dayChange: number;
  readonly dayChangePercent: number;
  readonly positions: readonly PositionValuation[];
}

/* ------------------------------------------------------------------ */
/* Performance and risk statistics                                     */
/* ------------------------------------------------------------------ */

export interface ReturnStatistics {
  readonly observations: number;
  /** Arithmetic mean of periodic log returns. */
  readonly meanReturn: number;
  readonly volatility: number;
  /** Mean return scaled to a year by the periods-per-year factor. */
  readonly annualizedReturn: number;
  readonly annualizedVolatility: number;
  readonly downsideDeviation: number;
  readonly skewness: number;
  readonly excessKurtosis: number;
  readonly bestPeriod: number;
  readonly worstPeriod: number;
}

export interface PerformanceMetrics {
  readonly sharpeRatio: number;
  readonly sortinoRatio: number;
  readonly calmarRatio: number;
  readonly maxDrawdown: number;
  /** Length of the deepest drawdown in periods. */
  readonly maxDrawdownDuration: number;
  /** Fraction of periods with a positive return. */
  readonly hitRate: number;
  /** Mean gain divided by mean loss magnitude. */
  readonly gainToPainRatio: number;
}

export type VarMethod = "historical" | "parametric" | "cornish-fisher" | "monte-carlo";

export interface RiskMeasure {
  readonly method: VarMethod;
  /** Confidence level, e.g. 0.99. */
  readonly confidence: number;
  /** Value at Risk as a positive loss fraction of portfolio value. */
  readonly valueAtRisk: number;
  /** Tail VaR (a.k.a. CVaR / expected shortfall), also a positive fraction. */
  readonly tailValueAtRisk: number;
  /** The same figures in portfolio currency. */
  readonly valueAtRiskAmount: number;
  readonly tailValueAtRiskAmount: number;
  /** Horizon in trading days the measure applies to. */
  readonly horizonDays: number;
}

export interface DrawdownPoint {
  readonly time: number;
  readonly equity: number;
  readonly peak: number;
  /** Negative fraction below the running peak. */
  readonly drawdown: number;
}

export interface ReturnHistogramBin {
  readonly start: number;
  readonly end: number;
  readonly count: number;
  /** True when the bin lies entirely beyond the VaR threshold. */
  readonly isTail: boolean;
}

/* ------------------------------------------------------------------ */
/* Options                                                             */
/* ------------------------------------------------------------------ */

export type OptionType = "call" | "put";
export type OptionStyle = "european";

export interface OptionContract {
  readonly symbol: string;
  readonly type: OptionType;
  readonly style: OptionStyle;
  /** Spot price of the underlying. */
  readonly spot: number;
  readonly strike: number;
  /** Time to expiry in years. */
  readonly timeToExpiry: number;
  /** Continuously compounded risk-free rate. */
  readonly riskFreeRate: number;
  /** Annualised volatility of log returns. */
  readonly volatility: number;
  /** Continuous dividend yield of the underlying. */
  readonly dividendYield: number;
}

export interface OptionGreeks {
  /** ∂V/∂S — sensitivity to the underlying. */
  readonly delta: number;
  /** ∂²V/∂S² — convexity of the position. */
  readonly gamma: number;
  /** ∂V/∂σ, quoted per 1 percentage-point change in volatility. */
  readonly vega: number;
  /** ∂V/∂t, quoted per calendar day. */
  readonly theta: number;
  /** ∂V/∂r, quoted per 1 percentage-point change in rates. */
  readonly rho: number;
  /** ∂³V/∂S³ — the rate of change of gamma. */
  readonly speed: number;
  /** ∂²V/∂S∂σ — how delta moves as volatility moves. */
  readonly vanna: number;
  /** ∂²V/∂σ² — convexity in volatility. */
  readonly volga: number;
}

export interface OptionPricing {
  readonly contract: OptionContract;
  readonly price: number;
  /** Value if exercised immediately, floored at zero. */
  readonly intrinsicValue: number;
  readonly timeValue: number;
  readonly greeks: OptionGreeks;
  /** d₁ and d₂ from the Black-Scholes formula, exposed for the derivation. */
  readonly d1: number;
  readonly d2: number;
  /** Risk-neutral probability the option expires in the money, N(d₂) for calls. */
  readonly probabilityItm: number;
  /** Break-even underlying price at expiry, including the premium paid. */
  readonly breakEven: number;
}

export interface PayoffPoint {
  readonly spot: number;
  /** Payoff at expiry, net of the premium. */
  readonly payoff: number;
  /** Mark-to-market profit today at that spot, net of the premium. */
  readonly currentValue: number;
}

/* ------------------------------------------------------------------ */
/* Allocation breakdown                                                */
/* ------------------------------------------------------------------ */

export interface AllocationSlice {
  readonly label: string;
  readonly value: number;
  readonly weight: number;
  readonly color: string;
}

/* ------------------------------------------------------------------ */
/* Streaming feed                                                      */
/* ------------------------------------------------------------------ */

export type FeedStatus = "connecting" | "open" | "closed" | "error";

export interface FeedTick {
  readonly symbol: string;
  readonly price: number;
  readonly previousPrice: number;
  readonly timestamp: number;
}

export interface FeedSnapshot {
  readonly status: FeedStatus;
  readonly quotes: Readonly<Record<string, Quote>>;
  /** Ticks received since the connection opened. */
  readonly tickCount: number;
  readonly lastUpdate: number | null;
}

/** Configuration for the simulated market data feed. */
export interface MarketFeedConfig {
  readonly symbols: readonly string[];
  /** Milliseconds between ticks. */
  readonly intervalMs: number;
  /** Annualised volatility used to drive the GBM tick process. */
  readonly volatility: Readonly<Record<string, number>>;
  readonly drift: Readonly<Record<string, number>>;
  readonly seed: number;
}
