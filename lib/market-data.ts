/**
 * Demo market universe.
 *
 * Every price series here is generated deterministically from a seeded GBM, so
 * the dashboard renders identically on the server and the client, and any
 * number quoted in the README can be reproduced exactly. The symbols are
 * fictitious by design — this is a modelling showcase, not a data terminal, and
 * inventing tickers avoids implying a live market data licence.
 */

import {
  generateSyntheticSeries,
  logReturns,
  quoteFromCandles,
  closingPrices,
} from "@/lib/finance-engine";
import type { Candle, Instrument, Position, Quote } from "@/types/finance";

interface UniverseEntry {
  readonly instrument: Instrument;
  readonly startPrice: number;
  readonly annualDrift: number;
  readonly annualVolatility: number;
  readonly baseVolume: number;
  readonly seed: number;
}

/** Two years of daily bars is enough for stable 252-day risk statistics. */
export const HISTORY_DAYS = 504;

export const UNIVERSE: readonly UniverseEntry[] = [
  {
    instrument: {
      symbol: "NVAX",
      name: "Novara Systems",
      assetClass: "equity",
      currency: "USD",
      sector: "Information Technology",
      dividendYield: 0.004,
    },
    startPrice: 148,
    annualDrift: 0.19,
    annualVolatility: 0.36,
    baseVolume: 4_200_000,
    seed: 10_007,
  },
  {
    instrument: {
      symbol: "HELM",
      name: "Helmsley Industrial",
      assetClass: "equity",
      currency: "USD",
      sector: "Industrials",
      dividendYield: 0.021,
    },
    startPrice: 92,
    annualDrift: 0.08,
    annualVolatility: 0.22,
    baseVolume: 1_800_000,
    seed: 20_011,
  },
  {
    instrument: {
      symbol: "CRSA",
      name: "Corsair Assurance",
      assetClass: "equity",
      currency: "USD",
      sector: "Financials",
      dividendYield: 0.034,
    },
    startPrice: 61,
    annualDrift: 0.07,
    annualVolatility: 0.19,
    baseVolume: 2_400_000,
    seed: 30_013,
  },
  {
    instrument: {
      symbol: "VERD",
      name: "Verdant Health",
      assetClass: "equity",
      currency: "USD",
      sector: "Health Care",
      dividendYield: 0.015,
    },
    startPrice: 205,
    annualDrift: 0.11,
    annualVolatility: 0.25,
    baseVolume: 1_100_000,
    seed: 40_009,
  },
  {
    instrument: {
      symbol: "GBLX",
      name: "Global Index ETF",
      assetClass: "etf",
      currency: "USD",
      sector: "Diversified",
      dividendYield: 0.018,
    },
    startPrice: 412,
    annualDrift: 0.09,
    annualVolatility: 0.16,
    baseVolume: 6_500_000,
    seed: 50_021,
  },
  {
    instrument: {
      symbol: "ORCN",
      name: "Orion Coin",
      assetClass: "crypto",
      currency: "USD",
      sector: "Digital Assets",
      dividendYield: 0,
    },
    startPrice: 2_840,
    annualDrift: 0.24,
    annualVolatility: 0.68,
    baseVolume: 320_000,
    seed: 60_017,
  },
  {
    instrument: {
      symbol: "TBND",
      name: "Treasury Bond Fund",
      assetClass: "bond",
      currency: "USD",
      sector: "Fixed Income",
      dividendYield: 0.042,
    },
    startPrice: 97,
    annualDrift: 0.03,
    annualVolatility: 0.07,
    baseVolume: 900_000,
    seed: 70_019,
  },
];

/** Full price history for every symbol, keyed by ticker. */
export const PRICE_HISTORY: Readonly<Record<string, readonly Candle[]>> = Object.fromEntries(
  UNIVERSE.map((entry) => [
    entry.instrument.symbol,
    generateSyntheticSeries({
      symbol: entry.instrument.symbol,
      startPrice: entry.startPrice,
      annualDrift: entry.annualDrift,
      annualVolatility: entry.annualVolatility,
      days: HISTORY_DAYS,
      seed: entry.seed,
      baseVolume: entry.baseVolume,
    }),
  ]),
);

