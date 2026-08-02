# Model Risk Management Log

> Incidents recorded during development of this valuation model, analysed under
> the **Model Risk Management** framework used in insurance and banking
> (SR 11-7; Solvency II Articles 121–124 on internal model governance).
>
> Model risk has three sources: **model error** (the mathematics is wrong),
> **implementation error** (the code does not match the mathematics), and
> **use error** (a correct model applied to the wrong inputs, or its output
> misread). Each incident below is classified accordingly.
>
> Every incident is one I can point to concretely in the codebase or its
> history. I would rather publish a short honest log than a long invented one.

---

## Model inventory

| Model | Location | Purpose | Validation basis |
|---|---|---|---|
| Liability projection | `projectCollegeCosts()` | Inflation-indexed benefit stream | Closed-form geometric growth |
| ALM ledger | `runSavingsLedger()` | Asset/liability run-off | $\ddot{s}_{\overline{n}\rvert i}$ identity |
| BEL solver | `requiredMonthlyContribution()` | Best Estimate funding premium | Boundary tightness + monotonicity |
| Stochastic solvency | `assessCollegePlanRisk()` | Ruin probability, CTE | Zero-volatility degeneracy |
| Risk Margin solver | `requiredContributionForConfidence()` | Technical Provision | Achieved confidence back-test |

---

## MRM-001 — Published Risk Margin understated by a factor of three

**Classification:** Use error → reporting control failure
**Severity:** High (incorrect public disclosure)
**Status:** Resolved

### Impact

The README disclosed a 90%-confidence Risk Margin of **12%**. The correct
loading for the shipped assumption set is **36–44%**. The published figure
understated the model's central finding — the cost of tail adequacy — by roughly
a factor of three, in the document a reader is most likely to trust without
independent recalculation.

In an insurance context this is a **disclosure error on a technical provision**:
the model was right, the number that left the building was not.

### Timeline

1. `requiredContributionForConfidence()` implemented and evaluated against the
   assumption set then in force. Ratio $P_{0.90}/P^\star = 1.12$ → "12%".
2. Figure hard-coded into `README.md`.
3. Independently, the **assumption set was recalibrated**. The original basis
   produced a 100% ruin probability — an unusable default — so initial assets
   rose \$18,000 → \$52,000 and premium \$450 → \$950.
4. The disclosure was not recalculated against the new basis.
5. Detected during end-to-end verification: the application rendered *"40% more
   than the expected case"* while the README asserted 12%.

### Root cause

**A model output was hard-coded in narrative while its inputs lived in code,
with no dependency linking the two.**

The 12% was correct on the basis under which it was computed. Changing the
assumption set silently invalidated it. There was no control that could detect
the drift because the disclosure had no computational dependency on the model.

### Contributing factors

- The recalibration was performed for a **presentation** reason, so it did not
  feel like an assumption change requiring revaluation. This is a classic MRM
  failure: **assumption changes reclassified as cosmetic escape review.**
- No test asserted the Risk Margin, so the regression suite stayed green.

### Resolution

- Corrected to 36–44% with per-scenario figures disclosed in a table.
- **Added a regression control** asserting the margin lies in $[0.20, 0.80]$ for
  every scenario — wide enough to tolerate Monte Carlo sampling error, tight
  enough to catch a 3× disclosure error.

### Control introduced

> Any figure in narrative derived from the model must either (a) be asserted by
> a test, or (b) be disclosed alongside the inputs that produced it.

The README now discloses *"in-state \$777 → \$1,090"* rather than a bare
percentage. A reader can recompute it; a future maintainer can see its basis.

---

## MRM-002 — Default assumption set produced a degenerate valuation

**Classification:** Use error (parameterisation)
**Severity:** Medium (model unusable as presented)
**Status:** Resolved

### Impact

The default scenario returned **100% ruin probability** and a **42% funding
ratio** on load. The flagship output of the model communicated only "this plan
is hopeless," and the percentile fan collapsed into a single band far below
zero — conveying no information about the distribution of outcomes, which is the
entire purpose of a stochastic projection.

### Root cause

The basis was selected for **plausibility** (\$450/month is a realistic household
premium) without evaluating what it **produced**. Realistic input, degenerate
output. The two were never assessed jointly.

This is a use error, not a model error: the mathematics was correct throughout.
A model that is right and useless is still a failed model.

### Detection

Visual inspection of rendered output. **Not caught by any test** — the entire
suite passed, because every computation was correct.

> Numerical correctness tests cannot detect a degenerate parameterisation. That
> requires output review, which is why MRM frameworks mandate it separately
> from code validation.

### Resolution

Swept the assumption space for a basis simultaneously plausible and
informative:

| Initial assets | Premium | Funding ratio | $\mathbb{P}(\text{ruin})$ |
|---:|---:|---:|---:|
| \$45,000 | \$900 | 99% | 57% |
| **\$52,000** | **\$950** | **100%** | **21%** ← adopted |
| \$60,000 | \$1,000 | 100% | 4.3% |

