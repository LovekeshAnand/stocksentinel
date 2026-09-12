# StockSentinel — A Self-Learning, Human-Gated Trading Agent

**SLAB (Self-Learning Agent Browser) Hackathon @ MAIT — Hosted by webcmd**
**Solo build · Built with webcmd (sponsor infrastructure) · Human-approval-gated by design**

---

## Table of Contents

1. Executive Summary
2. Problem Statement
3. Core Idea & Philosophy
4. Why webcmd (Sponsor Tool) Is Central to This Build
5. System Architecture
6. Agent A — The Watcher (Signal Agent)
7. The Strategist — LLM Reasoning Layer
8. Human Approval Gate
9. Agent B — The Executor (Action Agent)
10. Memory Layer (Knowledge Graph)
11. Target Platforms
12. Data Flow, End to End
13. Tech Stack
14. Build Plan — Core vs Stretch Scope
15. Project Structure (for Antigravity build)
16. LLM Prompting Strategy
17. Pattern & Signal Rules (v1)
18. Self-Healing & Recovery Behavior
19. Failure Modes & Mitigations
20. Demo Script
21. Judging Criteria Alignment
22. Hard Rules Compliance
23. Setup Instructions
24. Roadmap Beyond the Hackathon
25. One-Line Pitch

---

## 1. Executive Summary

StockSentinel is a browser agent system that watches financial news for signals, reasons about those signals using an LLM, proposes a specific trading action with a rationale, and — only after explicit human approval — executes that action on a paper trading platform. The system is built around **webcmd**, the hackathon's sponsor infrastructure, which lets the agent explore an unfamiliar website once, learn its structure and workflow, and convert that exploration into a fast, reusable, structured command. This "explore once, learn the workflow, reuse the command" pattern is used twice in this system: once to learn how to read a news source, and once to learn how to operate a paper trading platform's order form.

The system is intentionally **not** an autonomous trading bot. It is a decision-support and execution-assistance agent: all the tireless, repetitive work (watching, reading, reasoning, pre-filling) is automated, but the one step that matters most — actually placing an order — always requires a human click.

---

## 2. Problem Statement

Retail traders and casual investors who want to react to market-moving news face three compounding problems:

- **Volume of information** — dozens of news sources, feeds, and tickers to track manually
- **Speed of reaction** — by the time a human reads, interprets, and acts on a headline, the opportunity window may have narrowed
- **Execution friction** — even after deciding what to do, manually navigating to a trading platform, finding the right ticker, and filling out an order form takes time and is error-prone

Fully autonomous trading bots solve speed but remove human judgment from decisions involving real money — which is risky, and explicitly discouraged by this hackathon's rules requiring human approval for sensitive actions. StockSentinel is designed to solve the *watching, reading, and preparing* problem completely, while deliberately leaving the *deciding* problem with the human.

---

## 3. Core Idea & Philosophy

> **Watch tirelessly. Reason clearly. Prepare precisely. Act only on command.**

Four design principles anchor every decision in this build:

1. **Human authority is non-negotiable.** No matter how confident the LLM's reasoning is, the system never submits an order without an explicit human confirmation click.
2. **Speed is honest.** This is browser automation, not co-located exchange infrastructure — the value proposition is *tireless correctness*, not microsecond execution. We do not claim millisecond decision-making anywhere in the build or the pitch.
3. **Learn once, act fast forever.** Every site the agent touches is learned via webcmd's explore-then-reuse pattern, so repeated checks are fast, structured, and don't re-run expensive exploration each cycle.
4. **Memory prevents noise.** A system that alerts on every polling cycle is worse than useless — it trains the user to ignore it. The memory layer ensures the user is only told about *new or changed* signals.

---

## 4. Why webcmd (Sponsor Tool) Is Central to This Build

webcmd is used as the browser automation and self-learning backbone for **both** agents in the system, not as a bolt-on:

