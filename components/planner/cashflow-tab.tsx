"use client";

import { Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { AmountInput, Field, Stat, TextInput } from "@/components/planner/fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  COST_MODE_LABELS,
  fxSensitivity,
  projectCashFlow,
  requiredMonthlySaving,
  type CostMode,
} from "@/lib/planner/cashflow";
import { formatHome, formatMoney } from "@/lib/planner/format";
import { formatMonth } from "@/lib/planner/months";
import { newId, planStore } from "@/lib/planner/store";
import { cn } from "@/lib/utils";
import type { PlanState } from "@/types/planner";

const MODES: readonly CostMode[] = ["planned", "expected", "prudent"];

const MODE_HINTS: Readonly<Record<CostMode, string>> = {
  planned: "Only the payments you are sure of.",
  expected: "Contingencies counted at their probability — the best estimate.",
  prudent: "Every contingency happens — the plan a careful student funds.",
};

interface TooltipRow {
  readonly name?: string | number;
  readonly value?: string | number | readonly (string | number)[];
  readonly color?: string;
}

function MoneyTooltip({
  active,
  payload,
  label,
  currency,
}: {
  readonly active?: boolean;
  readonly payload?: readonly TooltipRow[];
  readonly label?: string | number;
  readonly currency: string;
}) {
  if (active !== true || payload === undefined || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((row, index) => (
        <p key={index} className="numeric flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-full" style={{ backgroundColor: row.color }} aria-hidden />
            {row.name}
          </span>
          <span>{typeof row.value === "number" ? formatMoney(row.value, currency) : String(row.value ?? "")}</span>
        </p>
      ))}
    </div>
  );
}