\$52k/\$950 presents a plan **adequate on the best estimate yet visibly exposed
to tail risk** — precisely the distinction the model exists to demonstrate. A
default at 0% ruin teaches nothing; one at 100% appears broken.

### Control introduced

Test asserting every scenario satisfies
$0.05 < \mathbb{P}(\text{ruin}) < 0.75$, so a future recalibration cannot
silently reintroduce a degenerate basis.

---

## MRM-003 — Model inventory divergence: no auditable source of record

**Classification:** Governance failure
**Severity:** Critical (all disclosures unverifiable)
**Status:** Partially resolved

### Impact

`github.com/dung037517-netizen/financeflow` returned:

```
409 Git Repository is empty
```

**Zero commits.** Meanwhile a deployment was live and the README asserted
*"63 tests passing"* behind a green badge.

Every quantitative disclosure about this model was **unverifiable by any
independent party**. Worse than unverified: the badge asserted a validation
suite that no reviewer could locate or execute.

In MRM terms this is the most serious class of failure — not a wrong number, but
**absence of an auditable model record**. A model whose implementation cannot be
inspected cannot be validated, and an unvalidated model's output carries no
weight regardless of whether it happens to be correct.

### Root cause

Commits existed only locally. A push failed on an authorisation error and the
failure was not treated as blocking. The sibling repository pushed successfully,
creating a **false assurance that the work was published** — one success masking
an adjacent silent failure.

### Detection

Direct API query during audit. **Not** by inspecting the deployment, which
appeared healthy.

### Resolution

- [x] Root cause identified: push failure treated as non-blocking
- [ ] **Publish complete source** ← outstanding
- [ ] Confirm the deployment builds from that repository and branch
- [ ] Suppress every metric badge until CI regenerates it from an execution

### Control introduced

> A metric badge may appear only if continuous integration produces it. A
> hand-written badge asserting a test count is an unsubstantiated claim.

`.github/workflows/ci.yml` exists for this reason: it executes typecheck, lint,
the full suite and the build on every push, so the badge reflects a run rather
than an assertion.

---

## MRM-004 — Validation oracle was itself incorrect

**Classification:** Validation error
**Severity:** Low (caught pre-release)
**Status:** Resolved

### Impact

The IRR test asserted `0.1289`. The implementation returned `0.12321`. Initial
working hypothesis: the solver contained a defect.

### Investigation

Solved the cash flows analytically. For $-1000, +500, +700$ with $v = 1/(1+i)$:

$$700v^2 + 500v - 1000 = 0 \;\Longrightarrow\; v = \frac{-500 + \sqrt{3{,}050{,}000}}{1400}$$

$$i = \frac{1}{v} - 1 = 0.1232125\ldots$$

**The implementation was correct. The validation oracle was wrong.**

### Root cause

The expected value was estimated rather than derived. **A test oracle that is
guessed is not an oracle** — it is a second, unvalidated model, and when two
unvalidated models disagree there is no basis for deciding which to trust.

### Resolution

Rewrote the test to derive the closed-form root **within the test** from the
quadratic, then compare to eight decimal places:

```ts
const v = (-500 + Math.sqrt(3_050_000)) / 1400;
expect(irr).toBeCloseTo(1 / v - 1, 8);
```

### What the near-miss demonstrates

My first instinct was to "correct" working code to satisfy a wrong test. Had I
done so I would have introduced a genuine defect while the suite remained green
— converting a validation failure into an undetected model error.

> When validation fails, the validator is a suspect too. Independent validation
> requires the oracle to be independently derived, not merely independent of the
> implementation.

---

## MRM-005 — Deployment routing

**Classification:** Unclassified — not yet reproduced
**Status:** Open

Routing failures were reported against the live deployment (404 responses on
non-root paths). I have **not reproduced this myself**, so I am not recording a
root cause I cannot evidence.

To complete on reproduction:

- [ ] Exact URLs returning 404, with timestamps
- [ ] Deployment identifier and build log
- [ ] Whether the deployed commit matches the repository head
- [ ] Whether the failure is routing configuration, an absent route, or a stale
      build artefact

> Deliberately left open. A postmortem for an incident I have not verified would
> be fiction, and an MRM log containing fiction is worse than no log — it
> destroys the credibility of the entries that are true.

---

## Standing model governance controls

Derived from the incidents above:

1. **Reproducibility.** Every stochastic routine takes a fixed seed. A model
   that cannot be re-run to the same answer cannot be validated.
2. **Closed-form anchoring.** Every core routine is pinned against an analytic
   identity, not against its own prior output.
3. **Degeneracy checks.** The zero-volatility test forces the stochastic model
   to collapse onto the deterministic one — the strongest available check on the
   drift correction.
4. **Disclosure discipline.** No narrative figure without a test or its inputs.
5. **Documented limitations.** `DERIVATION.md` §5 states five known model
   limitations, including that i.i.d. returns likely understate tail risk.
