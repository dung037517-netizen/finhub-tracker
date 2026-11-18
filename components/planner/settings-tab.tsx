"use client";

import { Download, FilePlus2, RotateCcw, Upload } from "lucide-react";
import * as React from "react";

import { AmountInput, Field, MonthInput, SelectInput } from "@/components/planner/fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exportPlan, importPlan } from "@/lib/planner/storage";
import { planStore } from "@/lib/planner/store";
import type { PlanSettings, PlanState } from "@/types/planner";

const CURRENCIES: readonly { readonly value: string; readonly label: string }[] = [
  { value: "USD", label: "USD — U.S. dollar" },
  { value: "VND", label: "VND — Vietnamese dong" },
  { value: "INR", label: "INR — Indian rupee" },
  { value: "CNY", label: "CNY — Chinese yuan" },
  { value: "KRW", label: "KRW — South Korean won" },
  { value: "JPY", label: "JPY — Japanese yen" },
  { value: "IDR", label: "IDR — Indonesian rupiah" },
  { value: "THB", label: "THB — Thai baht" },
  { value: "PHP", label: "PHP — Philippine peso" },
  { value: "MYR", label: "MYR — Malaysian ringgit" },
  { value: "SGD", label: "SGD — Singapore dollar" },
  { value: "EUR", label: "EUR — euro" },
  { value: "GBP", label: "GBP — pound sterling" },
  { value: "CAD", label: "CAD — Canadian dollar" },
  { value: "AUD", label: "AUD — Australian dollar" },
  { value: "BRL", label: "BRL — Brazilian real" },
  { value: "NGN", label: "NGN — Nigerian naira" },
];

function patch(change: Partial<PlanSettings>): void {
  planStore.update((plan) => ({ ...plan, settings: { ...plan.settings, ...change } }));
}

export function SettingsTab({ plan, persisted }: { readonly plan: PlanState; readonly persisted: boolean }) {
  const { settings } = plan;
  const [message, setMessage] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState<"blank" | "sample" | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const download = (): void => {
    const blob = new Blob([exportPlan(plan, Date.now())], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "finhub-plan.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("Backup downloaded.");
  };

  const upload = async (file: File): Promise<void> => {
    const result = importPlan(await file.text());
    if (result.ok) {
      planStore.replace(result.plan);
      setMessage("Backup restored.");
    } else {
      setMessage(result.error);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Currency and dates</CardTitle>
          <CardDescription>
            Fees are charged in U.S. dollars. Everything else — income, budget, goals — is in the currency you live in.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Your currency">
            <SelectInput
              value={settings.homeCurrency}
              label="Your currency"
              options={CURRENCIES.some((entry) => entry.value === settings.homeCurrency) ? CURRENCIES : [...CURRENCIES, { value: settings.homeCurrency, label: settings.homeCurrency }]}
              onChange={(homeCurrency) => patch(homeCurrency === "USD" ? { homeCurrency, usdRate: 1, fxStressPct: 0 } : { homeCurrency })}
            />
          </Field>
          <Field
            label={`1 U.S. dollar in ${settings.homeCurrency}`}
            hint={settings.homeCurrency === "USD" ? "Fixed at 1." : "You set this. Use the rate your bank actually charges, not the headline rate."}
          >
            <AmountInput value={settings.usdRate} onCommit={(usdRate) => patch({ usdRate: usdRate > 0 ? usdRate : 1 })} label="Exchange rate" disabled={settings.homeCurrency === "USD"} />
          </Field>
          <Field label="Plan from">
            <MonthInput value={settings.startMonth} max={settings.entryMonth} onChange={(startMonth) => patch({ startMonth })} label="First month of the plan" />
          </Field>
          <Field label="You start university in">
            <MonthInput value={settings.entryMonth} min={settings.startMonth} onChange={(entryMonth) => patch({ entryMonth })} label="Entry month" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your data</CardTitle>
          <CardDescription>
            The plan is stored only in this browser. There is no account and nothing is sent anywhere, so clearing your
            browser data clears the plan. Download a backup to keep it or to move it to another device.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={download}>
              <Download />
              Download backup
            </Button>
            <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
              <Upload />
              Restore backup
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              tabIndex={-1}
              aria-label="Choose a backup file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file !== undefined) void upload(file);
                event.target.value = "";
              }}
            />
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={() => setConfirming("blank")}>
              <FilePlus2 />
              Start a blank plan
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming("sample")}>
              <RotateCcw />
              Reset to the example
            </Button>
          </div>
          {confirming !== null ? (
            <div role="alertdialog" aria-label="Confirm" className="space-y-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
              <p>
                {confirming === "blank"
                  ? "This removes every cost, transaction, budget line and goal, keeping only your currency and dates."
                  : "This discards your plan and loads the example again."}{" "}
                It cannot be undone.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (confirming === "blank") planStore.startBlank();
                    else planStore.resetToSample();
                    setConfirming(null);
                    setMessage(confirming === "blank" ? "Started a blank plan." : "Example restored.");
                  }}
                >
                  Yes, do it
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
          {message !== null ? (
            <p role="status" className="text-sm text-muted-foreground">
              {message}
            </p>
          ) : null}
          {!persisted ? (
            <p role="alert" className="text-sm text-loss">
              This browser is not allowing data to be saved (private browsing or full storage). Your plan will be lost
              when you close the tab.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
