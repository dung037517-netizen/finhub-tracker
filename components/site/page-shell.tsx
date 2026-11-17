"use client";

import { Github, Moon, PiggyBank, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MATHFORGE_URL, NAV_ITEMS, REPOSITORY_URL } from "@/lib/site";
import { applyTheme, themeStore } from "@/lib/theme";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export interface SiteHeaderProps {
  /** Extra status shown next to the theme toggle, such as the simulated feed. */
  readonly status?: React.ReactNode;
}

/** Sticky header: brand, section navigation, theme toggle. */
export function SiteHeader({ status }: SiteHeaderProps) {
  const pathname = usePathname();
  const theme = React.useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot,
    themeStore.getServerSnapshot,
  );

  const links = (compact: boolean): React.ReactNode =>
    NAV_ITEMS.map((item) => {
      const active = isActive(pathname, item.href);
      return (
        <Link
          key={item.href}
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            compact && "shrink-0",
            active
              ? "bg-secondary font-medium text-foreground"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}
        >
          {item.label}
        </Link>
      );
    });

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <PiggyBank className="size-4" aria-hidden />
          </span>
          <span className="text-sm font-semibold tracking-tight">
            Fin<span className="text-primary">Hub</span> Tracker
          </span>
        </Link>

        <nav aria-label="Main" className="ml-3 hidden items-center gap-0.5 md:flex">
          {links(false)}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          {status}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => applyTheme(theme === "dark" ? "light" : "dark")}
                aria-label={`Switch to the ${theme === "dark" ? "light" : "dark"} theme`}
              >
                {theme === "dark" ? <Sun /> : <Moon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle the color theme</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" asChild>
                <a
                  href={REPOSITORY_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label="Open the FinHub Tracker repository on GitHub"
                >
                  <Github />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Source on GitHub</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <nav
        aria-label="Main sections"
        className="flex gap-1 overflow-x-auto border-t border-border/60 px-3 py-1.5 scrollbar-thin md:hidden"
      >
        {links(true)}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-[1280px] space-y-3 px-4 py-8 text-sm text-muted-foreground sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p>FinHub Tracker — budgeting, savings goals and cash-flow planning for students applying to college.</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link href="/method" className="transition-colors hover:text-foreground">
              Method and sources
            </Link>
            <a href={REPOSITORY_URL} target="_blank" rel="noreferrer noopener" className="transition-colors hover:text-foreground">
              Source
            </a>
            <a href={MATHFORGE_URL} target="_blank" rel="noreferrer noopener" className="transition-colors hover:text-foreground">
              MathForge →
            </a>
          </div>
        </div>
        <p className="text-xs leading-relaxed">
          A planning tool, not financial advice. Fees are reference figures that change every year: confirm each one
          with the organization that charges it. Your plan is stored only in this browser.
        </p>
      </div>
    </footer>
  );
}

export interface PageShellProps {
  readonly children: React.ReactNode;
  readonly status?: React.ReactNode;
  readonly width?: "default" | "wide";
  readonly className?: string;
}

/** Header, main landmark and footer for every page. */
export function PageShell({ children, status, width = "default", className }: PageShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader status={status} />
      <main
        id="main"
        tabIndex={-1}
        className={cn(
          "mx-auto w-full flex-1 px-4 py-8 outline-none sm:px-6 sm:py-10",
          width === "default" ? "max-w-[1280px]" : "max-w-[1500px]",
          className,
        )}
      >
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

export function PageHeading({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <h1 className="text-balance text-3xl font-semibold tracking-tight">{title}</h1>
        {description !== undefined ? <p className="mt-2 text-pretty text-muted-foreground">{description}</p> : null}
      </div>
      {children !== undefined ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}
