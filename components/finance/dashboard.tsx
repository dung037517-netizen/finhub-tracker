"use client";

import { motion } from "framer-motion";
import { Pause, Play, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import * as React from "react";

import { MarketChart } from "@/components/finance/market-chart";
import { PortfolioTable } from "@/components/finance/portfolio-table";
import { RiskDashboard } from "@/components/finance/risk-dashboard";
import { SiteHeader } from "@/components/site/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatCurrency,
  formatSignedPercent,
  portfolioReturns,
  valuePortfolio,
} from "@/lib/finance-engine";
import {
  DEMO_POSITIONS,
  FEED_DRIFT,
  FEED_SYMBOLS,
  FEED_VOLATILITY,
  INITIAL_PRICES,
  INITIAL_QUOTES,
  PRICE_HISTORY,
  RETURNS_BY_SYMBOL,
  UNIVERSE,
} from "@/lib/market-data";
import { useMarketFeed } from "@/lib/use-market-feed";
import { cn } from "@/lib/utils";

const FEED_INTERVAL_MS = 450;
const FEED_SEED = 20_260_801;

const SYMBOL_OPTIONS = UNIVERSE.map((entry) => ({
  symbol: entry.instrument.symbol,
  name: entry.instrument.name,
}));

interface SummaryTileProps {
  label: string;
  value: string;
  delta?: string;
  positive?: boolean;
  hint?: string;
}

