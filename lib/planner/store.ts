/**
 * The one place the plan is read and written.
 *
 * A small external store for `useSyncExternalStore`. The server snapshot is
 * an empty plan, so the first client render matches the server; the saved
 * plan (or the example, on a first visit) arrives immediately after.
 */

import { blankPlan, buildSamplePlan, EMPTY_PLAN } from "@/lib/planner/sample";
import {
  clearPlan,
  loadPlan,
  readLegacyTransactions,
  savePlan,
  STORAGE_KEY,
  type KeyValueStore,
} from "@/lib/planner/storage";
import type { PlanState } from "@/types/planner";

export interface PlanSnapshot {
  readonly plan: PlanState;
  /** False until the saved plan has been read on the client. */
  readonly hydrated: boolean;
  /** False if the browser refused the last write. */
  readonly persisted: boolean;
  /** Wall-clock time of the last change, so rendering never reads the clock. */
  readonly now: number;
  /** Transactions left behind by the first version of the app, not yet imported. */
  readonly legacyCount: number;
}

const SERVER_SNAPSHOT: PlanSnapshot = {
  plan: EMPTY_PLAN,
  hydrated: false,
  persisted: true,
  now: 0,
  legacyCount: 0,
};

let snapshot: PlanSnapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();

function storage(): KeyValueStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

function commit(plan: PlanState): void {
  snapshot = { ...snapshot, plan, persisted: savePlan(storage(), plan), now: Date.now() };
  emit();
}

function hydrate(): void {
  if (snapshot.hydrated) return;
  const now = Date.now();
  const saved = loadPlan(storage());
  const legacy = readLegacyTransactions(storage());
  const known = new Set((saved?.transactions ?? []).map((transaction) => transaction.id));
  snapshot = {
    // The example is shown, not saved, until the student changes something.
    plan: saved ?? buildSamplePlan(now),
    hydrated: true,
    persisted: true,
    now,
    legacyCount: legacy.filter((transaction) => !known.has(transaction.id)).length,
  };
}

function onStorage(event: StorageEvent): void {
  if (event.key !== STORAGE_KEY) return;
  const saved = loadPlan(storage());
  if (saved === null) return;
  snapshot = { ...snapshot, plan: saved, now: Date.now() };
  emit();
}

export const planStore = {
  subscribe(listener: () => void): () => void {
    if (listeners.size === 0 && typeof window !== "undefined") {
      hydrate();
      window.addEventListener("storage", onStorage);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && typeof window !== "undefined") {
        window.removeEventListener("storage", onStorage);
      }
    };
  },

  getSnapshot(): PlanSnapshot {
    return snapshot;
  },

  getServerSnapshot(): PlanSnapshot {
    return SERVER_SNAPSHOT;
  },

  /** Apply a change to the plan and save it. */
  update(recipe: (plan: PlanState) => PlanState): void {
    commit(recipe(snapshot.plan));
  },

  /** Replace the whole plan, for example from a backup. */
  replace(plan: PlanState): void {
    commit(plan);
  },

  /** Keep the example's numbers as the student's own starting point. */
  adoptSample(): void {
    commit({ ...snapshot.plan, sample: false });
  },

  /** Start from a blank plan, keeping the currency and the dates. */
  startBlank(): void {
    commit(blankPlan(snapshot.plan.settings));
  },

  /** Throw away everything saved and show the example again. */
  resetToSample(): void {
    clearPlan(storage());
    const now = Date.now();
    snapshot = { ...snapshot, plan: buildSamplePlan(now), persisted: true, now };
    emit();
  },

  /** Bring across transactions recorded in the first version of the app. */
  importLegacy(): number {
    const known = new Set(snapshot.plan.transactions.map((transaction) => transaction.id));
    const incoming = readLegacyTransactions(storage()).filter((transaction) => !known.has(transaction.id));
    if (incoming.length === 0) return 0;
    snapshot = { ...snapshot, legacyCount: 0 };
    commit({ ...snapshot.plan, transactions: [...snapshot.plan.transactions, ...incoming] });
    return incoming.length;
  },
};

/** A short unique id for a new record, generated in an event handler. */
export function newId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : Math.floor(Math.random() * 0xffffffff).toString(16);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}