/** Opening quote snapshot, before the live feed starts ticking. */
export const INITIAL_QUOTES: Readonly<Record<string, Quote>> = Object.fromEntries(
  UNIVERSE.map((entry) => [
    entry.instrument.symbol,
    quoteFromCandles(entry.instrument.symbol, PRICE_HISTORY[entry.instrument.symbol]),
  ]),
);

/** Daily log returns per symbol — the input to every risk statistic. */
export const RETURNS_BY_SYMBOL: Readonly<Record<string, readonly number[]>> = Object.fromEntries(
  UNIVERSE.map((entry) => [
    entry.instrument.symbol,
    logReturns(closingPrices(PRICE_HISTORY[entry.instrument.symbol])),
  ]),
);

const DAY_MS = 24 * 60 * 60 * 1000;
const ANCHOR = Date.UTC(2026, 6, 31);

/**
 * The demo book.
 *
 * Multiple lots per position are deliberate: it means average cost has to be
 * computed as a quantity-weighted figure rather than read off a single field,
 * which is how a real tax-lot ledger behaves.
 */
export const DEMO_POSITIONS: readonly Position[] = [
  {
    instrument: UNIVERSE[0].instrument,
    realizedPnl: 4_180.25,
    lots: [
      { id: "nvax-1", acquiredAt: ANCHOR - 430 * DAY_MS, quantity: 120, costBasis: 151.4 },
      { id: "nvax-2", acquiredAt: ANCHOR - 190 * DAY_MS, quantity: 80, costBasis: 178.9 },
    ],
  },
  {
    instrument: UNIVERSE[1].instrument,
    realizedPnl: -620.5,
    lots: [{ id: "helm-1", acquiredAt: ANCHOR - 365 * DAY_MS, quantity: 260, costBasis: 88.15 }],
  },
  {
    instrument: UNIVERSE[2].instrument,
    realizedPnl: 1_275,
    lots: [
      { id: "crsa-1", acquiredAt: ANCHOR - 480 * DAY_MS, quantity: 300, costBasis: 58.2 },
      { id: "crsa-2", acquiredAt: ANCHOR - 95 * DAY_MS, quantity: 150, costBasis: 66.75 },
    ],
  },
  {
    instrument: UNIVERSE[3].instrument,
    realizedPnl: 0,
    lots: [{ id: "verd-1", acquiredAt: ANCHOR - 240 * DAY_MS, quantity: 45, costBasis: 214.6 }],
  },
  {
    instrument: UNIVERSE[4].instrument,
    realizedPnl: 2_940.75,
    lots: [
      { id: "gblx-1", acquiredAt: ANCHOR - 500 * DAY_MS, quantity: 60, costBasis: 398.4 },
      { id: "gblx-2", acquiredAt: ANCHOR - 120 * DAY_MS, quantity: 25, costBasis: 441.2 },
    ],
  },
  {
    instrument: UNIVERSE[5].instrument,
    realizedPnl: -1_840,
    lots: [{ id: "orcn-1", acquiredAt: ANCHOR - 300 * DAY_MS, quantity: 3.5, costBasis: 3_120 }],
  },
  {
    instrument: UNIVERSE[6].instrument,
    realizedPnl: 310.4,
    lots: [{ id: "tbnd-1", acquiredAt: ANCHOR - 420 * DAY_MS, quantity: 400, costBasis: 95.8 }],
  },
];

/** Symbols the live feed subscribes to. */
export const FEED_SYMBOLS: readonly string[] = UNIVERSE.map((entry) => entry.instrument.symbol);

export const FEED_VOLATILITY: Readonly<Record<string, number>> = Object.fromEntries(
  UNIVERSE.map((entry) => [entry.instrument.symbol, entry.annualVolatility]),
);

export const FEED_DRIFT: Readonly<Record<string, number>> = Object.fromEntries(
  UNIVERSE.map((entry) => [entry.instrument.symbol, entry.annualDrift]),
);

export const INITIAL_PRICES: Readonly<Record<string, number>> = Object.fromEntries(
  UNIVERSE.map((entry) => [entry.instrument.symbol, INITIAL_QUOTES[entry.instrument.symbol].price]),
);

/** Look up an instrument by ticker. */
export function findInstrument(symbol: string): Instrument | null {
  return UNIVERSE.find((entry) => entry.instrument.symbol === symbol)?.instrument ?? null;
}
