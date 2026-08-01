"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  Calculator,
  PieChart as PieChartIcon,
  ShieldAlert,
  TrendingDown,
} from "lucide-react";
import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartTooltip } from "@/components/finance/chart-tooltip";
import { Latex } from "@/components/finance/latex";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  VAR_METHOD_DESCRIPTIONS,
  VAR_METHOD_LABELS,
  allocationBy,
  computeRiskMeasure,
  describeReturns,
  drawdownSeries,
  formatCurrency,
  formatPercent,
  formatSignedPercent,
  impliedVolatility,
  optionPayoffCurve,
  performanceMetrics,
  priceOption,
  putCallParityResidual,
  returnHistogram,
  strikeLadder,
} from "@/lib/finance-engine";
import { cn } from "@/lib/utils";
import type {
  OptionContract,
  OptionType,
  PortfolioSummary,
  VarMethod,
} from "@/types/finance";

const VAR_METHODS: readonly VarMethod[] = [
  "historical",
  "parametric",
  "cornish-fisher",
  "monte-carlo",
];

/* ------------------------------------------------------------------ */
/* Shared controls                                                     */
/* ------------------------------------------------------------------ */

interface RiskSliderProps {
  id: string;
  label: string;
  latex?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format: (value: number) => string;
  hint?: string;
}

function RiskSlider({
  id,
  label,
  latex,
  value,
  min,
  max,
  step,
  onChange,
  format,
  hint,
}: RiskSliderProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id} className="flex items-center gap-1.5 normal-case tracking-normal">
          {latex !== undefined && <Latex className="text-sm text-foreground">{latex}</Latex>}
          <span>{label}</span>
        </Label>
        <span className="numeric text-sm font-medium">{format(value)}</span>
      </div>
      <Slider
        id={id}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([next]) => onChange(next)}
        aria-label={label}
      />
      {hint !== undefined && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "gain" | "loss" | "warning";
  latex?: string;
}

