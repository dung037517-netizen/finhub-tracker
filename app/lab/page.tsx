import type { Metadata } from "next";

import { LabPage } from "@/components/finance/lab-page";

export const metadata: Metadata = {
  title: "Market lab",
  description:
    "A sandbox for the risk engine on simulated data: Value at Risk four ways, Black-Scholes with its Greeks, and technical indicators.",
  alternates: { canonical: "/lab" },
};

export default function Page() {
  return <LabPage />;
}
