# Rebound — AI Revenue Recovery Agent

**Razorpay AI Builder Internship 2026 · Track 3: AI Revenue Recovery**

An autonomous agent that works every failed payment as a case: it diagnoses the true root
cause from the Razorpay error signature, chooses a recovery strategy that matches that cause,
executes it through the Razorpay API, and shows the merchant exactly why it decided what it
decided.

---

## The problem

Between 10% and 30% of Indian recurring charges and checkouts fail — insufficient funds, bank
and UPI downtime, expired cards, revoked mandates, OTP drop-offs.

Most merchants respond to all of them the same way: **retry on day 1, day 3, day 5, then send
one generic "your payment failed" email.**

That policy treats an expired card exactly like a two-hour HDFC UPI outage. One of those will
never succeed no matter how many times you retry it. The other would have gone through on its
own by lunchtime. Throwing away the distinction is how merchants lose revenue that was always
recoverable — and annoy customers who already said no.

## The result

On the 25 cases the agent worked in the seeded dataset:

| | Recovered | Rate |
|---|---:|---:|
| **Rebound** | **₹66,090** | **30.2%** |
| A blind fixed 24h retry | ₹25,193 | 11.5% |
| **Difference** | **+₹40,897** | **2.6×** |

Both figures are scored over *the same* cases, using *the same* random draw per case with
different success thresholds — so the baseline can only beat the agent on a case the agent
genuinely got wrong. See [Which numbers are real](#which-numbers-are-real).

---

## How the agent thinks

Every Razorpay failure carries four fields — `error_reason`, `error_source`, `error_step` and
the payment method. Together they say *who or what* failed, and recovery follows from that:

| `error_source` | What it means | What recovery looks like |
|---|---|---|
| `bank` / `gateway` | The customer did nothing wrong; the rail broke | Retry — but only once the rail is actually back |
| `customer` | The customer must act | A silent retry fails again. Reach out. |
| `issuer` | The instrument itself is dead | Some of these can never succeed |

The agent picks from six strategies, and is explicitly allowed to give up:

`RETRY_SAME` · `RETRY_ALTERNATE_METHOD` · `PAYMENT_LINK_NUDGE` · `WAIT_FOR_SALARY_CYCLE` ·
`REQUEST_NEW_INSTRUMENT` · `MARK_UNCOLLECTIBLE`

### Two real cases, side by side

```
card_expired  ₹899  card/AXIS
  → get_payment_context      Kavya · 0 prior successes · history thin
  → create_payment_link      https://rzp.io/rzp/... (live test-mode link)
  → draft_nudge              WhatsApp, written by the agent
  DECISION  REQUEST_NEW_INSTRUMENT
  "The card is permanently expired — retrying the same instrument will always fail."

bank_down  ₹499  upi/KOTAK
  → get_payment_context      7 prior successful payments
  → check_bank_health KOTAK  down · 8% success · clears in ~240m
  → check_bank_health UPI    healthy
  → schedule_retry           +4h, switched to card
  DECISION  RETRY_ALTERNATE_METHOD
  "Kotak's card rails are healthy. Switch the rail rather than bothering a loyal customer."
```

Same failure count. Completely different action. That is the entire thesis.

---

## Architecture

```
Failure simulator ──HMAC-signed POST──▶ /api/webhooks/razorpay
                                              │ verifies signature BEFORE parsing
                                              ▼
                                      Recovery Agent  (Gemini, 6 tools)
                                              │
              ┌───────────────────────────────┼──────────────────────────┐
              ▼                               ▼                          ▼
      schedule_retry               create_payment_link             draft_nudge
      (retry queue)                (REAL Razorpay API)          (agent-written copy)
              └───────────────────────────────┼──────────────────────────┘
                                              ▼
                                   agent_actions  (decision log)
                                              ▼
                                    Merchant dashboard
```

### The six tools

| Tool | What it does |
|---|---|
| `get_payment_context` | Payment details plus the customer's success/failure history |
| `check_bank_health` | Is this issuer degraded right now, and when does it clear? |
| `schedule_retry` | Queue a retry at a specific time and method, with a written rationale |
| `create_payment_link` | **Real Razorpay Payment Links API call** |
| `draft_nudge` | Save the customer message the agent wrote |
| `mark_uncollectible` | Stop — a wasted retry costs money and annoys someone who said no |

Tool handlers perform real work and persist their effects, so the reasoning timeline in the UI
is a record of what actually happened — not a narration produced afterwards.

### Stack

Next.js 16 · TypeScript · Tailwind · Recharts · `node:sqlite` · Razorpay Node SDK · `@google/genai`

---

## Running it

Needs Node 20+ (Node 24 recommended — `node:sqlite` is built in).

```bash
npm install
cp .env.example .env.local     # then fill in the two keys below
npm run seed                   # 60 realistic failed payments
npm run work -- 20             # let the agent work 20 cases
npm run settle                 # resolve outcomes, print the baseline comparison
npm run dev                    # http://localhost:3000
```

**`.env.local`:**

```
GEMINI_API_KEY=          # free, no card: https://aistudio.google.com/apikey
GEMINI_MODEL=gemini-flash-lite-latest
RAZORPAY_KEY_ID=         # dashboard.razorpay.com → TEST MODE → Settings → API Keys
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=rebound_local_webhook_secret
```

Without Razorpay keys everything still runs; payment links are returned clearly flagged
`simulated` rather than failing.

### Verifying the webhook is real

```bash
curl -X POST localhost:3000/api/simulate -H 'content-type: application/json' -d '{"count":3}'
```

Signed payloads return `200` and open a case. Change one byte of the signature and it returns
`400` — verification is real, not decorative.

---

## Which numbers are real

Being precise about this, because a demo that blurs it is not worth trusting.

| | Status |
|---|---|
| Razorpay Payment Links | **Real** — live test-mode API calls returning working `rzp.io` URLs |
| Webhook signature verification | **Real** — HMAC-SHA256 with `crypto.timingSafeEqual` |
| Agent reasoning and tool calls | **Real** — every decision is a live model call; the timeline is the actual log |
| Failed payment events | **Simulated** — generated, then signed and delivered through the real webhook route |
| Recovery outcomes | **Simulated** — modelled from each strategy's fit to the actual root cause |
| Customer messages | **Written by the agent, not sent** — no email/SMS provider is wired up |

Real `payment.failed` traffic needs a public webhook URL and instruments that fail in specific
ways. The simulator produces the same payload shape and signs it with the real secret, so the
receiving code path — verification, parsing, persistence, case creation — is exactly the
production path. Only the origin of the event is synthetic. Outcomes would arrive as
`payment.captured` webhooks in a real deployment; here they are modelled in
[`src/lib/outcomes.ts`](src/lib/outcomes.ts).

---

## What was hard

**The agent wanted to reinvent the thing it was replacing.** Its strong default was "schedule a
retry in 24 hours" for every case — precisely the blind fixed-schedule policy this project
exists to beat. Fixed by requiring a causal argument before a strategy may be chosen, forcing
`check_bank_health` before any bank or gateway retry timing, and making `MARK_UNCOLLECTIBLE` an
explicitly respectable outcome rather than a failure.

**It scheduled retries into the past.** The model anchored retry times to the payment's failure
timestamp instead of now, producing retries dated five days earlier. The case brief now states
the current time, and `schedule_retry` rejects a past timestamp *before* persisting rather than
silently accepting it.

**The baseline comparison was wrong in two ways at once, and flattered the wrong side.** The
agent's rate was measured over every failed payment while the baseline's was measured over
worked cases only, and the two outcomes drew independent random numbers. Together those made
the dumb retry appear to win 46% to 21%. Both are now scoped to the same cases and share one
draw per case, so the comparison is structural rather than luck.

**The free-tier model had a 20-request daily cap.** `gemini-3.6-flash` allows 20 requests per
day and each case costs 3–5, so roughly five cases before everything 429s. Moved to
`gemini-flash-lite-latest`: about 15× faster (5s vs 76s per case) with equivalent tool-calling
quality, plus exponential backoff so a rate limit mid-demo doesn't look like a broken agent.

**`node:sqlite` rows cannot cross the React server/client boundary.** They come back with a
null prototype, which React refuses to serialise. Every row leaving the query layer is copied
into an ordinary object.

---

## What's next

- Fire scheduled retries for real against the Razorpay Orders API
- Learn from outcomes — feed observed recovery rates back into strategy selection
- A/B the agent against fixed retries on live traffic
- Send nudges through WhatsApp Business and email
