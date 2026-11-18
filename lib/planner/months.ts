/**
 * Calendar-month arithmetic.
 *
 * The planner works in whole months, written `YYYY-MM`. A month is converted
 * to a single integer (months since year 0) for arithmetic and back again for
 * display, which avoids every time-zone and day-of-month pitfall of `Date`.
 */

import type { Month } from "@/types/planner";

const PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonth(value: unknown): value is Month {
  return typeof value === "string" && PATTERN.test(value);
}

/** Months since year 0. Throws on a malformed month, which is a programming error. */
export function monthIndex(month: Month): number {
  const match = PATTERN.exec(month);
  if (match === null) throw new Error(`Not a month: ${month}`);
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

export function fromIndex(index: number): Month {
  const year = Math.floor(index / 12);
  const month = index - year * 12 + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export function addMonths(month: Month, count: number): Month {
  return fromIndex(monthIndex(month) + count);
}

/** Whole months from `from` to `to`; negative if `to` is earlier. */
export function monthsBetween(from: Month, to: Month): number {
  return monthIndex(to) - monthIndex(from);
}

/** Every month from `start` to `end`, inclusive. Empty if `end` is earlier. */
export function monthRange(start: Month, end: Month): Month[] {
  const first = monthIndex(start);
  const last = monthIndex(end);
  const months: Month[] = [];
  for (let index = first; index <= last; index += 1) months.push(fromIndex(index));
  return months;
}

/** The month a `YYYY-MM-DD` date falls in, or null if it is malformed. */
export function monthOfDate(date: string): Month | null {
  const month = date.slice(0, 7);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && isMonth(month) ? month : null;
}

/** The local calendar month of a timestamp. */
export function monthOfTimestamp(timestamp: number): Month {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** The local calendar date of a timestamp, as `YYYY-MM-DD`. */
export function dateOfTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return `${monthOfTimestamp(timestamp)}-${String(date.getDate()).padStart(2, "0")}`;
}

const SHORT_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "Nov 2026" or "November 2026". */
export function formatMonth(month: Month, style: "short" | "long" = "short"): string {
  const match = PATTERN.exec(month);
  if (match === null) return month;
  const names = style === "short" ? SHORT_NAMES : LONG_NAMES;
  return `${names[Number(match[2]) - 1]} ${match[1]}`;
}

/** Keep a month inside a range. */
export function clampMonth(month: Month, min: Month, max: Month): Month {
  const index = Math.min(Math.max(monthIndex(month), monthIndex(min)), monthIndex(max));
  return fromIndex(index);
}

/**
 * The August in which a student planning from `start` would most plausibly
 * enroll: the next August that is at least six months away.
 */
export function defaultEntryMonth(start: Month): Month {
  const startIndex = monthIndex(start);
  const year = Math.floor(startIndex / 12);
  const thisAugust = year * 12 + 7;
  return fromIndex(thisAugust - startIndex >= 6 ? thisAugust : thisAugust + 12);
}
