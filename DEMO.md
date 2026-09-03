# 5-Minute Pitch Video — Script

Read this more or less word for word. Timings are generous; a relaxed pace lands better than
rushing. Total ≈ 4:50.

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
> Here's a merchant with sixty-three failed payments — three lakh nine thousand rupees at risk.
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
> Of the three lakh forty-eight thousand it has worked so far, it's recovered one lakh
> seventy-one thousand. Forty-nine percent.
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
> So I scored the same forty-five cases both ways. Rebound recovers forty-nine percent. A blind
> twenty-four-hour retry recovers twenty-one.
>
> That's ninety-six thousand rupees that a fixed retry would have left on the table.
>
> And look at the strategy spread — five different strategies. A fixed retry policy would show
> exactly one bar here."

---

## 3:50 – 4:25 · Why it's an agent

**Screen:** the reasoning timeline again, or your architecture diagram.

> "This isn't a chatbot with a payments theme. The agent has six real tools: it reads payment
> context, checks issuer health, schedules retries, creates payment links, writes customer
> messages, and — importantly — it can decide to give up.
>
> That last one matters. When a customer cancels their mandate, the right answer is to stop.
> A wasted retry costs money and annoys someone who already said no.
>
> Every step you've seen was logged as it happened. That timeline isn't a summary written
> afterwards — it's the actual record of tool calls."

---

## 4:25 – 4:50 · Honest close

> "To be straight about what's real: the payment links, the signature verification, and the
> agent's reasoning are all genuinely live. The failure events are simulated — but they're
> signed and delivered through the real webhook route, so the code path is the production one.
> Recovery outcomes are modelled. All of that is documented in the README.
>
> Next step is firing those retries for real against the Orders API, and feeding observed
> outcomes back so the agent learns which strategies actually work.
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
> an expired card exactly as it retries a two-hour bank outage.
>
> Rebound is an autonomous agent that works each failed payment as a case. It diagnoses the
> true root cause from the Razorpay error signature (error_reason, error_source, error_step and
> method), checks live issuer health, and selects from six recovery strategies matched to that
> cause — retrying when the cause is transient, waiting for a salary cycle when the customer is
> merely short, requesting a new instrument when the card is dead, and stopping entirely when
> the customer has revoked their mandate.
>
> It executes through the Razorpay API, creating real Payment Links, and logs every tool call
> so the merchant can see exactly why each decision was made. Scored against a blind 24-hour
> retry on the same 45 cases, it recovers 49% versus 22% — ₹96,489 more.

**GitHub Repository URL:**
> https://github.com/harshpansuriya71-sudo/ai-revenue-recovery

**Build Challenges & Technical Obstacles:**
> **The agent kept reinventing the thing it replaced.** Its strongest default was "retry in 24
> hours" for every case — exactly the blind policy the project exists to beat. Later it
> collapsed onto "send a payment link" instead, 11 cases out of 15. Both are the same failure:
> defaulting instead of diagnosing. Fixed by requiring a causal argument before any strategy
> may be chosen, forcing a bank-health check before any infrastructure retry, adding an explicit
> cause-to-strategy mapping, and making "give up" a respectable outcome rather than a failure.
>
> **It scheduled retries into the past.** The model anchored retry times to the payment's
> failure timestamp instead of the present, producing retries dated five days earlier. The case
> brief now states the current time, and the tool rejects a past timestamp before persisting it
> rather than silently accepting it.
>
> **My own benchmark was wrong, and it flattered the wrong side.** The comparison against fixed
> retries measured the agent over every failed payment but the baseline over worked cases only,
> and drew independent random numbers for each. Together those made the dumb retry appear to
> *win*, 46% to 21%. Both are now scoped to identical cases and share one random draw per case,
> so the baseline can only win where the agent genuinely chose badly.
>
> **The free-tier model allowed 20 requests per day.** Each case costs 3–5 calls, so roughly
> five cases before everything returned 429. Moved to a lighter model — about 15× faster with
> equivalent tool-calling quality — and added exponential backoff so a rate limit mid-demo
> doesn't look like a broken agent.
>
> **Reproducing real webhooks was a trap.** Genuine `payment.failed` events need a public URL
> and instruments that fail in specific ways. Instead the simulator signs payloads with the real
> HMAC secret and posts them to the real webhook route, so verification, parsing and persistence
> all run the production path — only the event's origin is synthetic.
