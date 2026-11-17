"use client";

import { ExternalLink, Plus, Sparkles, Trash2 } from "lucide-react";
import * as React from "react";

import { AmountInput, Field, MonthInput, SelectInput, Stat, TextInput } from "@/components/planner/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  costDistribution,
  costTotals,
  DEFAULT_PROFILE,
  draftCosts,
  isContingent,
  itemUsd,
  usdToHome,
} from "@/lib/planner/costs";
import { CATEGORY_LABELS, CATEGORY_ORDER, FEES_CYCLE, findFee, REFERENCE_FEES } from "@/lib/planner/fees";
import { formatHome, formatShare, formatUsd } from "@/lib/planner/format";
import { newId, planStore } from "@/lib/planner/store";
import { cn } from "@/lib/utils";
import type { ApplicantProfile, CostItem, PlanState } from "@/types/planner";

function patchCost(id: string, patch: Partial<CostItem>): void {
  planStore.update((plan) => ({
    ...plan,
    costs: plan.costs.map((item) => (item.id === id ? { ...item, ...patch } : item)),
  }));
}

function CostRow({ item, plan }: { readonly item: CostItem; readonly plan: PlanState }) {
  const fee = findFee(item.feeId);
  const total = itemUsd(item);
  return (
    <li className={cn("grid gap-x-3 gap-y-2 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center", item.paid && "opacity-60")}>
      <label className="flex items-center gap-2 text-xs text-muted-foreground sm:w-16">
        <input
          type="checkbox"
          aria-label={`Paid: ${item.label}`}
          checked={item.paid}
          onChange={(event) => patchCost(item.id, { paid: event.target.checked })}
          className="size-4 accent-[var(--primary)]"
        />
        Paid
      </label>

      <div className="min-w-0 space-y-1.5">
        <TextInput value={item.label} onCommit={(label) => patchCost(item.id, { label })} label="Description" />
        {fee?.note !== undefined ? <p className="text-xs leading-snug text-muted-foreground">{fee.note}</p> : null}
      </div>

      <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-nowrap">
        <AmountInput
          value={item.unitUsd}
          onCommit={(unitUsd) => patchCost(item.id, { unitUsd })}
          label={`Price of one, in U.S. dollars, for ${item.label}`}
          prefix="USD"
          className="sm:w-28"
          max={100000}
        />
        <AmountInput
          value={item.quantity}
          onCommit={(quantity) => patchCost(item.id, { quantity: Math.max(1, Math.round(quantity)) })}
          label={`Quantity for ${item.label}`}
          prefix="×"
          className="sm:w-20"
          max={99}
        />
        <MonthInput value={item.month} onChange={(month) => patchCost(item.id, { month })} label={`Month for ${item.label}`} className="sm:w-[10.5rem]" />
        <AmountInput
          value={Math.round(item.probability * 100)}
          onCommit={(percent) => patchCost(item.id, { probability: Math.min(100, Math.max(1, percent)) / 100 })}
          label={`Chance in percent that ${item.label} is needed`}
          prefix="%"
          className="sm:w-20"
          max={100}
        />
        <span className="numeric text-right text-sm font-medium sm:w-24" title={formatHome(usdToHome(total, plan.settings), plan.settings)}>
          {formatUsd(total)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove ${item.label}`}
          onClick={() => planStore.update((current) => ({ ...current, costs: current.costs.filter((entry) => entry.id !== item.id) }))}
          className="justify-self-end"
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

function ProfileForm({ plan, onDone }: { readonly plan: PlanState; readonly onDone: () => void }) {
  const [profile, setProfile] = React.useState<ApplicantProfile>(DEFAULT_PROFILE);
  const set = <K extends keyof ApplicantProfile>(key: K, value: ApplicantProfile[K]): void =>
    setProfile((current) => ({ ...current, [key]: value }));

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface-sunken p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Colleges you will apply to">
          <AmountInput value={profile.colleges} onCommit={(value) => set("colleges", value)} label="Colleges" max={30} />
        </Field>
        <Field label="Colleges that need the CSS Profile">
          <AmountInput value={profile.cssColleges} onCommit={(value) => set("cssColleges", value)} label="CSS Profile colleges" max={30} />
        </Field>
        <Field label="SAT sittings planned">
          <AmountInput value={profile.satSittings} onCommit={(value) => set("satSittings", value)} label="SAT sittings" max={5} />
        </Field>
        <Field label="Chance of one more SAT (%)">
          <AmountInput value={profile.satRetakeChancePct} onCommit={(value) => set("satRetakeChancePct", value)} label="Retake chance" max={100} />
        </Field>
        <Field label="AP exams">
          <AmountInput value={profile.apExams} onCommit={(value) => set("apExams", value)} label="AP exams" max={12} />
        </Field>
        <Field label="English proficiency tests">
          <AmountInput value={profile.englishTests} onCommit={(value) => set("englishTests", value)} label="English tests" max={4} />
        </Field>
        <Field label="One binding Early Decision application">
          <SelectInput
            value={profile.earlyDecision ? "yes" : "no"}
            onChange={(value) => set("earlyDecision", value === "yes")}
            label="Early Decision"
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
          />
        </Field>
        <Field label="Your estimate of early admission (%)">
          <AmountInput
            value={profile.earlyAdmitChancePct}
            onCommit={(value) => set("earlyAdmitChancePct", value)}
            label="Early admission chance"
            max={100}
            disabled={!profile.earlyDecision}
          />
        </Field>
        <Field label="You will need a student visa">
          <SelectInput
            value={profile.needsVisa ? "yes" : "no"}
            onChange={(value) => set("needsVisa", value === "yes")}
            label="Student visa"
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
          />
        </Field>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Under binding Early Decision, an admitted student withdraws every other application. The regular-round costs
        are therefore entered as a contingency, with a chance of one minus your estimate of early admission.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => {
            planStore.update((current) => ({ ...current, costs: draftCosts(profile, current.settings) }));
            onDone();
          }}
        >
          Replace my schedule with this draft
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <span className="self-center text-xs text-muted-foreground">
          {plan.costs.length > 0 ? `This replaces the ${plan.costs.length} items you have now.` : null}
        </span>
      </div>
    </div>
  );
}

export function CostsTab({ plan }: { readonly plan: PlanState }) {
  const [drafting, setDrafting] = React.useState(false);
  const [feeToAdd, setFeeToAdd] = React.useState(REFERENCE_FEES[0].id);
  const distribution = React.useMemo(() => costDistribution(plan.costs), [plan.costs]);
  const totals = React.useMemo(() => costTotals(plan.costs), [plan.costs]);
  const home = (usd: number): string => formatHome(usdToHome(usd, plan.settings), plan.settings, true);
  const showHome = plan.settings.homeCurrency !== "USD";

  const addItem = (): void => {
    const fee = findFee(feeToAdd);
    planStore.update((current) => ({
      ...current,
      costs: [
        ...current.costs,
        {
          id: newId("cost"),
          category: fee?.category ?? "other",
          label: fee?.label ?? "Other cost",
          unitUsd: fee?.usd ?? 0,
          quantity: 1,
          month: current.settings.startMonth,
          paid: false,
          probability: 1,
          feeId: fee?.id,
        },
      ],
    }));
  };

  const largest = Math.max(1, ...distribution.scenarios.map((scenario) => scenario.probability));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Already paid" value={formatUsd(totals.paidUsd)} hint={showHome ? home(totals.paidUsd) : undefined} />
        <Stat
          label="Still to pay, if nothing extra happens"
          value={formatUsd(distribution.baseUsd)}
          hint={showHome ? home(distribution.baseUsd) : "Planned payments only"}
        />
        <Stat
          label="Expected total still to pay"
          value={formatUsd(distribution.expectedUsd)}
          hint={`Contingencies weighted by their chance${showHome ? ` · ${home(distribution.expectedUsd)}` : ""}`}
        />
        <Stat
          label="Fund this much to be safe"
          value={formatUsd(distribution.p90Usd)}
          tone={distribution.marginUsd > 0 ? "warn" : undefined}
          hint={`Enough in 9 outcomes out of 10${showHome ? ` · ${home(distribution.p90Usd)}` : ""}`}
        />
      </div>

      {distribution.groups.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>What could change the total</CardTitle>
            <CardDescription>
              Every combination of the contingencies below, with its probability. The expected total is the average;
              the amount to fund is the smallest total that is enough 90% of the time. The difference,{" "}
              <span className="numeric font-medium text-foreground">{formatUsd(distribution.marginUsd)}</span>, is a
              margin for things not going to plan.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ul className="space-y-2 text-sm">
              {distribution.groups.map((group) => (
                <li key={group.key} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <span className="min-w-0">{group.label}</span>
                  <span className="numeric shrink-0 text-muted-foreground">
                    {formatShare(group.probability)} · {formatUsd(group.usd)}
                  </span>
                </li>
              ))}
            </ul>
            <ol className="space-y-1.5" aria-label="Possible totals and their probabilities">
              {distribution.scenarios.slice(0, 10).map((scenario) => (
                <li key={scenario.usd} className="grid grid-cols-[5.5rem_minmax(0,1fr)_3rem] items-center gap-3 text-sm">
                  <span className="numeric text-right">{formatUsd(scenario.usd)}</span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-surface-sunken">
                    <span
                      className={cn("block h-full rounded-full", scenario.usd <= distribution.p90Usd ? "bg-primary" : "bg-warning")}
                      style={{ width: `${(scenario.probability / largest) * 100}%` }}
                    />
                  </span>
                  <span className="numeric text-right text-muted-foreground">{formatShare(scenario.probability)}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle>Cost schedule</CardTitle>
              <CardDescription>
                Prices are in U.S. dollars because that is how they are charged. Set a chance below 100% for anything
                that may not be needed.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={() => setDrafting((current) => !current)} aria-expanded={drafting}>
              <Sparkles />
              Draft a schedule for me
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {drafting ? <ProfileForm plan={plan} onDone={() => setDrafting(false)} /> : null}

          {plan.costs.length === 0 && !drafting ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No costs yet. Draft a schedule from a few questions, or add items one at a time below.
            </p>
          ) : null}

          {CATEGORY_ORDER.map((category) => {
            const items = plan.costs.filter((item) => item.category === category);
            if (items.length === 0) return null;
            const subtotal = items.reduce((total, item) => total + (item.paid ? 0 : itemUsd(item) * item.probability), 0);
            return (
              <section key={category} aria-label={CATEGORY_LABELS[category]}>
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h3 className="text-sm font-semibold">{CATEGORY_LABELS[category]}</h3>
                  <span className="numeric text-xs text-muted-foreground">expected {formatUsd(subtotal)} to pay</span>
                </div>
                <ul className="divide-y divide-border/60">
                  {items.map((item) => (
                    <CostRow key={item.id} item={item} plan={plan} />
                  ))}
                </ul>
              </section>
            );
          })}

          <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
            <Field label="Add a cost" className="min-w-[14rem] flex-1">
              <SelectInput
                value={feeToAdd}
                onChange={setFeeToAdd}
                label="Cost to add"
                options={[
                  ...REFERENCE_FEES.map((fee) => ({ value: fee.id, label: `${fee.label} — ${formatUsd(fee.usd)} ${fee.unit}` })),
                  { value: "custom", label: "Something else" },
                ]}
              />
            </Field>
            <Button type="button" onClick={addItem}>
              <Plus />
              Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {plan.costs.filter(isContingent).length} of {plan.costs.length} items are contingencies.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Reference fees</CardTitle>
            <Badge variant="outline">{FEES_CYCLE} cycle</Badge>
          </div>
          <CardDescription>
            Starting points, not quotations. Fees change every year, several vary by country, and colleges set their
            own application fees and deposits. Confirm each one before you pay it, and edit the schedule to match.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th scope="col" className="py-2 pr-4 font-medium">Fee</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Amount</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Set by</th>
                  <th scope="col" className="py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {REFERENCE_FEES.map((fee) => (
                  <tr key={fee.id} className="border-b border-border/60 align-top">
                    <th scope="row" className="py-2.5 pr-4 font-medium">{fee.label}</th>
                    <td className="numeric whitespace-nowrap py-2.5 pr-4 text-right">
                      {formatUsd(fee.usd)} <span className="text-xs text-muted-foreground">{fee.unit}</span>
                    </td>
                    <td className="py-2.5 pr-4">
                      {fee.url !== undefined ? (
                        <a href={fee.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
                          {fee.source}
                          <ExternalLink className="size-3" aria-hidden />
                        </a>
                      ) : (
                        fee.source
                      )}
                    </td>
                    <td className="py-2.5 text-xs leading-relaxed text-muted-foreground">{fee.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