| Where webcmd is used | What it does here |
|---|---|
| News source exploration | On first run, explores the chosen financial news page(s), learns how headlines, tickers, and timestamps are structured on that specific site's DOM |
| News source reuse | Converts that exploration into a saved, structured command — subsequent polling cycles read the page fast and reliably without re-exploring |
| Paper trading platform exploration | On first run, explores the paper trading platform's order entry flow — ticker search, quantity field, order type, stop-loss field, confirm button |
| Paper trading platform reuse | Converts the order flow into a saved command that can be re-triggered with different parameters (ticker, quantity, direction) supplied by the Strategist layer |
| Recovery | If either site's layout changes and a saved command starts failing, webcmd re-triggers exploration automatically rather than the agent crashing or silently failing |

This is the core technical story of the demo: **judges should see the exploration phase happen once (slower, visibly mapping the page), and then see the reuse phase happen fast and clean on the next cycle** — proving the "self-learning agent browser" concept the whole hackathon is built around, on two independent sites, chained into one working pipeline.

---

## 5. System Architecture

```
                         ┌─────────────────────────────┐
                         │        User Config           │
                         │  Watchlist tickers            │
                         │  News source(s)                │
                         │  Risk/approval preferences      │
                         └───────────────┬───────────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        ▼                                                                  ▼
┌───────────────────────┐                                    ┌───────────────────────┐
│      AGENT A            │                                    │      AGENT B            │
│   The Watcher            │                                    │   The Executor           │
│   (webcmd-learned)        │                                    │   (webcmd-learned)         │
│                            │                                    │                            │
│  Explores + reads news      │                                    │  Explores + operates the    │
│  source(s) on a loop          │                                    │  paper trading platform's    │
│  Extracts: headline,           │                                    │  order entry flow              │
│  ticker mention, timestamp       │                                    │  Waits idle until triggered      │
│  sentiment-relevant snippet        │                                    │  by an approved action            │
└───────────────┬────────────┘                                    └───────────────┬────────────┘
                │ raw signal                                                        │ approved action
                ▼                                                                    │
┌─────────────────────────────┐                                                     │
│      THE STRATEGIST           │                                                     │
│      (LLM reasoning layer)      │                                                     │
│                                    │                                                     │
│  Input: raw signal + ticker           │                                                     │
│  price/volume context + memory          │                                                     │
│  of past signals on this ticker           │                                                     │
│                                              │                                                     │
│  Output: proposed action (buy/sell/hold),      │                                                     │
│  suggested quantity, plain-English rationale,     │                                                     │
│  confidence level                                    │                                                     │
└───────────────┬─────────────────┘                                                     │
                │ proposed action                                                             │
                ▼                                                                              │
┌─────────────────────────────┐                                                              │
│      MEMORY LAYER (KG)          │                                                              │
│  Has this exact signal +          │                                                              │
│  ticker already been alerted        │                                                              │
│  and resolved? Suppress if so.        │                                                              │
│  Otherwise, log + pass through          │                                                              │
└───────────────┬─────────────────┘                                                              │
                │ new/changed signal                                                                    │
                ▼                                                                                        │
┌─────────────────────────────┐                                                                        │
│    HUMAN APPROVAL GATE          │────────────────────────────────────────────────────────────────────┘
│  Alert shown with rationale        │        (approved action forwarded to Agent B)
│  Approve / Reject / Modify           │
│  Rejected → logged, no action taken     │
└─────────────────────────────────────────┘
```

---

## 6. Agent A — The Watcher (Signal Agent)

**Responsibility:** Continuously monitor one or more financial news sources for content relevant to the user's watchlist, and hand off clean, structured signals to the Strategist.

**webcmd role:** Learns how to read the chosen news site — how headlines are laid out, how to extract ticker mentions, timestamps, and article snippets — and converts that into a reusable read command so each polling cycle is fast.

**Output format (structured signal object):**
```
{
  "ticker": "string",
  "headline": "string",
  "snippet": "string",
  "source": "string",
  "timestamp": "ISO 8601",
  "raw_sentiment_hint": "positive | negative | neutral | mixed"
}
```

