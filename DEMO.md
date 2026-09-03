# 5-Minute Pitch Video — Script

Read this more or less word for word. Timings are generous; a relaxed pace lands better than
rushing. Total ≈ 5:00 — it is now tight, so if you run over, cut the "Why it's an agent"
section at 4:40 first. Everything before 4:20 is load-bearing.

**Before you hit record:**

```bash
npm run dev          # leave running
```

Open two browser tabs and have them ready:
1. `http://localhost:3000`
2. A live Razorpay payment link, copied from any case with one (see 3:00 below)

Close every other tab. Full-screen the browser. Turn off notifications.

---

## 0:00 – 0:40 · The problem

**Screen:** dashboard, top of page.

> "Every month, Indian merchants lose a serious amount of revenue to payments that simply fail.
> Insufficient funds. Bank outages. Expired cards. Cancelled mandates.
>
> Here's a merchant with sixty-three failed payments — three lakh thirty-two thousand rupees at risk.
>
> The standard industry response is to retry on day one, day three, day five, and then send one
> generic 'your payment failed' email.
>
> That policy treats an expired card exactly the same as a two-hour HDFC outage. One of those
> will never succeed no matter how many times you retry it. The other would have gone through
> on its own by lunchtime.
>
> Throwing away that difference is how merchants lose money that was always recoverable."

---

## 0:40 – 1:10 · What Rebound does

**Screen:** stay on the dashboard. Point at the top row of tiles.

> "Rebound is an autonomous agent that works every one of these failures as its own case.
>
> It reads the Razorpay error signature, works out the actual root cause, picks a recovery
> strategy that matches that cause, and executes it through the Razorpay API.
>
> Of the two lakh thirty-three thousand it has worked so far, it's recovered one lakh
> twenty-eight thousand. Fifty-five percent.
>
> Let me show you how it gets there, because the reasoning is the whole point."

---

## 1:10 – 2:00 · Case one — the bank outage

**Screen:** scroll to the case table, click a `bank_down` case → the case view.

> "Fourteen thousand nine hundred and ninety-nine rupees. Netbanking, through HDFC. It failed.
>
> Watch what the agent actually did.
>
> First it pulled the customer's history. Then — and this is the important step — it checked
> whether HDFC was healthy. It wasn't. Forty-one percent success rate, degraded, with a
> hundred-and-five-minute recovery estimate.
>
> So the agent reasons: the customer did nothing wrong. Their money is still there. This is
> infrastructure. But HDFC's *card* rails are fine, only netbanking is affected.
>
> So it switches the retry to card, two hours out, and deliberately does *not* message the
> customer — because there is nothing for them to fix."

*(Pause on the reasoning panel and let the viewer read it.)*

---

## 2:00 – 2:45 · Case two — the expired card

**Screen:** back to dashboard, open a `card_expired` case.

> "Now a different failure. Eight hundred and ninety-nine rupees on an expired Axis card.
>
> Same agent. Completely different decision.
>
> It doesn't check bank health, because the bank isn't the problem. It doesn't schedule a
> retry — retrying an expired card is guaranteed to fail, every single time, forever.
>
> Instead it creates a Razorpay payment link and writes the customer a message asking them to
> update their card.
>
> Two failed payments. Two root causes. Two completely different actions. A fixed-schedule
> retry cannot tell these apart — and that gap is the entire product."

---

## 2:45 – 3:15 · The link is real

**Screen:** point at `create_payment_link` in the timeline, then switch to the Razorpay tab.

> "And that payment link isn't a mockup. The agent called Razorpay's Payment Links API.
>
> Here it is — live, in test mode. Correct amount, correct description, expiring in
> seventy-two hours, exactly as the agent specified."

---

## 3:15 – 3:50 · The number that matters

**Screen:** dashboard, the "Rebound vs a fixed 24-hour retry" panel.

> "A recovery rate on its own means nothing. The honest question is whether this beats what
> merchants already do.
>
> So I scored the same forty-nine cases both ways. Rebound recovers fifty-five percent. A blind
> twenty-four-hour retry recovers thirteen.
>
> That's ninety-seven thousand rupees that a fixed retry would have left on the table.
>
> And look at the strategy spread — all six strategies in use. A fixed retry policy would show
> exactly one bar here."

---

## 3:50 – 4:20 · The three things that make it shippable

**Screen:** the approval queue at the top of the dashboard, then scroll to the playbook.

> "Three more things, quickly.
>
> First — it asks permission. Anything over ten thousand rupees, or writing off a long-standing
> customer, the agent prepares but does *not* execute. No payment link exists until I approve it.
> That's the difference between a demo and something a payments company could actually deploy.
>
> Second — the playbook. The agent works one payment at a time, but the pattern across all of
> them is worth more. It's telling this merchant that ICICI UPI alone costs them fifty-five
> thousand rupees, and exactly what to change.
>
> Third — what it costs. Seven rupees of inference recovered one lakh twenty-eight thousand.
> About three paise per case. I think it's worth knowing whether the AI pays for itself."

---

## 4:20 – 4:40 · It's tested

