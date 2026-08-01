/**
 * Simulated real-time market data feed.
 *
 * `MarketFeedSocket` deliberately mirrors the browser `WebSocket` surface —
 * `readyState` with the same numeric constants, `addEventListener`, `close()`,
 * and messages delivered as JSON payloads. Swapping the demo for a live venue
 * feed is a change of constructor, not a change of consumer: every component
 * downstream already speaks the socket contract.
 *
 * Prices evolve as geometric Brownian motion sampled at the tick interval, so
 * the series has the properties the risk engine assumes (log-normal levels,
 * i.i.d. log returns) rather than being random noise that would make the VaR
 * numbers meaningless.
 */

import { SeededRandom, TRADING_DAYS_PER_YEAR } from "@/lib/finance-engine";
import type { FeedStatus, FeedTick, MarketFeedConfig, Quote } from "@/types/finance";

export type MarketFeedEvent =
  | { readonly type: "open" }
  | { readonly type: "tick"; readonly tick: FeedTick }
  | { readonly type: "close" }
  | { readonly type: "error"; readonly message: string };

type Listener = (event: MarketFeedEvent) => void;

/** Matches the numeric `readyState` values of the WebSocket standard. */
export const enum SocketReadyState {
  Connecting = 0,
  Open = 1,
  Closing = 2,
  Closed = 3,
}

export interface MarketFeedSocketOptions extends MarketFeedConfig {
  /** Starting price per symbol; the walk begins here. */
  readonly initialPrices: Readonly<Record<string, number>>;
  /** Simulated connection latency before the socket reports `open`. */
  readonly connectDelayMs?: number;
}

export class MarketFeedSocket {
  private readonly listeners = new Set<Listener>();
  private readonly prices = new Map<string, number>();
  private readonly random: SeededRandom;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private connectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private state: SocketReadyState = SocketReadyState.Connecting;
  private cursor = 0;

  constructor(private readonly options: MarketFeedSocketOptions) {
    this.random = new SeededRandom(options.seed);
    for (const symbol of options.symbols) {
      this.prices.set(symbol, options.initialPrices[symbol] ?? 100);
    }
  }

  get readyState(): SocketReadyState {
    return this.state;
  }

  addEventListener(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: MarketFeedEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }

  /** Open the connection and begin streaming ticks. */
  connect(): void {
    if (this.state === SocketReadyState.Open) return;
    this.state = SocketReadyState.Connecting;

    const delay = this.options.connectDelayMs ?? 350;
    this.connectTimeoutId = setTimeout(() => {
      if (this.options.symbols.length === 0) {
        this.state = SocketReadyState.Closed;
        this.emit({ type: "error", message: "The feed was opened with no symbols subscribed." });
        return;
      }

      this.state = SocketReadyState.Open;
      this.emit({ type: "open" });
      this.intervalId = setInterval(() => this.tick(), this.options.intervalMs);
    }, delay);
  }

  /**
   * Advance one symbol per tick, round-robin. Real feeds interleave symbols
   * rather than delivering the whole book at once, and staggering the updates
   * also keeps React re-renders small.
   */
  private tick(): void {
    if (this.state !== SocketReadyState.Open) return;

    const symbols = this.options.symbols;
    const symbol = symbols[this.cursor % symbols.length];
    this.cursor += 1;

    const previousPrice = this.prices.get(symbol) ?? 100;
    const volatility = this.options.volatility[symbol] ?? 0.25;
    const drift = this.options.drift[symbol] ?? 0.05;

    // One tick represents a fraction of a trading day, so the per-tick
    // volatility is scaled down accordingly rather than applied whole.
    const ticksPerDay = Math.max(1, Math.round((6.5 * 60 * 60 * 1000) / this.options.intervalMs));
    const dt = 1 / (TRADING_DAYS_PER_YEAR * ticksPerDay);
    const increment =
      (drift - (volatility * volatility) / 2) * dt +
      volatility * Math.sqrt(dt) * this.random.nextNormal();

    const nextPrice = Math.max(0.01, previousPrice * Math.exp(increment));
    this.prices.set(symbol, nextPrice);

    this.emit({
      type: "tick",
      tick: {
        symbol,
        price: nextPrice,
        previousPrice,
        timestamp: Date.now(),
      },
    });
  }

  /** Close the connection and stop the stream. */
  close(): void {
    if (this.state === SocketReadyState.Closed) return;
    this.state = SocketReadyState.Closing;

    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.connectTimeoutId !== null) {
      clearTimeout(this.connectTimeoutId);
      this.connectTimeoutId = null;
    }

    this.state = SocketReadyState.Closed;
    this.emit({ type: "close" });
  }
}

/** Map a socket `readyState` onto the status the UI displays. */
export function statusFromReadyState(state: SocketReadyState): FeedStatus {
  switch (state) {
    case SocketReadyState.Connecting:
      return "connecting";
    case SocketReadyState.Open:
      return "open";
    case SocketReadyState.Closing:
    case SocketReadyState.Closed:
      return "closed";
  }
}

/**
 * Fold a tick into an existing quote.
 *
 * `previousClose` is preserved from the seeded snapshot so the day-change
 * figures stay anchored to the actual prior session rather than drifting with
 * every tick — a bug that makes most naive dashboards report a change of ~0%.
 */
export function applyTick(quote: Quote, tick: FeedTick): Quote {
  const change = tick.price - quote.previousClose;
  return {
    ...quote,
    price: tick.price,
    change,
    changePercent: quote.previousClose !== 0 ? change / quote.previousClose : 0,
    dayHigh: Math.max(quote.dayHigh, tick.price),
    dayLow: Math.min(quote.dayLow, tick.price),
    timestamp: tick.timestamp,
  };
}