**Polling behavior:** Runs on a fixed interval (e.g. every 30–60 seconds for the demo). Deduplicates identical headlines seen in a previous cycle before forwarding anything downstream.

**Primary source for the hackathon build:** one reliable financial news page (e.g. a markets section of a major news site, or an aggregator page) — chosen specifically because it is stable, doesn't require login, and renders consistently, which protects the live-reliability score.

**Secondary/stretch source:** Twitter/X — included only as a stretch goal, tested extensively beforehand, with a documented fallback to the primary source if X's anti-scraping measures cause instability during rehearsal.

---

## 7. The Strategist — LLM Reasoning Layer

**Responsibility:** Take a raw signal from Agent A, plus relevant context, and produce a specific, explainable proposed action.

**Context assembled before calling the LLM:**
- The raw signal (headline, snippet, ticker, sentiment hint)
- Recent price/volume context for that ticker, if available from the news page or a lightweight secondary data pull
- Memory layer's record of past signals and past user decisions on this ticker (did the user usually approve or reject similar alerts?)

**Output format (structured proposal object):**
```
{
  "ticker": "string",
  "action": "buy | sell | hold | watch_only",
  "suggested_quantity": "number (paper units)",
  "rationale": "plain-English explanation, 1-3 sentences",
  "confidence": "low | medium | high",
  "source_signal_id": "reference back to Agent A's signal"
}
```

**Key design choice:** The LLM never sees itself as "deciding" — its output is explicitly framed and labeled as a *proposal*, and the system prompt reinforces that its job is to inform a human, not to act. `hold` / `watch_only` is a valid and expected output for weak or ambiguous signals — the Strategist should not manufacture actionable trades out of noise.

---

## 8. Human Approval Gate

**Responsibility:** Present the Strategist's proposal to the user clearly, and require an explicit decision before anything reaches Agent B.

**What the user sees:**
- Ticker and current context
- The headline/snippet that triggered this
- The proposed action, quantity, and rationale in plain English
- Confidence level
- Three options: **Approve**, **Reject**, **Modify** (adjust quantity/action before approving)

**On Approve:** the (possibly modified) action object is forwarded to Agent B with a timestamp and an approval record.

**On Reject:** the proposal and the reason (if given) are logged to the memory layer, and nothing is sent to Agent B. This rejection also feeds back into future Strategist context (see Section 10).

This gate is not a formality — it is the architectural centerpiece that keeps the entire system compliant with the hackathon's human-approval rule for sensitive actions, and it should be given real visual weight in the demo UI, not buried as a small popup.

---

## 9. Agent B — The Executor (Action Agent)

**Responsibility:** Sit idle at (or be able to quickly navigate to) the paper trading platform, and execute an approved action precisely as specified — and only after approval.

**webcmd role:** Learns the paper trading platform's order entry flow once — how to search for a ticker, select order type, enter quantity, set stop-loss/take-profit if applicable, and where the confirm button is. This becomes a reusable, parameterized command: `place_order(ticker, action, quantity)`.

**Critical behavior:** Agent B **pre-fills the order form and stops.** It never clicks the final confirm/submit button autonomously. The human clicks that button — either directly on the platform (screen-shared for the demo) or via a final in-app "confirm execution" step that then triggers the very last click. Either way, the last action-causing click is human-originated. This is documented and demoed explicitly so judges can verify compliance with the hard rule.

**Target platform:** TradingView Paper Trading (primary recommendation) — fully web-based, real order-entry UI, globally recognized by judges, no app install required. Moneybhai (Moneycontrol) is a documented India-specific alternative if a more locally-flavored demo is preferred.

---

## 10. Memory Layer (Knowledge Graph)

**Responsibility:** Prevent alert fatigue, track state over time, and make the system demonstrably "self-learning" rather than stateless.

**What it tracks:**
- Every signal seen, per ticker, with a resolved/active state
- Every proposal made, and the user's decision (approve/reject/modify) on it
- A lightweight per-ticker "user trust" signal — if a user has rejected similar proposals on a ticker repeatedly, the Strategist is told this in its context and can lower its confidence or hold rather than propose again immediately

