# Rebound — AI Revenue Recovery Agent

**Razorpay AI Builder Internship 2026 · Track 3: AI Revenue Recovery**

A supervised, autonomous agent that works every failed payment as a case: it diagnoses the true
root cause from the Razorpay error signature, chooses a recovery strategy that matches that
cause, executes it through the Razorpay API — and asks a human first when the money is
significant.

---

## The problem

Between 10% and 30% of Indian recurring charges and checkouts fail — insufficient funds, bank
and UPI downtime, expired cards, revoked mandates, OTP drop-offs.

Most merchants respond to all of them the same way: **retry on day 1, day 3, day 5, then send
one generic "your payment failed" email.**

That policy treats an expired card exactly like a two-hour HDFC UPI outage. One will never
succeed no matter how many times you retry it. The other would have gone through on its own by
lunchtime. Throwing away that distinction is how merchants lose revenue that was always
recoverable — and annoy customers who have already said no.

## The result

Over 49 settled cases (figures move as the agent works more):

| | Recovered | Rate |
|---|---:|---:|
| **Rebound** | **₹1,28,462** | **55.1%** |
| A blind fixed 24h retry | ₹30,985 | 13.3% |
| **Difference** | **+₹97,477** | **4.1×** |

Both figures are scored over *the same* cases, using *the same* random draw per case with
different thresholds — so the baseline can only beat the agent on a case the agent genuinely
got wrong. See [Which numbers are real](#which-numbers-are-real).

---

## How the agent thinks

Every Razorpay failure carries four fields — `error_reason`, `error_source`, `error_step` and
the payment method. Together they say *who or what* failed, and recovery follows from that:

| `error_source` | What it means | What recovery looks like |
|---|---|---|
| `bank` / `gateway` | The customer did nothing wrong; the rail broke | Retry — but only once the rail is actually back |
| `customer` | The customer must act | A silent retry fails again. Reach out. |
| `issuer` | The instrument itself is dead | Some of these can never succeed |

It picks from six strategies, and is explicitly allowed to give up. All six are in active use
on the current dataset:

| Strategy | Used |
|---|---:|
| `RETRY_SAME` | 18 |
| `PAYMENT_LINK_NUDGE` | 15 |
| `RETRY_ALTERNATE_METHOD` | 9 |
| `MARK_UNCOLLECTIBLE` | 8 |
| `WAIT_FOR_SALARY_CYCLE` | 4 |
| `REQUEST_NEW_INSTRUMENT` | 2 |

A fixed-schedule retry policy would show one row here. That difference is the product.

### Two real cases, side by side

```
card_expired  ₹899  card/AXIS
  → get_payment_context      Kavya · history thin
  → create_payment_link      https://rzp.io/rzp/... (live test-mode link)
  → draft_nudge              WhatsApp, written by the agent
  DECISION  REQUEST_NEW_INSTRUMENT
  "The card is permanently expired — retrying the same instrument will always fail."

bank_down  ₹14,999  netbanking/HDFC
  → get_payment_context      Varun Banerjee · 15 prior payments
  → check_bank_health HDFC   degraded · 41% success · clears in ~105m
  → schedule_retry           +2h, switched to card
  DECISION  RETRY_ALTERNATE_METHOD
  "HDFC's card rails are healthy. Switch the rail rather than bothering the customer."
```

Same merchant, same agent. Completely different action. That is the entire thesis.

---

## What makes this more than a prompt

### 1. Autonomy controls — the agent asks permission

An agent that acts on merchant money unsupervised is not deployable, whatever its accuracy.
A policy layer decides, per action, whether it may act alone:

| Tier | Condition | Behaviour |
|---|---|---|
| `auto` | under ₹2,000 | executes immediately |
| `notify` | ₹2,000 – ₹10,000 | executes, merchant is told |
| **`approval`** | **over ₹10,000** | **held** — prepared, not executed |
| **`approval`** | **writing off a long-standing customer** | **held**, whatever the amount |

**The hold is real, not a label.** For a held case no Razorpay call is made at all — the link
does not exist until a person clicks Approve, and approving is what creates it. Verified:

```
before approval   status: pending_approval   link: null
after approval    status: scheduled          link: https://rzp.io/rzp/BU28Z1B
```

A policy that classifies actions *after* they have already fired would be decoration.

### 2. Recovery playbook — merchant-level insight, not another chart

The agent works one payment at a time. The pattern across payments is worth more, so every
worked case feeds a set of costed, actionable recommendations:

> **ICICI UPI is your most expensive failure point** — ₹54,997 lost, 16% of all failed value.
> *Enable automatic fallback to a healthy method and route UPI attempts away while degraded.*
> ≈ ₹38,498 recoverable.

> **You are billing loyal customers before they get paid** — ₹57,036 across customers with five
> or more successful payments who simply had no balance that day.
> *Move recurring charges to the 2nd–3rd, after Indian salary credit.*

Each insight carries a rupee figure and a specific action. An observation without those is a
chart, not advice.

### 3. Unit economics — what it costs to run

The standing objection to putting a model in front of every failed payment is that inference
might cost more than the recovery is worth. That deserves a measured answer:

| | |
|---|---|
| Inference cost | **₹7** |
| Revenue recovered | **₹1.28L** |
| Return on spend | **~24,000×** (about 3 paise per case) |

Priced at published **paid-tier** rates. This project runs on a free tier where real spend is
₹0 — quoting that would be flattering and useless.

### 4. Live agent view — watch it reason

`GET /api/agent/stream` emits Server-Sent Events as the agent works, so the case view renders
each tool call as it happens rather than a spinner followed by a finished log. A screenshot
proves nothing; watching the bank-health lookup come back and change the decision proves a
great deal.

### 5. Evaluation suite — the decisions are tested

`npm run eval` runs the agent against fixtures with known-correct constraints and asserts what
it actually did. **18 checks across 6 fixtures, all passing:**

| Fixture | Asserted |
|---|---|
| Expired card | never schedules a retry |
| Dead UPI ID | never schedules a retry |
| Cancelled mandate | must choose `MARK_UNCOLLECTIBLE` |
| Bank outage | must check issuer health, and not retry into the outage window |
| Loyal customer, no funds | must not be written off |
| Gateway blip | must not blame the customer |

**This suite caught two real defects on its first run**, both of which had passed a spot check:

1. On a Kotak outage with a 240-minute recovery estimate, the agent scheduled the retry
   *inside* the outage window — precisely the mistake this project exists to prevent.
2. It wrote off a customer with 12 successful payments over an expired card, creating a payment
   link and then marking the same case uncollectible.

Both are now enforced in the tools rather than only the prompt, because the prompt-only
versions of these rules were already being ignored.

---

## Architecture

```
Failure simulator ──HMAC-signed POST──▶ /api/webhooks/razorpay
                                              │ verifies signature BEFORE parsing
                                              ▼
                                      Recovery Agent  (Gemini, 6 tools)
                                              │
                                        autonomy policy
                                     ┌────────┴────────┐
                                  execute            hold
                                     │            (awaits a human)
              ┌──────────────────────┼──────────────────────┐
              ▼                      ▼                      ▼
      schedule_retry        create_payment_link         draft_nudge
      (retry queue)         (REAL Razorpay API)     (agent-written copy)
              └──────────────────────┼──────────────────────┘
                                     ▼
                          agent_actions (decision log)
                                     ▼
                    Dashboard · Playbook · Economics · Approvals
```

### The six tools

| Tool | What it does |
|---|---|
| `get_payment_context` | Payment details plus the customer's success/failure history |
| `check_bank_health` | Is this issuer degraded right now, and when does it clear? |
| `schedule_retry` | Queue a retry at a specific time and method, with a written rationale |
| `create_payment_link` | **Real Razorpay Payment Links API call** — subject to the autonomy policy |
| `draft_nudge` | Save the customer message the agent wrote |
| `mark_uncollectible` | Stop — a wasted retry costs money and annoys someone who said no |

Tool handlers perform real work and persist their effects, so the reasoning timeline in the UI
is a record of what actually happened — not a narration produced afterwards.

Three rules are enforced **in the tools**, not the prompt, because the model ignored them as
prompt instructions:
- a retry may not be scheduled in the past
- a retry may not land inside a known outage on the affected rail
- a case with an active payment link may not then be written off

### Stack

Next.js 16 · TypeScript · Tailwind · Recharts · `node:sqlite` · Razorpay Node SDK · `@google/genai`

---

## Running it

Needs Node 20+ (Node 24 recommended — `node:sqlite` is built in).

```bash
npm install
cp .env.example .env.local     # fill in the two keys below
npm run seed                   # 60 realistic failed payments
npm run work -- 20             # let the agent work 20 cases
npm run settle                 # resolve outcomes, print the baseline comparison
npm run eval                   # assert the agent's decisions are correct
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

Without Razorpay keys everything still runs; payment links come back clearly flagged
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
| Razorpay Payment Links | **Real** — live test-mode API calls; 17 working `rzp.io` URLs |
| Webhook signature verification | **Real** — HMAC-SHA256 with `crypto.timingSafeEqual` |
| Agent reasoning and tool calls | **Real** — every decision is a live model call; the timeline is the actual log |
| Autonomy policy and approvals | **Real** — a held case genuinely has no payment link until released |
| Inference cost | **Real call counts**, priced at published paid-tier rates |
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

**The agent kept becoming the thing it replaces.** Its first default was "schedule a retry in
24 hours" for every case — the blind policy this project exists to beat. After that was fixed
it collapsed onto "send a payment link", 11 cases out of 15. Both are the same failure:
defaulting instead of diagnosing. Fixed by requiring a causal argument before a strategy may be
chosen, forcing `check_bank_health` before any infrastructure retry timing, adding an explicit
cause-to-strategy mapping, and making `MARK_UNCOLLECTIBLE` a respectable outcome rather than a
failure.

**It scheduled retries into the past.** The model anchored retry times to the payment's failure
timestamp instead of now, producing retries dated five days earlier. The case brief now states
the current time, and `schedule_retry` rejects a past timestamp *before* persisting it. When
the tool rejects a call the agent reads the reason and retries with corrected arguments — that
self-correction is visible in the live agent view.

**My own benchmark was wrong in two ways at once, and flattered the wrong side.** The agent's
rate was measured over every failed payment while the baseline's was measured over worked cases
only, and the two outcomes drew independent random numbers. Together those made the dumb retry
appear to *win*, 46% to 21%. Both are now scoped to identical cases and share one draw per
case, so the comparison is structural rather than luck.

**Held cases were being credited with recoveries they never attempted.** Twenty cases awaiting
approval had been settled as recovered or uncollectible — but a held case has no payment link
and never reached the customer. Settlement now skips them until a person releases them.

**Cases could get stranded.** A case that ended in a payment link stayed on `working` forever,
because only retries and write-offs ever advanced the status; and a run that failed part-way
left its case on `working` with no strategy, so it never reappeared as available to work.
Both now resolve correctly.

**Free-tier limits are real and had to be designed around.** The first model allowed 20 requests
per day and each case costs 3–5, so roughly five cases before everything 429'd. Moved to
`gemini-flash-lite-latest`: ~15× faster with equivalent tool-calling quality. Backoff now
distinguishes a per-minute limit (retry) from a per-day cap (stop and say so) and from transient
503 overload (retry) — silently backing off against a daily cap is indistinguishable from a hung
agent. Razorpay test mode caps payment links and rate-limits bursts; link creation returns a
readable reason instead of throwing a 500.

**`node:sqlite` rows cannot cross the React server/client boundary.** They come back with a null
prototype, which React refuses to serialise. Every row leaving the query layer is copied into an
ordinary object.

---

## What's next

- Fire scheduled retries for real against the Razorpay Orders API
- Feed observed recovery rates per (cause, strategy) pair back into the agent's context so
  strategy selection improves with evidence
- Merchant-configurable policy thresholds instead of constants
- Send nudges through WhatsApp Business and email
- A contact budget so no customer is messaged more than twice
