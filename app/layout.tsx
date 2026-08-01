import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { TooltipProvider } from "@/components/ui/tooltip";
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
  "Plan four years of college costs the way an actuary would: tuition inflated forward, savings " +
  "accumulated as an annuity-due, then drawn down semester by semester — and stress-tested with " +
  "Monte Carlo shortfall risk, Value at Risk and Black-Scholes analytics. Computed entirely in " +
  "the browser by a typed, tested engine with no financial libraries.";
const SITE_URL = "https://finhubtracker-maudung.vercel.app";

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
    "college savings calculator",
    "529 projection",
    "tuition inflation",
    "Monte Carlo simulation",
    "Value at Risk",
    "expected shortfall",
    "Black-Scholes",
    "option Greeks",
    "actuarial science",
    "quantitative finance",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title: TITLE,
    description:
      "A four-year college funding plan modelled with real actuarial mathematics — inflation-" +
      "adjusted cash flows, annuity-due accumulation, and Monte Carlo shortfall risk.",
    url: SITE_URL,
    siteName: "FinHub Tracker",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description:
      "College funding modelled with actuarial mathematics: inflation-adjusted cash flows, " +
      "annuity-due accumulation, and Monte Carlo shortfall risk.",
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
          href="#markets"
          className="sr-only rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
        >
          Skip to the dashboard
        </a>
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
