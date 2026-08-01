"use client";

import { motion } from "framer-motion";
import { Activity, Github, Moon, Sun } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { applyTheme, themeStore } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { FeedStatus } from "@/types/finance";

const REPOSITORY_URL = "https://github.com/dung037517-netizen/financeflow";

const STATUS_LABEL: Readonly<Record<FeedStatus, string>> = {
  connecting: "Connecting",
  open: "Live",
  closed: "Paused",
  error: "Feed error",
};

const STATUS_TONE: Readonly<Record<FeedStatus, string>> = {
  connecting: "bg-warning",
  open: "bg-gain",
  closed: "bg-muted-foreground",
  error: "bg-loss",
};

export interface SiteHeaderProps {
  feedStatus: FeedStatus;
  tickCount: number;
}

/** Sticky header carrying the live-feed indicator and the theme toggle. */
export function SiteHeader({ feedStatus, tickCount }: SiteHeaderProps) {
  const theme = React.useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot,
    themeStore.getServerSnapshot,
  );

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-3 px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-2"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Activity className="size-4" aria-hidden />
          </span>
          <span className="text-sm font-semibold tracking-tight">
            Fin<span className="text-primary">Hub</span> Tracker
          </span>
        </motion.div>

        <nav aria-label="Sections" className="ml-4 hidden items-center gap-1 md:flex">
          {[
            { href: "#planner", label: "College plan" },
            { href: "#markets", label: "Markets" },
            { href: "#risk", label: "Risk" },
            { href: "#holdings", label: "Holdings" },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5" aria-live="polite">
            <span
              className={cn(
                "size-1.5 rounded-full",
                STATUS_TONE[feedStatus],
                feedStatus === "open" && "animate-pulse",
              )}
              aria-hidden
            />
            <span>{STATUS_LABEL[feedStatus]}</span>
            {feedStatus === "open" && (
              <span className="numeric hidden text-muted-foreground sm:inline">
                {tickCount.toLocaleString("en-US")} ticks
              </span>
            )}
          </Badge>

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
            <TooltipContent>Toggle the colour theme</TooltipContent>
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
    </header>
  );
}
