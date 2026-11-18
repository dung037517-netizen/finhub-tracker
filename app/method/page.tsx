import type { Metadata } from "next";

import { MethodPage } from "@/components/planner/method-page";

export const metadata: Metadata = {
  title: "Method and sources",
  description:
    "How FinHub Tracker models the cost of applying to U.S. colleges: reference fees and their sources, the cost distribution, cash flow and exchange-rate stress.",
  alternates: { canonical: "/method" },
};

export default function Page() {
  return <MethodPage />;
}