**Why this matters for the demo:** it lets you show a second, more interesting behavior beyond "it alerted once" — you can show the system *not* re-alerting on a still-active signal, and then show it *changing its behavior* based on a prior rejection, which is a genuinely compelling "self-learning" moment for judges.

**Implementation note:** this does not need to be a heavyweight graph database for the hackathon — a structured local store (ticker → signal history → decision history) is sufficient to demonstrate the concept live. The architecture should be described as knowledge-graph-*style* memory, keeping the door open to a fuller KG implementation post-hackathon.

---

## 11. Target Platforms

| Role | Platform | Why |
|---|---|---|
| News signal source (primary) | One stable financial news/markets page | No login wall, consistent structure, safe for repeated automated reads |
| News signal source (stretch) | Twitter/X | High information value but fragile to automate reliably — stretch only |
| Paper trading / execution | TradingView Paper Trading | Real order-entry UI, free, no real money at risk, globally recognizable |
| Paper trading (alternative) | Moneybhai (Moneycontrol) | India-specific, NSE/BSE flavored, good for a locally-grounded demo narrative |

---

## 12. Data Flow, End to End

1. Agent A polls the news source (webcmd-learned read command) → produces a raw signal
2. Signal passes through the memory layer's dedup check → if genuinely new/changed, proceeds
3. Strategist assembles context (signal + price context + memory history) → calls the LLM → produces a structured proposal
4. Proposal is logged to memory and shown at the Human Approval Gate
5. User approves, rejects, or modifies
6. On approval, the (possibly modified) action is sent to Agent B
7. Agent B navigates to the paper trading platform (webcmd-learned command), pre-fills the order exactly as approved, and stops at the confirm step
8. User performs the final confirm click
9. Outcome (order placed) is logged back to memory, closing the loop for that signal

---

## 13. Tech Stack

| Layer | Tool / Approach |
|---|---|
| Browser automation & self-learning core | **webcmd** (sponsor-mandated, used for both Agent A and Agent B) |
| LLM reasoning | Any capable LLM API accessible during the hackathon (API key brought on the day) |
| Memory / dedup / decision history | Lightweight structured local store (ticker → signal/decision history) |
| Orchestration between agents | A simple message-passing layer coordinating Agent A → Strategist → Gate → Agent B |
| Frontend / demo UI | A minimal live dashboard: incoming signals, Strategist proposals, approval controls, and a running decision log |
| Build environment | **Antigravity**, structured from the ground up with clear module boundaries (see Section 15) |
| News source | One stable public financial news/markets page |
| Execution target | TradingView Paper Trading (primary) |

---

## 14. Build Plan — Core vs Stretch Scope

### Core scope (must be bulletproof — this is what gets rehearsed 10+ times before demo day)

1. Agent A reads one news source via a webcmd-learned command and extracts a clean signal for a watchlisted ticker
2. Strategist turns that signal into a specific proposed action with a plain-English rationale
3. Human Approval Gate displays the proposal clearly and accepts approve/reject
4. On approval, Agent B (webcmd-learned) navigates to TradingView Paper Trading, pre-fills the order exactly as proposed, and stops at confirm
5. User performs the final click, order appears on the paper trading platform, visible on screen
6. Memory layer suppresses a duplicate alert for the same still-active signal (demoed by letting a cycle repeat without a new alert firing)

### Stretch scope (only after core is fully rehearsed and reliable)

1. Twitter/X as a secondary signal source
2. Multi-signal confirmation (cross-check news sentiment against a second data point before proposing)
3. Confidence scoring that visibly adjusts based on past user approvals/rejections (memory-driven Strategist behavior change)
4. Live "cockpit" dashboard showing both agents' status and a running decision log in real time
5. Self-healing demo — deliberately altering a page's state mid-demo and showing webcmd re-explore and recover the broken command
6. Voice-gated confirmation step (spoken alert, spoken/voice-triggered approval) — natural extension given prior work on a voice + memory stack