function SummaryTile({ label, value, delta, positive, hint }: SummaryTileProps) {
  return (
    <Card className="bg-surface">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="numeric mt-1.5 text-2xl font-semibold tabular-nums">{value}</p>
        {delta !== undefined && (
          <p
            className={cn(
              "numeric mt-1 flex items-center gap-1 text-sm",
              positive === true ? "text-gain" : positive === false ? "text-loss" : "text-muted-foreground",
            )}
          >
            {positive === true ? (
              <TrendingUp className="size-3.5" aria-hidden />
            ) : positive === false ? (
              <TrendingDown className="size-3.5" aria-hidden />
            ) : null}
            {delta}
          </p>
        )}
        {hint !== undefined && (
          <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The live dashboard.
 *
 * State flows one way: the simulated socket produces quotes, quotes drive the
 * portfolio valuation, and the valuation drives every panel below. Nothing
 * derived is stored — it is all recomputed from the quote snapshot, which is
 * why the numbers can never disagree with each other.
 */
export function Dashboard() {
  const [selectedSymbol, setSelectedSymbol] = React.useState(SYMBOL_OPTIONS[0].symbol);
  const [feedEnabled, setFeedEnabled] = React.useState(true);

  const feed = useMarketFeed({
    symbols: FEED_SYMBOLS,
    intervalMs: FEED_INTERVAL_MS,
    volatility: FEED_VOLATILITY,
    drift: FEED_DRIFT,
    seed: FEED_SEED,
    initialPrices: INITIAL_PRICES,
    initialQuotes: INITIAL_QUOTES,
    enabled: feedEnabled,
  });

  const portfolio = React.useMemo(
    () => valuePortfolio(DEMO_POSITIONS, feed.quotes, RETURNS_BY_SYMBOL),
    [feed.quotes],
  );

  // Portfolio weights move only marginally intraday, so the blended return
  // series is rebuilt on a rounded weight key rather than on every tick. That
  // keeps a 500-session × 7-asset blend off the animation-frame critical path.
  const weightKey = portfolio.positions
    .map((position) => position.weight.toFixed(4))
    .join("|");

  const blendedReturns = React.useMemo(() => {
    const weights = weightKey.split("|").map(Number);
    const series = portfolio.positions.map(
      (position) => RETURNS_BY_SYMBOL[position.symbol] ?? [],
    );
    return portfolioReturns(weights, series);
    // `portfolio.positions` is re-derived every tick but its symbol order is
    // fixed, so the weight key is the only input that can change the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weightKey]);

  const selectedQuote = feed.quotes[selectedSymbol] ?? INITIAL_QUOTES[selectedSymbol];
  const selectedCandles = PRICE_HISTORY[selectedSymbol];
  const selectedName =
    SYMBOL_OPTIONS.find((option) => option.symbol === selectedSymbol)?.name ?? selectedSymbol;

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader feedStatus={feed.status} tickCount={feed.tickCount} />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 aurora" aria-hidden />
        <div className="pointer-events-none absolute inset-0 grid-backdrop" aria-hidden />

        <div className="relative mx-auto max-w-[1500px] px-4 py-12 sm:px-6 sm:py-16">
          <div className="max-w-3xl">
            <Badge variant="outline" className="mb-4">
              <Wallet className="size-3" aria-hidden />
              Quantitative risk analytics
            </Badge>
            <h1 className="text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Portfolio risk, priced from{" "}
              <span className="text-gradient">first principles</span>
            </h1>
            <p className="mt-5 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
              Value at Risk by four estimation methods, Black-Scholes option pricing with a full
              Greek surface, and a streaming market feed — every figure computed in the browser by
              a typed engine with no financial libraries behind it.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryTile
              label="Market value"
              value={formatCurrency(portfolio.marketValue, "USD", true)}
              delta={`${formatCurrency(portfolio.dayChange)} today`}
              positive={portfolio.dayChange >= 0}
              hint={`${portfolio.positions.length} holdings across ${
                new Set(portfolio.positions.map((position) => position.assetClass)).size
              } asset classes.`}
            />
            <SummaryTile
              label="Total P&L"
              value={formatCurrency(portfolio.totalPnl, "USD", true)}
              delta={formatSignedPercent(portfolio.totalPnlPercent)}
              positive={portfolio.totalPnl >= 0}
              hint="Unrealised plus realised, against a weighted-average cost basis."
            />
            <SummaryTile
              label="Unrealised"
              value={formatCurrency(portfolio.unrealizedPnl, "USD", true)}
              positive={portfolio.unrealizedPnl >= 0}
              hint="Mark-to-market on open lots only."
            />
            <SummaryTile
              label="Realised"
              value={formatCurrency(portfolio.realizedPnl, "USD", true)}
              positive={portfolio.realizedPnl >= 0}
              hint="Booked from closed lots; unaffected by live prices."
            />
          </div>
        </div>
      </section>

      {/* Market chart */}
      <section id="markets" className="mx-auto max-w-[1500px] scroll-mt-20 px-4 py-10 sm:px-6">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Markets</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Two years of daily bars with moving averages, Bollinger bands and Wilder&apos;s RSI.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFeedEnabled((current) => !current)}
          >
            {feedEnabled ? <Pause /> : <Play />}
            {feedEnabled ? "Pause the feed" : "Resume the feed"}
          </Button>
        </header>

        <MarketChart
          symbol={selectedSymbol}
          name={selectedName}
          candles={selectedCandles}
          quote={selectedQuote}
          symbols={SYMBOL_OPTIONS}
          onSymbolChange={setSelectedSymbol}
        />
      </section>

      {/* Risk analytics */}
      <section id="risk" className="mx-auto max-w-[1500px] scroll-mt-20 px-4 pb-10 sm:px-6">
        <header className="mb-5">
          <h2 className="text-xl font-semibold tracking-tight">Risk</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The same engine that the 49-case test suite pins against textbook values.
          </p>
        </header>

        <RiskDashboard
          portfolio={portfolio}
          returns={blendedReturns}
          optionSpot={selectedQuote.price}
        />
      </section>

      {/* Holdings */}
      <section id="holdings" className="mx-auto max-w-[1500px] scroll-mt-20 px-4 pb-16 sm:px-6">
        <header className="mb-5">
          <h2 className="text-xl font-semibold tracking-tight">Holdings</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Live marks, tax-lot cost basis, and each position&apos;s share of portfolio variance.
          </p>
        </header>

        <Card>
          <CardHeader className="border-b border-border">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <CardTitle>Positions</CardTitle>
                <CardDescription>
                  Prices flash as the feed ticks; the risk column is computed from the covariance
                  matrix, not from position size.
                </CardDescription>
              </div>
              {feed.lastUpdate !== null && (
                <motion.span
                  key={feed.tickCount}
                  initial={{ opacity: 0.4 }}
                  animate={{ opacity: 1 }}
                  className="numeric shrink-0 text-xs text-muted-foreground"
                >
                  updated {new Date(feed.lastUpdate).toLocaleTimeString("en-US")}
                </motion.span>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <PortfolioTable positions={portfolio.positions} />
          </CardContent>
        </Card>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            FinHub Tracker — synthetic market data, real quantitative methods. Not investment
            advice.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <a
              href="https://github.com/dung037517-netizen/financeflow"
              target="_blank"
              rel="noreferrer noopener"
              className="transition-colors hover:text-foreground"
            >
              Source
            </a>
            <a
              href="https://mathforge-blush.vercel.app"
              target="_blank"
              rel="noreferrer noopener"
              className="transition-colors hover:text-foreground"
            >
              MathForge →
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
