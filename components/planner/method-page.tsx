import { ExternalLink } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Latex } from "@/components/finance/latex";
import { PageHeading, PageShell } from "@/components/site/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CATEGORY_LABELS, FEES_CYCLE, REFERENCE_FEES } from "@/lib/planner/fees";
import { formatUsd } from "@/lib/planner/format";
import { REPOSITORY_URL } from "@/lib/site";

function Section({ id, title, children }: { readonly id: string; readonly title: string; readonly children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <h2 id={`${id}-title`} className="mb-3 text-xl font-semibold tracking-tight">
        {title}
      </h2>
      <div className="space-y-3 leading-relaxed text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

export function MethodPage() {
  return (
    <PageShell>
      <div className="mx-auto max-w-[860px]">
        <PageHeading
          title="Method and sources"
          description="How the planner turns a list of fees into a plan, where its reference figures come from, and what it does not know."
        />

        <div className="space-y-10">
          <Section id="structure" title="1. The cost structure of a U.S. application">
            <p>
              Applying to U.S. colleges from abroad is a sequence of separate payments to different organizations,
              spread over about a year, and most of them are not to a college. The planner follows that sequence:
            </p>
            <ol className="list-decimal space-y-1.5 pl-5">
              <li><strong>Tests</strong> through the autumn before applications are due: the SAT, AP exams, an English proficiency test.</li>
              <li><strong>Score reports</strong> sent to each college beyond the free ones.</li>
              <li><strong>Application fees</strong>, one per college: early applications at the start of November, regular ones at the start of January.</li>
              <li><strong>Financial-aid forms</strong>: the CSS Profile charges for the first college and again for each additional one.</li>
              <li><strong>The enrollment deposit</strong>, around May 1, to hold a place.</li>
              <li><strong>The visa</strong>: the SEVIS fee and the visa application fee, once the college issues its I-20.</li>
            </ol>
            <p>
              The structure matters as much as the total. A student applying by binding Early Decision pays for one
              application in the autumn, and for the other nine only if that one does not end in an offer.
            </p>
          </Section>

          <Section id="fees" title="2. Reference fees and where they come from">
            <p>
              These are the published standard fees for the <strong>{FEES_CYCLE}</strong> cycle. They are starting
              points: fees change every year, several vary by country, and each college sets its own application fee
              and deposit. Every amount in a plan can be edited, and should be checked against the source before it is
              paid.
            </p>
            <div className="overflow-x-auto rounded-xl border border-border scrollbar-thin">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="bg-surface-sunken text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Fee</th>
                    <th scope="col" className="px-3 py-2 font-medium">Group</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Amount</th>
                    <th scope="col" className="px-3 py-2 font-medium">Set by</th>
                  </tr>
                </thead>
                <tbody>
                  {REFERENCE_FEES.map((fee) => (
                    <tr key={fee.id} className="border-t border-border/60">
                      <th scope="row" className="px-3 py-2 font-medium text-foreground">{fee.label}</th>
                      <td className="px-3 py-2">{CATEGORY_LABELS[fee.category]}</td>
                      <td className="numeric whitespace-nowrap px-3 py-2 text-right text-foreground">
                        {formatUsd(fee.usd)} <span className="text-xs text-muted-foreground">{fee.unit}</span>
                      </td>
                      <td className="px-3 py-2">
                        {fee.url !== undefined ? (
                          <a href={fee.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
                            {fee.source}
                            <ExternalLink className="size-3" aria-hidden />
                          </a>
                        ) : (
                          fee.source
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="distribution" title="3. Expected cost, and the margin above it">
            <p>
              Some costs are certain and some are not. Each contingency in a plan — a retake, the regular-round
              applications under Early Decision — carries a probability <Latex>{"p_j"}</Latex> and a cost{" "}
              <Latex>{"c_j"}</Latex>. With a certain base <Latex>{"B"}</Latex>, the total still to pay is a random
              variable
            </p>
            <Latex display>{"T = B + \\sum_{j} c_j X_j, \\qquad X_j \\sim \\text{Bernoulli}(p_j) \\text{ independent,}"}</Latex>
            <p>
              and its expectation is <Latex>{"E[T] = B + \\sum_j p_j c_j"}</Latex>. That is the best estimate, but
              half of all outcomes cost more than it. So the planner also computes the whole distribution, exactly, by
              enumerating all <Latex>{"2^k"}</Latex> combinations of the <Latex>{"k"}</Latex> contingencies, and
              reports the 90th percentile:
            </p>
            <Latex display>{"t_{0.9} = \\min\\{\\, t : P(T \\le t) \\ge 0.9 \\,\\}."}</Latex>
            <p>
              The gap <Latex>{"t_{0.9} - E[T]"}</Latex> is a <strong>risk margin</strong>: what a careful student
              holds above the best estimate so that the plan survives things not going to plan. It is the same idea an
              insurer applies when it holds more than its best-estimate liability.
            </p>
            <p>
              Actuaries call this an <strong>individual risk model</strong>: a sum of independent amounts, each paid
              with its own probability. Across thousands of small policies the total is close to normal, but an
              application year has a handful of large contingencies, and there the normal approximation fails — for
              the example plan it puts the 90th percentile above the largest total that can occur. So the planner
              enumerates instead.
            </p>
          </Section>

          <Section id="cashflow" title="4. Cash flow, and the month that binds">
            <p>
              Whether a plan works depends on timing, not on totals. With an opening balance{" "}
              <Latex>{"S_0"}</Latex> and, in month <Latex>{"t"}</Latex>, income <Latex>{"I_t"}</Latex>, living costs{" "}
              <Latex>{"L_t"}</Latex>, goal contributions <Latex>{"G_t"}</Latex> and application costs{" "}
              <Latex>{"A_t"}</Latex>, the balance at the end of each month is
            </p>
            <Latex display>{"S_t = S_{t-1} + I_t - L_t - G_t - A_t ."}</Latex>
            <p>
              The plan holds if <Latex>{"S_t \\ge 0"}</Latex> in every month. If it does not, the planner solves for
              the smallest level amount <Latex>{"m"}</Latex> that, saved every month from now, repairs it. Saving{" "}
              <Latex>{"m"}</Latex> a month raises the balance at the end of month <Latex>{"t"}</Latex> by{" "}
              <Latex>{"t\\,m"}</Latex> (counting the first month as 1), so
            </p>
            <Latex display>{"m^{*} = \\max_{t}\\; \\frac{-S_t}{t}, \\qquad \\text{taken over months with } S_t < 0 ."}</Latex>
            <p>
              The month that attains the maximum is the <strong>binding month</strong>. In a typical application year
              it is December, when the regular applications fall due together, or June, when the visa fees follow the
              deposit — which is why a plan that balances over the year can still fail in the middle of it.
            </p>
          </Section>

          <Section id="fx" title="5. Exchange-rate stress">
            <p>
              Fees are charged in dollars; most applicants earn in another currency. A cost of <Latex>{"c"}</Latex>{" "}
              dollars at a rate of <Latex>{"r"}</Latex> home units per dollar, with the dollar assumed{" "}
              <Latex>{"s"}</Latex> stronger, is <Latex>{"c \\cdot r \\cdot (1 + s)"}</Latex> at home. The planner
              re-runs the whole projection at several values of <Latex>{"s"}</Latex> so the sensitivity is visible
              before the money is needed rather than after.
            </p>
          </Section>

          <Card className="border-warning/40">
            <CardHeader>
              <CardTitle>What the planner does not know</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <strong className="font-medium text-foreground">The probabilities are yours.</strong> The chance of
                being admitted early, or of needing a retake, is entered by the student. The planner does the
                arithmetic on that belief; it has no data with which to check it.
              </p>
              <p>
                <strong className="font-medium text-foreground">Contingencies are treated as independent.</strong> A
                student who needs an SAT retake may also be less likely to be admitted early. The enumeration ignores
                that link, which makes the 90th percentile slightly optimistic.
              </p>
              <p>
                <strong className="font-medium text-foreground">Fees are reference figures.</strong> They are not
                fetched live and can be out of date. The source of each is linked above.
              </p>
              <p>
                <strong className="font-medium text-foreground">It stops at enrollment.</strong> Tuition, housing and
                the four years that follow are a different problem, treated on the{" "}
                <Link href="/funding" className="text-primary underline-offset-4 hover:underline">
                  College funding
                </Link>{" "}
                page with its own{" "}
                <a href={`${REPOSITORY_URL}/blob/main/DERIVATION.md`} target="_blank" rel="noreferrer noopener" className="text-primary underline-offset-4 hover:underline">
                  derivation
                </a>{" "}
                and{" "}
                <a href={`${REPOSITORY_URL}/blob/main/POSTMORTEM.md`} target="_blank" rel="noreferrer noopener" className="text-primary underline-offset-4 hover:underline">
                  record of its errors
                </a>
                .
              </p>
              <p>
                <strong className="font-medium text-foreground">It is not financial advice,</strong> and your plan
                never leaves your browser.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
