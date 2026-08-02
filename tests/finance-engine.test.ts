import { describe, expect, it } from "vitest";

import {
  SeededRandom,
  allocationBy,
  bollingerBands,
  computeRiskMeasure,
  cornishFisherVar,
  correlation,
  covariance,
  describeReturns,
  drawdownSeries,
  erf,
  excessKurtosis,
  exponentialMovingAverage,
  generateSyntheticSeries,
  historicalVar,
  impliedVolatility,
  logReturns,
  macd,
  maxDrawdown,
  mean,
  monteCarloVar,
  normalCdf,
  normalPdf,
  normalQuantile,
  parametricVar,
  performanceMetrics,
  portfolioReturns,
  priceOption,
  putCallParityResidual,
  quantile,
  relativeStrengthIndex,
  returnHistogram,
  simpleMovingAverage,
  simpleReturns,
  skewness,
  standardDeviation,
  valuePortfolio,
  variance,
} from "@/lib/finance-engine";
import type { Candle, OptionContract, Position, Quote } from "@/types/finance";

function unwrap<T>(
  result: { ok: true; value: T } | { ok: false; error: { message: string } },
): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

const BASE_CONTRACT: OptionContract = {
  symbol: "TEST",
  type: "call",
  style: "european",
  spot: 100,
  strike: 100,
  timeToExpiry: 1,
  riskFreeRate: 0.05,
  volatility: 0.2,
  dividendYield: 0,
};

function candlesFromCloses(closes: readonly number[]): Candle[] {
  return closes.map((close, index) => ({
    time: index * 86_400_000,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000,
  }));
}

describe("special functions", () => {
  it("matches known values of erf", () => {
    expect(erf(0)).toBe(0);
    expect(erf(1)).toBeCloseTo(0.8427007929497149, 9);
    expect(erf(-0.5)).toBeCloseTo(-0.5204998778130465, 9);
  });

  it("computes the normal CDF and PDF", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 12);
    expect(normalCdf(1.96)).toBeCloseTo(0.9750021048517795, 10);
    expect(normalPdf(0)).toBeCloseTo(0.3989422804014327, 12);
  });

  it("inverts the normal CDF consistently", () => {
    for (const p of [0.001, 0.01, 0.05, 0.5, 0.95, 0.99, 0.999]) {
      expect(normalCdf(normalQuantile(p))).toBeCloseTo(p, 10);
    }
    expect(normalQuantile(0.95)).toBeCloseTo(1.6448536269514722, 8);
  });
});

describe("descriptive statistics", () => {
  const sample = [2, 4, 4, 4, 5, 5, 7, 9];

  it("computes mean, variance and standard deviation", () => {
    expect(mean(sample)).toBe(5);
    // Sample (Bessel-corrected) variance of this set is 32/7.
    expect(variance(sample)).toBeCloseTo(32 / 7, 12);
    expect(standardDeviation(sample)).toBeCloseTo(Math.sqrt(32 / 7), 12);
  });

  it("computes quantiles by linear interpolation", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 12);
    expect(quantile([1, 2, 3, 4, 5], 0.25)).toBeCloseTo(2, 12);
    expect(quantile([10], 0.9)).toBe(10);
  });

  it("reports zero skewness for a symmetric sample", () => {
    expect(skewness([-2, -1, 0, 1, 2])).toBeCloseTo(0, 12);
  });

  it("reports positive excess kurtosis for a fat-tailed sample", () => {
    const fatTailed = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -8, 8];
    expect(excessKurtosis(fatTailed)).toBeGreaterThan(0);
  });

  it("computes covariance and correlation", () => {
    const a = [1, 2, 3, 4, 5];
    const b = [2, 4, 6, 8, 10];
    expect(correlation(a, b)).toBeCloseTo(1, 12);
    expect(correlation(a, [...b].reverse())).toBeCloseTo(-1, 12);
    expect(covariance(a, b)).toBeCloseTo(5, 12);
  });
});