function MetricCard({ label, value, hint, tone = "default", latex }: MetricCardProps) {
  return (
    <motion.div
      layout
      className="rounded-lg border border-border bg-surface px-3.5 py-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">{label}</span>
        {latex !== undefined && <Latex className="shrink-0 text-xs text-primary">{latex}</Latex>}
      </div>
      <p
        className={cn(
          "numeric mt-1 text-lg font-semibold",
          tone === "gain" && "text-gain",
          tone === "loss" && "text-loss",
          tone === "warning" && "text-warning",
        )}
      >
        {value}
      </p>
      {hint !== undefined && (
        <p className="mt-1 text-[0.7rem] leading-snug text-muted-foreground">{hint}</p>
      )}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Value at Risk panel                                                 */
/* ------------------------------------------------------------------ */

interface VarPanelProps {
  returns: readonly number[];
  portfolioValue: number;
}

function VarPanel({ returns, portfolioValue }: VarPanelProps) {
  const [method, setMethod] = React.useState<VarMethod>("historical");
  const [confidence, setConfidence] = React.useState(0.99);
  const [horizonDays, setHorizonDays] = React.useState(1);

  const measure = React.useMemo(
    () => computeRiskMeasure(returns, method, confidence, portfolioValue, horizonDays),
    [returns, method, confidence, portfolioValue, horizonDays],
  );

  const comparison = React.useMemo(
    () =>
      VAR_METHODS.map((candidate) =>
        computeRiskMeasure(returns, candidate, confidence, portfolioValue, horizonDays),
      ),
    [returns, confidence, portfolioValue, horizonDays],
  );

  const histogram = React.useMemo(
    // The histogram shows the one-day distribution, so compare it against the
    // unscaled VaR rather than the horizon-scaled figure.
    () => returnHistogram(returns, measure.valueAtRisk / Math.sqrt(Math.max(1, horizonDays)), 44),
    [returns, measure.valueAtRisk, horizonDays],
  );

  const statistics = React.useMemo(() => describeReturns(returns), [returns]);
  const metrics = React.useMemo(() => performanceMetrics(returns), [returns]);

  const drawdowns = React.useMemo(
    () => drawdownSeries(returns, returns.map((_, index) => index)),
    [returns],
  );

  const oneDayVar = measure.valueAtRisk / Math.sqrt(Math.max(1, horizonDays));

  const histogramData = histogram.map((bin) => ({
    midpoint: (bin.start + bin.end) / 2,
    count: bin.count,
    isTail: bin.isTail,
  }));

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_290px]">
      <div className="order-2 space-y-5 lg:order-1">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label={`VaR ${formatPercent(confidence, 0)}`}
            latex="\mathrm{VaR}_\alpha"
            value={formatCurrency(measure.valueAtRiskAmount, "USD", true)}
            hint={`${formatPercent(measure.valueAtRisk)} of the book over ${horizonDays} day${horizonDays === 1 ? "" : "s"}.`}
            tone="loss"
          />
          <MetricCard
            label={`Tail VaR ${formatPercent(confidence, 0)}`}
            latex="\mathrm{TVaR}_\alpha"
            value={formatCurrency(measure.tailValueAtRiskAmount, "USD", true)}
            hint="Mean loss conditional on breaching VaR — the coherent measure."
            tone="loss"
          />
          <MetricCard
            label="Max drawdown"
            value={formatPercent(metrics.maxDrawdown)}
            hint={`Deepest peak-to-trough decline, lasting ${metrics.maxDrawdownDuration} sessions.`}
            tone="warning"
          />
          <MetricCard
            label="Annualised volatility"
            latex="\sigma_{\mathrm{ann}}"
            value={formatPercent(statistics.annualizedVolatility)}
            hint={`Daily σ ${formatPercent(statistics.volatility)} × √252.`}
          />
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-medium">Return distribution and the loss tail</h4>
            <Badge variant="outline">{statistics.observations} daily observations</Badge>
          </div>

          <div className="h-64 w-full" aria-label="Histogram of daily returns with the VaR tail">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histogramData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="midpoint"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                  tickFormatter={(value: number) => `${(value * 100).toFixed(1)}%`}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                  width={44}
                />
                <Tooltip
                  content={
                    <ChartTooltip
                      decimals={0}
                      labelFormatter={(value) =>
                        typeof value === "number" ? `return ${(value * 100).toFixed(2)}%` : ""
                      }
                    />
                  }
                  cursor={{ fill: "var(--secondary)", opacity: 0.35 }}
                />
                <Bar dataKey="count" name="sessions" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                  {histogramData.map((bin, index) => (
                    <Cell
                      key={index}
                      fill={bin.isTail ? "var(--loss)" : "var(--chart-1)"}
                      fillOpacity={bin.isTail ? 0.9 : 0.65}
                    />
                  ))}
                </Bar>
                <ReferenceLine
                  x={-oneDayVar}
                  stroke="var(--loss)"
                  strokeWidth={2}
                  label={{
                    value: "VaR",
                    fill: "var(--loss)",
                    fontSize: 10,
                    position: "top",
                  }}
                />
                <ReferenceLine
                  x={-measure.tailValueAtRisk / Math.sqrt(Math.max(1, horizonDays))}
                  stroke="var(--warning)"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  label={{
                    value: "TVaR",
                    fill: "var(--warning)",
                    fontSize: 10,
                    position: "top",
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {VAR_METHOD_DESCRIPTIONS[method]}
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface p-4">
            <h4 className="mb-3 text-sm font-medium">Method comparison</h4>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Value at Risk and Tail VaR by estimation method
                </caption>
                <thead>
                  <tr className="border-b border-border text-left">
                    <th scope="col" className="pb-2 text-xs font-medium text-muted-foreground">
                      Method
                    </th>
                    <th scope="col" className="pb-2 text-right text-xs font-medium text-muted-foreground">
                      VaR
                    </th>
                    <th scope="col" className="pb-2 text-right text-xs font-medium text-muted-foreground">
                      TVaR
                    </th>
                    <th scope="col" className="pb-2 text-right text-xs font-medium text-muted-foreground">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((entry) => (
                    <tr
                      key={entry.method}
                      className={cn(
                        "border-b border-border/60 last:border-0",
                        entry.method === method && "bg-primary/5",
                      )}
                    >
                      <th scope="row" className="py-2 text-left font-normal">
                        <button
                          type="button"
                          onClick={() => setMethod(entry.method)}
                          className={cn(
                            "rounded px-1 text-left transition-colors hover:text-primary",
                            entry.method === method && "font-medium text-primary",
                          )}
                        >
                          {VAR_METHOD_LABELS[entry.method]}
                        </button>
                      </th>
                      <td className="numeric py-2 text-right">
                        {formatPercent(entry.valueAtRisk)}
                      </td>
                      <td className="numeric py-2 text-right">
                        {formatPercent(entry.tailValueAtRisk)}
                      </td>
                      <td className="numeric py-2 text-right text-loss">
                        {formatCurrency(entry.valueAtRiskAmount, "USD", true)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Skewness {statistics.skewness.toFixed(2)}, excess kurtosis{" "}
              {statistics.excessKurtosis.toFixed(2)}. The further these sit from zero, the more the
              parametric figure understates the tail — which is precisely the gap Cornish-Fisher
              closes.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-surface p-4">
            <h4 className="mb-3 text-sm font-medium">Underwater curve</h4>
            <div className="h-56 w-full" aria-label="Drawdown from the running peak">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={drawdowns} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                  <defs>
                    <linearGradient id="drawdown-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--loss)" stopOpacity={0.05} />
                      <stop offset="100%" stopColor="var(--loss)" stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="time" hide />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    stroke="var(--border)"
                    width={48}
                    tickFormatter={(value: number) => `${(value * 100).toFixed(0)}%`}
                  />
                  <Tooltip
                    content={
                      <ChartTooltip
                        decimals={4}
                        labelFormatter={(value) => `session ${String(value ?? "")}`}
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="drawdown"
                    name="Drawdown"
                    stroke="var(--loss)"
                    strokeWidth={1.5}
                    fill="url(#drawdown-fill)"
                    dot={false}
                    isAnimationActive={false}
                  />
                  <ReferenceLine y={0} stroke="var(--muted-foreground)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Sharpe</dt>
                <dd className="numeric font-medium">{metrics.sharpeRatio.toFixed(2)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Sortino</dt>
                <dd className="numeric font-medium">{metrics.sortinoRatio.toFixed(2)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Calmar</dt>
                <dd className="numeric font-medium">{metrics.calmarRatio.toFixed(2)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <div className="order-1 space-y-4 lg:order-2">
        <div className="space-y-1.5">
          <Label htmlFor="var-method">Estimation method</Label>
          <Select value={method} onValueChange={(value) => setMethod(value as VarMethod)}>
            <SelectTrigger id="var-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VAR_METHODS.map((candidate) => (
                <SelectItem key={candidate} value={candidate}>
                  {VAR_METHOD_LABELS[candidate]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
          <RiskSlider
            id="var-confidence"
            label="confidence"
            latex="\alpha"
            value={confidence}
            min={0.9}
            max={0.995}
            step={0.005}
            onChange={setConfidence}
            format={(value) => formatPercent(value, 1)}
            hint="The probability that the realised loss stays within VaR."
          />
          <RiskSlider
            id="var-horizon"
            label="horizon (trading days)"
            latex="h"
            value={horizonDays}
            min={1}
            max={20}
            step={1}
            onChange={(value) => setHorizonDays(Math.round(value))}
            format={(value) => String(Math.round(value))}
            hint="Scaled by √h, which assumes returns are serially independent."
          />
        </div>

        <div className="rounded-lg border border-border bg-surface-sunken p-4">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Definition</p>
          <Latex display className="text-xs">
            {"\\mathrm{VaR}_\\alpha = -\\inf\\{\\,x : P(R \\le x) > 1-\\alpha\\,\\}"}
          </Latex>
          <Latex display className="mt-2 text-xs">
            {"\\mathrm{TVaR}_\\alpha = -\\mathbb{E}\\!\\left[R \\mid R \\le -\\mathrm{VaR}_\\alpha\\right]"}
          </Latex>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            TVaR is subadditive and therefore coherent; VaR is not, which is why Solvency II and
            the Swiss Solvency Test are built on the expected shortfall instead.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Options panel                                                       */
/* ------------------------------------------------------------------ */

function OptionsPanel({ defaultSpot }: { defaultSpot: number }) {
  const [type, setType] = React.useState<OptionType>("call");
  const [spot, setSpot] = React.useState(defaultSpot);
  const [strike, setStrike] = React.useState(Math.round(defaultSpot));
  const [timeToExpiry, setTimeToExpiry] = React.useState(0.5);
  const [riskFreeRate, setRiskFreeRate] = React.useState(0.045);
  const [volatility, setVolatility] = React.useState(0.28);
  const [dividendYield, setDividendYield] = React.useState(0.01);
  const [marketQuote, setMarketQuote] = React.useState("");

  // A single memoised contract object is the one input every derived figure
  // below depends on, which keeps their dependency arrays honest.
  const contract = React.useMemo<OptionContract>(
    () => ({
      symbol: "OPT",
      type,
      style: "european",
      spot,
      strike,
      timeToExpiry,
      riskFreeRate,
      volatility,
      dividendYield,
    }),
    [type, spot, strike, timeToExpiry, riskFreeRate, volatility, dividendYield],
  );

  const priced = React.useMemo(() => priceOption(contract), [contract]);

  const parityResidual = React.useMemo(() => putCallParityResidual(contract), [contract]);

  const payoff = React.useMemo(
    () => (priced.ok ? optionPayoffCurve(contract, priced.value.price, 120) : []),
    [contract, priced],
  );

  const ladder = React.useMemo(() => {
    const strikes = Array.from({ length: 11 }, (_, i) => Math.round(spot * (0.75 + i * 0.05)));
    return strikeLadder(contract, strikes);
  }, [contract, spot]);

  const impliedResult = React.useMemo(() => {
    const parsed = Number.parseFloat(marketQuote);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    const { volatility: _omit, ...withoutVol } = contract;
    void _omit;
    return impliedVolatility(withoutVol, parsed);
  }, [contract, marketQuote]);

  if (!priced.ok) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>{priced.error.message}</p>
      </div>
    );
  }

  const pricing = priced.value;
  const greeks = pricing.greeks;

  return (
    <div className="grid gap-5 lg:grid-cols-[290px_minmax(0,1fr)]">
      <div className="space-y-4">
        <div
          className="flex rounded-md border border-border p-0.5"
          role="group"
          aria-label="Option type"
        >
          {(["call", "put"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setType(option)}
              aria-pressed={type === option}
              className={cn(
                "flex-1 rounded px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                type === option
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {option}
            </button>
          ))}
        </div>

        <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
          <RiskSlider
            id="opt-spot"
            label="spot"
            latex="S"
            value={spot}
            min={Math.max(1, defaultSpot * 0.4)}
            max={defaultSpot * 1.8}
            step={0.5}
            onChange={setSpot}
            format={(value) => formatCurrency(value)}
          />
          <RiskSlider
            id="opt-strike"
            label="strike"
            latex="K"
            value={strike}
            min={Math.max(1, defaultSpot * 0.4)}
            max={defaultSpot * 1.8}
            step={0.5}
            onChange={setStrike}
            format={(value) => formatCurrency(value)}
          />
          <RiskSlider
            id="opt-tau"
            label="time to expiry (years)"
            latex="T"
            value={timeToExpiry}
            min={0.02}
            max={3}
            step={0.02}
            onChange={setTimeToExpiry}
            format={(value) => `${value.toFixed(2)} yr`}
          />
          <RiskSlider
            id="opt-vol"
            label="volatility"
            latex="\sigma"
            value={volatility}
            min={0.02}
            max={1.5}
            step={0.01}
            onChange={setVolatility}
            format={(value) => formatPercent(value, 1)}
          />
          <RiskSlider
            id="opt-rate"
            label="risk-free rate"
            latex="r"
            value={riskFreeRate}
            min={0}
            max={0.12}
            step={0.0025}
            onChange={setRiskFreeRate}
            format={(value) => formatPercent(value, 2)}
          />
          <RiskSlider
            id="opt-div"
            label="dividend yield"
            latex="q"
            value={dividendYield}
            min={0}
            max={0.08}
            step={0.0025}
            onChange={setDividendYield}
            format={(value) => formatPercent(value, 2)}
          />
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-surface p-4">
          <Label htmlFor="opt-market">Solve for implied volatility</Label>
          <Input
            id="opt-market"
            value={marketQuote}
            onChange={(event) => setMarketQuote(event.target.value)}
            placeholder="Enter a market premium"
            inputMode="decimal"
            className="numeric"
          />
          {impliedResult !== null && (
            <p
              className={cn(
                "text-xs leading-relaxed",
                impliedResult.ok ? "text-muted-foreground" : "text-destructive",
              )}
            >
              {impliedResult.ok ? (
                <>
                  Implied σ ={" "}
                  <span className="numeric font-medium text-primary">
                    {formatPercent(impliedResult.value, 2)}
                  </span>{" "}
                  — recovered by a bracketed Newton-Raphson solve on vega.
                </>
              ) : (
                impliedResult.error.message
              )}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-surface-sunken px-4 py-3">
          <Latex display className="text-xs">
            {type === "call"
              ? "C = S e^{-qT} N(d_1) - K e^{-rT} N(d_2), \\quad d_{1} = \\frac{\\ln(S/K) + (r - q + \\sigma^2/2)T}{\\sigma\\sqrt{T}}"
              : "P = K e^{-rT} N(-d_2) - S e^{-qT} N(-d_1), \\quad d_{2} = d_1 - \\sigma\\sqrt{T}"}
          </Latex>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Theoretical price"
            value={formatCurrency(pricing.price)}
            hint={`Intrinsic ${formatCurrency(pricing.intrinsicValue)} + time ${formatCurrency(pricing.timeValue)}.`}
          />
          <MetricCard
            label="Probability ITM"
            latex="N(d_2)"
            value={formatPercent(pricing.probabilityItm)}
            hint="Risk-neutral, not real-world — it prices the option, it does not forecast."
          />
          <MetricCard
            label="Break-even at expiry"
            value={formatCurrency(pricing.breakEven)}
            hint="Underlying level at which the premium is recovered."
          />
          <MetricCard
            label="Put-call parity residual"
            value={parityResidual.toExponential(2)}
            hint="C − P − Se^(−qT) + Ke^(−rT); must be zero to machine precision."
            tone={Math.abs(parityResidual) < 1e-8 ? "gain" : "warning"}
          />
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <h4 className="mb-3 text-sm font-medium">Greeks</h4>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(
              [
                {
                  label: "Delta",
                  latex: "\\Delta",
                  value: greeks.delta.toFixed(4),
                  hint: "∂V/∂S — shares of the underlying to hedge one contract.",
                },
                {
                  label: "Gamma",
                  latex: "\\Gamma",
                  value: greeks.gamma.toFixed(5),
                  hint: "∂²V/∂S² — how fast the hedge goes stale.",
                },
                {
                  label: "Vega",
                  latex: "\\nu",
                  value: greeks.vega.toFixed(4),
                  hint: "Per 1 point of volatility.",
                },
                {
                  label: "Theta",
                  latex: "\\Theta",
                  value: greeks.theta.toFixed(4),
                  hint: "Per calendar day of decay.",
                },
                {
                  label: "Rho",
                  latex: "\\rho",
                  value: greeks.rho.toFixed(4),
                  hint: "Per 1 point of interest rates.",
                },
                {
                  label: "Vanna",
                  latex: "\\partial^2V/\\partial S\\partial\\sigma",
                  value: greeks.vanna.toFixed(5),
                  hint: "How delta moves when volatility moves.",
                },
                {
                  label: "Volga",
                  latex: "\\partial^2V/\\partial\\sigma^2",
                  value: greeks.volga.toFixed(5),
                  hint: "Convexity in volatility — the smile's cost.",
                },
                {
                  label: "Speed",
                  latex: "\\partial^3V/\\partial S^3",
                  value: greeks.speed.toFixed(6),
                  hint: "Third-order sensitivity, matters for large moves.",
                },
              ] as const
            ).map((greek) => (
              <div
                key={greek.label}
                className="rounded-md border border-border bg-surface-sunken px-3 py-2"
              >
                <dt className="flex items-center justify-between gap-1.5">
                  <span className="text-xs text-muted-foreground">{greek.label}</span>
                  <Latex className="text-xs text-primary">{greek.latex}</Latex>
                </dt>
                <dd className="numeric mt-1 text-sm font-semibold">{greek.value}</dd>
                <p className="mt-1 text-[0.68rem] leading-snug text-muted-foreground">
                  {greek.hint}
                </p>
              </div>
            ))}
          </dl>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface p-4">
            <h4 className="mb-3 text-sm font-medium">Payoff profile</h4>
            <div className="h-56 w-full" aria-label="Option payoff at expiry versus today">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={payoff} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="spot"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    stroke="var(--border)"
                    tickFormatter={(value: number) => value.toFixed(0)}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    stroke="var(--border)"
                    width={52}
                    tickFormatter={(value: number) => value.toFixed(0)}
                  />
                  <Tooltip
                    content={
                      <ChartTooltip
                        decimals={2}
                        labelFormatter={(value) =>
                          typeof value === "number" ? `spot ${value.toFixed(2)}` : ""
                        }
                      />
                    }
                  />
                  <ReferenceLine y={0} stroke="var(--muted-foreground)" />
                  <ReferenceLine x={strike} stroke="var(--chart-3)" strokeDasharray="4 3" />
                  <Line
                    type="monotone"
                    dataKey="payoff"
                    name="At expiry"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="currentValue"
                    name="Today (mark)"
                    stroke="var(--chart-2)"
                    strokeWidth={1.75}
                    strokeDasharray="5 3"
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
                    iconType="plainline"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface p-4">
            <h4 className="mb-3 text-sm font-medium">Strike ladder</h4>
            <div className="h-56 w-full" aria-label="Call and put prices across strikes">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ladder} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="strike"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    stroke="var(--border)"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    stroke="var(--border)"
                    width={52}
                    tickFormatter={(value: number) => value.toFixed(0)}
                  />
                  <Tooltip
                    content={
                      <ChartTooltip
                        decimals={2}
                        labelFormatter={(value) => `strike ${String(value ?? "")}`}
                      />
                    }
                  />
                  <ReferenceLine x={Math.round(spot)} stroke="var(--chart-3)" strokeDasharray="4 3" />
                  <Line
                    type="monotone"
                    dataKey="call"
                    name="Call"
                    stroke="var(--gain)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="put"
                    name="Put"
                    stroke="var(--loss)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
                    iconType="plainline"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Allocation panel                                                    */
/* ------------------------------------------------------------------ */

function AllocationPanel({ portfolio }: { portfolio: PortfolioSummary }) {
  const [groupBy, setGroupBy] = React.useState<"assetClass" | "sector" | "symbol">("assetClass");

  const slices = React.useMemo(
    () => allocationBy(portfolio.positions, groupBy),
    [portfolio.positions, groupBy],
  );

  const riskVsWeight = React.useMemo(
    () =>
      [...portfolio.positions]
        .sort((a, b) => b.riskContribution - a.riskContribution)
        .map((position) => ({
          symbol: position.symbol,
          weight: position.weight,
          risk: position.riskContribution,
          // Positive means the position carries more risk than its size implies.
          gap: position.riskContribution - position.weight,
        })),
    [portfolio.positions],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Group by">
          {(
            [
              { value: "assetClass", label: "Asset class" },
              { value: "sector", label: "Sector" },
              { value: "symbol", label: "Holding" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setGroupBy(option.value)}
              aria-pressed={groupBy === option.value}
              className={cn(
                "rounded px-3 py-1.5 text-sm transition-colors",
                groupBy === option.value
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <Badge variant="outline">
          {formatCurrency(portfolio.marketValue, "USD", true)} invested
        </Badge>
      </div>

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="h-56 w-full" aria-label="Allocation breakdown">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="58%"
                  outerRadius="88%"
                  paddingAngle={2}
                  stroke="var(--background)"
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {slices.map((slice) => (
                    <Cell key={slice.label} fill={slice.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={<ChartTooltip decimals={0} labelFormatter={() => "Allocation"} />}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <ul className="mt-3 space-y-1.5">
            {slices.map((slice) => (
              <li key={slice.label} className="flex items-center gap-2 text-sm">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: slice.color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{slice.label}</span>
                <span className="numeric shrink-0 text-muted-foreground">
                  {formatPercent(slice.weight, 1)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-medium">Capital weight vs risk contribution</h4>
              <Badge variant="accent">wᵢ(Σw)ᵢ / wᵀΣw</Badge>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
              Capital weight says how much you own; risk contribution says where the volatility
              actually comes from. A holding whose risk bar overshoots its weight bar is
              concentrating the portfolio&apos;s variance regardless of how small the position looks.
            </p>

            <div className="h-64 w-full" aria-label="Weight versus risk contribution by holding">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={riskVsWeight}
                  margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
                  barGap={2}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="symbol"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    stroke="var(--border)"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    stroke="var(--border)"
                    width={48}
                    tickFormatter={(value: number) => `${(value * 100).toFixed(0)}%`}
                  />
                  <Tooltip
                    content={<ChartTooltip decimals={4} />}
                    cursor={{ fill: "var(--secondary)", opacity: 0.35 }}
                  />
                  <Bar
                    dataKey="weight"
                    name="Capital weight"
                    fill="var(--chart-2)"
                    radius={[2, 2, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="risk"
                    name="Risk contribution"
                    fill="var(--chart-1)"
                    radius={[2, 2, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {riskVsWeight.slice(0, 3).map((entry) => (
              <MetricCard
                key={entry.symbol}
                label={`${entry.symbol} risk gap`}
                value={formatSignedPercent(entry.gap, 2)}
                hint={
                  entry.gap > 0
                    ? "Contributes more variance than capital — a concentration to watch."
                    : "Diversifying: it absorbs less risk than its size."
                }
                tone={entry.gap > 0.02 ? "warning" : "gain"}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Public component                                                    */
/* ------------------------------------------------------------------ */

export interface RiskDashboardProps {
  portfolio: PortfolioSummary;
  /** Portfolio-level daily return series. */
  returns: readonly number[];
  /** Spot price used to seed the option pricer. */
  optionSpot: number;
  className?: string;
}

/**
 * The analytics surface: Value at Risk, the option Greek module, and the
 * allocation-versus-risk breakdown, each backed by the same pure engine that
 * the test suite exercises.
 */
export function RiskDashboard({
  portfolio,
  returns,
  optionSpot,
  className,
}: RiskDashboardProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="border-b border-border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-primary" aria-hidden />
              Risk analytics
            </CardTitle>
            <CardDescription>
              Value at Risk by four methods, a full Black-Scholes Greek surface, and where the
              portfolio&apos;s variance actually lives.
            </CardDescription>
          </div>
          <Badge variant="accent" className="shrink-0">
            {returns.length} sessions modelled
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-5">
        <Tabs defaultValue="var">
          <TabsList>
            <TabsTrigger value="var">
              <TrendingDown aria-hidden />
              Value at Risk
            </TabsTrigger>
            <TabsTrigger value="options">
              <Calculator aria-hidden />
              Options & Greeks
            </TabsTrigger>
            <TabsTrigger value="allocation">
              <PieChartIcon aria-hidden />
              Allocation
            </TabsTrigger>
          </TabsList>

          <TabsContent value="var">
            <VarPanel returns={returns} portfolioValue={portfolio.marketValue} />
          </TabsContent>

          <TabsContent value="options">
            <OptionsPanel defaultSpot={optionSpot} />
          </TabsContent>

          <TabsContent value="allocation">
            <AllocationPanel portfolio={portfolio} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
