"use client";

import { motion } from "framer-motion";
import { FlaskConical, Pause, Play, TrendingDown, TrendingUp } from "lucide-react";
import * as React from "react";

import { MarketChart } from "@/components/finance/market-chart";
import { PortfolioTable } from "@/components/finance/portfolio-table";
import { RiskDashboard } from "@/components/finance/risk-dashboard";
import { PageHeading, PageShell } from "@/components/site/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatSignedPercent, portfolioReturns, valuePortfolio } from "@/lib/finance-engine";
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
import type { FeedStatus } from "@/types/finance";

const FEED_INTERVAL_MS = 450;
const FEED_SEED = 20_260_801;

const SYMBOL_OPTIONS = UNIVERSE.map((entry) => ({
  symbol: entry.instrument.symbol,
  name: entry.instrument.name,
}));

const STATUS_LABEL: Readonly<Record<FeedStatus, string>> = {
  connecting: "Starting",
  open: "Simulated feed running",
  closed: "Simulated feed paused",
  error: "Feed error",
};

const STATUS_TONE: Readonly<Record<FeedStatus, string>> = {
  connecting: "bg-warning",
  open: "bg-gain",
  closed: "bg-muted-foreground",
  error: "bg-loss",
};

interface SummaryTileProps {
  readonly label: string;
  readonly value: string;
  readonly delta?: string;
  readonly positive?: boolean;
  readonly hint?: string;
}

function SummaryTile({ label, value, delta, positive, hint }: SummaryTileProps) {
  return (
    <Card className="bg-surface">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="numeric mt-1.5 text-2xl font-semibold tabular-nums">{value}</p>
        {delta !== undefined ? (
          <p
            className={cn(
              "numeric mt-1 flex items-center gap-1 text-sm",
              positive === true ? "text-gain" : positive === false ? "text-loss" : "text-muted-foreground",
            )}
          >
            {positive === true ? <TrendingUp className="size-3.5" aria-hidden /> : positive === false ? <TrendingDown className="size-3.5" aria-hidden /> : null}
            {delta}
          </p>
        ) : null}
        {hint !== undefined ? <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

/**
 * The market laboratory: a made-up portfolio on a simulated price feed, used
 * to exercise the risk engine. Nothing here is real market data, and the page
 * says so before anything else.
 *
 * State flows one way: the simulated feed produces quotes, quotes drive the
 * portfolio valuation, and the valuation drives every panel below.
 */
export function LabPage() {
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

  // Portfolio weights move only marginally from tick to tick, so the blended
  // return series is rebuilt on a rounded weight key rather than on every tick.
  const weightKey = portfolio.positions.map((position) => position.weight.toFixed(4)).join("|");

  const blendedReturns = React.useMemo(() => {
    const weights = weightKey.split("|").map(Number);
    const series = portfolio.positions.map((position) => RETURNS_BY_SYMBOL[position.symbol] ?? []);
    return portfolioReturns(weights, series);
    // `portfolio.positions` is re-derived every tick but its symbol order is
    // fixed, so the weight key is the only input that can change the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weightKey]);

  const selectedQuote = feed.quotes[selectedSymbol] ?? INITIAL_QUOTES[selectedSymbol];
  const selectedCandles = PRICE_HISTORY[selectedSymbol];
  const selectedName = SYMBOL_OPTIONS.find((option) => option.symbol === selectedSymbol)?.name ?? selectedSymbol;

  const status = (
    <Badge variant="outline" className="hidden gap-1.5 sm:inline-flex" aria-live="polite">
      <span className={cn("size-1.5 rounded-full", STATUS_TONE[feed.status], feed.status === "open" && "animate-pulse")} aria-hidden />
      {STATUS_LABEL[feed.status]}
    </Badge>
  );

  return (
    <PageShell width="wide" status={status}>
      <PageHeading
        title="Market lab"
        description="A sandbox for the risk engine behind the college funding model: Value at Risk four ways, Black-Scholes with its Greeks, and technical indicators."
      >
        <Button type="button" variant="outline" onClick={() => setFeedEnabled((current) => !current)}>
          {feedEnabled ? <Pause /> : <Play />}
          {feedEnabled ? "Pause the feed" : "Resume the feed"}
        </Button>
      </PageHeading>

      <div role="note" className="mb-8 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <p>
          <strong className="font-semibold">Everything on this page is simulated.</strong> The portfolio is invented
          and the prices come from a seeded random process, not from any market. It exists to test and demonstrate the
          calculations, and nothing here is investment advice.
        </p>
      </div>

      <div className="mb-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          label="Simulated market value"
          value={formatCurrency(portfolio.marketValue, "USD", true)}
          delta={`${formatCurrency(portfolio.dayChange)} this session`}
          positive={portfolio.dayChange >= 0}
          hint={`${portfolio.positions.length} holdings across ${new Set(portfolio.positions.map((position) => position.assetClass)).size} asset classes.`}
        />
        <SummaryTile
          label="Total P&L"
          value={formatCurrency(portfolio.totalPnl, "USD", true)}
          delta={formatSignedPercent(portfolio.totalPnlPercent)}
          positive={portfolio.totalPnl >= 0}
          hint="Unrealized plus realized, against a weighted-average cost basis."
        />
        <SummaryTile
          label="Unrealized"
          value={formatCurrency(portfolio.unrealizedPnl, "USD", true)}
          positive={portfolio.unrealizedPnl >= 0}
          hint="Mark-to-market on open lots only."
        />
        <SummaryTile
          label="Realized"
          value={formatCurrency(portfolio.realizedPnl, "USD", true)}
          positive={portfolio.realizedPnl >= 0}
          hint="Booked from closed lots; unaffected by the feed."
        />
      </div>

      <section id="markets" className="scroll-mt-28 pb-10">
        <header className="mb-5">
          <h2 className="text-xl font-semibold tracking-tight">Markets</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Two years of generated daily bars with moving averages, Bollinger bands and Wilder&apos;s RSI.
          </p>
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

      <section id="risk" className="scroll-mt-28 pb-10">
        <header className="mb-5">
          <h2 className="text-xl font-semibold tracking-tight">Risk</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The same engine that the test suite pins against textbook values.
          </p>
        </header>
        <RiskDashboard portfolio={portfolio} returns={blendedReturns} optionSpot={selectedQuote.price} />
      </section>

      <section id="holdings" className="scroll-mt-28">
        <header className="mb-5">
          <h2 className="text-xl font-semibold tracking-tight">Holdings</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Simulated marks, tax-lot cost basis, and each position&apos;s share of portfolio variance.
          </p>
        </header>
        <Card>
          <CardHeader className="border-b border-border">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <CardTitle>Positions</CardTitle>
                <CardDescription>
                  Prices flash as the simulated feed ticks; the risk column is computed from the covariance matrix,
                  not from position size.
                </CardDescription>
              </div>
              {feed.lastUpdate !== null ? (
                <motion.span
                  key={feed.tickCount}
                  initial={{ opacity: 0.4 }}
                  animate={{ opacity: 1 }}
                  className="numeric shrink-0 text-xs text-muted-foreground"
                >
                  {feed.tickCount.toLocaleString("en-US")} simulated ticks
                </motion.span>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <PortfolioTable positions={portfolio.positions} />
          </CardContent>
        </Card>
      </section>
    </PageShell>
  );
}
