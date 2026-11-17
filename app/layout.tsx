import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { TooltipProvider } from "@/components/ui/tooltip";
import { SITE_URL } from "@/lib/site";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const TITLE = "FinHub Tracker — Student Finance Planning Web App";
const DESCRIPTION =
  "A budgeting, savings-goal and cash-flow planner for students, built on the real cost structure " +
  "of a U.S. college application: tests, score reports, application fees, financial-aid forms, the " +
  "enrollment deposit and the visa, each in the month it falls due and in your own currency.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · FinHub Tracker",
  },
  description: DESCRIPTION,
  applicationName: "FinHub Tracker",
  authors: [{ name: "Dung Nguyen", url: "https://github.com/dung037517-netizen" }],
  creator: "Dung Nguyen",
  keywords: [
    "student finance planning",
    "college application costs",
    "student budget planner",
    "savings goals",
    "cash flow planning",
    "CSS Profile fee",
    "international student costs",
    "college savings calculator",
    "Monte Carlo simulation",
    "actuarial science",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title: TITLE,
    description:
      "Budget, save and plan cash flow for a U.S. college application, with every fee in the " +
      "month it falls due.",
    url: SITE_URL,
    siteName: "FinHub Tracker",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description:
      "Budget, save and plan cash flow for a U.S. college application, fee by fee.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#09090f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Applies a stored light-theme preference before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}>
        <a
          href="#main"
          className="sr-only rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
        >
          Skip to the main content
        </a>
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
