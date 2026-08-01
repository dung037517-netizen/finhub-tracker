"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent, formatSignedPercent } from "@/lib/finance-engine";
import { cn } from "@/lib/utils";
import type { PositionValuation } from "@/types/finance";

type SortKey =
  | "symbol"
  | "marketValue"
  | "unrealizedPnl"
  | "unrealizedPnlPercent"
  | "dayChangePercent"
  | "weight"
  | "riskContribution";

interface Column {
  readonly key: SortKey | "quantity" | "averageCost" | "lastPrice" | "realizedPnl";
  readonly label: string;
  readonly sortable: boolean;
  readonly align: "left" | "right";
  readonly hideBelow?: "sm" | "md" | "lg";
}

const COLUMNS: readonly Column[] = [
  { key: "symbol", label: "Holding", sortable: true, align: "left" },
  { key: "quantity", label: "Qty", sortable: false, align: "right", hideBelow: "md" },
  { key: "averageCost", label: "Avg cost", sortable: false, align: "right", hideBelow: "lg" },
  { key: "lastPrice", label: "Last", sortable: false, align: "right" },
  { key: "dayChangePercent", label: "Day", sortable: true, align: "right" },
  { key: "marketValue", label: "Value", sortable: true, align: "right" },
  { key: "unrealizedPnl", label: "Unrealised", sortable: true, align: "right", hideBelow: "sm" },
  { key: "realizedPnl", label: "Realised", sortable: false, align: "right", hideBelow: "lg" },
  { key: "weight", label: "Weight", sortable: true, align: "right", hideBelow: "md" },
  {
    key: "riskContribution",
    label: "Risk",
    sortable: true,
    align: "right",
    hideBelow: "md",
  },
];

const HIDE_CLASSES: Readonly<Record<"sm" | "md" | "lg", string>> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
};

/** Flash a cell green or red for one animation cycle when its price moves. */
function usePriceFlash(price: number): "up" | "down" | null {
  const previous = React.useRef(price);
  const [direction, setDirection] = React.useState<"up" | "down" | null>(null);

  React.useEffect(() => {
    if (price === previous.current) return;
    const next = price > previous.current ? "up" : "down";
    previous.current = price;
    setDirection(next);
    const timeout = setTimeout(() => setDirection(null), 600);
    return () => clearTimeout(timeout);
  }, [price]);

  return direction;
}

function PriceCell({ price }: { price: number }) {
  const flash = usePriceFlash(price);
  return (
    <td
      className={cn(
        "numeric px-3 py-2.5 text-right tabular-nums transition-colors",
        flash === "up" && "tick-up",
        flash === "down" && "tick-down",
      )}
    >
      {formatCurrency(price)}
    </td>
  );
}

export interface PortfolioTableProps {
  positions: readonly PositionValuation[];
  className?: string;
}

/**
 * Live holdings table.
 *
 * Sorting is applied to a copy so the incoming array is never mutated — with a
 * streaming feed, mutating the source would make row identity flicker between
 * ticks and defeat React's reconciliation.
 */