describe("returns", () => {
  it("computes simple and log returns", () => {
    expect(simpleReturns([100, 110])[0]).toBeCloseTo(0.1, 12);
    expect(logReturns([100, 110])[0]).toBeCloseTo(Math.log(1.1), 12);
  });

  it("annualises correctly at 252 periods", () => {
    const daily = new Array(252).fill(0.0004);
    const stats = describeReturns(daily);
    expect(stats.annualizedReturn).toBeCloseTo(0.0004 * 252, 8);
    expect(stats.volatility).toBeCloseTo(0, 10);
  });
});

describe("drawdowns and performance", () => {
  it("measures a known drawdown exactly", () => {
    // +25%, then -40% (peak 1.25 → trough 0.75), then +20%.
    const returns = [0.25, -0.4, 0.2];
    const { depth } = maxDrawdown(returns);
    expect(depth).toBeCloseTo(0.4, 10);
  });

  it("builds an equity curve whose final value compounds the returns", () => {
    const returns = [0.1, -0.05, 0.02];
    const points = drawdownSeries(returns, [1, 2, 3]);
    expect(points).toHaveLength(3);
    expect(points[2].equity).toBeCloseTo(1.1 * 0.95 * 1.02, 10);
    expect(points[0].drawdown).toBeCloseTo(0, 10);
  });

  it("reports a positive Sharpe ratio for a profitable series", () => {
    const random = new SeededRandom(11);
    const returns = Array.from({ length: 750 }, () => 0.0006 + 0.01 * random.nextNormal());
    const metrics = performanceMetrics(returns, 0.02);
    expect(metrics.sharpeRatio).toBeGreaterThan(0);
    expect(metrics.sortinoRatio).toBeGreaterThan(metrics.sharpeRatio * 0.5);
    expect(metrics.hitRate).toBeGreaterThan(0.4);
    expect(metrics.hitRate).toBeLessThan(0.6);
  });

  it("returns zeroed metrics rather than NaN for a degenerate series", () => {
    const metrics = performanceMetrics([0.01]);
    expect(metrics.sharpeRatio).toBe(0);
    expect(Number.isNaN(metrics.sortinoRatio)).toBe(false);
  });
});

describe("Value at Risk", () => {
  // A large normal sample lets us compare every method against theory.
  const random = new SeededRandom(2026);
  const normalSample = Array.from({ length: 100_000 }, () => 0.0005 + 0.012 * random.nextNormal());

  it("recovers the theoretical parametric VaR of a normal sample", () => {
    const { var: varValue } = parametricVar(normalSample, 0.99);
    // VaR₉₉ = −(μ + σ·z₀.₀₁) = −(0.0005 + 0.012 × (−2.32635))
    const theoretical = -(0.0005 + 0.012 * normalQuantile(0.01));
    expect(varValue).toBeCloseTo(theoretical, 3);
  });

  it("agrees between historical and parametric VaR on normal data", () => {
    const historical = historicalVar(normalSample, 0.99).var;
    const parametric = parametricVar(normalSample, 0.99).var;
    expect(Math.abs(historical - parametric)).toBeLessThan(0.002);
  });

  it("always reports TVaR at least as large as VaR", () => {
    for (const confidence of [0.9, 0.95, 0.99]) {
      const historical = historicalVar(normalSample, confidence);
      const parametric = parametricVar(normalSample, confidence);
      const modified = cornishFisherVar(normalSample, confidence);
      expect(historical.tvar).toBeGreaterThanOrEqual(historical.var - 1e-12);
      expect(parametric.tvar).toBeGreaterThanOrEqual(parametric.var - 1e-12);
      expect(modified.tvar).toBeGreaterThanOrEqual(modified.var - 1e-12);
    }
  });

  it("increases VaR with the confidence level", () => {
    const v90 = historicalVar(normalSample, 0.9).var;
    const v95 = historicalVar(normalSample, 0.95).var;
    const v99 = historicalVar(normalSample, 0.99).var;
    expect(v95).toBeGreaterThan(v90);
    expect(v99).toBeGreaterThan(v95);
  });

  it("produces a larger Cornish-Fisher VaR on a left-skewed sample", () => {
    // A sample with a fat left tail: the normal assumption understates it.
    const skewed = [...normalSample.slice(0, 5000), ...Array(200).fill(-0.09)];
    const parametric = parametricVar(skewed, 0.99).var;
    const modified = cornishFisherVar(skewed, 0.99).var;
    expect(modified).toBeGreaterThan(parametric);
  });

  it("converges Monte Carlo VaR to the parametric figure", () => {
    const parametric = parametricVar(normalSample, 0.95).var;
    const simulated = monteCarloVar(normalSample, 0.95, 50_000, 7).var;
    expect(Math.abs(simulated - parametric)).toBeLessThan(0.0015);
  });

  it("scales to a multi-day horizon by the square root of time", () => {
    const oneDay = computeRiskMeasure(normalSample, "parametric", 0.99, 1_000_000, 1);
    const tenDay = computeRiskMeasure(normalSample, "parametric", 0.99, 1_000_000, 10);
    expect(tenDay.valueAtRisk / oneDay.valueAtRisk).toBeCloseTo(Math.sqrt(10), 8);
    expect(tenDay.valueAtRiskAmount).toBeCloseTo(tenDay.valueAtRisk * 1_000_000, 6);
  });

  it("flags only bins beyond the VaR threshold as tail", () => {
    const bins = returnHistogram(normalSample, 0.03, 30);
    expect(bins.length).toBeGreaterThan(0);
    for (const bin of bins) {
      if (bin.isTail) expect(bin.end).toBeLessThanOrEqual(-0.03 + 1e-12);
    }
  });
});

