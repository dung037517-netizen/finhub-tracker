"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { CollegePlanner } from "@/components/finance/college-planner";
import { PageHeading, PageShell } from "@/components/site/page-shell";
import { Button } from "@/components/ui/button";
import { REPOSITORY_URL } from "@/lib/site";

/**
 * The four-year question that follows the application year: once admitted,
 * will the money be there when each tuition bill arrives?
 */
export function FundingPage() {
  return (
    <PageShell width="wide">
      <PageHeading
        title="College funding"
        description="The planner covers the year of applying. This model covers the four years after it: costs inflated forward, savings accumulated as an annuity-due and drawn down semester by semester, then tested against simulated investment returns."
      >
        <Button asChild variant="outline">
          <a href={`${REPOSITORY_URL}/blob/main/DERIVATION.md`} target="_blank" rel="noreferrer noopener">
            Read the derivation
          </a>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/">
            Back to the planner
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </PageHeading>
      <p role="note" className="mb-6 max-w-3xl rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-muted-foreground">
        The three presets use typical published costs for U.S. residents. International students pay out-of-state
        tuition at public universities and usually qualify for less need-based aid, so replace the figures with the
        cost of attendance your own college publishes.
      </p>
      <CollegePlanner />
    </PageShell>
  );
}
