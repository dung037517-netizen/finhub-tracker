"use client";

import * as React from "react";

import { parseAmount } from "@/lib/planner/format";
import { cn } from "@/lib/utils";

const CONTROL =
  "h-9 w-full rounded-md border border-input bg-surface-sunken px-2.5 text-sm transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-50";

function grouped(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "";
}

export interface AmountInputProps {
  readonly value: number;
  readonly onCommit: (value: number) => void;
  readonly label: string;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly max?: number;
  /** Text shown inside the field before the number, such as a currency code. */
  readonly prefix?: string;
}

/**
 * A number field for money. The student types freely; the value is parsed and
 * committed when they leave the field or press Enter, and shown with thousands
 * separators the rest of the time.
 */
export function AmountInput({ value, onCommit, label, className, disabled, max, prefix }: AmountInputProps) {
  const [draft, setDraft] = React.useState<string | null>(null);

  const commit = (): void => {
    if (draft === null) return;
    const parsed = parseAmount(draft);
    if (parsed !== null) onCommit(max === undefined ? parsed : Math.min(max, parsed));
    setDraft(null);
  };

  return (
    <span className={cn("relative block", className)}>
      {prefix !== undefined ? (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-xs text-muted-foreground">
          {prefix}
        </span>
      ) : null}
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        disabled={disabled}
        value={draft ?? grouped(value)}
        onFocus={(event) => {
          // Keep the text exactly as displayed. Changing it here would re-render
          // the field and drop the selection made below, so typing would add to
          // the old amount instead of replacing it. Separators are ignored when
          // the value is parsed.
          setDraft(grouped(value));
          event.currentTarget.select();
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(null);
            event.currentTarget.blur();
          }
        }}
        className={cn(CONTROL, "numeric text-right", prefix !== undefined && "pl-10")}
      />
    </span>
  );
}

export function TextInput({
  value,
  onCommit,
  label,
  className,
  placeholder,
}: {
  readonly value: string;
  readonly onCommit: (value: string) => void;
  readonly label: string;
  readonly className?: string;
  readonly placeholder?: string;
}) {
  const [draft, setDraft] = React.useState<string | null>(null);
  return (
    <input
      type="text"
      aria-label={label}
      placeholder={placeholder}
      value={draft ?? value}
      maxLength={80}
      onFocus={() => setDraft(value)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== null && draft.trim().length > 0) onCommit(draft.trim());
        setDraft(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      className={cn(CONTROL, className)}
    />
  );
}

export function MonthInput({
  value,
  onChange,
  label,
  className,
  min,
  max,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label: string;
  readonly className?: string;
  readonly min?: string;
  readonly max?: string;
}) {
  return (
    <input
      type="month"
      aria-label={label}
      value={value}
      min={min}
      max={max}
      onChange={(event) => {
        if (/^\d{4}-\d{2}$/.test(event.target.value)) onChange(event.target.value);
      }}
      className={cn(CONTROL, "numeric", className)}
    />
  );
}

export function SelectInput({
  value,
  onChange,
  label,
  options,
  className,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly className?: string;
}) {
  return (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className={cn(CONTROL, className)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** A visible label above a control. */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly children: React.ReactNode;
  readonly className?: string;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint !== undefined ? <span className="block text-xs leading-snug text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

/** A labeled number, used in summary rows. */
export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  readonly label: string;
  readonly value: React.ReactNode;
  readonly hint?: React.ReactNode;
  readonly tone?: "good" | "bad" | "warn";
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-3 sm:p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "numeric mt-1 text-lg font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-2xl",
          tone === "good" && "text-gain",
          tone === "bad" && "text-loss",
          tone === "warn" && "text-warning",
        )}
      >
        {value}
      </p>
      {hint !== undefined ? <p className="mt-1 text-xs leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** A thin horizontal bar showing a share of a whole. */
export function Meter({
  value,
  tone = "primary",
  label,
}: {
  /** 0–1; values above 1 fill the bar. */
  readonly value: number;
  readonly tone?: "primary" | "good" | "warn" | "bad";
  readonly label: string;
}) {
  const share = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken" role="img" aria-label={label}>
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-300",
          tone === "primary" && "bg-primary",
          tone === "good" && "bg-gain",
          tone === "warn" && "bg-warning",
          tone === "bad" && "bg-loss",
        )}
        style={{ width: `${share * 100}%` }}
      />
    </div>
  );
}
