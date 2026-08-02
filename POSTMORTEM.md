# Postmortems

> Incidents recorded during development, written in the blameless format used in
> production engineering: what happened, why, how it was caught, what changed.
>
> Every incident below is one I can point to concretely in the codebase or its
> history. I would rather publish a short honest list than a long invented one.

---

## INC-001 — Published risk margin figure was wrong by 3×

**Severity:** High (incorrect public claim)
**Status:** Resolved

### Impact

The README stated the 90%-confidence risk margin was **12%**. The correct figure
for the shipped presets is **36–44%**. The published number understated the
central finding of the project by roughly a factor of three, in the one document
a reader is most likely to trust without checking.

### Timeline

1. `requiredContributionForConfidence()` was implemented and measured against
   the preset scenarios then in the repository. Ratio: **1.12** → "12%".
2. That figure was written into `README.md`.
3. Separately, the presets were **retuned**. The original default produced a
   100% shortfall probability — a terrible default state — so `currentSavings`
   rose from \$18,000 to \$52,000 and `monthlyContribution` from \$450 to \$950.
4. The README was not recomputed.
5. Caught during end-to-end browser verification: the UI rendered *"40% more
   than the expected case"* while the README said 12%.

### Root cause

**A derived constant was hard-coded in prose while its inputs lived in code.**

The 12% was correct when written. Changing the presets silently invalidated it,
and nothing connected the two. The README had no dependency on the code that
produced its numbers, so nothing could detect the drift.

### Contributing factors

- The presets were changed for a **UI** reason (bad default state), so the
  change did not feel like it touched the mathematics.
- No test asserted the risk-margin figure, so the suite stayed green.

### Resolution

- Corrected to 36–44% with per-scenario values in a table.
- **Added a regression test** asserting the margin lies in $[0.20, 0.80]$ for
  every preset — wide enough to tolerate Monte Carlo noise, tight enough to
  catch a 3× error.

### What I changed in how I work

> Any number in prose that is derived from code must either (a) be asserted by a
> test, or (b) carry the inputs that produced it.

The README now states *"in-state \$777 → \$1,090"* rather than a bare
percentage. A reader can recompute it; a future me can see what it depends on.

---

## INC-002 — Default scenario rendered a 100% failure state

**Severity:** Medium (product quality)
**Status:** Resolved

### Impact

The planner's default scenario showed **100% shortfall probability** and **42%
funded** on first load. The landing state of the flagship feature communicated
"this plan is hopeless," and the Monte Carlo fan chart was visually useless —
all percentile bands collapsed together far below zero.

### Root cause

The preset was chosen for **realism** (\$450/month is a plausible family
contribution) without checking what it **rendered**. Realistic input, useless
output. The two were never evaluated together.

### Detection

Browser screenshot during verification. Not caught by any test — every test
passed, because the mathematics was correct. The *product* was wrong, not the code.

### Resolution

Swept the parameter space to find a preset that is simultaneously plausible and
pedagogically useful:

| currentSavings | monthly | funded | P(shortfall) |
|---:|---:|---:|---:|
| \$45,000 | \$900 | 99% | 57% |
| **\$52,000** | **\$950** | **100%** | **21%** ← chosen |
| \$60,000 | \$1,000 | 100% | 4.3% |

\$52k/\$950 shows a plan that is **funded on the expected path but still visibly
risky** — which is exactly the lesson the tool exists to teach. A default at 0%
risk teaches nothing; one at 100% looks broken.

### What I changed

Added a test asserting every preset lands in
$0.05 < \mathbb{P}(\text{shortfall}) < 0.75$, so a future parameter change
cannot silently reintroduce a degenerate default.

---

## INC-003 — Repository/deployment divergence: source of truth was empty

**Severity:** Critical (integrity of every published claim)
**Status:** Partially resolved

### Impact

`github.com/dung037517-netizen/financeflow` returned:

```
409 Git Repository is empty
```

**Zero commits.** Meanwhile the deployment at `finhubtracker-maudung.vercel.app`
was live and the README claimed *"63 tests passing"* with a green badge.

Every quantitative claim about this project was **unverifiable by any third
party**. Worse than unverified — the badges asserted a test suite that no one
could locate or run. From a reader's position this is indistinguishable from
fabrication.

### Root cause

The commits existed only locally. A push failed on an authorization error and
the failure was not treated as blocking. The sibling repository (`mathforge`)
pushed successfully, which created a **false sense that the work was published**
— one repo landing masked the other silently not landing.

### Detection

Direct GitHub API query during an audit — not by looking at the site, which
appeared fine.

### Why this is the most serious of the three

INC-001 and INC-002 are wrong numbers. This one breaks **verifiability itself**.
A claim nobody can check is not a weak claim; it is not a claim at all.

### Resolution

- [x] Root cause identified: push failure treated as non-blocking
- [ ] **Push the complete source to `financeflow`** ← outstanding
- [ ] Confirm the Vercel project builds from that repository and branch
- [ ] Remove every metric badge until CI regenerates it from an actual run

### Standing rule

> A metric badge may only appear in a README if CI produces it. A hand-written
> badge asserting a test count is a claim without evidence.

The `.github/workflows/ci.yml` in this repository exists for exactly this reason.

---

## INC-004 — Test asserted a hand-computed value that was itself wrong

**Severity:** Low (caught pre-merge)
**Status:** Resolved

### Impact

The IRR test expected `0.1289`. The implementation returned `0.12321`. Initial
assumption: the solver had a bug.

### Investigation

Solved the cash flows by hand. For $-1000, +500, +700$ with $v = 1/(1+i)$:

$$700v^2 + 500v - 1000 = 0 \;\Longrightarrow\; v = \frac{-500 + \sqrt{3{,}050{,}000}}{1400}$$

$$i = \frac{1}{v} - 1 = 0.1232125\ldots$$

**The implementation was correct. The test's expected value was wrong.**

### Root cause

The expected value was estimated rather than derived. A test oracle that is
guessed is not an oracle.

### Resolution

Rewrote the test to compute the closed-form root **inside the test** from the
quadratic, then compare to 8 decimal places:

```ts
const v = (-500 + Math.sqrt(3_050_000)) / 1400;
expect(irr).toBeCloseTo(1 / v - 1, 8);
```

### What I learned

The near-miss matters more than the fix. My first instinct was to "fix" working
code to match a wrong test. Had I done that, I would have introduced a real bug
while the suite stayed green.

> When a test fails, the test is a suspect too.

---

## INC-005 — Deployment routing

**Status:** Open — awaiting my own reproduction

Routing failures were reported on the live deployment (404s on non-root paths).
I have **not yet reproduced this myself**, so I am not recording a root cause I
cannot evidence.

To complete when reproduced:

- [ ] Exact URLs returning 404, with timestamps
- [ ] Vercel deployment ID and build log
- [ ] Whether the deployed commit matches `main`
- [ ] Whether the failure is routing config, a missing route, or a stale build

> Deliberately left open. A postmortem for an incident I have not verified would
> be fiction, and the point of this document is that it is not.