---

## 15. Project Structure (for Antigravity build)

```
stocksentinel/
├── agents/
│   ├── agent_a_watcher/
│   │   ├── webcmd_news_explore.*      # first-run exploration of news source
│   │   ├── webcmd_news_read.*         # saved, reusable read command
│   │   └── signal_extractor.*         # parses raw page data into signal objects
│   ├── agent_b_executor/
│   │   ├── webcmd_trade_explore.*     # first-run exploration of paper trading platform
│   │   ├── webcmd_trade_place.*       # saved, reusable order-placement command (pre-fill only)
│   │   └── order_formatter.*          # turns an approved action object into platform-specific field values
├── strategist/
│   ├── prompt_templates/
│   ├── context_builder.*              # assembles signal + price context + memory history
│   └── llm_client.*
├── memory/
│   ├── store.*                        # ticker → signal history → decision history
│   ├── dedup.*                        # active/resolved signal state tracking
│   └── trust_score.*                  # per-ticker approval/rejection pattern tracking
├── approval_gate/
│   ├── ui/                            # dashboard: signals, proposals, approve/reject/modify controls
│   └── gate_logic.*                   # enforces the "nothing proceeds without approval" rule
├── orchestration/
│   └── pipeline.*                     # coordinates Agent A → Strategist → Memory → Gate → Agent B
├── config/
│   ├── watchlist.*
│   └── settings.*                     # polling interval, source URLs, risk preferences
└── docs/
    └── PROJECT.md                     # this file
```

---

## 16. LLM Prompting Strategy

The Strategist's system prompt should explicitly encode:
- Its role is advisory only — it proposes, it never executes
- It must always include a plain-English rationale a non-expert can understand
- It must output `hold` / `watch_only` when the signal is weak, ambiguous, or contradicts recent price action — fabricating an actionable call from noise is a failure mode to actively guard against
- It should incorporate the user's past approval/rejection pattern on that ticker (from memory) as context, and note in its rationale if it's adjusting confidence because of that history
- Output must be structured (the proposal object format from Section 7), not free-form prose, so the Approval Gate UI can render it consistently

---

## 17. Pattern & Signal Rules (v1)

Beyond raw news sentiment, the Strategist's context can be strengthened with simple, explainable technical checks pulled from the same page or a lightweight secondary source:

- **Volume spike** — current volume noticeably above trailing average
- **Moving average positioning** — price relative to a short/long moving average
- **RSI threshold** — near/above/below common overbought/oversold levels
- **News-price divergence** — sentiment says one thing, recent price action says another (a genuinely interesting signal for the Strategist to flag explicitly, e.g. "negative news but price is holding, treating with lower confidence")

These are additive context for the Strategist, not standalone alert triggers — the news signal remains the primary trigger for the core scope, keeping the demo story simple and coherent.

---

## 18. Self-Healing & Recovery Behavior

Both Agent A and Agent B rely on webcmd-learned commands. If either target site changes its layout mid-run (or is deliberately altered for the demo — e.g. switching a filter view or page variant), the saved command will start failing. The system should detect this failure explicitly (not silently retry forever) and trigger webcmd's exploration phase again on that specific site, producing a new saved command automatically. This is the single most convincing live proof of "self-learning agent browser" the demo can offer, and should be staged deliberately as part of the demo script (Section 20).

---

## 19. Failure Modes & Mitigations

| Failure mode | Mitigation |
|---|---|
| News source layout changes mid-demo | Self-healing re-exploration (Section 18); rehearsed fallback screen recording per hackathon rules |
| Paper trading platform requires login/session timeout | Pre-authenticate and keep session warm before demo; test session persistence beforehand |
| LLM produces a low-quality or nonsensical proposal live | System prompt hardened to default to `hold`/`watch_only` on uncertainty; have a pre-tested ticker/news pairing ready as a reliable demo path |
| Twitter/X scraping breaks | Treated as stretch-only; primary news source never depends on X |
| Network/API issues during live demo | Screen-recorded fallback captured from a real prior execution, per hackathon hard rules |
| Judges question "isn't this basically a trading bot?" | Approval Gate is demoed prominently and explicitly narrated as the architectural centerpiece, not a footnote |

