"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  GraduationCap,
  ShieldCheck,
  Sparkles,
  Target,
  Wand2,
} from "lucide-react";
import * as React from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartTooltip } from "@/components/finance/chart-tooltip";
import { Latex } from "@/components/finance/latex";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  COLLEGE_SCENARIOS,
  assessCollegePlanRisk,
  projectCollegePlan,
  requiredContributionForConfidence,
} from "@/lib/college-plan";
import { formatCurrency, formatPercent } from "@/lib/finance-engine";
import { cn } from "@/lib/utils";
import type { CollegePlanInput } from "@/types/finance";

/** Monte Carlo path count — enough for a stable fan, cheap enough to re-run. */
const RISK_PATHS = 1200;

interface PlanSliderProps {
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

function PlanSlider({
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
}: PlanSliderProps) {
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
      {hint !== undefined && <p className="text-xs leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface HeadlineProps {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "gain" | "loss" | "warning";
  latex?: string;
}

function Headline({ label, value, hint, tone = "default", latex }: HeadlineProps) {
  return (
    <motion.div layout className="rounded-lg border border-border bg-surface px-3.5 py-3">
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

export interface CollegePlannerProps {
  className?: string;
  /** Bumping this value re-applies the demo scenario from outside. */
  demoSignal?: number;
}

/**
 * The 4-year college application and expense planner.
 *
 * Two computations run at different priorities. The deterministic projection
 * is cheap and recomputes synchronously, so dragging a slider moves the cost
 * curve in the same frame. The Monte Carlo fan is ~1,200 full ledger
 * simulations, so it runs against a `useDeferredValue` copy of the inputs —
 * React can abandon a stale run when the next drag event lands, which keeps
 * the slider at 60 fps while still showing a fully-converged risk band once
 * the user lets go.
 */
export function CollegePlanner({ className, demoSignal = 0 }: CollegePlannerProps) {
  const [scenarioIndex, setScenarioIndex] = React.useState(0);
  const [plan, setPlan] = React.useState<CollegePlanInput>(COLLEGE_SCENARIOS[0]);

  // Re-apply the headline scenario when the hero's demo button fires.
  const [lastSignal, setLastSignal] = React.useState(demoSignal);
  if (demoSignal !== lastSignal) {
    setLastSignal(demoSignal);
    setScenarioIndex(0);
    setPlan(COLLEGE_SCENARIOS[0]);
  }

  const update = <K extends keyof CollegePlanInput>(
    key: K,
    value: CollegePlanInput[K],
  ): void => {
    setPlan((current) => ({ ...current, [key]: value }));
  };

  const projection = React.useMemo(() => projectCollegePlan(plan), [plan]);

  // The confidence solve is a bisection over repeated Monte Carlo runs, which
  // is far too costly to recompute on every slider tick — so it is explicit,
  // and yields to the event loop first so the button can paint its busy state.
  const [confidenceContribution, setConfidenceContribution] = React.useState<number | null>(
    null,
  );
  const [solvingConfidence, setSolvingConfidence] = React.useState(false);

  const solveForConfidence = React.useCallback(() => {
    setSolvingConfidence(true);
    setTimeout(() => {
      setConfidenceContribution(requiredContributionForConfidence(plan, 0.9, 400));
      setSolvingConfidence(false);
    }, 0);
  }, [plan]);

  // A solved figure belongs to the plan it was solved for; drop it on any edit.
  const [solvedFor, setSolvedFor] = React.useState(plan);
  if (solvedFor !== plan) {
    setSolvedFor(plan);
    if (confidenceContribution !== null) setConfidenceContribution(null);
  }

  // The expensive half, deliberately deprioritised.
  const deferredPlan = React.useDeferredValue(plan);
  const risk = React.useMemo(
    () => assessCollegePlanRisk(deferredPlan, RISK_PATHS),
    [deferredPlan],
  );
  const riskIsStale = deferredPlan !== plan;

  const fanData = React.useMemo(
    () =>
      risk.bands.map((band) => ({
        years: band.yearsFromNow,
        band90: [band.p10, band.p90] as const,
        band50: [band.p25, band.p75] as const,
        median: band.median,
        expected: band.expected,
      })),
    [risk.bands],
  );

  const costData = React.useMemo(
    () =>
      projection.costs.map((year) => ({
        label: `Year ${year.academicYear}`,
        Tuition: year.tuition,
        "Room & board": year.roomBoard,
        "Books & supplies": year.booksSupplies,
        Travel: year.travel,
        Aid: -year.aid,
        net: year.netCost,
      })),
    [projection.costs],
  );

  const fullyFunded = projection.fundingGap <= 1;
  const contributionGap = projection.requiredMonthlyContribution - plan.monthlyContribution;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="border-b border-border">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="size-4 text-primary" aria-hidden />
              4-year college application &amp; expense scenario
            </CardTitle>
            <CardDescription>
              An accumulation phase followed by a decumulation phase — a pension in miniature,
              stress-tested against {RISK_PATHS.toLocaleString("en-US")} market futures.
            </CardDescription>
          </div>
          <Badge variant={fullyFunded ? "success" : "warning"} className="shrink-0">
            {fullyFunded ? (
              <CheckCircle2 className="size-3" aria-hidden />
            ) : (
              <AlertTriangle className="size-3" aria-hidden />
            )}
            {fullyFunded ? "Fully funded" : `${formatPercent(projection.fundedRatio, 0)} funded`}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-5">
        <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          {/* Controls */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Scenario</Label>
              <div className="grid gap-1">
                {COLLEGE_SCENARIOS.map((scenario, index) => (
                  <button
                    key={scenario.scenarioName}
                    type="button"
                    onClick={() => {
                      setScenarioIndex(index);
                      setPlan(scenario);
                    }}
                    aria-pressed={index === scenarioIndex}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                      index === scenarioIndex
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    <span className="block font-medium">{scenario.scenarioName}</span>
                    <span className="numeric block text-xs opacity-80">
                      {formatCurrency(
                        scenario.annualTuition + scenario.annualRoomBoard,
                        "USD",
                        true,
                      )}
                      /yr sticker
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
              <PlanSlider
                id="plan-savings"
                label="current savings"
                value={plan.currentSavings}
                min={0}
                max={150_000}
                step={500}
                onChange={(value) => update("currentSavings", value)}
                format={(value) => formatCurrency(value, "USD", true)}
              />
              <PlanSlider
                id="plan-contribution"
                label="monthly contribution"
                latex="PMT"
                value={plan.monthlyContribution}
                min={0}
                max={4000}
                step={25}
                onChange={(value) => update("monthlyContribution", value)}
                format={(value) => formatCurrency(value)}
              />
              <PlanSlider
                id="plan-years"
                label="years until enrollment"
                latex="n"
                value={plan.yearsUntilEnrollment}
                min={0}
                max={10}
                step={1}
                onChange={(value) => update("yearsUntilEnrollment", Math.round(value))}
                format={(value) => `${Math.round(value)} yr`}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() =>
                  update("monthlyContribution", projection.requiredMonthlyContribution)
                }
              >
                <Wand2 />
                Solve: fund the expected case
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={solvingConfidence}
                onClick={solveForConfidence}
              >
                <ShieldCheck />
                {solvingConfidence ? "Solving…" : "Solve: fund it 90% of the time"}
              </Button>

              {confidenceContribution !== null && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  90% confidence needs{" "}
                  <span className="numeric font-medium text-primary">
                    {formatCurrency(confidenceContribution)}/mo
                  </span>{" "}
                  —{" "}
                  <span className="numeric font-medium text-warning">
                    {formatPercent(
                      confidenceContribution / Math.max(1, projection.requiredMonthlyContribution) -
                        1,
                      0,
                    )}
                  </span>{" "}
                  more than the expected case. Funding to the average leaves roughly a coin flip,
                  because the median return path sits below the mean.
                </p>
              )}
            </div>

            <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
              <PlanSlider
                id="plan-return"
                label="expected return"
                latex="r"
                value={plan.expectedAnnualReturn}
                min={0}
                max={0.12}
                step={0.005}
                onChange={(value) => update("expectedAnnualReturn", value)}
                format={(value) => formatPercent(value, 1)}
              />
              <PlanSlider
                id="plan-vol"
                label="return volatility"
                latex="\sigma"
                value={plan.returnVolatility}
                min={0}
                max={0.35}
                step={0.01}
                onChange={(value) => update("returnVolatility", value)}
                format={(value) => formatPercent(value, 0)}
                hint="Higher volatility widens the fan and raises the chance of running dry."
              />
              <PlanSlider
                id="plan-inflation"
                label="college cost inflation"
                latex="g"
                value={plan.costInflation}
                min={0}
                max={0.1}
                step={0.005}
                onChange={(value) => update("costInflation", value)}
                format={(value) => formatPercent(value, 1)}
                hint="College costs have historically outrun general CPI."
              />
              <PlanSlider
                id="plan-aid"
                label="expected annual aid"
                value={plan.expectedAnnualAid}
                min={0}
                max={45_000}
                step={500}
                onChange={(value) => update("expectedAnnualAid", value)}
                format={(value) => formatCurrency(value, "USD", true)}
                hint="Grants and scholarships, netted off the sticker price."
              />
            </div>
          </div>

          {/* Results */}
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Headline
                label="Total 4-year net cost"
                value={formatCurrency(projection.totalNetCost, "USD", true)}
                hint={`Present value ${formatCurrency(projection.presentValueOfCosts, "USD", true)} discounted at ${formatPercent(plan.expectedAnnualReturn, 1)}.`}
              />
              <Headline
                label="Balance at enrollment"
                value={formatCurrency(projection.balanceAtEnrollment, "USD", true)}
                hint={`${formatCurrency(projection.totalContributions, "USD", true)} contributed, ${formatCurrency(projection.totalInvestmentGrowth, "USD", true)} earned.`}
                tone="gain"
              />
              <Headline
                label={fullyFunded ? "Funding surplus" : "Funding gap"}
                value={formatCurrency(
                  fullyFunded ? projection.endingBalance : projection.fundingGap,
                  "USD",
                  true,
                )}
                hint={
                  fullyFunded
                    ? "The plan never runs dry under the expected return."
                    : "Deepest point the plan goes underwater."
                }
                tone={fullyFunded ? "gain" : "loss"}
              />
              <Headline
                label="Required contribution"
                latex="PMT^{*}"
                value={`${formatCurrency(projection.requiredMonthlyContribution)}/mo`}
                hint={
                  contributionGap > 1
                    ? `${formatCurrency(contributionGap)}/mo more than the current plan.`
                    : "Current contribution already covers it."
                }
                tone={contributionGap > 1 ? "warning" : "gain"}
              />
            </div>

            <Tabs defaultValue="projection">
              <TabsList>
                <TabsTrigger value="projection">
                  <Target aria-hidden />
                  Balance projection
                </TabsTrigger>
                <TabsTrigger value="costs">
                  <GraduationCap aria-hidden />
                  Cost breakdown
                </TabsTrigger>
              </TabsList>

              <TabsContent value="projection">
                <div className="rounded-lg border border-border bg-surface p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-medium">
                      Savings balance with {RISK_PATHS.toLocaleString("en-US")} simulated futures
                    </h4>
                    <Badge variant={riskIsStale ? "warning" : "outline"}>
                      {riskIsStale ? "recomputing…" : "10th–90th percentile fan"}
                    </Badge>
                  </div>

                  <div
                    className={cn(
                      "h-72 w-full transition-opacity",
                      riskIsStale && "opacity-60",
                    )}
                    aria-label="Projected savings balance over time with percentile bands"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={fanData}
                        margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="years"
                          type="number"
                          domain={["dataMin", "dataMax"]}
                          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                          stroke="var(--border)"
                          tickFormatter={(value: number) => `${value.toFixed(0)}y`}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                          stroke="var(--border)"
                          width={64}
                          tickFormatter={(value: number) =>
                            formatCurrency(value, "USD", true)
                          }
                        />
                        <Tooltip
                          content={
                            <ChartTooltip
                              decimals={0}
                              labelFormatter={(value) =>
                                typeof value === "number"
                                  ? `${value.toFixed(1)} years from now`
                                  : ""
                              }
                            />
                          }
                        />
                        <Area
                          dataKey="band90"
                          name="10th–90th pct"
                          stroke="none"
                          fill="var(--chart-2)"
                          fillOpacity={0.16}
                          isAnimationActive={false}
                        />
                        <Area
                          dataKey="band50"
                          name="25th–75th pct"
                          stroke="none"
                          fill="var(--chart-2)"
                          fillOpacity={0.26}
                          isAnimationActive={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="median"
                          name="Median outcome"
                          stroke="var(--chart-1)"
                          strokeWidth={2.25}
                          dot={false}
                          isAnimationActive={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="expected"
                          name="Deterministic plan"
                          stroke="var(--chart-3)"
                          strokeWidth={1.75}
                          strokeDasharray="5 3"
                          dot={false}
                          isAnimationActive={false}
                        />
                        {/* Crossing zero means the plan has run out of money. */}
                        <ReferenceLine y={0} stroke="var(--loss)" strokeWidth={1.5} />
                        <ReferenceLine
                          x={plan.yearsUntilEnrollment}
                          stroke="var(--muted-foreground)"
                          strokeDasharray="4 4"
                          label={{
                            value: "enrollment",
                            fill: "var(--muted-foreground)",
                            fontSize: 10,
                            position: "top",
                          }}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="costs">
                <div className="rounded-lg border border-border bg-surface p-4">
                  <h4 className="mb-3 text-sm font-medium">
                    Inflation-adjusted cost per academic year
                  </h4>
                  <div className="h-72 w-full" aria-label="Cost breakdown by academic year">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={costData}
                        margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
                        stackOffset="sign"
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                          stroke="var(--border)"
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                          stroke="var(--border)"
                          width={64}
                          tickFormatter={(value: number) =>
                            formatCurrency(value, "USD", true)
                          }
                        />
                        <Tooltip
                          content={<ChartTooltip decimals={0} />}
                          cursor={{ fill: "var(--secondary)", opacity: 0.35 }}
                        />
                        <ReferenceLine y={0} stroke="var(--border)" />
                        <Bar dataKey="Tuition" stackId="cost" fill="var(--chart-1)" />
                        <Bar dataKey="Room & board" stackId="cost" fill="var(--chart-2)" />
                        <Bar dataKey="Books & supplies" stackId="cost" fill="var(--chart-4)" />
                        <Bar
                          dataKey="Travel"
                          stackId="cost"
                          fill="var(--chart-6)"
                          radius={[3, 3, 0, 0]}
                        />
                        <Bar
                          dataKey="Aid"
                          stackId="cost"
                          fill="var(--gain)"
                          radius={[0, 0, 3, 3]}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    Aid is drawn below the axis because it offsets the bars above it. Every figure
                    is inflated forward from today&apos;s dollars at{" "}
                    {formatPercent(plan.costInflation, 1)} per year — which is why year four costs
                    materially more than year one for the identical education.
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            {/* Risk summary */}
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Headline
                label="Probability of shortfall"
                latex="P(\text{ruin})"
                value={formatPercent(risk.shortfallProbability, 1)}
                hint="Share of futures where the balance goes negative at any point."
                tone={
                  risk.shortfallProbability > 0.25
                    ? "loss"
                    : risk.shortfallProbability > 0.05
                      ? "warning"
                      : "gain"
                }
              />
              <Headline
                label="Expected shortfall"
                value={formatCurrency(risk.expectedShortfall, "USD", true)}
                hint="Average size of the hole, given that one opens."
                tone={risk.expectedShortfall > 0 ? "warning" : "gain"}
              />
              <Headline
                label="Shortfall VaR (95%)"
                latex="\mathrm{VaR}_{95}"
                value={formatCurrency(risk.shortfallValueAtRisk, "USD", true)}
                hint="Exceeded in only 1 future out of 20."
                tone="loss"
              />
              <Headline
                label="Shortfall TVaR (95%)"
                latex="\mathrm{TVaR}_{95}"
                value={formatCurrency(risk.shortfallTailValueAtRisk, "USD", true)}
                hint="Mean shortfall across the worst 5% of futures."
                tone="loss"
              />
            </div>

            <div className="rounded-lg border border-border bg-surface-sunken p-4">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="size-3.5 text-primary" aria-hidden />
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  The mathematics behind this panel
                </p>
              </div>
              <Latex display className="text-xs">
                {"C_k = C_0(1+g)^k, \\qquad B_{t+1} = \\bigl(B_t + PMT - W_t\\bigr)(1 + r_m), \\qquad r_m = (1+r)^{1/12} - 1"}
              </Latex>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Costs compound forward at <Latex>{"g"}</Latex>; the balance is an annuity-due
                accumulation that switches into decumulation once bills land. Because contributions
                and withdrawals overlap, there is no closed form for the required payment — it is
                solved by bisection on the minimum balance, which is monotone in{" "}
                <Latex>{"PMT"}</Latex> and therefore cannot diverge.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
