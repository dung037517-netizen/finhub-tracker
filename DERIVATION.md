# Mathematical Derivations

> **What this document is.** A study document. I am working through the
> mathematics behind `lib/college-plan.ts` until I can reproduce each result
> unaided. Where a derivation is standard actuarial material I say so rather
> than implying I discovered it. See [How This Was Built](./README.md#how-this-was-built--transparency-statement).

---

## 1. Notation

| Symbol | Meaning |
|---|---|
| $C_0$ | Annual cost in today's dollars |
| $g$ | Annual cost inflation |
| $r$ | Expected annual effective return |
| $i$ | Monthly effective rate |
| $\sigma$ | Annualised volatility of returns |
| $P$ | Monthly contribution |
| $B_t$ | Account balance at end of month $t$ |
| $W_t$ | Withdrawal in month $t$ |
| $n$ | Total months in the horizon |

---

## 2. Annuity-due accumulation

### 2.1 Rate conversion

An annual effective rate $r$ converts to monthly $i$ by requiring twelve months
of compounding to reproduce it exactly:

$$(1+i)^{12} = 1+r \quad\Longrightarrow\quad i = (1+r)^{1/12} - 1$$

This is **not** $r/12$. By strict concavity of $x \mapsto x^{1/12}$ on $x>0$:

$$(1+r)^{1/12} - 1 < \frac{r}{12} \quad \text{for } r > 0$$

At $r = 6\%$: $i = 0.4868\%$ versus the nominal shortcut $0.5000\%$. Over 60
months the shortcut overstates the terminal balance by roughly $0.8\%$.

### 2.2 The accumulation identity

With no withdrawals, contribution $P$ at the **start** of each month, over $n$
months. The payment made at the start of month $k$ (for $k = 1,\dots,n$) earns
interest for $n - k + 1$ full months:

$$\ddot{S}_n = \sum_{k=1}^{n} P(1+i)^{\,n-k+1}$$

Substituting $j = n-k+1$, as $k$ runs $1 \to n$, $j$ runs $n \to 1$:

$$\ddot{S}_n = P\sum_{j=1}^{n}(1+i)^{\,j} = P(1+i)\sum_{j=0}^{n-1}(1+i)^{\,j}$$

The inner sum is geometric with ratio $(1+i) \neq 1$:

$$\sum_{j=0}^{n-1}(1+i)^{\,j} = \frac{(1+i)^n - 1}{(1+i)-1} = \frac{(1+i)^n - 1}{i}$$

Therefore:

$$\boxed{\;\ddot{s}_{\overline{n}|i} = \frac{(1+i)^n - 1}{i}\,(1+i)\;}$$

### 2.3 Why the trailing $(1+i)$ matters

The annuity-**immediate** (payments at period *end*) gives
$s_{\overline{n}|i} = \frac{(1+i)^n-1}{i}$. The ratio is exactly:

$$\frac{\ddot{s}_{\overline{n}|i}}{s_{\overline{n}|i}} = 1+i$$

Every payment earns one extra month. At $i=0.4868\%$ over 5 years that is
$\approx 0.49\%$ more — small, but it is the difference between a model that is
right and one that is nearly right.

**Both facts are asserted as tests** in `tests/college-plan.test.ts`:
`"reproduces the annuity-due future value s̈(n,i) exactly"` and
`"is strictly greater than the annuity-immediate equivalent"`.

### 2.4 The full recurrence

With withdrawals, no closed form survives. The implementation is the recurrence:

$$B_t = \bigl(B_{t-1} + P - W_t\bigr)(1+i), \qquad B_{-1} = B_{\text{initial}}$$

subject to $B_t = B_{t-1} + P - W_t$ whenever that quantity is negative (a
shortfall earns no return). Cost inflation enters through:

$$C_k = C_0(1+g)^k$$

---

## 3. Why bisection, not Newton-Raphson

### 3.1 The objective

Define, for monthly contribution $P$:

$$f(P) = \min_{0 \le t \le n} B_t(P)$$

We seek $P^\star = \inf\{P : f(P) \ge 0\}$.

### 3.2 $f$ is strictly increasing

Each $B_t(P)$ is affine and strictly increasing in $P$: an extra dollar
contributed in month $k \le t$ accumulates to $(1+i)^{t-k+1} > 0$ by month $t$.
So $\frac{\partial B_t}{\partial P} = \sum_{k \le t}(1+i)^{t-k+1} > 0$.

A pointwise minimum of strictly increasing functions is strictly increasing.
Hence $f$ is strictly increasing, $P^\star$ is **unique**, and any sign change
brackets it.

### 3.3 $f$ is not differentiable

$f$ is a pointwise **minimum** over a finite family $\{B_t\}_{t=0}^{n}$ of affine
functions of $P$. Let $t^\star(P) = \arg\min_t B_t(P)$.

At values of $P$ where $t^\star$ changes — where two balance curves cross — $f$
has a **kink**: left and right derivatives differ.

$$f'(P^-) = \frac{\partial B_{t_1}}{\partial P} \neq \frac{\partial B_{t_2}}{\partial P} = f'(P^+)$$

A min of affine functions is **concave and piecewise-linear**. It is continuous
everywhere but differentiable only on the open intervals between crossovers.

Additionally, the withdrawal schedule is a step function of $t$ (payments land
only in specific months), so long stretches of $P$ leave $t^\star$ unchanged and
$f$ nearly flat.

### 3.4 Newton fails on exactly these two features

Newton's iteration:

$$P_{k+1} = P_k - \frac{f(P_k)}{f'(P_k)}$$

requires $f'$ to exist and be bounded away from zero.

- **At a kink**, $f'(P_k)$ is undefined. A numerical derivative
  $\frac{f(P+h)-f(P-h)}{2h}$ straddling the kink returns an average of two
  different slopes — a value that describes neither side.
- **On a flat stretch**, $f'(P_k) \approx 0$, so $f(P_k)/f'(P_k) \to \infty$
  and the iterate is thrown far outside the bracket.

Newton is superlinear *when it converges*. Here it has no convergence guarantee
at all.

### 3.5 Bisection is unconditionally correct here

Bisection requires only:
1. $f$ continuous on $[a,b]$ — ✓ (min of affine functions is continuous)
2. $f(a) < 0 < f(b)$ — ✓ (established by bracket expansion)

Then the bracket halves every iteration:

$$|P_k - P^\star| \le \frac{b-a}{2^k}$$

**Guaranteed** linear convergence. Starting from a bracket of width $10^4$,
reaching $10^{-2}$ needs $\log_2(10^6) \approx 20$ iterations. The
implementation runs up to 200 and stops on tolerance.

> **The engineering point.** Newton is faster when it works. For a solver whose
> output a family will act on, *"always right, slightly slower"* beats
> *"usually faster, occasionally absurd."* Choosing a method by its **failure
> mode** rather than its best case is the actual lesson here.

### 3.6 A subtlety in the confidence solver

`requiredContributionForConfidence` bisects on **shortfall probability**,
estimated by Monte Carlo. A Monte Carlo estimate is a *random* function of $P$.

If the seed were re-drawn each evaluation, $\hat{p}(P)$ would be noisy and
bisection would oscillate rather than converge — the sign test would flip on
sampling noise, not on the true crossing.

**Fixing the seed** makes $\hat{p}(P)$ a deterministic step function of $P$,
monotone decreasing, which bisection handles correctly. This is why
`DEFAULT_SEED` is threaded through every call.

---

## 4. Lognormal returns and why the risk margin is unavoidable

### 4.1 The model

$$1 + R_m = \exp\!\left[\left(\ln(1+r) - \frac{\sigma^2}{2}\right)\Delta t + \sigma\sqrt{\Delta t}\,Z\right], \qquad Z \sim \mathcal{N}(0,1)$$

with $\Delta t = 1/12$. So $\ln(1+R_m) \sim \mathcal{N}(\mu\Delta t, \sigma^2\Delta t)$
where $\mu = \ln(1+r) - \sigma^2/2$.

### 4.2 Why the $-\sigma^2/2$ correction is mandatory

For $X \sim \mathcal{N}(m, s^2)$, the moment generating function gives:

$$\mathbb{E}[e^X] = e^{\,m + s^2/2}$$

Without the correction, setting $m = \ln(1+r)\Delta t$:

$$\mathbb{E}[1+R_m] = \exp\!\left(\ln(1+r)\Delta t + \frac{\sigma^2\Delta t}{2}\right) > (1+r)^{\Delta t}$$

The simulation would drift **upward faster than the stated expected return**,
systematically understating every risk figure. With $m = (\ln(1+r) - \sigma^2/2)\Delta t$:

$$\mathbb{E}[1+R_m] = \exp\!\left(\ln(1+r)\Delta t - \frac{\sigma^2\Delta t}{2} + \frac{\sigma^2\Delta t}{2}\right) = (1+r)^{\Delta t} \;\checkmark$$

**Test:** `"collapses the fan to the deterministic path at zero volatility"` — at
$\sigma = 0$ the lognormal degenerates to its drift, so every percentile must
equal the deterministic path. This is the strongest available check that the
correction is applied correctly.

### 4.3 The median–mean gap

For lognormal $Y = e^X$ with $X \sim \mathcal{N}(m,s^2)$:

$$\text{Median}(Y) = e^{m}, \qquad \mathbb{E}[Y] = e^{\,m+s^2/2}$$

$$\frac{\mathbb{E}[Y]}{\text{Median}(Y)} = e^{\,s^2/2} > 1 \quad \text{whenever } s > 0$$

**The mean strictly exceeds the median.** The arithmetic average is inflated by
a thin upper tail that the typical path never visits.

Over $n$ months the cumulative log-return is $\mathcal{N}(nm, ns^2)$, so the gap
**widens with horizon**:

$$\frac{\mathbb{E}[Y_n]}{\text{Median}(Y_n)} = e^{\,n s^2/2}$$

For $\sigma = 12\%$ over 5 years: $e^{0.5 \times 0.0144 \times 5} = e^{0.036} \approx 1.037$.

### 4.4 Why funding to the mean fails ~50% of the time

$P^\star$ is solved so the **deterministic** path exactly reaches zero at its
worst point. That path tracks the *mean* return.

But roughly half of all realised paths finish below the median, and the median
lies below the mean. So the probability of falling short is:

$$\mathbb{P}(\text{shortfall} \mid P = P^\star) \approx \mathbb{P}(Y_n < \mathbb{E}[Y_n]) > \tfrac12$$

**Empirically confirmed** at 800 paths: shortfall probability lands in
$[0.30, 0.70]$, tested in
`"demonstrates the median–mean gap: funding to the mean fails ~half the time"`.

### 4.5 The risk margin

Define $P_\alpha = \inf\{P : \mathbb{P}(\min_t B_t < 0) \le 1-\alpha\}$.

The **risk margin** is:

$$\text{RM} = \frac{P_{0.90}}{P^\star} - 1$$

Measured across the three preset scenarios:

| Scenario | $P^\star$ | $P_{0.90}$ | Risk margin |
|---|---:|---:|---:|
| In-state public | \$777 | \$1,090 | **+40%** |
| Out-of-state public | \$1,456 | \$1,980 | **+36%** |
| Private | \$1,679 | \$2,425 | **+44%** |

### 4.6 Why the margin is this large

Two compounding factors:

1. **High initial balance.** Each preset holds substantial savings already
   exposed to five years of market risk. Additional contributions cannot offset
   volatility on a balance that is already large — the variance term scales with
   the balance, the contribution does not.
2. **Convexity of the tail.** Moving from the 50th to the 90th percentile of a
   lognormal is a much larger step than from the 10th to the 50th, because the
   distribution is right-skewed. Buying confidence gets progressively more
   expensive.

> **This is precisely what a risk margin is in Solvency II and IFRS 17:** the
> loading above best-estimate liability that converts *"probably adequate"* into
> *"adequate with stated confidence."* The same number, at family scale.

### 4.7 Why TVaR and not just VaR

The model reports both:

$$\mathrm{VaR}_\alpha = \inf\{x : \mathbb{P}(L \le x) \ge \alpha\}, \qquad
\mathrm{TVaR}_\alpha = \mathbb{E}[L \mid L \ge \mathrm{VaR}_\alpha]$$

VaR is **not subadditive**: there exist $L_1, L_2$ with

$$\mathrm{VaR}_\alpha(L_1 + L_2) > \mathrm{VaR}_\alpha(L_1) + \mathrm{VaR}_\alpha(L_2)$$

which would say diversification *increases* risk — incoherent. TVaR **is**
subadditive and therefore coherent, which is why Solvency II and the Swiss
Solvency Test are built on expected shortfall.

Practically: a 5% chance of a \$2,000 gap and a 5% chance of a \$90,000 gap have
identical VaR and utterly different TVaR. Reporting only VaR hides the
difference that matters most.

**Test:** `"keeps TVaR at or above VaR — the coherence property"`.

---

## 5. Open questions I am still working through

Recorded honestly rather than omitted:

1. **Serial correlation.** Returns are drawn i.i.d. Real equity returns exhibit
   volatility clustering (GARCH effects). This likely *understates* tail risk.
2. **Inflation is deterministic.** $g$ is a fixed constant; in reality cost
   inflation is itself stochastic and probably correlated with market returns.
3. **Aid is modelled as inflating in lockstep with cost.** Defensible, but
   need-based aid often responds to family assets — creating a feedback loop
   between the savings balance and the aid figure that this model ignores.
4. **No tax treatment.** A real 529 has tax-advantaged growth and penalties for
   non-qualified withdrawal. Neither is modelled.

---

## References

- Bowers et al., *Actuarial Mathematics*, 2nd ed. — annuity notation, Ch. 4–5
- Broverman, *Mathematics of Investment and Credit* — annuity-due derivations
- Hull, *Options, Futures, and Other Derivatives* — lognormal returns, drift correction
- Artzner et al. (1999), "Coherent Measures of Risk" — subadditivity, why TVaR
- Burden & Faires, *Numerical Analysis* — bisection convergence guarantees
