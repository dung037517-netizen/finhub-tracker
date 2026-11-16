"use client";

import { useSyncExternalStore } from "react";

import { planStore, type PlanSnapshot } from "@/lib/planner/store";

/** The student's plan, re-rendering whenever it changes. */
export function usePlan(): PlanSnapshot {
  return useSyncExternalStore(planStore.subscribe, planStore.getSnapshot, planStore.getServerSnapshot);
}
