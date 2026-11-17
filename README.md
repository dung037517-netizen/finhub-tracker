<div align="center">

# FinHub Tracker

### Student finance planning for the year of applying to U.S. colleges

**A budgeting, savings-goal and cash-flow planner built on the real cost structure of a
U.S. college application — every test, score report, application fee, financial-aid
form, deposit and visa fee, in the month it falls due and in your own currency.**

[![CI](https://github.com/dung037517-netizen/finhub-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/dung037517-netizen/finhub-tracker/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](./tsconfig.json)
[![Actuarial libraries](https://img.shields.io/badge/actuarial_libraries-0-1f6feb?style=flat-square)](./lib/planner)

[**Live app**](https://finhubtracker-maudung.vercel.app) ·
[**Method and sources**](https://finhubtracker-maudung.vercel.app/method) ·
[**Actuarial derivations**](./DERIVATION.md) ·
[**Model risk log**](./POSTMORTEM.md)

</div>

---

## The problem

Applying to U.S. colleges from abroad is not one payment. It is a dozen separate
charges in dollars — the College Board, the testing agencies, each college, the CSS
Profile, the Student and Exchange Visitor Program, the State Department — spread over
about a year. Some of them may never be needed: under binding Early Decision, the
regular-round applications are paid only if the early one does not end in an offer.

A spreadsheet total hides the two things that decide whether a plan works:

- **Timing.** Income arrives evenly; application costs do not. A quiet autumn is
  followed by several hundred dollars in one week of December. A plan can balance over
  the year and still run dry in the month the bills land together.
- **Uncertainty.** Retakes, extra applications and the exchange rate are not known in
  advance. One number cannot say how much to hold back for them.

FinHub Tracker models both, from the student's side of the table.

---

## What it does

| | |
|---|---|
| **Application costs** | Reference fees for the 2025–26 cycle, each linked to the organization that sets it. Nine questions — colleges, Early Decision and your own estimate of early admission, SAT sittings and retake chance, AP exams, English tests, CSS Profile colleges, visa — draft the whole schedule on the application calendar. Anything that may not happen carries a probability. |
| **Cost distribution** | The exact distribution of what is still to pay: the expected total, the amount that is enough in 9 outcomes out of 10, and the risk margin between them. |
| **Cash flow** | The balance at the end of every month from today to the first day of university, read three ways — planned payments only, expected, and prudent (every contingency happens). It finds the first month in the red, the smallest level monthly saving that repairs the plan, the month that sets that figure, and what a stronger dollar does to all of it. |
| **Budget** | A monthly budget by category against recorded spending, the savings rate, and the last six months. |
| **Savings goals** | Target, deadline and monthly amount give the level saving that arrives on time, whether you are on track, and when you will get there. Goal contributions are taken out of the cash flow, so the two always agree. |
| **Transactions** | Income and spending in your own currency, CSV export, and a one-click import of anything recorded in the first version of the app. |
| **Your data** | Stored only in your browser. No account, no server, no analytics. A JSON backup moves a plan between devices. |

The app opens on an invented example applicant, labelled as one on every screen, so
there is something to read before you enter anything. **Start blank** clears it.

---

## The mathematics

### The cost of applying is an individual risk model

Let $B$ be what is certain and still unpaid, and let contingency $j$ cost $c_j$ with
probability $p_j$. The total still to pay is

$$T = B + \sum_{j=1}^{k} c_j X_j, \qquad X_j \sim \text{Bernoulli}(p_j) \text{ independent},$$

which is the **individual risk model** of loss models, with a fixed amount in place of
a claim-size distribution. Items that stand or fall together — the regular-round
applications, their score reports and CSS Profiles, all needed only if Early Decision
fails — form one contingency.

The planner computes the distribution of $T$ **exactly**, by enumerating all $2^k$
outcomes and merging equal totals, then reports $\mathbb{E}[T]$, the 90th percentile
$t_{0.9}$, and the **risk margin** $t_{0.9} - \mathbb{E}[T]$.

It does not use the normal approximation, and the example plan (as built in November
2026) shows why. With three lumpy contingencies — the regular round ($1,021 at 75%), the visa integrity fee ($250
at 50%) and an SAT retake ($111 at 40%) on a certain base of $1,551:

| | 90th percentile |
|---|---:|
| Exact distribution | **$2,933** (every contingency happens) |
| Normal approximation, $\mathbb{E}[T] + 1.2816\,\sigma_T$ | $3,079 — **$146 above the largest total that can occur** |

The central limit theorem needs many small risks. An application year has a handful of
large ones. [Derivation →](./DERIVATION.md#61-the-cost-of-applying-as-an-individual-risk-model)

### The month that binds

With month-end balances $S_1, \dots, S_n$, saving an extra $m$ every month from now
raises $S_t$ by $t\,m$. The plan holds when $S_t + t\,m \ge 0$ for every $t$, so the
smallest level saving that repairs it is

$$m^{*} = \max\Big(0,\ \max_{t}\ \frac{-S_t}{t}\Big).$$

The month that attains the maximum is the **binding month**. The figure is set by when
the money is short, not by the year's total: the same deficit costs four times as much
a month if it falls in month 2 as in month 8. [Proof →](./DERIVATION.md#62-the-smallest-level-saving-and-the-binding-month)

### Exchange-rate stress

A cost of $c$ dollars at $r$ home units per dollar, with the dollar assumed $s$
stronger, is $c\,r\,(1+s)$ at home. The lowest balance is then a minimum of affine
functions of $s$ — concave and piecewise linear — so it falls at least linearly, and
faster once a later month with more dollar costs becomes the binding one.

---

## The four-year model: college funding as a pension problem

The planner stops at enrollment. The [**College funding**](https://finhubtracker-maudung.vercel.app/funding)
page models the four years after it as what they structurally are: a
**defined-benefit liability funded by a risky asset portfolio**.

| Household object | Actuarial object |
|---|---|
| Tuition, room, board, travel | **Liability stream** $\{W_t\}$, inflation-linked |
| Savings and investments | **Asset portfolio** $A_t$ |
| Monthly contribution | **Level premium** $P$ |
| Fund fails to meet a payment | **Ruin event**, $\min_t A_t < 0$ |
| Contribution at expected return | Funding the **Best Estimate Liability** |
| Extra loading for confidence | **Risk Margin** |

Savings accumulate as an annuity-due and are drawn down semester by semester; returns
are lognormal and tested over 1,200 simulated futures.

**The finding: funding the plan to its best estimate leaves roughly a coin-flip
probability of ruin.** For a lognormal return the median lies strictly below the mean,

$$\frac{\mathbb{E}[Y]}{\text{Median}(Y)} = e^{\sigma^2/2} > 1,$$

so funding to the average funds an outcome most futures never reach. Closing the gap to
90% confidence takes a risk margin of 36–44%:

| Scenario | $P^\star$ (best estimate) | $P_{0.90}$ (90% confidence) | Risk Margin |
|---|---:|---:|---:|
| In-state public | $777/mo | $1,090/mo | **+40%** |
| Out-of-state public | $1,456/mo | $1,980/mo | **+36%** |
| Private | $1,679/mo | $2,425/mo | **+44%** |

The presets use typical published costs for U.S. residents; international students pay
out-of-state tuition at public universities and usually receive less need-based aid.

**What holds the engine together:**

1. **The ledger is anchored to a closed-form identity.** With no withdrawals it must
   equal $\ddot{s}_{\overline{n}\rvert i} = \frac{(1+i)^n - 1}{d}$ exactly, which also
   proves the annuity is *due* rather than immediate.
2. **Zero volatility tests the drift correction.** At $\sigma = 0$ every percentile must
   collapse onto the deterministic projection. Omit the $-\sigma^2/2$ term and this test
   fails while every other test passes.
3. **A fixed seed makes the risk-margin solver converge.** Bisection on a noisy Monte
   Carlo objective flips on sampling error; a fixed seed makes the ruin probability a
   deterministic, monotone step function.
4. **Solvency is tested at every payment date.** A fund that is empty in year three and
   recovers by graduation has still missed a tuition payment.
5. **CTE, not VaR alone.** VaR is not subadditive; Conditional Tail Expectation
   satisfies all four coherence axioms of Artzner et al.

The full working is in [`DERIVATION.md`](./DERIVATION.md), and the errors I made along
the way, with their root causes, are in [`POSTMORTEM.md`](./POSTMORTEM.md).

---

## Market lab

A sandbox for the risk engine on **simulated** data, and labelled as such: Value at Risk
four ways (historical, parametric, Cornish–Fisher and Monte Carlo), Black–Scholes prices
with their Greeks, implied volatility, and technical indicators. The portfolio is
invented and the prices come from a seeded geometric Brownian motion, so every figure is
reproducible and nothing implies a market-data licence this project does not hold.

---

## Verification

```
147 tests · 3 suites
  planner          49   fees, cost distribution, cash flow, budget, goals, storage
  college funding  49   closed-form annuity identities, zero-volatility collapse, solvers
  risk engine      49   pinned against textbook values
```

CI runs the type checker, the linter, the tests and a production build on every push to
`main` and every pull request, and fails if `any` appears anywhere in the source.

---

## Project structure

```
app/                   routes: / (planner) · /funding · /lab · /method
components/planner/    the planner's tabs and inputs
components/finance/    the college funding model and the market lab
lib/planner/           fees · costs · cashflow · budget · goals · storage — pure functions, no React
lib/college-plan.ts    the four-year funding engine
lib/finance-engine.ts  risk analytics
tests/                 vitest suites
```

The planning logic in `lib/planner/` is plain TypeScript with no React, so every number
on the screen comes from a function with a test.

---

## How This Was Built & Transparency Statement

This project was built with substantial AI assistance (Claude), and the git history
shows that openly — most of the implementation of both versions was AI-authored. The
first version was the college funding model; the second, in November 2026, added the
application-year planner.

I state this plainly because the alternative is worse. A reviewer can read the commit
log in thirty seconds, and a portfolio that hides how it was made is not evidence of
anything.

What I claim is narrower, and checkable:

- **I chose the problem.** The planner follows the costs of my own application year,
  in the order they arrive.
- **I own the mathematics.** [`DERIVATION.md`](./DERIVATION.md) works through every
  result the code depends on — the annuity-due identity, why the solvency objective is
  monotone but not differentiable, the lognormal median–mean gap, and, for the planner,
  the individual risk model and the binding-month result — and documents the
  limitations I have not resolved.
- **I own the model risk record.** [`POSTMORTEM.md`](./POSTMORTEM.md) analyses the
  errors under a model risk management framework, including a disclosed risk margin
  that was wrong by a factor of three.
- **I can defend the design decisions.** Why enumerate the cost distribution instead of
  using a normal approximation? Because with three lumpy contingencies the
  approximation puts the 90th percentile above the worst case that can occur. Why does
  one month, not the year's total, set the extra saving? Because each month's balance
  is a separate constraint, and an early deficit has fewer months to be saved for.

Using AI to build past my current ability, then working backwards until I understood
what it built, was a deliberate choice about how to learn quickly. I would rather be
judged on that than on a smaller project I could have written alone.

---

## Running locally

```bash
git clone https://github.com/dung037517-netizen/finhub-tracker.git
cd finhub-tracker
npm install

npm run dev        # http://localhost:3000
npm test           # 147 tests
npm run typecheck  # tsc --noEmit, strict
npm run lint
npm run build
```

Requires Node.js 20 or later.

---

## Assumptions and disclosure

- **Fees are reference figures** for the 2025–26 cycle, each linked to its source on the
  [Method](https://finhubtracker-maudung.vercel.app/method) page. They change every year,
  several vary by country, and colleges set their own application fees and deposits.
  The visa integrity fee was enacted in 2025 but how and when it is collected has
  varied, so it enters as a 50% contingency: confirm it with the consulate.
- **The probabilities are the student's own.** The planner does the arithmetic on that
  belief; it has no data with which to check it.
- **The example applicant is invented**, and the market lab is simulated.
- **This is not financial advice.**

---

<div align="center">
<sub><a href="./DERIVATION.md">Actuarial derivations</a> · <a href="./POSTMORTEM.md">Model risk log</a> · <a href="https://github.com/dung037517-netizen/mathforge">MathForge →</a></sub>
</div>
