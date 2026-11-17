"use client";

import { FlaskConical, GraduationCap } from "lucide-react";
import * as React from "react";

import { BudgetTab } from "@/components/planner/budget-tab";
import { CashFlowTab } from "@/components/planner/cashflow-tab";
import { CostsTab } from "@/components/planner/costs-tab";
import { GoalsTab } from "@/components/planner/goals-tab";
import { OverviewTab } from "@/components/planner/overview-tab";
import { SettingsTab } from "@/components/planner/settings-tab";
import { TransactionsTab } from "@/components/planner/transactions-tab";
import { PageShell } from "@/components/site/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/planner/format";
import { dateOfTimestamp, formatMonth, monthOfTimestamp } from "@/lib/planner/months";
import { planStore } from "@/lib/planner/store";
import { usePlan } from "@/lib/planner/use-plan";

const TABS: readonly { readonly value: string; readonly label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "costs", label: "Application costs" },
  { value: "cashflow", label: "Cash flow" },
  { value: "budget", label: "Budget" },
  { value: "goals", label: "Goals" },
  { value: "transactions", label: "Transactions" },
  { value: "settings", label: "Settings" },
];

function Skeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your plan</span>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-24 animate-pulse rounded-xl border border-border bg-card" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-border bg-card" />
    </div>
  );
}

export function PlannerPage() {
  const { plan, hydrated, now, legacyCount, persisted } = usePlan();
  const [tab, setTab] = React.useState("overview");
  const thisMonth = monthOfTimestamp(now);
  const today = dateOfTimestamp(now);
  const { settings } = plan;

  return (
    <PageShell className="!max-w-none !p-0">
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 aurora" aria-hidden />
        <div className="pointer-events-none absolute inset-0 grid-backdrop" aria-hidden />
        <div className="relative mx-auto max-w-[1280px] px-4 py-10 sm:px-6 sm:py-14">
          <Badge variant="outline" className="mb-4">
            <GraduationCap className="size-3" aria-hidden />
            Student finance planning
          </Badge>
          <h1 className="max-w-3xl text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Know what applying to college <span className="text-gradient">will cost, and when</span>
          </h1>
          <p className="mt-4 max-w-2xl text-pretty text-muted-foreground">
            A budgeting, savings-goal and cash-flow planner built on the real cost structure of a U.S. college
            application: tests, score reports, application fees, financial-aid forms, the deposit and the visa — each
            in the month it falls due, in your own currency.
          </p>
          {hydrated ? (
            <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Entering</dt>
                <dd className="font-medium">{formatMonth(settings.entryMonth, "long")}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Currency</dt>
                <dd className="numeric font-medium">
                  {settings.homeCurrency}
                  {settings.homeCurrency === "USD" ? "" : ` · $1 = ${formatMoney(settings.usdRate, settings.homeCurrency)}`}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Savings now</dt>
                <dd className="numeric font-medium">{formatMoney(settings.openingBalance, settings.homeCurrency)}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      </section>

      {hydrated && plan.sample ? (
        <div role="status" className="border-b border-warning/40 bg-warning/15">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-2 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:gap-4 sm:px-6">
            <p className="flex min-w-0 flex-1 items-start gap-3">
              <FlaskConical className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <span>
                <strong className="font-semibold">This is an example plan.</strong> The applicant and every number in
                it are invented. Edit it into your own, or start from blank.
              </span>
            </p>
            <div className="flex flex-wrap gap-2 pl-7 sm:pl-0">
              <Button type="button" size="sm" variant="outline" onClick={() => planStore.adoptSample()}>
                Use it as my starting point
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  planStore.startBlank();
                  setTab("costs");
                }}
              >
                Start blank
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6">
        {!hydrated ? (
          <Skeleton />
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <div className="-mx-4 mb-6 overflow-x-auto px-4 scrollbar-thin sm:mx-0 sm:px-0">
              <TabsList className="w-max">
                {TABS.map((entry) => (
                  <TabsTrigger key={entry.value} value={entry.value}>
                    {entry.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <TabsContent value="overview">
              <OverviewTab plan={plan} thisMonth={thisMonth} onOpen={setTab} />
            </TabsContent>
            <TabsContent value="costs">
              <CostsTab plan={plan} />
            </TabsContent>
            <TabsContent value="cashflow">
              <CashFlowTab plan={plan} />
            </TabsContent>
            <TabsContent value="budget">
              <BudgetTab plan={plan} thisMonth={thisMonth} />
            </TabsContent>
            <TabsContent value="goals">
              <GoalsTab plan={plan} thisMonth={thisMonth} />
            </TabsContent>
            <TabsContent value="transactions">
              <TransactionsTab plan={plan} thisMonth={thisMonth} today={today} legacyCount={legacyCount} />
            </TabsContent>
            <TabsContent value="settings">
              <SettingsTab plan={plan} persisted={persisted} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </PageShell>
  );
}
