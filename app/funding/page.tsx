import type { Metadata } from "next";

import { FundingPage } from "@/components/finance/funding-page";

export const metadata: Metadata = {
  title: "College funding",
  description:
    "A four-year college funding model: costs inflated forward, savings accumulated as an annuity-due, and shortfall risk tested by simulation.",
  alternates: { canonical: "/funding" },
};

export default function Page() {
  return <FundingPage />;
}
