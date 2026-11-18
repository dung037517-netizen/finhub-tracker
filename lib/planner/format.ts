/**
 * Money formatting for the planner.
 */

import type { PlanSettings } from "@/types/planner";

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, compact: boolean, fractionDigits: number): Intl.NumberFormat {
  const key = `${currency}|${compact ? 1 : 0}|${fractionDigits}`;
  const cached = formatters.get(key);
  if (cached !== undefined) return cached;
  let created: Intl.NumberFormat;
  try {
    created = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: compact ? "compact" : "standard",
      minimumFractionDigits: compact ? 0 : fractionDigits,
      maximumFractionDigits: compact ? 1 : fractionDigits,
    });
  } catch {
    // An unknown currency code: fall back to a plain number with the code after it.
    created = new Intl.NumberFormat("en-US", { maximumFractionDigits: fractionDigits });
  }
  formatters.set(key, created);
  return created;
}

/** Currencies whose amounts are large enough that minor units are noise. */
function digitsFor(currency: string, value: number): number {
  if (["VND", "KRW", "JPY", "IDR"].includes(currency)) return 0;
  return Math.abs(value) >= 1000 ? 0 : 2;
}

export function formatMoney(value: number, currency: string, compact = false): string {
  if (!Number.isFinite(value)) return "—";
  // Avoid "-$0".
  const safe = Math.abs(value) < 0.005 ? 0 : value;
  return formatter(currency, compact && Math.abs(safe) >= 100_000, digitsFor(currency, safe)).format(safe);
}

export function formatUsd(value: number, compact = false): string {
  return formatMoney(value, "USD", compact);
}

export function formatHome(value: number, settings: PlanSettings, compact = false): string {
  return formatMoney(value, settings.homeCurrency, compact);
}

/** "12.5%" from 0.125. */
export function formatShare(value: number | null, decimals = 0): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(decimals)}%`;
}

/** Parse what a person types into a money field: digits with optional separators. */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[,\s_]/g, "");
  if (cleaned.length === 0 || !/^\d*\.?\d*$/.test(cleaned)) return null;
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
