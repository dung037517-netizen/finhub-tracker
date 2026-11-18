"use client";

import { Plus, Trash2 } from "lucide-react";
import * as React from "react";

import { AmountInput, Field, Meter, MonthInput, SelectInput, Stat } from "@/components/planner/fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EXPENSE_CATEGORIES, monthBudget, monthlyHistory } from "@/lib/planner/budget";
import { formatHome, formatShare } from "@/lib/planner/format";
import { addMonths, formatMonth } from "@/lib/planner/months";
import { newId, planStore } from "@/lib/planner/store";
import { cn } from "@/lib/utils";
import type { Month, PlanState } from "@/types/planner";

export function BudgetTab({ plan, thisMonth }: { readonly plan: PlanState; readonly thisMonth: Month }) {
  const [chosen, setChosen] = React.useState<Month | null>(null);
  const month = chosen ?? thisMonth;
  const budget = React.useMemo(() => monthBudget(plan, month), [plan, month]);
  const history = React.useMemo(
    () => monthlyHistory(plan.transactions, [-5, -4, -3, -2, -1, 0].map((offset) => addMonths(month, offset))),
    [plan.transactions, month],
  );
  const money = (value: number): string => formatHome(value, plan.settings);
  const unused = EXPENSE_CATEGORIES.filter((category) => !plan.budget.some((line) => line.category === category));
  const [toAdd, setToAdd] = React.useState("");
  const adding = unused.includes(toAdd) ? toAdd : (unused[0] ?? "");
  const peak = Math.max(1, ...history.flatMap((entry) => [entry.income, entry.expense]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Month">
          <MonthInput value={month} onChange={setChosen} label="Month to review" className="w-44" />
        </Field>
        <p className="max-w-xl text-sm text-muted-foreground">
          Your budget is what you plan to spend each month. The bars compare it with what your recorded transactions
          say you actually spent.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Income recorded" value={money(budget.income)} />
        <Stat
          label="Spent"
          value={money(budget.spent)}
          tone={budget.spent > budget.planned && budget.planned > 0 ? "bad" : undefined}
          hint={`of ${money(budget.planned)} budgeted`}
        />
        <Stat label="Left over" value={money(budget.net)} tone={budget.net < 0 ? "bad" : "good"} />
        <Stat label="Savings rate" value={formatShare(budget.savingsRate)} hint="Left over as a share of income" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{formatMonth(month, "long")} by category</CardTitle>
          <CardDescription>Edit a planned amount to change your budget for every month.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {budget.categories.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No budget yet. Add a category below.
            </p>
          ) : null}
          <ul className="space-y-4">
            {budget.categories.map((entry) => {
              const line = plan.budget.find((candidate) => candidate.category === entry.category);
              const over = entry.planned > 0 && entry.actual > entry.planned;
              return (
                <li key={entry.category} className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                    <span className="text-sm font-medium">{entry.category}</span>
                    <div className="flex items-center gap-2">
                      <span className={cn("numeric text-sm", over ? "text-loss" : "text-muted-foreground")}>
                        {money(entry.actual)} spent
                        {entry.planned > 0 ? (over ? ` · ${money(-entry.remaining)} over` : ` · ${money(entry.remaining)} left`) : " · not budgeted"}
                      </span>
                      {line !== undefined ? (
                        <>
                          <AmountInput
                            value={line.monthly}
                            label={`Monthly budget for ${entry.category}`}
                            className="w-32"
                            onCommit={(monthly) =>
                              planStore.update((current) => ({
                                ...current,
                                budget: current.budget.map((candidate) => (candidate.id === line.id ? { ...candidate, monthly } : candidate)),
                              }))
                            }
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove the budget for ${entry.category}`}
                            onClick={() => planStore.update((current) => ({ ...current, budget: current.budget.filter((candidate) => candidate.id !== line.id) }))}
                          >
                            <Trash2 />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <Meter
                    value={entry.ratio ?? (entry.actual > 0 ? 1 : 0)}
                    tone={entry.ratio === null ? "warn" : over ? "bad" : entry.ratio > 0.85 ? "warn" : "primary"}
                    label={
                      entry.planned > 0
                        ? `${entry.category}: ${Math.round((entry.ratio ?? 0) * 100)} percent of the budget used`
                        : `${entry.category}: spending with no budget set`
                    }
                  />
                </li>
              );
            })}
          </ul>

          {unused.length > 0 ? (
            <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
              <Field label="Add a category" className="min-w-[12rem]">
                <SelectInput value={adding} onChange={setToAdd} label="Category to add" options={unused.map((category) => ({ value: category, label: category }))} />
              </Field>
              <Button
                type="button"
                onClick={() =>
                  planStore.update((current) => ({
                    ...current,
                    budget: [...current.budget, { id: newId("budget"), category: adding, monthly: 0 }],
                  }))
                }
              >
                <Plus />
                Add
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>The last six months</CardTitle>
          <CardDescription>Income and spending from your recorded transactions.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-6 items-end gap-2 sm:gap-4" aria-label="Income and spending by month">
            {history.map((entry) => (
              <li key={entry.month} className="flex flex-col items-center gap-2">
                <div className="flex h-36 w-full items-end justify-center gap-1" role="img" aria-label={`${formatMonth(entry.month, "long")}: income ${money(entry.income)}, spending ${money(entry.expense)}`}>
                  <span className="w-1/3 max-w-6 rounded-t bg-gain/80" style={{ height: `${(entry.income / peak) * 100}%` }} />
                  <span className="w-1/3 max-w-6 rounded-t bg-chart-3/80" style={{ height: `${(entry.expense / peak) * 100}%` }} />
                </div>
                <span className="text-center text-xs text-muted-foreground">{formatMonth(entry.month).slice(0, 3)}</span>
                <span className={cn("numeric hidden text-xs sm:block", entry.net < 0 ? "text-loss" : "text-muted-foreground")}>
                  {entry.income === 0 && entry.expense === 0 ? "—" : formatHome(entry.net, plan.settings, true)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-gain/80" aria-hidden />Income</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-chart-3/80" aria-hidden />Spending</span>
            <span>The figure under each month is what was left over.</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