export function CashFlowTab({ plan }: { readonly plan: PlanState }) {
  const [mode, setMode] = React.useState<CostMode>("expected");
  const { settings } = plan;
  const projection = React.useMemo(() => projectCashFlow(plan, mode), [plan, mode]);
  const requirement = React.useMemo(() => requiredMonthlySaving(plan, mode), [plan, mode]);
  const sensitivity = React.useMemo(() => fxSensitivity(plan, [0, 5, 10, 15], mode), [plan, mode]);
  const money = (value: number, compact = false): string => formatHome(value, settings, compact);
  const short = projection.firstShortfall !== null;
  const foreign = settings.homeCurrency !== "USD";

  const chart = projection.months.map((flow) => ({
    label: formatMonth(flow.month),
    balance: Math.round(flow.balance),
    application: Math.round(flow.application),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="How to treat contingencies" className="inline-flex rounded-lg border border-border bg-surface-sunken p-1">
          {MODES.map((entry) => (
            <button
              key={entry}
              type="button"
              role="radio"
              aria-checked={mode === entry}
              onClick={() => setMode(entry)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                mode === entry ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {COST_MODE_LABELS[entry]}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{MODE_HINTS[mode]}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Lowest balance"
          value={money(projection.minBalance, true)}
          tone={short ? "bad" : "good"}
          hint={projection.minMonth === null ? undefined : `at the end of ${formatMonth(projection.minMonth, "long")}`}
        />
        <Stat
          label={short ? "First month in the red" : "Months in the red"}
          value={short && projection.firstShortfall !== null ? formatMonth(projection.firstShortfall) : "None"}
          tone={short ? "bad" : "good"}
          hint={short ? "The balance is negative at the end of this month." : "The money is there when each bill arrives."}
        />
        <Stat
          label="Extra saving needed each month"
          value={money(requirement.amount, true)}
          tone={requirement.amount > 0 ? "warn" : "good"}
          hint={
            requirement.bindingMonth === null
              ? "Nothing more is needed."
              : `Set by the bills due by ${formatMonth(requirement.bindingMonth, "long")}, not by the year's total.`
          }
        />
        <Stat
          label="Balance when you start university"
          value={money(projection.endBalance, true)}
          tone={projection.endBalance < 0 ? "bad" : undefined}
          hint={`${formatMonth(settings.entryMonth, "long")}`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Balance, month by month</CardTitle>
          <CardDescription>
            Income arrives evenly; application costs do not. A plan can balance over the year and still run dry in
            the month several bills land together.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chart.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Set a start month before the entry month to see a projection.</p>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chart} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" minTickGap={16} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    stroke="var(--border)"
                    width={64}
                    tickFormatter={(value: number) => formatMoney(value, settings.homeCurrency, true)}
                  />
                  <Tooltip content={<MoneyTooltip currency={settings.homeCurrency} />} />
                  <ReferenceLine y={0} stroke="var(--loss)" strokeDasharray="4 4" />
                  <Bar dataKey="application" name="Application costs due" fill="var(--chart-3)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  <Line type="monotone" dataKey="balance" name="Balance at month end" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 2.5 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Money coming in</CardTitle>
            <CardDescription>What you can count on each month, and what you start with.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label={`Savings available now (${settings.homeCurrency})`}>
              <AmountInput
                value={settings.openingBalance}
                onCommit={(openingBalance) => planStore.update((current) => ({ ...current, settings: { ...current.settings, openingBalance } }))}
                label="Savings available now"
              />
            </Field>
            <ul className="space-y-2">
              {plan.income.map((source) => (
                <li key={source.id} className="grid grid-cols-[minmax(0,1fr)_9rem_auto] items-center gap-2">
                  <TextInput
                    value={source.label}
                    label="Income source"
                    onCommit={(label) =>
                      planStore.update((current) => ({
                        ...current,
                        income: current.income.map((entry) => (entry.id === source.id ? { ...entry, label } : entry)),
                      }))
                    }
                  />
                  <AmountInput
                    value={source.monthly}
                    label={`Monthly amount for ${source.label}`}
                    onCommit={(monthly) =>
                      planStore.update((current) => ({
                        ...current,
                        income: current.income.map((entry) => (entry.id === source.id ? { ...entry, monthly } : entry)),
                      }))
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${source.label}`}
                    onClick={() => planStore.update((current) => ({ ...current, income: current.income.filter((entry) => entry.id !== source.id) }))}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                planStore.update((current) => ({
                  ...current,
                  income: [...current.income, { id: newId("income"), label: "New income", monthly: 0 }],
                }))
              }
            >
              <Plus />
              Add an income source
            </Button>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Living costs come from your budget ({money(projection.months[0]?.living ?? 0)} a month) and savings goals
              take {money(projection.months[0]?.goals ?? 0)} this month. Change them on the Budget and Goals tabs.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>If the dollar gets more expensive</CardTitle>
            <CardDescription>
              {foreign
                ? `Fees are charged in dollars but you earn in ${settings.homeCurrency}. This is what a stronger dollar does to the plan.`
                : "Your home currency is the dollar, so the exchange rate does not affect this plan."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label={`Stress applied to the whole plan: dollar ${settings.fxStressPct}% stronger`}>
              <input
                type="range"
                min={0}
                max={20}
                step={1}
                value={settings.fxStressPct}
                disabled={!foreign}
                aria-label="Exchange-rate stress in percent"
                onChange={(event) =>
                  planStore.update((current) => ({
                    ...current,
                    settings: { ...current.settings, fxStressPct: Number(event.target.value) },
                  }))
                }
                className="w-full accent-[var(--primary)]"
              />
            </Field>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th scope="col" className="py-2 text-left font-medium">Dollar stronger by</th>
                  <th scope="col" className="py-2 text-right font-medium">Application costs</th>
                  <th scope="col" className="py-2 text-right font-medium">Lowest balance</th>
                </tr>
              </thead>
              <tbody>
                {sensitivity.map((point) => (
                  <tr key={point.stressPct} className="border-b border-border/60">
                    <th scope="row" className="numeric py-2 text-left font-normal">{point.stressPct}%</th>
                    <td className="numeric whitespace-nowrap py-2 text-right">{money(point.application, true)}</td>
                    <td className={cn("numeric whitespace-nowrap py-2 text-right", point.minBalance < 0 ? "text-loss" : "text-gain")}>
                      {money(point.minBalance, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Every month</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[50rem] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th scope="col" className="py-2 pr-4 text-left font-medium">Month</th>
                  <th scope="col" className="py-2 pl-4 text-right font-medium">Income</th>
                  <th scope="col" className="py-2 pl-4 text-right font-medium">Living</th>
                  <th scope="col" className="py-2 pl-4 text-right font-medium">Goals</th>
                  <th scope="col" className="py-2 pl-4 text-right font-medium">Applications</th>
                  <th scope="col" className="py-2 pl-4 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {projection.months.map((flow) => (
                  <tr key={flow.month} className="border-b border-border/60 align-top">
                    <th scope="row" className="min-w-[13rem] py-2 pr-4 text-left font-normal">
                      {formatMonth(flow.month)}
                      {flow.items.length > 0 ? (
                        <span className="block text-xs text-muted-foreground">{flow.items.map((item) => item.label).join(" · ")}</span>
                      ) : null}
                    </th>
                    <td className="numeric whitespace-nowrap py-2 pl-4 text-right">{money(flow.income)}</td>
                    <td className="numeric whitespace-nowrap py-2 pl-4 text-right">{money(flow.living)}</td>
                    <td className="numeric whitespace-nowrap py-2 pl-4 text-right">{money(flow.goals)}</td>
                    <td className="numeric whitespace-nowrap py-2 pl-4 text-right">{flow.application > 0 ? money(flow.application) : "—"}</td>
                    <td className={cn("numeric whitespace-nowrap py-2 pl-4 text-right font-medium", flow.balance < 0 && "text-loss")}>
                      {money(flow.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