**Screen:** terminal, `npm run eval`.

> "And the decisions are tested. Eighteen assertions — never retry an expired card, respect a
> cancelled mandate, never schedule a retry inside a known bank outage.
>
> This suite caught two bugs I'd missed. One of them was my agent scheduling a retry *into* a
> Kotak outage — the exact mistake this whole project exists to prevent."

---

## 4:40 – 4:50 · Why it's an agent (cut this first if you run long)

**Screen:** the reasoning timeline again, or your architecture diagram.

> "This isn't a chatbot with a payments theme. Six real tools, and it can decide to give up —
> when a customer cancels their mandate, the right answer is to stop. Every step you've seen was
> logged as it happened; that timeline is the actual record of tool calls, not a summary."

---

## 4:50 – 5:00 · Honest close

> "To be straight: the payment links, the signature verification and the agent's reasoning are
> genuinely live. The failure events and the recovery outcomes are simulated — the README says
> exactly which is which.
>
> That's Rebound. Thanks for watching."

---

# Submission form answers

**Track:** Track 3: AI Revenue Recovery

**Project Name / Title:**
> Rebound — AI Revenue Recovery Agent

**Project Objectives (What does it solve?):**
> Indian merchants lose 10–30% of recurring and checkout revenue to failed payments, and the
> standard response is a fixed retry schedule that ignores *why* the payment failed — retrying
> an expired card exactly as it retries a two-hour bank outage. One of those can never succeed;
> the other would have cleared on its own.
>
> Rebound is a supervised autonomous agent that works each failed payment as a case. It
> diagnoses the root cause from the Razorpay error signature (error_reason, error_source,
> error_step and method), checks live issuer health, and selects from six recovery strategies
> matched to that cause — retrying when the cause is transient, routing to a healthy rail when
> one is degraded, waiting for the salary cycle when a loyal customer is merely short,
> requesting a new instrument when the card is dead, and stopping entirely when the customer
> has revoked their mandate.
>
> Four things make it more than a prompt. It **asks permission**: anything above Rs 10,000, or
> writing off a long-standing customer, is prepared but held — no Razorpay call happens until a
> human approves, and approving is what creates the link. It produces a **recovery playbook**,
> turning per-case work into costed merchant-level advice such as "ICICI UPI costs you
> Rs 54,997; enable card fallback". It reports its own **unit economics** — Rs 7 of inference
> against Rs 1.28L recovered, about 3 paise per case. And its decisions are **tested**: an
> 18-assertion evaluation suite checks that it never retries a dead instrument and never
> schedules a retry inside a known outage.
>
> Scored against a blind 24-hour retry on the same 49 cases: 55.1% versus 13.3% — Rs 97,477
> more recovered.

**GitHub Repository URL:**
> https://github.com/harshpansuriya71-sudo/ai-revenue-recovery

**Build Challenges & Technical Obstacles:**
> **The agent kept reinventing the thing it replaces.** Its first default was "retry in 24
> hours" for every case — precisely the blind policy this project exists to beat. After that
> was fixed it collapsed onto "send a payment link", 11 cases out of 15. Both are the same
> failure: defaulting instead of diagnosing. Fixed by requiring a causal argument before a
> strategy may be chosen, forcing a bank-health check before any infrastructure retry, adding
> an explicit cause-to-strategy mapping, and making "give up" a respectable outcome.
>
> **Prompt rules were not enough, so three became tool-level guarantees.** The model ignored
> instructions it had agreed to. A retry can no longer be scheduled in the past, or inside a
> known outage on the affected rail, and a case with an active payment link can no longer be
> written off — the tools reject those calls and explain why, and the agent then corrects
> itself and retries.
>
> **My own benchmark was wrong, and it flattered the wrong side.** The comparison against fixed
> retries measured the agent over every failed payment but the baseline over worked cases only,
> and drew independent random numbers for each. Together those made the dumb retry appear to
> *win*, 46% to 21%. Both are now scoped to identical cases and share one draw per case, so the
> baseline can only win where the agent genuinely chose badly.
>
> **I wrote an evaluation suite, and it caught two bugs I had missed.** Both had passed a spot
> check. The agent had scheduled a retry *inside* a 240-minute Kotak outage — the exact mistake
> this project claims to prevent — and had written off a customer with 12 successful payments
> over an expired card. Testing an agent's decisions rather than its output is what surfaced
> them.
>
> **Free-tier limits shaped the architecture.** The first model allowed 20 requests per day and
> each case costs 3-5. Backoff now distinguishes a per-minute limit (retry), a per-day cap
> (stop and say so), and transient 503 overload (retry) — silently backing off against a daily
> cap is indistinguishable from a hung agent. Razorpay test mode caps payment links and
> rate-limits bursts, so link creation returns a readable reason instead of throwing a 500.
>
> **Reproducing real webhooks was a trap.** Genuine `payment.failed` events need a public URL
> and instruments that fail in specific ways. Instead the simulator signs payloads with the real
> HMAC secret and posts them to the real webhook route, so verification, parsing and persistence
> all run the production path — only the event's origin is synthetic.
