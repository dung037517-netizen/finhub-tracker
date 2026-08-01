<div align="center">

# FinHub Tracker

**A quantitative risk analytics and portfolio dashboard — every figure computed in the browser.**

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Framer Motion](https://img.shields.io/badge/Framer_Motion-12-0055FF?style=flat-square&logo=framer&logoColor=white)](https://motion.dev)
[![Recharts](https://img.shields.io/badge/Recharts-3-22B5BF?style=flat-square)](https://recharts.org)
[![Tests](https://img.shields.io/badge/tests-49_passing-3fb950?style=flat-square&logo=vitest&logoColor=white)](./tests/finance-engine.test.ts)
[![Finance libraries](https://img.shields.io/badge/finance_libraries-0-1f6feb?style=flat-square)](./lib/finance-engine.ts)

[Live demo](https://finhubtracker-maudung.vercel.app) · [Risk engine](./lib/finance-engine.ts) · [Test suite](./tests/finance-engine.test.ts) · [MathForge →](https://github.com/dung037517-netizen/mathforge)

</div>

---

## What this is

A portfolio dashboard where the analytics are the product. Value at Risk by four estimation
methods, Black-Scholes-Merton pricing with a full second- and third-order Greek surface, Wilder's
RSI, Bollinger bands, MACD, marginal risk contributions from the covariance matrix, and a streaming
market feed — implemented from first principles in
[`lib/finance-engine.ts`](./lib/finance-engine.ts), with **no financial library behind any of it**.

The engine is pure and total: every function either returns a value or a typed `FinanceError`.
That is what makes a 49-case test suite possible without a browser, and it is why the dashboard can
render a singular covariance matrix or an arbitrageable option quote as a message rather than as
`NaN`.

> **On the data.** The tickers are fictitious and the price history is generated from a seeded
> geometric Brownian motion. That is deliberate: it keeps every number in this README exactly
> reproducible, and it avoids implying a market data licence this project does not hold. The
> *methods* are real; the prices are not.

---

## System architecture

```mermaid
flowchart TB
    subgraph FEED["Streaming layer"]
        MFS["market-feed.ts<br/><b>MarketFeedSocket</b><br/><i>mirrors the WebSocket contract</i>"]
        HOOK["use-market-feed.ts<br/><i>batches ticks per animation frame</i>"]
    end

    subgraph DATA["Seeded universe — market-data.ts"]
        GEN["generateSyntheticSeries()<br/><i>GBM with 4 intraday sub-steps</i>"]
        HIST["504 daily OHLC bars × 7 symbols"]
        POS["Tax-lot position ledger"]
    end

    subgraph ENGINE["Risk engine — lib/finance-engine.ts (pure)"]
        STAT["Descriptive statistics<br/><i>skew · kurtosis · covariance</i>"]
        SPEC["erf · Φ · Φ⁻¹ · logΓ"]
        RET["Returns → performance<br/><i>Sharpe · Sortino · Calmar · drawdown</i>"]
        VAR["VaR / TVaR<br/><i>historical · parametric<br/>Cornish-Fisher · Monte Carlo</i>"]
        BS["Black-Scholes-Merton<br/><i>price · 8 Greeks · implied vol</i>"]
        TA["SMA · EMA · RSI · MACD · Bollinger"]
        PORT["valuePortfolio()<br/><i>P&L + marginal risk contribution</i>"]
    end

    subgraph VIEW["Dashboard — React 19"]
        MC["market-chart.tsx<br/><i>candlestick · area · RSI</i>"]
        RD["risk-dashboard.tsx<br/><i>VaR · Greeks · allocation</i>"]
        PT["portfolio-table.tsx<br/><i>live marks, tick flashes</i>"]
    end

    GEN --> HIST
    HIST --> POS
    HIST -->|"initial quotes"| MFS
    MFS -->|"tick events"| HOOK
    HOOK -->|"quote snapshot"| PORT
    POS --> PORT

    HIST --> TA
    HIST -->|"log returns"| STAT
    STAT --> RET
    STAT --> VAR
    SPEC --> VAR
    SPEC --> BS
    STAT --> PORT

    TA --> MC
    PORT --> PT
    PORT --> RD
    VAR --> RD
    BS --> RD
    RET --> RD
```

### How one tick reaches the screen

```mermaid
sequenceDiagram
    participant S as MarketFeedSocket
    participant H as useMarketFeed
    participant RAF as requestAnimationFrame
    participant E as finance-engine
    participant UI as Dashboard

    S->>S: GBM increment, one symbol (round-robin)
    S->>H: {type:"tick", symbol, price, timestamp}
    H->>H: push into a pending buffer
    alt no frame scheduled
        H->>RAF: schedule flush
    end
    RAF->>H: flush — one setState for the whole batch
    H->>E: valuePortfolio(positions, quotes, returns)
    E->>E: weighted-average cost across tax lots
    E->>E: Σw and wᵀΣw → marginal risk contributions
    E-->>UI: PortfolioSummary
    UI->>UI: price cell flashes green or red for 600 ms
```

Batching matters: a 450 ms interval across seven symbols would otherwise schedule several
full-dashboard re-renders per second. With the buffer, React commits **at most once per frame**
however fast the feed runs.

---

## Financial formulas implemented

### Value at Risk and Tail VaR

$$\mathrm{VaR}_\alpha = -\inf\\{\,x : P(R \le x) > 1-\alpha\,\\}, \qquad \mathrm{TVaR}_\alpha = -\mathbb{E}\left[R \mid R \le -\mathrm{VaR}_\alpha\right]$$

Four estimators, deliberately shown side by side because their disagreement *is* the lesson:

| Method | Estimator | What it assumes |
|---|---|---|
| **Historical** | empirical quantile of realised returns | nothing about shape — but cannot exceed the worst observed loss |
| **Parametric** | $-(\mu + \sigma z_{1-\alpha})$, with $\mathrm{TVaR} = -\left(\mu - \sigma\frac{\varphi(z)}{1-\alpha}\right)$ | returns are normal |
| **Cornish-Fisher** | $z' = z + \frac{(z^2-1)S}{6} + \frac{(z^3-3z)K}{24} - \frac{(2z^3-5z)S^2}{36}$ | corrects the normal quantile for skewness $S$ and excess kurtosis $K$ |
| **Monte Carlo** | resampled from a fitted normal, seeded | a convergence check on the parametric figure |

Multi-day horizons scale by $\sqrt{h}$, valid under the same i.i.d. assumption the parametric
measure already makes. TVaR is **subadditive and therefore coherent**; VaR is not, which is why
Solvency II and the Swiss Solvency Test are built on expected shortfall — the dashboard says so
where it is relevant.

### Black-Scholes-Merton

$$d_1 = \frac{\ln(S/K) + (r - q + \sigma^2/2)T}{\sigma\sqrt{T}}, \qquad d_2 = d_1 - \sigma\sqrt{T}$$

$$C = Se^{-qT}N(d_1) - Ke^{-rT}N(d_2), \qquad P = Ke^{-rT}N(-d_2) - Se^{-qT}N(-d_1)$$

The full Greek surface, first through third order:

| Greek | Definition | Quoted as |
|---|---|---|
| $\Delta$ | $\partial V/\partial S$ | shares per contract |
| $\Gamma$ | $\partial^2 V/\partial S^2$ | per unit of spot |
| $\nu$ (vega) | $\partial V/\partial\sigma$ | per 1 volatility point |
| $\Theta$ | $\partial V/\partial t$ | per calendar day |
| $\rho$ | $\partial V/\partial r$ | per 1 rate point |
| Vanna | $\partial^2 V/\partial S\,\partial\sigma$ | how delta moves with volatility |
| Volga | $\partial^2 V/\partial\sigma^2$ | convexity in volatility |
| Speed | $\partial^3 V/\partial S^3$ | rate of change of gamma |

**Put-call parity** is displayed live as a residual:

$$C - P - Se^{-qT} + Ke^{-rT} \overset{!}{=} 0$$

which makes the pricer self-checking — a wrong sign anywhere in the formula surfaces immediately
instead of hiding behind a plausible-looking number.

**Implied volatility** is recovered by Newton-Raphson on vega, *bracketed by bisection*. Newton
alone is fragile deep in and out of the money where vega collapses toward zero; keeping the bracket
means the solve either converges or reports `CONVERGENCE_FAILURE` honestly, and never returns a
wild number. No-arbitrage bounds are checked before the solve begins.

### Performance measurement

$$\text{Sharpe} = \frac{\bar{r} - r_f}{\sigma}\sqrt{252}, \qquad \text{Sortino} = \frac{\bar{r} - r_f}{\sigma_{\text{down}}}\sqrt{252}, \qquad \text{Calmar} = \frac{r_{\text{ann}}}{\mathrm{MDD}}$$

The annual risk-free rate is de-annualised to $(1+r_f)^{1/252} - 1$ before being netted off each
period's return — the step naive implementations skip.

### Marginal risk contribution

$$\mathrm{RC}_i = \frac{w_i(\Sigma w)_i}{w^{\mathsf{T}}\Sigma w}, \qquad \sum_i \mathrm{RC}_i = 1$$

Capital weight says how much you own; risk contribution says where the volatility actually comes
from. The dashboard plots them against each other, because a 4% position in a 68%-volatility asset
is not a 4% risk.

### Technical indicators

SMA, EMA seeded with the first window's SMA, **Wilder's** RSI (a $1/n$ exponential average of gains
and losses — materially different from the plain-SMA version after the first window, and the one
every trading platform actually quotes), MACD with signal and histogram, and Bollinger bands at
$\pm k$ sample standard deviations.

---

## Testing

```
✓ 49 tests passing
```

The suite pins the engine against values that can be checked independently:

| Assertion | Reference |
|---|---|
| ATM call, $S{=}K{=}100$, $r{=}5\%$, $\sigma{=}20\%$, $T{=}1$ | **10.450583572185565** (textbook) |
| Matching put | **5.573526022256971** |
| Put-call parity across 5 strikes × 3 volatilities | zero to $<10^{-9}$ |
| $\Delta$, $\Gamma$, $\nu$, $\rho$ | central finite differences of the pricer |
| Implied volatility over 4 vols × 3 strikes | round-trips to 5 decimals |
| Parametric VaR on 100,000 normal draws | $-(\mu + \sigma z_{0.01})$ |
| Historical vs parametric VaR on normal data | agree within 0.2% |
| $\mathrm{TVaR} \ge \mathrm{VaR}$ for all methods and confidences | coherence |
| Cornish-Fisher > parametric on a left-skewed sample | the correction does what it claims |
| $\sqrt{h}$ horizon scaling | exact ratio $\sqrt{10}$ |
| Max drawdown of $[+25\%, -40\%, +20\%]$ | exactly 40% |
| RSI on a monotone series | 100 up, 0 down, and $[0,100]$ on noise |
| Weighted-average cost across two tax lots | hand-computed 60.00 |
| Portfolio weights and risk contributions | each sums to 1 |
| Identical seeds produce identical series | reproducibility |

```bash
npm test          # vitest run
npm run typecheck # tsc --noEmit
npm run lint      # eslint (flat config)
npm run build     # next build
```

---

## CS admission highlights

Things in this repository that a reviewer can verify by reading the code:

**A custom candlestick renderer.** Recharts has no candlestick primitive. `CandleShape` binds a bar
to the `[low, high]` range and converts all four OHLC prices back into pixels using the bar's own
geometry — which keeps the candle perfectly registered to the y-axis without reaching into
Recharts' internal scale. Up bars are hollow and down bars filled, so direction survives
colour-blindness.

**An interface designed for its future replacement.** `MarketFeedSocket` deliberately mirrors the
browser `WebSocket` surface: the same numeric `readyState` constants, `addEventListener`, `close()`.
Swapping the simulation for a live venue feed is a change of constructor, not a change of any
consumer.

**Numerical methods chosen for their failure modes, not their elegance.** Bisection-bracketed
Newton for implied volatility. Bessel-corrected variance and unbiased skew/kurtosis estimators.
The complementary error function evaluated *directly* by continued fraction rather than as
$1 - \mathrm{erf}(x)$, because the subtraction destroys precision exactly where VaR needs it — in
the far tail.

**Indicators computed on full history, then sliced.** Narrowing the timeframe from 1Y to 1M must not
restart a 50-day moving average. Most dashboards get this wrong; this one computes over the whole
series and slices the result.

**Correctness that is visible in the UI.** Put-call parity residual and $\bar{A}_x + \delta\bar{a}_x$
are rendered on screen. If the maths breaks, the page says so.

**Rendering discipline.** Ticks batched per animation frame; feed status derived from props rather
than mirrored through an effect; sorting applied to a copy so streaming updates never destabilise
row identity.

**Accessibility as structure, not retrofit.** Sortable columns expose `aria-sort`; tables carry
captions and `<th scope>`; every chart has an `aria-label`; gain and loss always pair colour with a
sign or an arrow; `prefers-reduced-motion` disables animation.

---

## Project structure

```
financeflow/
├── app/
│   ├── layout.tsx                # fonts, metadata, pre-paint theme script
│   ├── page.tsx
│   └── globals.css               # oklch tokens, gain/loss semantics
├── components/
│   ├── finance/
│   │   ├── market-chart.tsx      # candlestick · area · SMA · Bollinger · RSI
│   │   ├── risk-dashboard.tsx    # VaR · Greeks · allocation
│   │   ├── portfolio-table.tsx   # sortable, live tick flashes
│   │   ├── dashboard.tsx
│   │   ├── chart-tooltip.tsx
│   │   └── latex.tsx
│   ├── ui/                       # shadcn-style primitives on Radix
│   └── site/site-header.tsx
├── lib/
│   ├── finance-engine.ts         # the whole quantitative core
│   ├── market-feed.ts            # WebSocket-shaped simulated feed
│   ├── use-market-feed.ts        # frame-batched subscription hook
│   ├── market-data.ts            # seeded universe and demo book
│   ├── theme.ts
│   └── utils.ts
├── types/finance.ts              # the entire domain vocabulary
└── tests/finance-engine.test.ts
```

---

## Running locally

```bash
git clone https://github.com/dung037517-netizen/financeflow.git
cd financeflow
npm install
npm run dev      # http://localhost:3000
```

Requires Node.js 20 or newer.

---

## Related work

**[MathForge →](https://github.com/dung037517-netizen/mathforge)** — the actuarial counterpart:
symbolic calculus with step-by-step derivations, parametric survival models, life contingencies,
and non-blocking Monte Carlo in a Web Worker.

<div align="center">
<sub>Synthetic market data, real quantitative methods. Not investment advice.</sub>
</div>