describe("Black-Scholes-Merton", () => {
  it("prices a benchmark at-the-money call", () => {
    // S=100, K=100, r=5%, σ=20%, T=1 → C = 10.4506 (textbook value).
    const priced = unwrap(priceOption(BASE_CONTRACT));
    expect(priced.price).toBeCloseTo(10.450583572185565, 8);
    expect(priced.d1).toBeCloseTo(0.35, 10);
    expect(priced.d2).toBeCloseTo(0.15, 10);
  });

  it("prices the matching put", () => {
    const put = unwrap(priceOption({ ...BASE_CONTRACT, type: "put" }));
    expect(put.price).toBeCloseTo(5.573526022256971, 8);
  });

  it("satisfies put-call parity", () => {
    for (const strike of [80, 95, 100, 110, 130]) {
      for (const volatility of [0.1, 0.25, 0.6]) {
        const residual = putCallParityResidual({ ...BASE_CONTRACT, strike, volatility });
        expect(Math.abs(residual)).toBeLessThan(1e-9);
      }
    }
  });

  it("produces Greeks that agree with finite differences", () => {
    const priced = unwrap(priceOption(BASE_CONTRACT));
    const h = 0.01;

    const up = unwrap(priceOption({ ...BASE_CONTRACT, spot: 100 + h })).price;
    const down = unwrap(priceOption({ ...BASE_CONTRACT, spot: 100 - h })).price;
    expect((up - down) / (2 * h)).toBeCloseTo(priced.greeks.delta, 6);
    expect((up - 2 * priced.price + down) / (h * h)).toBeCloseTo(priced.greeks.gamma, 4);

    // Vega is reported per percentage point, so scale the bump accordingly.
    const volUp = unwrap(priceOption({ ...BASE_CONTRACT, volatility: 0.2 + 1e-5 })).price;
    const volDown = unwrap(priceOption({ ...BASE_CONTRACT, volatility: 0.2 - 1e-5 })).price;
    expect(((volUp - volDown) / (2e-5)) / 100).toBeCloseTo(priced.greeks.vega, 6);

    const rateUp = unwrap(priceOption({ ...BASE_CONTRACT, riskFreeRate: 0.05 + 1e-6 })).price;
    const rateDown = unwrap(priceOption({ ...BASE_CONTRACT, riskFreeRate: 0.05 - 1e-6 })).price;
    expect(((rateUp - rateDown) / (2e-6)) / 100).toBeCloseTo(priced.greeks.rho, 5);
  });

  it("keeps call delta in [0,1] and put delta in [-1,0]", () => {
    for (const spot of [50, 80, 100, 130, 200]) {
      const call = unwrap(priceOption({ ...BASE_CONTRACT, spot }));
      const put = unwrap(priceOption({ ...BASE_CONTRACT, spot, type: "put" }));
      expect(call.greeks.delta).toBeGreaterThanOrEqual(0);
      expect(call.greeks.delta).toBeLessThanOrEqual(1);
      expect(put.greeks.delta).toBeLessThanOrEqual(0);
      expect(put.greeks.delta).toBeGreaterThanOrEqual(-1);
      expect(call.greeks.gamma).toBeGreaterThanOrEqual(0);
    }
  });

  it("collapses to intrinsic value at expiry", () => {
    const expired = unwrap(priceOption({ ...BASE_CONTRACT, spot: 120, timeToExpiry: 0 }));
    expect(expired.price).toBeCloseTo(20, 10);
    expect(expired.timeValue).toBeCloseTo(0, 10);
  });

  it("accounts for a dividend yield", () => {
    const noYield = unwrap(priceOption(BASE_CONTRACT)).price;
    const withYield = unwrap(priceOption({ ...BASE_CONTRACT, dividendYield: 0.03 })).price;
    expect(withYield).toBeLessThan(noYield);
  });

  it("rejects an invalid contract instead of returning NaN", () => {
    const result = priceOption({ ...BASE_CONTRACT, spot: -1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DOMAIN_ERROR");
  });

  it("recovers implied volatility from a priced option", () => {
    for (const trueVol of [0.08, 0.2, 0.45, 0.9]) {
      for (const strike of [80, 100, 125]) {
        const contract = { ...BASE_CONTRACT, strike, volatility: trueVol };
        const price = unwrap(priceOption(contract)).price;
        const { volatility: _omit, ...withoutVol } = contract;
        void _omit;
        const implied = unwrap(impliedVolatility(withoutVol, price));
        expect(implied).toBeCloseTo(trueVol, 5);
      }
    }
  });

  it("refuses a quote that violates no-arbitrage bounds", () => {
    const { volatility: _omit, ...withoutVol } = BASE_CONTRACT;
    void _omit;
    const result = impliedVolatility(withoutVol, 500);
    expect(result.ok).toBe(false);
  });
});

describe("technical indicators", () => {
  const closes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  const candles = candlesFromCloses(closes);

  it("computes a simple moving average with the right lookback", () => {
    const sma = simpleMovingAverage(candles, 3);
    expect(sma.points[0].value).toBeNull();
    expect(sma.points[1].value).toBeNull();
    expect(sma.points[2].value).toBeCloseTo(11, 10);
    expect(sma.points[10].value).toBeCloseTo(19, 10);
  });

  it("computes an EMA that tracks a trending series", () => {
    const ema = exponentialMovingAverage(candles, 5);
    expect(ema.points[3].value).toBeNull();
    expect(ema.points[4].value).toBeCloseTo(12, 10); // seeded with the SMA
    const last = ema.points[ema.points.length - 1].value;
    expect(last).not.toBeNull();
    if (last !== null) expect(last).toBeGreaterThan(17);
  });

  it("returns RSI = 100 for an unbroken uptrend", () => {
    const rsi = relativeStrengthIndex(candles, 5);
    const last = rsi.points[rsi.points.length - 1].value;
    expect(last).toBeCloseTo(100, 6);
  });

  it("returns RSI near 0 for an unbroken downtrend", () => {
    const falling = relativeStrengthIndex(candlesFromCloses([...closes].reverse()), 5);
    const last = falling.points[falling.points.length - 1].value;
    expect(last).toBeCloseTo(0, 6);
  });

  it("keeps RSI within [0, 100] on noisy data", () => {
    const noisy = candlesFromCloses(
      generateSyntheticSeries({
        symbol: "T",
        startPrice: 100,
        annualDrift: 0.05,
        annualVolatility: 0.3,
        days: 300,
        seed: 5,
        baseVolume: 1000,
      }).map((candle) => candle.close),
    );
    for (const point of relativeStrengthIndex(noisy, 14).points) {
      if (point.value === null) continue;
      expect(point.value).toBeGreaterThanOrEqual(0);
      expect(point.value).toBeLessThanOrEqual(100);
    }
  });

  it("nests Bollinger bands around the moving average", () => {
    const bands = bollingerBands(candles, 5, 2);
    for (let i = 0; i < bands.middle.length; i += 1) {
      const middle = bands.middle[i].value;
      const upper = bands.upper[i].value;
      const lower = bands.lower[i].value;
      if (middle === null || upper === null || lower === null) continue;
      expect(upper).toBeGreaterThanOrEqual(middle);
      expect(lower).toBeLessThanOrEqual(middle);
    }
  });

  it("computes MACD as the difference of its two EMAs", () => {
    const longSeries = candlesFromCloses(
      Array.from({ length: 120 }, (_, i) => 100 + i * 0.4 + Math.sin(i / 5) * 3),
    );
    const result = macd(longSeries, 12, 26, 9);
    const fast = exponentialMovingAverage(longSeries, 12).points;
    const slow = exponentialMovingAverage(longSeries, 26).points;

    const index = 100;
    const fastValue = fast[index].value;
    const slowValue = slow[index].value;
    const macdValue = result.macd[index].value;
    expect(fastValue).not.toBeNull();
    expect(slowValue).not.toBeNull();
    if (fastValue !== null && slowValue !== null && macdValue !== null) {
      expect(macdValue).toBeCloseTo(fastValue - slowValue, 8);
    }
  });
});

describe("synthetic series", () => {
  it("is reproducible for a fixed seed", () => {
    const config = {
      symbol: "X",
      startPrice: 100,
      annualDrift: 0.08,
      annualVolatility: 0.2,
      days: 60,
      seed: 123,
      baseVolume: 1_000_000,
    };
    const a = generateSyntheticSeries(config);
    const b = generateSyntheticSeries(config);
    expect(a.map((candle) => candle.close)).toEqual(b.map((candle) => candle.close));
  });

  it("produces internally consistent OHLC bars", () => {
    const candles = generateSyntheticSeries({
      symbol: "X",
      startPrice: 50,
      annualDrift: 0.1,
      annualVolatility: 0.45,
      days: 400,
      seed: 99,
      baseVolume: 500_000,
    });
    for (const candle of candles) {
      expect(candle.high).toBeGreaterThanOrEqual(candle.open);
      expect(candle.high).toBeGreaterThanOrEqual(candle.close);
      expect(candle.low).toBeLessThanOrEqual(candle.open);
      expect(candle.low).toBeLessThanOrEqual(candle.close);
      expect(candle.close).toBeGreaterThan(0);
      expect(candle.volume).toBeGreaterThan(0);
    }
  });

  it("has an annualised volatility near the requested figure", () => {
    const candles = generateSyntheticSeries({
      symbol: "X",
      startPrice: 100,
      annualDrift: 0.05,
      annualVolatility: 0.3,
      days: 2000,
      seed: 4242,
      baseVolume: 1000,
    });
    const stats = describeReturns(logReturns(candles.map((candle) => candle.close)));
    expect(stats.annualizedVolatility).toBeGreaterThan(0.24);
    expect(stats.annualizedVolatility).toBeLessThan(0.36);
  });
});

describe("portfolio valuation", () => {
  const positions: readonly Position[] = [
    {
      instrument: {
        symbol: "AAA",
        name: "Alpha",
        assetClass: "equity",
        currency: "USD",
        sector: "Tech",
        dividendYield: 0,
      },
      realizedPnl: 100,
      lots: [
        { id: "a1", acquiredAt: 0, quantity: 10, costBasis: 50 },
        { id: "a2", acquiredAt: 0, quantity: 10, costBasis: 70 },
      ],
    },
    {
      instrument: {
        symbol: "BBB",
        name: "Beta",
        assetClass: "bond",
        currency: "USD",
        sector: "Fixed Income",
        dividendYield: 0.04,
      },
      realizedPnl: -50,
      lots: [{ id: "b1", acquiredAt: 0, quantity: 100, costBasis: 10 }],
    },
  ];

  const quotes: Readonly<Record<string, Quote>> = {
    AAA: {
      symbol: "AAA",
      price: 80,
      previousClose: 75,
      change: 5,
      changePercent: 5 / 75,
      dayHigh: 81,
      dayLow: 74,
      volume: 1000,
      timestamp: 0,
    },
    BBB: {
      symbol: "BBB",
      price: 11,
      previousClose: 11,
      change: 0,
      changePercent: 0,
      dayHigh: 11,
      dayLow: 11,
      volume: 500,
      timestamp: 0,
    },
  };

  it("computes weighted-average cost across lots", () => {
    const summary = valuePortfolio(positions, quotes);
    const alpha = summary.positions[0];
    // (10×50 + 10×70) / 20 = 60
    expect(alpha.averageCost).toBeCloseTo(60, 10);
    expect(alpha.costBasis).toBeCloseTo(1200, 10);
    expect(alpha.marketValue).toBeCloseTo(1600, 10);
    expect(alpha.unrealizedPnl).toBeCloseTo(400, 10);
  });

  it("separates realised from unrealised P&L", () => {
    const summary = valuePortfolio(positions, quotes);
    // AAA: 1600−1200 = 400; BBB: 1100−1000 = 100 → unrealised 500.
    expect(summary.unrealizedPnl).toBeCloseTo(500, 10);
    expect(summary.realizedPnl).toBeCloseTo(50, 10);
    expect(summary.totalPnl).toBeCloseTo(550, 10);
  });

  it("produces weights that sum to one", () => {
    const summary = valuePortfolio(positions, quotes);
    const total = summary.positions.reduce((sum, position) => sum + position.weight, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("computes day change from the previous close", () => {
    const summary = valuePortfolio(positions, quotes);
    // AAA moved +5 on 20 shares = +100; BBB flat.
    expect(summary.dayChange).toBeCloseTo(100, 10);
  });

  it("produces risk contributions that sum to one", () => {
    const random = new SeededRandom(8);
    const returnsBySymbol = {
      AAA: Array.from({ length: 300 }, () => 0.02 * random.nextNormal()),
      BBB: Array.from({ length: 300 }, () => 0.004 * random.nextNormal()),
    };
    const summary = valuePortfolio(positions, quotes, returnsBySymbol);
    const total = summary.positions.reduce(
      (sum, position) => sum + position.riskContribution,
      0,
    );
    expect(total).toBeCloseTo(1, 8);

    // The volatile, larger position must carry more risk than its weight alone.
    const alpha = summary.positions[0];
    expect(alpha.riskContribution).toBeGreaterThan(alpha.weight);
  });

  it("builds allocation slices whose weights sum to one", () => {
    const summary = valuePortfolio(positions, quotes);
    const slices = allocationBy(summary.positions, "assetClass");
    expect(slices).toHaveLength(2);
    expect(slices.reduce((sum, slice) => sum + slice.weight, 0)).toBeCloseTo(1, 10);
  });

  it("blends per-asset returns into a portfolio series", () => {
    const blended = portfolioReturns(
      [0.5, 0.5],
      [
        [0.02, -0.01],
        [0.0, 0.03],
      ],
    );
    expect(blended).toHaveLength(2);
    expect(blended[0]).toBeCloseTo(0.01, 10);
    expect(blended[1]).toBeCloseTo(0.01, 10);
  });
});
