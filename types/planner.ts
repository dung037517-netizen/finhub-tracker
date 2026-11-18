/**
 * Domain types for the student finance planner.
 *
 * Two currencies are involved and they are kept apart on purpose. Application
 * costs are charged in U.S. dollars, so they are stored in dollars. Everything
 * a student earns, spends and saves day to day is in their home currency. The
 * exchange rate that joins the two is an explicit assumption of the plan, and
 * it can be stressed.
 */

/** A calendar month, written `YYYY-MM`. */
export type Month = string;

export interface PlanSettings {
  /** ISO 4217 code of the currency the student lives in, e.g. "VND". */
  readonly homeCurrency: string;
  /** Home-currency units per one U.S. dollar. 1 when the home currency is USD. */
  readonly usdRate: number;
  /** First month of the projection. */
  readonly startMonth: Month;
  /** The month the student starts university. */
  readonly entryMonth: Month;
  /** Savings available at the start of the first month, in home currency. */
  readonly openingBalance: number;
  /** Percentage by which the dollar is assumed to strengthen, as a stress. */
  readonly fxStressPct: number;
}

export type CostCategory =
  | "testing"
  | "scores"
  | "applications"
  | "aid"
  | "enrollment"
  | "visa"
  | "other";

export interface CostItem {
  readonly id: string;
  readonly category: CostCategory;
  readonly label: string;
  /** Price of one unit, in U.S. dollars. */
  readonly unitUsd: number;
  readonly quantity: number;
  /** The month the payment is expected. */
  readonly month: Month;
  readonly paid: boolean;
  /**
   * 1 for a payment that is planned. Below 1 for a contingency — a retake, or
   * applications that are only needed if an early round does not work out.
   */
  readonly probability: number;
  /** Contingent items that share a group happen together or not at all. */
  readonly group?: string;
  /** The reference fee this item was created from, if any. */
  readonly feeId?: string;
}

export interface IncomeSource {
  readonly id: string;
  readonly label: string;
  /** Home currency per month. */
  readonly monthly: number;
  readonly from?: Month;
  readonly until?: Month;
}

export interface BudgetLine {
  readonly id: string;
  readonly category: string;
  /** Planned spending per month, in home currency. */
  readonly monthly: number;
}

export type TransactionKind = "income" | "expense";

export interface Transaction {
  readonly id: string;
  /** `YYYY-MM-DD`. */
  readonly date: string;
  readonly description: string;
  /** Always positive, in home currency; `kind` carries the direction. */
  readonly amount: number;
  readonly kind: TransactionKind;
  readonly category: string;
}

export interface Goal {
  readonly id: string;
  readonly name: string;
  readonly target: number;
  readonly saved: number;
  readonly deadline: Month;
  /** What the student plans to set aside each month. */
  readonly monthly: number;
}

export interface PlanState {
  readonly version: 1;
  /** True while the plan is still the built-in example. */
  readonly sample: boolean;
  readonly settings: PlanSettings;
  readonly costs: readonly CostItem[];
  readonly income: readonly IncomeSource[];
  readonly budget: readonly BudgetLine[];
  readonly transactions: readonly Transaction[];
  readonly goals: readonly Goal[];
}

/** Answers to the short questionnaire that drafts a cost schedule. */
export interface ApplicantProfile {
  readonly colleges: number;
  /** One binding early application, so the rest are needed only if it fails. */
  readonly earlyDecision: boolean;
  /** The student's own estimate of being admitted early, in percent. */
  readonly earlyAdmitChancePct: number;
  readonly satSittings: number;
  /** Chance of sitting the SAT once more than planned, in percent. */
  readonly satRetakeChancePct: number;
  readonly apExams: number;
  readonly englishTests: number;
  /** Colleges that will be sent a CSS Profile. */
  readonly cssColleges: number;
  readonly needsVisa: boolean;
}
