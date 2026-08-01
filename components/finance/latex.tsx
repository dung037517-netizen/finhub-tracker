"use client";

import katex from "katex";
import * as React from "react";

import { cn } from "@/lib/utils";

export interface LatexProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** The LaTeX source to typeset. */
  children: string;
  /** Render centred on its own line rather than inline with surrounding text. */
  display?: boolean;
  /** Text shown when the source fails to typeset. */
  fallback?: string;
}

/**
 * KaTeX renderer.
 *
 * `katex.renderToString` is pure and synchronous, so typesetting happens during
 * render and is memoised on the source string — no layout thrash, and no
 * effect-driven second paint. `throwOnError: false` means a malformed formula
 * degrades to red source text instead of taking down the tree, which matters
 * because the equation editor typesets on every keystroke.
 *
 * KaTeX escapes its own input and we pass `strict: false` with `trust: false`,
 * so no user-authored macro can emit raw HTML through this component.
 */
export function Latex({ children, display = false, className, fallback, ...props }: LatexProps) {
  const html = React.useMemo(() => {
    try {
      return katex.renderToString(children, {
        displayMode: display,
        throwOnError: false,
        errorColor: "oklch(0.63 0.21 25)",
        strict: false,
        trust: false,
        output: "htmlAndMathml",
      });
    } catch {
      return null;
    }
  }, [children, display]);

  if (html === null) {
    return (
      <span className={cn("font-mono text-xs text-destructive", className)} {...props}>
        {fallback ?? children}
      </span>
    );
  }

  return (
    <span
      className={cn(display && "block w-full overflow-x-auto scrollbar-thin", className)}
      // KaTeX output is generated from the source above, not from raw user HTML.
      dangerouslySetInnerHTML={{ __html: html }}
      {...props}
    />
  );
}

/** Convenience wrapper for display-mode equations. */
export function LatexBlock({ children, className, ...props }: Omit<LatexProps, "display">) {
  return (
    <Latex display className={cn("py-1", className)} {...props}>
      {children}
    </Latex>
  );
}
