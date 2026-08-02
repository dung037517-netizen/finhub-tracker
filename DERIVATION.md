# Actuarial Derivations

> **What this document is.** A study document. I am working through the actuarial
> mathematics behind `lib/college-plan.ts` until I can reproduce each result
> unaided. Where a derivation is standard actuarial material — and most of it is —
> I say so rather than implying I discovered it.
> See [How This Was Built](./README.md#how-this-was-built--transparency-statement).

---

## 1. The model in actuarial terms

A four-year college funding plan is a **defined-benefit liability** funded by an
asset portfolio of uncertain return. Every technique below is standard pension
and life-insurance practice, applied at household scale.

| Component | Actuarial object |
|---|---|
| Tuition, room, board | **Liability stream** $\{W_t\}$, inflation-linked |
| Savings and investments | **Asset portfolio** $A_t$ |
| Monthly contribution | **Level premium** $P$ |
| Fund runs dry | **Ruin event**, $\min_t A_t < 0$ |
| Contribution at best estimate | Funding the **BEL** |
| Additional loading for confidence | **Risk Margin** |

### 1.1 International Actuarial Notation

| Symbol | Definition | Relation |
|---|---|---|
| $i$ | Annual effective rate of interest | — |
| $v$ | Discount factor | $v = \dfrac{1}{1+i}$ |
| $d$ | Rate of discount | $d = \dfrac{i}{1+i} = iv = 1 - v$ |
| $\delta$ | Force of interest | $\delta = \ln(1+i)$ |
| $i_m$ | Monthly effective rate | $(1+i_m)^{12} = 1+i$ |
| $\ddot{s}_{\overline{n}\rvert i}$ | Accumulated value, annuity-due | $\dfrac{(1+i)^n - 1}{d}$ |
| $\ddot{a}_{\overline{n}\rvert i}$ | Present value, annuity-due | $\dfrac{1 - v^n}{d}$ |
| $g$ | Benefit (cost) inflation | — |
| $\sigma$ | Annualised asset volatility | — |
| $\mathrm{CTE}_\alpha$ | Conditional Tail Expectation | $= \mathrm{TVaR}_\alpha$ |

### 1.2 Relationships worth stating explicitly

$$d = iv, \qquad v = e^{-\delta}, \qquad 1 + i = e^{\delta}, \qquad d = 1 - e^{-\delta}$$

and the fundamental link between accumulation and present value:

$$\ddot{s}_{\overline{n}\rvert i} = (1+i)^n \cdot \ddot{a}_{\overline{n}\rvert i}$$

---

## 2. Annuity-due accumulation of the asset portfolio

### 2.1 Rate conversion

The projection runs monthly. An annual effective rate $i$ converts to monthly
$i_m$ by requiring twelve periods of compounding to reproduce it exactly:

$$(1+i_m)^{12} = 1+i \quad\Longrightarrow\quad i_m = (1+i)^{1/12} - 1 = e^{\delta/12} - 1$$

This is **not** $i/12$. In actuarial notation $i/12$ is $i^{(12)}/12$, the
nominal rate convertible monthly — a different quantity. By strict concavity of
$x \mapsto x^{1/12}$ on $x > 0$:

$$(1+i)^{1/12} - 1 < \frac{i}{12} \quad \text{for } i > 0$$

At $i = 6\%$: $i_m = 0.4868\%$ against the nominal $0.5000\%$. Over a 60-month
projection the nominal shortcut overstates the accumulated fund by roughly
$0.8\%$ — immaterial per period, material at the benefit payment date.

### 2.2 Derivation of $\ddot{s}_{\overline{n}\rvert i}$

Level premium $P$ paid at the **start** of each of $n$ periods. The payment made
at the start of period $k$ (for $k = 1,\dots,n$) accumulates for $n-k+1$ full
periods:

$$\ddot{S}_n = \sum_{k=1}^{n} P(1+i)^{\,n-k+1}$$

Substitute $j = n-k+1$; as $k$ runs $1 \to n$, $j$ runs $n \to 1$:

$$\ddot{S}_n = P\sum_{j=1}^{n}(1+i)^{\,j} = P(1+i)\sum_{j=0}^{n-1}(1+i)^{\,j}$$

The inner sum is geometric with ratio $(1+i) \neq 1$:

$$\sum_{j=0}^{n-1}(1+i)^{\,j} = \frac{(1+i)^n - 1}{(1+i)-1} = \frac{(1+i)^n - 1}{i}$$

Hence

$$\ddot{S}_n = P \cdot \frac{(1+i)^n - 1}{i}(1+i)$$

Now apply $d = \dfrac{i}{1+i}$, so $\dfrac{1+i}{i} = \dfrac{1}{d}$:

$$\boxed{\;\ddot{s}_{\overline{n}\rvert i} = \frac{(1+i)^n - 1}{d}\;}$$

This is the standard form. The rate of discount $d$ in the denominator — rather
than the rate of interest $i$ — is exactly what distinguishes an annuity-**due**
from an annuity-immediate.

### 2.3 The due/immediate relationship

The annuity-immediate (payments at period *end*) gives
$s_{\overline{n}\rvert i} = \dfrac{(1+i)^n-1}{i}$. Therefore

$$\frac{\ddot{s}_{\overline{n}\rvert i}}{s_{\overline{n}\rvert i}} = \frac{i}{d} = 1+i$$

Every premium earns one additional period of interest. At $i_m = 0.4868\%$ that
is $\approx 0.49\%$ more over the projection — the difference between a model
that is right and one that is nearly right.

**Both facts are asserted as tests** in `tests/college-plan.test.ts`:
`"reproduces the annuity-due future value s̈(n,i) exactly"` and
`"is strictly greater than the annuity-immediate equivalent"`.

### 2.4 The full recurrence with benefit outgo

Once benefits fall due, no closed form survives. The implementation is:

$$A_t = \bigl(A_{t-1} + P - W_t\bigr)(1+i_m), \qquad A_{-1} = A_{\text{initial}}$$

subject to $A_t = A_{t-1} + P - W_t$ whenever that quantity is negative — a fund
in deficit earns no return. The liability stream is indexed:

$$W \text{ derived from } C_k = C_0(1+g)^k$$

This is an **accumulation phase followed by a decumulation phase**, structurally
identical to a pension in payment.

---

## 3. Bisection under a non-smooth liability profile

### 3.1 The solvency objective

For level premium $P$, define

$$f(P) = \min_{0 \le t \le n} A_t(P)$$

We seek the BEL-funding premium

$$P^\star = \inf\{P : f(P) \ge 0\}$$

### 3.2 $f$ is strictly increasing

Each $A_t(P)$ is affine and strictly increasing in $P$: an extra unit of premium
paid at period $k \le t$ accumulates to $(1+i_m)^{\,t-k+1} > 0$ by period $t$, so

$$\frac{\partial A_t}{\partial P} = \sum_{k \le t}(1+i_m)^{\,t-k+1} > 0$$

A pointwise minimum of strictly increasing functions is strictly increasing.
Hence $f$ is strictly increasing, $P^\star$ is **unique**, and any sign change
brackets it.

### 3.3 $f$ is not differentiable

$f$ is a pointwise **minimum** over the finite family $\{A_t\}_{t=0}^{n}$ of
affine functions of $P$. Write $t^\star(P) = \arg\min_t A_t(P)$ — the period at
which the fund is under greatest strain.

As $P$ varies, $t^\star$ **moves**: the binding constraint shifts from one
benefit payment date to another. At each such crossover $f$ has a **kink**,
where the left and right derivatives differ:

$$f'(P^-) = \frac{\partial A_{t_1}}{\partial P} \;\neq\; \frac{\partial A_{t_2}}{\partial P} = f'(P^+)$$

A minimum of affine functions is **concave and piecewise-linear**: continuous
everywhere, differentiable only on the open intervals between crossovers.

Compounding this, the liability stream is a *step* function of $t$ — benefits
fall due only in specific months — so long stretches of $P$ leave $t^\star$
unchanged and $f$ nearly flat.

### 3.4 Why Newton-Raphson fails here

Newton's iteration

$$P_{k+1} = P_k - \frac{f(P_k)}{f'(P_k)}$$

requires $f'$ to exist and be bounded away from zero. Neither holds:

- **At a kink**, $f'(P_k)$ is undefined. A numerical derivative
  $\dfrac{f(P+h)-f(P-h)}{2h}$ straddling the kink averages two different slopes
  and describes neither side.
- **On a flat stretch**, $f'(P_k) \approx 0$, so $f(P_k)/f'(P_k) \to \infty$ and
  the iterate is thrown far outside the bracket.

Newton is superlinear *when it converges*. Against a non-smooth liability
profile it has no convergence guarantee at all.

### 3.5 Bisection is unconditionally correct

Bisection requires only:

1. $f$ continuous on $[a,b]$ — ✓ (a minimum of affine functions is continuous)
2. $f(a) < 0 < f(b)$ — ✓ (established by bracket expansion)

The bracket then halves every iteration:

$$|P_k - P^\star| \le \frac{b-a}{2^{\,k}}$$

**Guaranteed** linear convergence. From a bracket of width $10^4$, reaching
$10^{-2}$ takes $\log_2(10^6) \approx 20$ iterations; the implementation permits
200 and halts on tolerance.

> **The actuarial point.** Newton is faster when it converges. For a reserve
> calculation whose output a family will act on, *"always right, slightly
> slower"* beats *"usually faster, occasionally absurd."* Selecting a numerical
> method by its **failure mode** rather than its best case is model risk
> management, not fastidiousness.

### 3.6 A subtlety in the Risk Margin solver

`requiredContributionForConfidence` bisects on **ruin probability**, estimated
by Monte Carlo. A simulation estimate is a *random* function of $P$.

If the seed were redrawn at each evaluation, $\hat{p}(P)$ would be noisy and
bisection would oscillate rather than converge — the sign test would flip on
sampling noise instead of at the true crossing.

**Fixing the seed** makes $\hat{p}(P)$ a deterministic, monotone step function
of $P$, which bisection handles correctly. This is why `DEFAULT_SEED` is threaded
through every call, and it is the same reason a valuation model must be
reproducible before it can be validated.

---

## 4. Lognormal asset returns and the Risk Margin

### 4.1 The asset model

$$1 + R_m = \exp\!\left[\left(\delta - \frac{\sigma^2}{2}\right)\Delta t + \sigma\sqrt{\Delta t}\,Z\right], \qquad Z \sim \mathcal{N}(0,1)$$

with $\Delta t = 1/12$ and $\delta = \ln(1+i)$ the force of interest. Hence

$$\ln(1+R_m) \sim \mathcal{N}\!\left(\left(\delta - \tfrac{\sigma^2}{2}\right)\Delta t,\; \sigma^2\Delta t\right)$$

### 4.2 Why the $-\sigma^2/2$ correction is mandatory

For $X \sim \mathcal{N}(m, s^2)$ the moment generating function gives

$$\mathbb{E}[e^X] = e^{\,m + s^2/2}$$

Omitting the correction — setting $m = \delta\Delta t$ — yields

$$\mathbb{E}[1+R_m] = \exp\!\left(\delta\Delta t + \frac{\sigma^2\Delta t}{2}\right) > e^{\delta \Delta t} = (1+i)^{\Delta t}$$

The simulated portfolio would drift **upward faster than the stated expected
return**, systematically understating every solvency figure. With the correction:

$$\mathbb{E}[1+R_m] = \exp\!\left(\delta\Delta t - \frac{\sigma^2\Delta t}{2} + \frac{\sigma^2\Delta t}{2}\right) = (1+i)^{\Delta t} \;\checkmark$$

**Test:** `"collapses the fan to the deterministic path at zero volatility"`. At
$\sigma = 0$ the lognormal degenerates to its drift, so every percentile must
coincide with the deterministic projection. This is the strongest available
check that the correction is applied — and no other test in the suite would
catch its absence.

### 4.3 The median–mean gap

For lognormal $Y = e^X$ with $X \sim \mathcal{N}(m, s^2)$:

$$\text{Median}(Y) = e^{m}, \qquad \mathbb{E}[Y] = e^{\,m+s^2/2}$$

$$\frac{\mathbb{E}[Y]}{\text{Median}(Y)} = e^{\,s^2/2} > 1 \quad \text{for all } s > 0$$

**The mean strictly exceeds the median.** The arithmetic average is inflated by
a thin upper tail that the typical scenario never visits.

Over $n$ periods the cumulative log-return is $\mathcal{N}(nm, ns^2)$, so the gap
**widens with the projection horizon**:

$$\frac{\mathbb{E}[Y_n]}{\text{Median}(Y_n)} = e^{\,n s^2/2}$$

At $\sigma = 12\%$ over five years: $e^{0.5 \times 0.0144 \times 5} \approx 1.037$.

### 4.4 Why funding the BEL leaves ~50% ruin probability

$P^\star$ is solved so the **deterministic** projection reaches exactly zero at
its point of greatest strain. That projection tracks the *mean* return.

But roughly half of all realised scenarios finish below the median, and the
median lies strictly below the mean. Therefore

$$\mathbb{P}\bigl(\text{ruin} \mid P = P^\star\bigr) \;\approx\; \mathbb{P}\bigl(Y_n < \mathbb{E}[Y_n]\bigr) \;>\; \tfrac12$$

**Empirically confirmed** at 800 scenarios: ruin probability lands in
$[0.30, 0.70]$, asserted in
`"demonstrates the median–mean gap: funding to the mean fails ~half the time"`.

> This is the entire reason Solvency II does not permit a technical provision set
> at best estimate. A provision adequate half the time is not a provision.

### 4.5 The Risk Margin

Define the confidence-funded premium

$$P_\alpha = \inf\Bigl\{P : \mathbb{P}\bigl(\min_t A_t < 0\bigr) \le 1-\alpha\Bigr\}$$

The **Risk Margin**, expressed as a loading on the best estimate, is

$$\mathrm{RM} = \frac{P_{0.90}}{P^\star} - 1$$

and the **Technical Provision** is $\mathrm{TP} = \mathrm{BEL} + \mathrm{RM}$.

Measured across the three preset scenarios:

| Scenario | $P^\star$ (BEL) | $P_{0.90}$ (TP) | Risk Margin |
|---|---:|---:|---:|
| In-state public | \$777 | \$1,090 | **+40%** |
| Out-of-state public | \$1,456 | \$1,980 | **+36%** |
| Private | \$1,679 | \$2,425 | **+44%** |

### 4.6 Why the margin is this large

Two effects compound:

1. **Asset-heavy funding position.** Each preset already holds substantial
   assets exposed to five years of market risk. The variance of the fund scales
   with the balance; additional premium does not. Contributions cannot offset
   volatility on a balance that is already large.
2. **Right-skew convexity.** Moving from the 50th to the 90th percentile of a
   lognormal is a far larger step than from the 10th to the 50th. Each
   additional unit of confidence costs progressively more — the same convexity
   that makes the SCR rise faster than linearly in the confidence level.

### 4.7 CTE / TVaR, and why not VaR alone

The model reports both measures:

$$\mathrm{VaR}_\alpha = \inf\{x : \mathbb{P}(L \le x) \ge \alpha\}$$

$$\mathrm{CTE}_\alpha = \mathrm{TVaR}_\alpha = \mathbb{E}\bigl[L \mid L \ge \mathrm{VaR}_\alpha\bigr]$$

**VaR is not subadditive.** There exist losses $L_1, L_2$ with

$$\mathrm{VaR}_\alpha(L_1 + L_2) > \mathrm{VaR}_\alpha(L_1) + \mathrm{VaR}_\alpha(L_2)$$

which asserts that diversification *increases* risk — incoherent in the sense of
Artzner et al. (1999). A coherent risk measure must satisfy monotonicity,
translation invariance, positive homogeneity and **subadditivity**; VaR fails the
last. CTE satisfies all four.

This is why Solvency II and the Swiss Solvency Test are built on expected
shortfall, and why the SOA syllabus teaches CTE rather than VaR as the primary
tail measure.

Practically: a 5% chance of a \$2,000 deficit and a 5% chance of a \$90,000
deficit have **identical VaR** and utterly different CTE. Reporting only VaR
hides precisely the distinction that determines whether a family is ruined.

**Test:** `"keeps TVaR at or above VaR — the coherence property"`.

---

## 5. Limitations of the model

Stated rather than omitted, because a valuation model without a documented
limitations section has not been validated.

1. **Returns are i.i.d.** Real equity returns exhibit volatility clustering
   (GARCH effects) and mean reversion. Independence almost certainly
   **understates** tail risk — the model is optimistic where it matters most.
2. **Inflation is deterministic.** $g$ is a fixed constant. Real education cost
   inflation is stochastic and plausibly correlated with asset returns, which
   would introduce ALM basis risk this model does not capture.
3. **Aid is indexed in lockstep with cost.** Defensible, but need-based aid
   often responds to family assets — creating a feedback loop between the fund
   balance and the liability that is ignored here.
4. **No tax or product structure.** A real 529 has tax-advantaged accumulation
   and penalties on non-qualified withdrawal. Neither is modelled.
5. **No mortality or morbidity decrement.** A genuine life-contingent model
   would attach survival probabilities to the benefit stream. Here the benefits
   are certain, which makes this an ALM problem rather than a life-contingent
   one.

---

## References

- Bowers, Gerber, Hickman, Jones & Nesbitt, *Actuarial Mathematics*, 2nd ed. —
  annuity notation, Ch. 4–5
- Broverman, *Mathematics of Investment and Credit* — annuity-due derivations,
  $d$ and $\delta$ relationships
- Hardy, *Investment Guarantees* — CTE, stochastic reserving, lognormal models
- Artzner, Delbaen, Eber & Heath (1999), "Coherent Measures of Risk" —
  subadditivity, why CTE and not VaR
- Hull, *Options, Futures, and Other Derivatives* — lognormal drift correction
- EIOPA, *Solvency II Delegated Regulation* — Risk Margin, Technical Provisions
- Burden & Faires, *Numerical Analysis* — bisection convergence guarantees