---

## 20. Demo Script

**Act 1 — The manual chore (20s):** Briefly show how tedious it is to manually track news and cross-reference it against a ticker before deciding to act.

**Act 2 — Learn once, reuse forever (60s):** Run Agent A's exploration phase live on the news source (narrate: "first time, it's mapping the page"), then trigger a second cycle and show the saved command executing fast. Repeat the same beat briefly for Agent B on the paper trading platform.

**Act 3 — Live signal to human-gated execution (90s):** Let a real (or pre-arranged) news signal come through, show the Strategist's proposal appear with its rationale, approve it live, and show Agent B pre-fill the real order form on the paper trading platform — pausing visibly at the confirm button before the final human click completes it.

**Act 4 — Self-healing (20–30s, if time allows):** Deliberately alter the target page's state and show the system detect the broken command, re-explore, and recover — live.

**Close:** One sentence tying it back to the pitch — "It watches, it reasons, it prepares — but you always pull the trigger."

---

## 21. Judging Criteria Alignment

| Criteria | Points | How this project addresses it |
|---|---|---|
| Live reliability | 30 | Single stable primary news source; TradingView as a well-known, stable execution target; rehearsed core path; visible self-healing rather than silent failure |
| Real-world usefulness | 25 | Solves a real, common problem — tracking news and translating it into a prepared, ready-to-review trade — without removing human control |
| Technical depth & recovery | 20 | Two independent webcmd-learned commands chained into one pipeline; explicit explore-vs-reuse demo moment; live recovery from a broken command; memory-driven behavior change |
| Creativity | 15 | Two-agent parallel architecture (watcher + executor) coordinated through an LLM strategist and a human gate — a genuinely novel structure, not just "if news then alert" |
| Demo & storytelling | 10 | Four-act live demo with a forced self-healing moment and a visibly human-clicked final confirm |

---

## 22. Hard Rules Compliance

- ✅ **Built with webcmd**, the hackathon's sponsor infrastructure, as the core browser automation and self-learning engine for both agents
- ✅ Demo runs live, with a screen-recorded fallback captured from a real execution, per the rules
- ✅ Uses the builder's own accounts on the news source and paper trading platform — no shared or scraped credentials
- ✅ Respects target platforms' terms of use — read-only automated reading of public news pages, and normal interactive use of a paper trading platform intended for practice
- ✅ Human approval step enforced before any order is finalized — Agent B never clicks submit autonomously
- ✅ Built solo

---

## 23. Setup Instructions

1. Set up webcmd per the sponsor's provided repo/instructions
2. Configure `config/watchlist.*` with the tickers to track for the demo
3. Configure `config/settings.*` with the chosen news source URL, polling interval, and the paper trading platform target
4. Run Agent A's first-pass exploration against the news source to generate its saved webcmd command
5. Run Agent B's first-pass exploration against the paper trading platform's order form to generate its saved webcmd command
6. Wire the Strategist's LLM client with an API key on the day of the hackathon
7. Start the orchestration pipeline and confirm signals flow end to end through to the Approval Gate
8. Rehearse the full demo script (Section 20) at least 10 times before presenting, including the deliberate self-healing break

---

## 24. Roadmap Beyond the Hackathon

- Expand signal sources beyond news/Twitter to include earnings calendars, filings, and analyst rating changes
- Move from a lightweight local memory store to a fuller knowledge-graph implementation for richer historical reasoning
- Add voice-triggered status checks and voice-gated approval, building on existing voice + memory infrastructure
- Support multiple paper trading platforms and eventually a supervised path toward real (still human-gated) execution
- Build out the per-ticker trust score into a genuine personalization layer — the Strategist learning each individual user's risk appetite over time

---

## 25. One-Line Pitch

*"StockSentinel watches the news, reasons like an analyst, and prepares the trade — but the trigger always stays in your hand."*
