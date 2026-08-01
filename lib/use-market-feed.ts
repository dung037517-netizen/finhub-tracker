"use client";

import * as React from "react";

import {
  MarketFeedSocket,
  applyTick,
  type MarketFeedSocketOptions,
} from "@/lib/market-feed";
import type { FeedSnapshot, FeedStatus, FeedTick, Quote } from "@/types/finance";

export interface UseMarketFeedOptions extends MarketFeedSocketOptions {
  /** Quote snapshot to start from, before any tick arrives. */
  readonly initialQuotes: Readonly<Record<string, Quote>>;
  /** Set false to hold the feed closed (used by the pause control). */
  readonly enabled?: boolean;
}

interface QuoteState {
  readonly quotes: Readonly<Record<string, Quote>>;
  readonly tickCount: number;
  readonly lastUpdate: number | null;
}

/**
 * Subscribe a component tree to the simulated market feed.
 *
 * Two design points worth naming:
 *
 *  - **Ticks are batched per animation frame.** A 450 ms interval across seven
 *    symbols would otherwise schedule several full-dashboard re-renders a
 *    second; batching means React commits at most once per frame however fast
 *    the feed runs.
 *  - **Status is derived, not mirrored.** The paused state is computed from the
 *    `enabled` prop at read time rather than pushed into state from an effect,
 *    so the badge can never lag the actual subscription by a render.
 */
export function useMarketFeed(options: UseMarketFeedOptions): FeedSnapshot {
  const {
    initialQuotes,
    enabled = true,
    symbols,
    intervalMs,
    volatility,
    drift,
    seed,
    initialPrices,
    connectDelayMs,
  } = options;

  const [state, setState] = React.useState<QuoteState>(() => ({
    quotes: initialQuotes,
    tickCount: 0,
    lastUpdate: null,
  }));

  // Only ever written from socket event callbacks, never synchronously in the
  // effect body.
  const [connectionStatus, setConnectionStatus] = React.useState<FeedStatus>("connecting");

  React.useEffect(() => {
    if (!enabled) return;

    const socket = new MarketFeedSocket({
      symbols,
      intervalMs,
      volatility,
      drift,
      seed,
      initialPrices,
      connectDelayMs,
    });

    // Ticks accumulate here and are flushed once per frame.
    let pending: FeedTick[] = [];
    let frameId: number | null = null;

    const flush = (): void => {
      frameId = null;
      if (pending.length === 0) return;
      const batch = pending;
      pending = [];

      setState((current) => {
        const quotes: Record<string, Quote> = { ...current.quotes };
        for (const tick of batch) {
          const existing = quotes[tick.symbol];
          if (existing === undefined) continue;
          quotes[tick.symbol] = applyTick(existing, tick);
        }
        return {
          quotes,
          tickCount: current.tickCount + batch.length,
          lastUpdate: batch[batch.length - 1].timestamp,
        };
      });
    };

    const unsubscribe = socket.addEventListener((event) => {
      switch (event.type) {
        case "open":
          setConnectionStatus("open");
          return;
        case "tick":
          pending.push(event.tick);
          if (frameId === null) frameId = requestAnimationFrame(flush);
          return;
        case "close":
          setConnectionStatus("closed");
          return;
        case "error":
          setConnectionStatus("error");
          return;
      }
    });

    socket.connect();

    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      unsubscribe();
      socket.close();
    };
  }, [enabled, symbols, intervalMs, volatility, drift, seed, initialPrices, connectDelayMs]);

  return {
    // A paused feed reports "closed" without waiting for the socket's own
    // close event to land.
    status: enabled ? connectionStatus : "closed",
    quotes: state.quotes,
    tickCount: state.tickCount,
    lastUpdate: state.lastUpdate,
  };
}
