"use client";

import { formatNumber } from "@/lib/utils";

/**
 * A single series entry as recharts hands it to a custom tooltip.
 *
 * Recharts types the built-in `formatter`/`labelFormatter` props loosely
 * (`ValueType | undefined`), which fights strict mode. Supplying a custom
 * `content` component instead lets us state exactly the shape we consume and
 * keeps every tooltip in the app on the same visual footing.
 */
export interface ChartTooltipRow {
  readonly name?: string | number;
  readonly value?: string | number | readonly (string | number)[];
  readonly color?: string;
  readonly dataKey?: string | number;
}

export interface ChartTooltipProps {
  active?: boolean;
  payload?: readonly ChartTooltipRow[];
  label?: string | number;
  /** Prefix for the label line, e.g. `"x = "`. */
  labelPrefix?: string;
  /** Decimal places for numeric values. */
  decimals?: number;
  /** Override the label rendering entirely. */
  labelFormatter?: (label: string | number | undefined) => string;
}

function renderValue(
  value: ChartTooltipRow["value"],
  decimals: number,
): string {
  if (typeof value === "number") return formatNumber(value, decimals);
  if (Array.isArray(value)) {
    return value.map((entry) => (typeof entry === "number" ? formatNumber(entry, decimals) : String(entry))).join(" – ");
  }
  return value === undefined ? "—" : String(value);
}

/** Themed tooltip shared by every chart in the workbench. */
export function ChartTooltip({
  active,
  payload,
  label,
  labelPrefix = "",
  decimals = 4,
  labelFormatter,
}: ChartTooltipProps) {
  if (active !== true || payload === undefined || payload.length === 0) return null;

  const heading =
    labelFormatter !== undefined
      ? labelFormatter(label)
      : `${labelPrefix}${typeof label === "number" ? formatNumber(label, 3) : (label ?? "")}`;

  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-lg">
      <p className="numeric text-xs text-muted-foreground">{heading}</p>
      <ul className="mt-1 space-y-0.5">
        {payload.map((row, index) => (
          <li key={index} className="flex items-center gap-2 text-xs">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: row.color }}
              aria-hidden
            />
            <span className="text-muted-foreground">{row.name}</span>
            <span className="numeric ml-auto font-medium text-foreground">
              {renderValue(row.value, decimals)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
