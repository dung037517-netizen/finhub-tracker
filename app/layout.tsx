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

export const metadata: Metadata = {
  title: {
    default: "FinHub Tracker — Quantitative Risk Analytics & Portfolio Dashboard",
    template: "%s · FinHub Tracker",
  },
  description:
    "A quantitative portfolio dashboard: Value at Risk and Tail VaR by four estimation methods, " +
    "Black-Scholes option pricing with a full Greek surface, technical indicators, and a " +
    "streaming market feed — all computed client-side from a typed, tested engine.",
  keywords: [
    "Value at Risk",
    "expected shortfall",
    "Black-Scholes",
    "option Greeks",
    "Sharpe ratio",
    "portfolio risk",
    "quantitative finance",
    "actuarial risk measures",
  ],
  openGraph: {
    title: "FinHub Tracker — Quantitative Risk Analytics",
    description:
      "VaR, TVaR, Black-Scholes Greeks and live portfolio analytics computed entirely in the browser.",
    type: "website",
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
