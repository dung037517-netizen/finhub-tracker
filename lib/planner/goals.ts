/**
 * Savings goals: how much a month a target needs, and whether the current
 * contribution gets there in time.
 */

import { addMonths, monthsBetween } from "@/lib/planner/months";
import type { Goal, Month } from "@/types/planner";

export type GoalState = "unset" | "reached" | "on-track" | "behind" | "overdue";

export const GOAL_STATE_LABELS: Readonly<Record<GoalState, string>> = {
  unset: "No target yet",
  reached: "Reached",
  "on-track": "On track",
  behind: "Behind",
  overdue: "Past deadline",
};

export interface GoalStatus {
  readonly goal: Goal;
  readonly remaining: number;
  /** Months of saving left, counting the current month. */
  readonly monthsLeft: number;
  /** Level monthly amount that reaches the target exactly on the deadline. */
  readonly requiredMonthly: number;
  /** Saved so far as a share of the target, capped at 1. */
  readonly progress: number;
  /** When the current contribution would reach the target, or null if never. */
  readonly projectedMonth: Month | null;
  /** What the goal will be short by on its deadline at the current contribution. */
  readonly shortfallAtDeadline: number;
  readonly state: GoalState;
}

/**
 * Status of a goal as of `now`. A contribution is assumed to be made in every
 * month from `now` up to and including the deadline month.
 */
export function goalStatus(goal: Goal, now: Month): GoalStatus {
  const monthsLeft = Math.max(0, monthsBetween(now, goal.deadline) + 1);
  if (!(goal.target > 0)) {
    // Nothing to measure against yet: not reached, not behind.
    return { goal, remaining: 0, monthsLeft, requiredMonthly: 0, progress: 0, projectedMonth: null, shortfallAtDeadline: 0, state: "unset" };
  }
  const remaining = Math.max(0, goal.target - goal.saved);
  const progress = Math.min(1, goal.saved / goal.target);

  if (remaining === 0) {
    return { goal, remaining, monthsLeft, requiredMonthly: 0, progress: 1, projectedMonth: now, shortfallAtDeadline: 0, state: "reached" };
  }

  const requiredMonthly = monthsLeft > 0 ? remaining / monthsLeft : remaining;
  const projectedMonth = goal.monthly > 0 ? addMonths(now, Math.ceil(remaining / goal.monthly) - 1) : null;
  const shortfallAtDeadline = Math.max(0, remaining - goal.monthly * monthsLeft);
  const state: GoalState =
    monthsLeft === 0 ? "overdue" : goal.monthly + 1e-9 >= requiredMonthly ? "on-track" : "behind";
  return { goal, remaining, monthsLeft, requiredMonthly, progress, projectedMonth, shortfallAtDeadline, state };
}

/** Total set aside for unfinished goals each month. */
export function monthlyGoalCommitment(goals: readonly Goal[], now: Month): number {
  return goals.reduce((total, goal) => {
    const status = goalStatus(goal, now);
    return status.state === "reached" || status.state === "unset" || status.monthsLeft === 0 ? total : total + goal.monthly;
  }, 0);
}
