"use client";

import { Download, History, Plus, Trash2 } from "lucide-react";
import * as React from "react";

import { AmountInput, Field, MonthInput, SelectInput } from "@/components/planner/fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, monthBudget } from "@/lib/planner/budget";
import { formatHome } from "@/lib/planner/format";
import { formatMonth } from "@/lib/planner/months";
import { newId, planStore } from "@/lib/planner/store";
import { cn } from "@/lib/utils";
import type { Month, PlanState, TransactionKind } from "@/types/planner";

const CONTROL =
  "h-9 w-full rounded-md border border-input bg-surface-sunken px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";

function csvCell(value: string | number): string {
  const text = String(value);
  // Leading =, +, - or @ would be run as a formula by a spreadsheet.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export interface TransactionsTabProps {
  readonly plan: PlanState;
  readonly thisMonth: Month;
  readonly today: string;
  readonly legacyCount: number;
}

export function TransactionsTab({ plan, thisMonth, today, legacyCount }: TransactionsTabProps) {
  const [chosen, setChosen] = React.useState<Month | null>(null);
  const month = chosen ?? thisMonth;
  const [kind, setKind] = React.useState<TransactionKind>("expense");
  const [date, setDate] = React.useState<string | null>(null);
  const [category, setCategory] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState(0);
  const [notice, setNotice] = React.useState<string | null>(null);

  const categories = kind === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const activeCategory = categories.includes(category) ? category : categories[0];
  const activeDate = date ?? today;
  const summary = React.useMemo(() => monthBudget(plan, month), [plan, month]);
  const money = (value: number): string => formatHome(value, plan.settings);

  const add = (): void => {
    if (amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(activeDate)) {
      setNotice("Enter a date and an amount greater than zero.");
      return;
    }
    planStore.update((current) => ({
      ...current,
      transactions: [
        ...current.transactions,
        {
          id: newId("tx"),
          date: activeDate,
          description: description.trim().length > 0 ? description.trim().slice(0, 120) : activeCategory,
          amount,
          kind,
          category: activeCategory,
        },
      ],
    }));
    setDescription("");
    setAmount(0);
    setChosen(activeDate.slice(0, 7));
    setNotice(null);
  };

  const download = (): void => {
    const rows = [
      ["date", "type", "category", "description", `amount_${plan.settings.homeCurrency}`],
      ...[...plan.transactions]
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .map((entry) => [entry.date, entry.kind, entry.category, entry.description, entry.amount]),
    ];
    const blob = new Blob([rows.map((row) => row.map(csvCell).join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "finhub-transactions.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {legacyCount > 0 ? (
        <Card className="border-primary/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="flex items-center gap-2 text-sm">
              <History className="size-4 text-primary" aria-hidden />
              This browser holds {legacyCount} {legacyCount === 1 ? "transaction" : "transactions"} from FinanceFlow,
              the first version of this app.
            </p>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                const imported = planStore.importLegacy();
                setNotice(`Imported ${imported} ${imported === 1 ? "transaction" : "transactions"}.`);
              }}
            >
              Bring them across
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Record a transaction</CardTitle>
          <CardDescription>Amounts are in {plan.settings.homeCurrency}. Recorded spending feeds the Budget tab.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[9rem_10rem_11rem_minmax(0,1fr)_10rem_auto] lg:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              add();
            }}
          >
            <Field label="Type">
              <SelectInput
                value={kind}
                onChange={(value) => setKind(value === "income" ? "income" : "expense")}
                label="Type"
                options={[
                  { value: "expense", label: "Spending" },
                  { value: "income", label: "Income" },
                ]}
              />
            </Field>
            <Field label="Date">
              <input type="date" aria-label="Date" value={activeDate} max={today} onChange={(event) => setDate(event.target.value)} className={cn(CONTROL, "numeric")} />
            </Field>
            <Field label="Category">
              <SelectInput value={activeCategory} onChange={setCategory} label="Category" options={categories.map((entry) => ({ value: entry, label: entry }))} />
            </Field>
            <Field label="Description">
              <input type="text" aria-label="Description" value={description} maxLength={120} placeholder="Optional" onChange={(event) => setDescription(event.target.value)} className={CONTROL} />
            </Field>
            <Field label="Amount">
              <AmountInput value={amount} onCommit={setAmount} label="Amount" />
            </Field>
            <Button type="submit">
              <Plus />
              Add
            </Button>
          </form>
          {notice !== null ? (
            <p role="status" className="mt-3 text-sm text-muted-foreground">
              {notice}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle>{formatMonth(month, "long")}</CardTitle>
              <CardDescription>
                {summary.transactions.length} {summary.transactions.length === 1 ? "transaction" : "transactions"} ·
                income {money(summary.income)} · spending {money(summary.spent)}
              </CardDescription>
            </div>
            <div className="flex items-end gap-2">
              <MonthInput value={month} onChange={setChosen} label="Month to show" className="w-40" />
              <Button type="button" variant="outline" onClick={download} disabled={plan.transactions.length === 0}>
                <Download />
                CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {summary.transactions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              Nothing recorded for this month.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {summary.transactions.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 py-2.5">
                  <span className="numeric w-12 shrink-0 text-xs text-muted-foreground">{entry.date.slice(8)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{entry.description}</span>
                    <span className="block text-xs text-muted-foreground">{entry.category}</span>
                  </span>
                  <span className={cn("numeric shrink-0 text-sm font-medium", entry.kind === "income" ? "text-gain" : "text-foreground")}>
                    {entry.kind === "income" ? "+" : "−"}
                    {money(entry.amount)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${entry.description} on ${entry.date}`}
                    onClick={() => planStore.update((current) => ({ ...current, transactions: current.transactions.filter((candidate) => candidate.id !== entry.id) }))}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
