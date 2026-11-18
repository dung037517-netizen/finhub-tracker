"use client";

import { Plus, Trash2 } from "lucide-react";
import * as React from "react";

import { AmountInput, Field, Meter, MonthInput, TextInput } from "@/components/planner/fields";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatHome, formatShare } from "@/lib/planner/format";
import { GOAL_STATE_LABELS, goalStatus, monthlyGoalCommitment, type GoalState } from "@/lib/planner/goals";
import { addMonths, formatMonth } from "@/lib/planner/months";
import { newId, planStore } from "@/lib/planner/store";
import type { Goal, Month, PlanState } from "@/types/planner";

const STATE_VARIANT: Readonly<Record<GoalState, NonNullable<BadgeProps["variant"]>>> = {
  unset: "outline",
  reached: "success",
  "on-track": "success",
  behind: "warning",
  overdue: "destructive",
};

function patchGoal(id: string, patch: Partial<Goal>): void {
  planStore.update((plan) => ({
    ...plan,
    goals: plan.goals.map((goal) => (goal.id === id ? { ...goal, ...patch } : goal)),
  }));
}

function GoalCard({ goal, plan, thisMonth }: { readonly goal: Goal; readonly plan: PlanState; readonly thisMonth: Month }) {
  const status = goalStatus(goal, thisMonth);
  const money = (value: number): string => formatHome(value, plan.settings);
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TextInput value={goal.name} onCommit={(name) => patchGoal(goal.id, { name })} label="Goal name" className="max-w-xs text-base font-semibold" />
          <div className="flex items-center gap-2">
            <Badge variant={STATE_VARIANT[status.state]}>{GOAL_STATE_LABELS[status.state]}</Badge>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove the goal ${goal.name}`}
              onClick={() => planStore.update((current) => ({ ...current, goals: current.goals.filter((entry) => entry.id !== goal.id) }))}
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="numeric font-medium">
              {money(goal.saved)} <span className="font-normal text-muted-foreground">of {money(goal.target)}</span>
            </span>
            <span className="numeric text-muted-foreground">{formatShare(status.progress)}</span>
          </div>
          <Meter
            value={status.progress}
            tone={status.state === "behind" ? "warn" : status.state === "overdue" ? "bad" : status.state === "unset" ? "primary" : "good"}
            label={`${goal.name}: ${Math.round(status.progress * 100)} percent saved`}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Target">
            <AmountInput value={goal.target} onCommit={(target) => patchGoal(goal.id, { target })} label={`Target for ${goal.name}`} />
          </Field>
          <Field label="Saved so far">
            <AmountInput value={goal.saved} onCommit={(saved) => patchGoal(goal.id, { saved })} label={`Saved so far for ${goal.name}`} />
          </Field>
          <Field label="Needed by">
            <MonthInput value={goal.deadline} onChange={(deadline) => patchGoal(goal.id, { deadline })} label={`Deadline for ${goal.name}`} />
          </Field>
          <Field label="Setting aside each month">
            <AmountInput value={goal.monthly} onCommit={(monthly) => patchGoal(goal.id, { monthly })} label={`Monthly saving for ${goal.name}`} />
          </Field>
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">
          {status.state === "unset" ? (
            "Enter a target and a date to see how much a month this takes."
          ) : status.state === "reached" ? (
            "This goal is fully funded."
          ) : status.state === "overdue" ? (
            <>The deadline has passed with {money(status.remaining)} still to save. Move the date or the target.</>
          ) : (
            <>
              To arrive exactly on time you need{" "}
              <span className="numeric font-medium text-foreground">{money(status.requiredMonthly)}</span> a month for{" "}
              {status.monthsLeft} {status.monthsLeft === 1 ? "month" : "months"}.{" "}
              {status.state === "on-track" ? (
                status.projectedMonth !== null ? (
                  <>At your current rate you get there in {formatMonth(status.projectedMonth, "long")}.</>
                ) : null
              ) : (
                <>
                  At your current rate you will be{" "}
                  <span className="numeric font-medium text-loss">{money(status.shortfallAtDeadline)}</span> short
                  {status.projectedMonth !== null ? <>, and reach the target in {formatMonth(status.projectedMonth, "long")}</> : null}.
                </>
              )}
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}

export function GoalsTab({ plan, thisMonth }: { readonly plan: PlanState; readonly thisMonth: Month }) {
  const commitment = monthlyGoalCommitment(plan.goals, thisMonth);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Things to save for besides the applications themselves. What you set aside here —{" "}
          <span className="numeric font-medium text-foreground">{formatHome(commitment, plan.settings)}</span> this
          month — is taken out of your cash-flow projection, so the two always agree.
        </p>
        <Button
          type="button"
          onClick={() =>
            planStore.update((current) => ({
              ...current,
              goals: [
                ...current.goals,
                { id: newId("goal"), name: "New goal", target: 0, saved: 0, deadline: addMonths(thisMonth, 6), monthly: 0 },
              ],
            }))
          }
        >
          <Plus />
          Add a goal
        </Button>
      </div>

      {plan.goals.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No goals yet</CardTitle>
            <CardDescription>
              A laptop, the flight, a housing deposit: anything with an amount and a date. Add one to see how much a
              month it takes.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4">
          {plan.goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} plan={plan} thisMonth={thisMonth} />
          ))}
        </div>
      )}
    </div>
  );
}
