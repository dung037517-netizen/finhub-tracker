"use client";

import { AlertTriangle, CalendarClock, CircleCheck, Info } from "lucide-react";
import * as React from "react";

import { Meter, Stat } from "@/components/planner/fields";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { monthBudget } from "@/lib/planner/budget";
import { fxSensitivity, projectCashFlow, requiredMonthlySaving } from "@/lib/planner/cashflow";
import { costDistribution, isContingent, itemUsd, usdToHome } from "@/lib/planner/costs";
import { formatHome, formatShare, formatUsd } from "@/lib/planner/format";
import { goalStatus } from "@/lib/planner/goals";
import { formatMonth, monthIndex, monthsBetween } from "@/lib/planner/months";
import { cn } from "@/lib/utils";
import type { Month, PlanState } from "@/types/planner";

interface Finding {
  readonly tone: "good" | "warn" | "info";
  readonly text: React.ReactNode;
}

export function OverviewTab({
  plan,
  thisMonth,
  onOpen,
}: {
  readonly plan: PlanState;
  readonly thisMonth: Month;
  readonly onOpen: (tab: string) => void;
}) {
  const { settings } = plan;
  const money = (value: number, compact = false): string => formatHome(value, settings, compact);
  const distribution = React.useMemo(() => costDistribution(plan.costs), [plan.costs]);
  const planned = React.useMemo(() => projectCashFlow(plan, "planned"), [plan]);
  const expected = React.useMemo(() => projectCashFlow(plan, "expected"), [plan]);
  const prudent = React.useMemo(() => projectCashFlow(plan, "prudent"), [plan]);
  const requirement = React.useMemo(() => requiredMonthlySaving(plan, "prudent"), [plan]);
  const budget = React.useMemo(() => monthBudget(plan, thisMonth), [plan, thisMonth]);
  const statuses = plan.goals.map((goal) => goalStatus(goal, thisMonth));
  const behind = statuses.filter((status) => status.state === "behind" || status.state === "overdue");
  const behindNames = behind.map((status) => status.goal.name).join(", ");
  const foreign = settings.homeCurrency !== "USD";

  const upcoming = [...plan.costs]
    .filter((item) => !item.paid)
    .sort((a, b) => monthIndex(a.month) - monthIndex(b.month))
    .slice(0, 5);

  const when = (month: Month | null): string => (month === null ? "" : formatMonth(month, "long"));
  const cover =
    requirement.amount > 0 ? (
      <>
        {" "}
        Setting aside <strong className="numeric font-semibold text-foreground">{money(requirement.amount)}</strong>{" "}
        more each month from now keeps the balance above zero even then
        {requirement.bindingMonth !== null ? <>: the bills due by {when(requirement.bindingMonth)} set that figure</> : null}.
      </>
    ) : null;

  const findings: Finding[] = [];
  if (plan.costs.length === 0) {
    findings.push({ tone: "info", text: "Start on the Application costs tab: a few questions draft your whole schedule." });
  } else if (prudent.firstShortfall === null) {
    findings.push({
      tone: "good",
      text: (
        <>
          The plan holds even if every contingency happens: the balance never goes below zero before you start
          university, and is lowest in {when(prudent.minMonth)} at {money(prudent.minBalance)}.
        </>
      ),
    });
  } else if (expected.firstShortfall === null) {
    findings.push({
      tone: "warn",
      text: (
        <>
          On the best estimate the plan holds: at its lowest, in {when(expected.minMonth)}, {money(expected.minBalance)}{" "}
          is left. If every contingency happens it does not, and the balance falls to {money(prudent.minBalance)} in{" "}
          {when(prudent.minMonth)}.{cover}
        </>
      ),
    });
  } else if (planned.firstShortfall === null) {
    findings.push({
      tone: "warn",
      text: (
        <>
          The plan holds only if nothing extra happens. Counting each contingency at its probability, the balance turns
          negative in {when(expected.firstShortfall)} and reaches {money(expected.minBalance)} in{" "}
          {when(expected.minMonth)}.{cover}
        </>
      ),
    });
  } else {
    findings.push({
      tone: "warn",
      text: (
        <>
          Even with nothing unexpected, the balance turns negative in {when(planned.firstShortfall)} and reaches{" "}
          {money(planned.minBalance)} at its lowest, in {when(planned.minMonth)}.{cover}
        </>
      ),
    });
  }
  if (distribution.marginUsd > 0) {
    findings.push({
      tone: "info",
      text: (
        <>
          You expect to pay {formatUsd(distribution.expectedUsd)} more in application costs, but should be ready for{" "}
          {formatUsd(distribution.p90Usd)}: that covers 9 outcomes in 10. The {formatUsd(distribution.marginUsd)}{" "}
          between them is your margin for retakes and extra applications.
        </>
      ),
    });
  }
  if (foreign && plan.costs.some((item) => !item.paid)) {
    const [, stressed] = fxSensitivity(plan, [settings.fxStressPct, settings.fxStressPct + 5], "expected");
    const base = projectCashFlow(plan, "expected").totalApplication;
    findings.push({
      tone: "info",
      text: (
        <>
          Your fees are in dollars. If the dollar strengthens by a further 5%, the same applications cost{" "}
          {money(stressed.application - base)} more in {settings.homeCurrency}.
        </>
      ),
    });
  }
  const over = budget.categories.filter((entry) => entry.planned > 0 && entry.actual > entry.planned);
  if (over.length > 0) {
    findings.push({
      tone: "warn",
      text: (
        <>
          This month you are over budget on {over.map((entry) => entry.category.toLowerCase()).join(", ")} by{" "}
          {money(over.reduce((total, entry) => total - entry.remaining, 0))}
          {over.length > 1 ? " in total" : ""}.
        </>
      ),
    });
  }
  if (behind.length > 0) {
    findings.push({
      tone: "warn",
      text: (
        <>
          {behind.length === 1 ? "One savings goal is" : `${behind.length} savings goals are`} behind schedule:{" "}
          {behindNames}
          {behindNames.endsWith(".") ? "" : "."}
        </>
      ),
    });
  }

  const monthsToEntry = Math.max(0, monthsBetween(thisMonth, settings.entryMonth));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Application costs still to pay"
          value={formatUsd(distribution.expectedUsd)}
          hint={`Expected${foreign ? ` · ${money(usdToHome(distribution.expectedUsd, settings), true)}` : ""} · be ready for ${formatUsd(distribution.p90Usd)}`}
        />
        <Stat
          label="Lowest balance before university"
          value={money(prudent.minBalance, true)}
          tone={prudent.minBalance < 0 ? "bad" : "good"}
          hint={prudent.minMonth === null ? "If every contingency happens" : `If every contingency happens · ${formatMonth(prudent.minMonth)}`}
        />
        <Stat
          label={`Spent in ${formatMonth(thisMonth)}`}
          value={money(budget.spent, true)}
          tone={budget.planned > 0 && budget.spent > budget.planned ? "bad" : undefined}
          hint={budget.planned > 0 ? `${formatShare(budget.spent / budget.planned)} of a ${money(budget.planned, true)} budget` : "No budget set"}
        />
        <Stat
          label="Until you start"
          value={`${monthsToEntry} ${monthsToEntry === 1 ? "month" : "months"}`}
          hint={`Entering ${formatMonth(settings.entryMonth, "long")}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>What the numbers say</CardTitle>
            <CardDescription>Read off your plan as it stands. Change anything and this updates.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {findings.map((finding, index) => (
                <li key={index} className="flex gap-3 text-sm leading-relaxed">
                  {finding.tone === "good" ? (
                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-gain" aria-hidden />
                  ) : finding.tone === "warn" ? (
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                  ) : (
                    <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                  )}
                  <span className="text-muted-foreground">{finding.text}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="size-4 text-primary" aria-hidden />
              Next payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing left to pay.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {upcoming.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate">{item.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {formatMonth(item.month)}
                        {isContingent(item) ? ` · ${formatShare(item.probability)} chance` : ""}
                      </span>
                    </span>
                    <span className={cn("numeric shrink-0 font-medium", isContingent(item) && "text-muted-foreground")}>
                      {formatUsd(itemUsd(item))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => onOpen("costs")}
              className="mt-3 text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              See the whole schedule
            </button>
          </CardContent>
        </Card>
      </div>

      {statuses.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Savings goals</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {statuses.map((status) => (
              <div key={status.goal.id} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{status.goal.name}</span>
                  <span className="numeric text-muted-foreground">
                    {status.state === "unset"
                      ? "No target yet"
                      : `${money(status.goal.saved, true)} of ${money(status.goal.target, true)}`}
                  </span>
                </div>
                <Meter
                  value={status.progress}
                  tone={status.state === "behind" ? "warn" : status.state === "overdue" ? "bad" : status.state === "unset" ? "primary" : "good"}
                  label={`${status.goal.name}: ${Math.round(status.progress * 100)} percent saved`}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