export function PortfolioTable({ positions, className }: PortfolioTableProps) {
  const [sortKey, setSortKey] = React.useState<SortKey>("marketValue");
  const [ascending, setAscending] = React.useState(false);

  const sorted = React.useMemo(() => {
    const copy = [...positions];
    copy.sort((a, b) => {
      const left = a[sortKey];
      const right = b[sortKey];
      const comparison =
        typeof left === "string" && typeof right === "string"
          ? left.localeCompare(right)
          : Number(left) - Number(right);
      return ascending ? comparison : -comparison;
    });
    return copy;
  }, [positions, sortKey, ascending]);

  const toggleSort = (key: SortKey): void => {
    if (key === sortKey) {
      setAscending((current) => !current);
      return;
    }
    setSortKey(key);
    setAscending(key === "symbol");
  };

  const totals = React.useMemo(
    () => ({
      marketValue: positions.reduce((sum, position) => sum + position.marketValue, 0),
      unrealized: positions.reduce((sum, position) => sum + position.unrealizedPnl, 0),
      realized: positions.reduce((sum, position) => sum + position.realizedPnl, 0),
    }),
    [positions],
  );

  return (
    <div className={cn("overflow-x-auto scrollbar-thin", className)}>
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">
          Portfolio holdings with live prices, profit and loss, and risk contribution
        </caption>
        <thead>
          <tr className="border-b border-border">
            {COLUMNS.map((column) => {
              const isSorted = column.sortable && column.key === sortKey;
              const Icon = !column.sortable
                ? null
                : isSorted
                  ? ascending
                    ? ArrowUp
                    : ArrowDown
                  : ArrowUpDown;

              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    isSorted ? (ascending ? "ascending" : "descending") : undefined
                  }
                  className={cn(
                    "px-3 pb-2 text-xs font-medium text-muted-foreground",
                    column.align === "right" ? "text-right" : "text-left",
                    column.hideBelow !== undefined && HIDE_CLASSES[column.hideBelow],
                  )}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key as SortKey)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded transition-colors hover:text-foreground",
                        column.align === "right" && "flex-row-reverse",
                        isSorted && "text-foreground",
                      )}
                    >
                      {column.label}
                      {Icon !== null && <Icon className="size-3" aria-hidden />}
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {sorted.map((position) => (
            <tr
              key={position.symbol}
              className="border-b border-border/60 transition-colors last:border-0 hover:bg-surface-raised"
            >
              <th scope="row" className="px-3 py-2.5 text-left font-normal">
                <div className="flex flex-col">
                  <span className="numeric font-medium">{position.symbol}</span>
                  <span className="truncate text-xs text-muted-foreground">{position.name}</span>
                </div>
              </th>

              <td className={cn("numeric px-3 py-2.5 text-right", HIDE_CLASSES.md)}>
                {position.quantity.toLocaleString("en-US", { maximumFractionDigits: 4 })}
              </td>

              <td className={cn("numeric px-3 py-2.5 text-right", HIDE_CLASSES.lg)}>
                {formatCurrency(position.averageCost)}
              </td>

              <PriceCell price={position.lastPrice} />

              <td
                className={cn(
                  "numeric px-3 py-2.5 text-right",
                  position.dayChangePercent >= 0 ? "text-gain" : "text-loss",
                )}
              >
                {formatSignedPercent(position.dayChangePercent)}
              </td>

              <td className="numeric px-3 py-2.5 text-right font-medium">
                {formatCurrency(position.marketValue, "USD", true)}
              </td>

              <td className={cn("px-3 py-2.5 text-right", HIDE_CLASSES.sm)}>
                <div className="flex flex-col items-end">
                  <span
                    className={cn(
                      "numeric",
                      position.unrealizedPnl >= 0 ? "text-gain" : "text-loss",
                    )}
                  >
                    {position.unrealizedPnl >= 0 ? "+" : "−"}
                    {formatCurrency(Math.abs(position.unrealizedPnl), "USD", true)}
                  </span>
                  <span className="numeric text-xs text-muted-foreground">
                    {formatSignedPercent(position.unrealizedPnlPercent)}
                  </span>
                </div>
              </td>

              <td
                className={cn(
                  "numeric px-3 py-2.5 text-right",
                  HIDE_CLASSES.lg,
                  position.realizedPnl >= 0 ? "text-gain" : "text-loss",
                )}
              >
                {position.realizedPnl >= 0 ? "+" : "−"}
                {formatCurrency(Math.abs(position.realizedPnl))}
              </td>

              <td className={cn("numeric px-3 py-2.5 text-right", HIDE_CLASSES.md)}>
                {formatPercent(position.weight, 1)}
              </td>

              <td className={cn("px-3 py-2.5 text-right", HIDE_CLASSES.md)}>
                <div className="flex items-center justify-end gap-2">
                  {/* A bar makes the weight/risk divergence readable at a glance. */}
                  <span
                    className="h-1.5 w-10 overflow-hidden rounded-full bg-surface-sunken"
                    aria-hidden
                  >
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{
                        width: `${Math.min(100, Math.max(0, position.riskContribution * 100))}%`,
                      }}
                    />
                  </span>
                  <span className="numeric w-12 text-right">
                    {formatPercent(position.riskContribution, 1)}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>

        <tfoot>
          <tr className="border-t border-border">
            <th scope="row" className="px-3 pt-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
              Total
            </th>
            <td className={cn("px-3 pt-3", HIDE_CLASSES.md)} />
            <td className={cn("px-3 pt-3", HIDE_CLASSES.lg)} />
            <td className="px-3 pt-3" />
            <td className="px-3 pt-3" />
            <td className="numeric px-3 pt-3 text-right font-semibold">
              {formatCurrency(totals.marketValue, "USD", true)}
            </td>
            <td
              className={cn(
                "numeric px-3 pt-3 text-right font-semibold",
                HIDE_CLASSES.sm,
                totals.unrealized >= 0 ? "text-gain" : "text-loss",
              )}
            >
              {totals.unrealized >= 0 ? "+" : "−"}
              {formatCurrency(Math.abs(totals.unrealized), "USD", true)}
            </td>
            <td
              className={cn(
                "numeric px-3 pt-3 text-right font-semibold",
                HIDE_CLASSES.lg,
                totals.realized >= 0 ? "text-gain" : "text-loss",
              )}
            >
              {totals.realized >= 0 ? "+" : "−"}
              {formatCurrency(Math.abs(totals.realized))}
            </td>
            <td className={cn("numeric px-3 pt-3 text-right", HIDE_CLASSES.md)}>
              <Badge variant="outline">100%</Badge>
            </td>
            <td className={cn("px-3 pt-3", HIDE_CLASSES.md)} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
