/**
 * Reference fees for applying to U.S. colleges from abroad.
 *
 * These are starting points, not quotations. Each figure is the published
 * standard fee for the cycle named below, with the organization that sets it
 * and where to confirm it. Fees change every year, several vary by country,
 * and colleges set their own application fees and deposits — so every amount
 * in a plan is editable, and the interface says so wherever a fee is shown.
 */

import type { CostCategory } from "@/types/planner";

export const FEES_CYCLE = "2025–26";

export interface ReferenceFee {
  readonly id: string;
  readonly category: CostCategory;
  readonly label: string;
  readonly usd: number;
  /** What one unit of the fee covers. */
  readonly unit: string;
  /** Who sets the fee. */
  readonly source: string;
  /** Where to confirm the current amount. */
  readonly url?: string;
  readonly note?: string;
}

export const REFERENCE_FEES: readonly ReferenceFee[] = [
  {
    id: "sat",
    category: "testing",
    label: "SAT registration (outside the U.S.)",
    usd: 111,
    unit: "per sitting",
    source: "College Board",
    url: "https://satsuite.collegeboard.org/sat/registration/fees-refunds",
    note: "The $68 registration fee plus the $43 international fee. Late registration and some test centers cost more.",
  },
  {
    id: "ap",
    category: "testing",
    label: "AP exam (outside the U.S.)",
    usd: 129,
    unit: "per exam",
    source: "College Board",
    url: "https://apstudents.collegeboard.org/exam-policies-guidelines/exam-fees",
    note: "Schools and test centers abroad often add their own administration fee.",
  },
  {
    id: "english",
    category: "testing",
    label: "English proficiency test",
    usd: 200,
    unit: "per sitting",
    source: "ETS, IELTS or Duolingo",
    url: "https://www.ets.org/toefl",
    note: "TOEFL iBT and IELTS cost roughly $185–$260 depending on the country; the Duolingo English Test costs much less. Enter what your test charges where you live.",
  },
  {
    id: "sat-report",
    category: "scores",
    label: "Additional SAT score report",
    usd: 14,
    unit: "per college",
    source: "College Board",
    url: "https://satsuite.collegeboard.org/sat/scores/sending-scores",
    note: "Four reports are free if you choose the colleges soon after each test. Many colleges accept self-reported scores until you enroll.",
  },
  {
    id: "english-report",
    category: "scores",
    label: "Additional English test score report",
    usd: 25,
    unit: "per college",
    source: "The testing organization",
    url: "https://www.ets.org/toefl",
    note: "The number of free reports and the price of extra ones differ between tests.",
  },
  {
    id: "application",
    category: "applications",
    label: "College application fee",
    usd: 75,
    unit: "per college",
    source: "Each college",
    url: "https://www.commonapp.org",
    note: "Set by each college: typically $50–$90, and some charge nothing. Fee waivers are available for students who qualify.",
  },
  {
    id: "css-first",
    category: "aid",
    label: "CSS Profile, first college",
    usd: 25,
    unit: "once",
    source: "College Board",
    url: "https://cssprofile.collegeboard.org",
    note: "Required by many private colleges for institutional financial aid, including for international applicants.",
  },
  {
    id: "css-more",
    category: "aid",
    label: "CSS Profile, each additional college",
    usd: 16,
    unit: "per college",
    source: "College Board",
    url: "https://cssprofile.collegeboard.org",
  },
  {
    id: "deposit",
    category: "enrollment",
    label: "Enrollment deposit",
    usd: 500,
    unit: "once",
    source: "The college you choose",
    note: "Usually $200–$1,000, due around May 1 and credited toward the first bill.",
  },
  {
    id: "sevis",
    category: "visa",
    label: "SEVIS I-901 fee (F-1 students)",
    usd: 350,
    unit: "once",
    source: "U.S. Immigration and Customs Enforcement",
    url: "https://www.ice.gov/sevis/i901",
  },
  {
    id: "visa",
    category: "visa",
    label: "Visa application (MRV) fee",
    usd: 185,
    unit: "once",
    source: "U.S. Department of State",
    url: "https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/fees/fees-visa-services.html",
  },
  {
    id: "visa-integrity",
    category: "visa",
    label: "Visa integrity fee",
    usd: 250,
    unit: "once",
    source: "U.S. Department of State",
    url: "https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/fees/fees-visa-services.html",
    note: "Created by a 2025 law. Whether and when it is collected has varied, so it is treated here as a contingency: confirm with the consulate before you budget for it.",
  },
  {
    id: "documents",
    category: "other",
    label: "Transcript translation and courier",
    usd: 60,
    unit: "estimate",
    source: "Your own estimate",
    note: "Certified translations, notarization and courier charges vary widely.",
  },
];

const BY_ID: ReadonlyMap<string, ReferenceFee> = new Map(REFERENCE_FEES.map((fee) => [fee.id, fee]));

export function findFee(id: string | undefined): ReferenceFee | null {
  return id === undefined ? null : (BY_ID.get(id) ?? null);
}

export function feeAmount(id: string): number {
  return BY_ID.get(id)?.usd ?? 0;
}

export const CATEGORY_LABELS: Readonly<Record<CostCategory, string>> = {
  testing: "Tests",
  scores: "Score reports",
  applications: "Applications",
  aid: "Financial aid forms",
  enrollment: "Enrollment",
  visa: "Visa",
  other: "Other",
};

export const CATEGORY_ORDER: readonly CostCategory[] = [
  "testing",
  "scores",
  "applications",
  "aid",
  "enrollment",
  "visa",
  "other",
];
