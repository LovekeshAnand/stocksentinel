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
6. Agent A1 — The Chart Watcher (Pattern Signal Agent)
7. Agent A2 — The News Watcher (Sentiment Signal Agent)
8. The Strategist — LLM Reasoning Layer
9. Human Approval Gate
10. Agent B — The Executor (Action Agent)
11. Memory Layer (Knowledge Graph)
12. Target Platforms
13. Data Flow, End to End
14. Tech Stack
15. Build Plan — Core vs Stretch Scope
16. Project Structure (for Antigravity build)
17. LLM Prompting Strategy
18. Pattern & Signal Rules (v1)
19. Self-Healing & Recovery Behavior
20. Failure Modes & Mitigations
21. Demo Script
22. Judging Criteria Alignment
23. Hard Rules Compliance
24. Setup Instructions
25. Roadmap Beyond the Hackathon
26. One-Line Pitch

---

## 1. Executive Summary

StockSentinel is a browser agent system built around **three cooperating agents**: one that watches stock charts and screeners for technical patterns, one that watches financial news for sentiment-moving signals, and one that executes trades — but only after a human approves a specific, LLM-reasoned proposal. All three agents are built on **webcmd**, the hackathon's sponsor infrastructure, which lets each agent explore an unfamiliar website once, learn its structure and workflow, and convert that exploration into a fast, reusable, structured command. This "explore once, learn the workflow, reuse the command" pattern is used three times in this system — once per target site — and is the technical backbone the whole pitch is built on.

The system is intentionally **not** an autonomous trading bot. It is a decision-support and execution-assistance agent: all the tireless, repetitive work (watching charts, watching news, reasoning, pre-filling orders) is automated, but the one step that matters most — actually placing an order — always requires a human click.

---

## 2. Problem Statement

Retail traders and casual investors face three compounding problems:

- **Chart fatigue** — manually watching screeners and charts for technical patterns (volume spikes, moving average crossovers, RSI extremes) all day is repetitive and easy to get wrong when tired or distracted
- **Information volume** — dozens of news sources and feeds to track manually for anything that might move a price
- **Execution friction** — even after deciding what to do, manually navigating to a trading platform and filling out an order form takes time and is error-prone

Fully autonomous trading bots solve speed but remove human judgment from decisions involving real money — risky, and explicitly discouraged by this hackathon's rules requiring human approval for sensitive actions. StockSentinel automates the *watching, reading, and preparing* completely, on both the technical (chart) side and the fundamental (news) side, while deliberately leaving the *deciding* step with the human.

---

## 3. Core Idea & Philosophy

> **Watch tirelessly, on every front. Reason clearly. Prepare precisely. Act only on command.**

Four design principles anchor every decision in this build:

1. **Human authority is non-negotiable.** No matter how confident the LLM's reasoning is, the system never submits an order without an explicit human confirmation click.
2. **Speed is honest.** This is browser automation, not co-located exchange infrastructure — the value proposition is *tireless correctness across multiple signal types*, not microsecond execution. We do not claim millisecond decision-making anywhere in the build or the pitch.
3. **Learn once, act fast forever.** Every site the agents touch — chart/screener, news, and the trading platform — is learned via webcmd's explore-then-reuse pattern, so repeated checks are fast, structured, and don't re-run expensive exploration each cycle.
4. **Two independent lenses beat one.** A pattern on a chart and a headline in the news are different kinds of evidence. Watching both, and letting the Strategist reason over both together, produces sharper, more defensible proposals than either signal alone — and it's a stronger technical story for judges than a single-signal system.

---

## 4. Why webcmd (Sponsor Tool) Is Central to This Build

webcmd is used as the browser automation and self-learning backbone for **all three agents** in the system:

| Where webcmd is used | What it does here |
|---|---|
| Chart/screener exploration | On first run, explores the chosen screener/chart page, learns how price, volume, and indicator data are laid out in that site's DOM |
| Chart/screener reuse | Converts that exploration into a saved, structured read command — subsequent polling cycles read the page fast and reliably without re-exploring |
| News source exploration | On first run, explores the chosen financial news page(s), learns how headlines, tickers, and timestamps are structured on that specific site |
| News source reuse | Converts that exploration into a saved read command for fast repeated polling |
| Paper trading platform exploration | On first run, explores the paper trading platform's order entry flow — ticker search, quantity field, order type, stop-loss field, confirm button |
| Paper trading platform reuse | Converts the order flow into a saved, parameterized command: `place_order(ticker, action, quantity)` |
| Recovery, on any of the three | If a site's layout changes and a saved command starts failing, webcmd re-triggers exploration automatically rather than the agent crashing or silently failing |

This is the core technical story of the demo: **judges should see the exploration phase happen once per site (slower, visibly mapping the page), and then see the reuse phase happen fast and clean on the next cycle** — proving the "self-learning agent browser" concept the whole hackathon is built around, across three independent sites, chained into one working pipeline.

---

## 5. System Architecture

```
                         ┌─────────────────────────────┐
                         │        User Config           │
                         │  Watchlist tickers             │
                         │  Chart/screener source           │
                         │  News source(s)                    │
                         │  Risk/approval preferences            │
                         └───────────────┬───────────────┘
                                         │
        ┌──────────────────┬─────────────┴─────────────┬──────────────────┐
        ▼                  ▼                                              ▼
┌───────────────────┐┌───────────────────┐                    ┌───────────────────┐
│      AGENT A1        ││      AGENT A2        │                    │      AGENT B         │
│  The Chart Watcher     ││  The News Watcher      │                    │   The Executor         │
│  (webcmd-learned)        ││  (webcmd-learned)         │                    │   (webcmd-learned)        │
│                            ││                            │                    │                            │
│  Explores + reads              ││  Explores + reads              │                    │  Explores + operates the    │
│  screener/chart on a loop        ││  news source(s) on a loop        │                    │  paper trading platform's     │
│  Extracts: price, volume,           ││  Extracts: headline, ticker         │                    │  order entry flow                │
│  RSI, moving averages,                 ││  mention, timestamp, snippet          │                    │  Waits idle until triggered         │
│  pattern flags per ticker                 ││                                          │                    │  by an approved action                │
└────────────┬──────────────┘└────────────┬──────────────┘                    └───────────────┬────────────┘
             │ chart signal                             │ news signal                                             │
             └───────────────────┬──────────────────────┘                                                          │
                                 ▼                                                                                   │
                   ┌─────────────────────────────┐                                                                  │
                   │      THE STRATEGIST           │                                                                  │
                   │      (LLM reasoning layer)      │                                                                  │
                   │                                    │                                                                  │
                   │  Input: chart signal(s) + news         │                                                                  │
                   │  signal(s) for the same ticker +          │                                                                  │
                   │  memory of past decisions on it              │                                                                  │
                   │                                                  │                                                                  │
                   │  Output: proposed action (buy/sell/hold),          │                                                                  │
                   │  suggested quantity, plain-English rationale          │                                                                  │
                   │  that explicitly names which signal(s) agreed,           │                                                                  │
                   │  confidence level                                          │                                                                  │
                   └───────────────┬─────────────────┘                                                                  │
                                 │ proposed action                                                                       │
                                 ▼                                                                                        │
                   ┌─────────────────────────────┐                                                                        │
                   │    MEMORY LAYER (KG)            │                                                                        │
                   │  Has this exact signal              │                                                                        │
                   │  combination + ticker already          │                                                                        │
                   │  been alerted and resolved?               │                                                                        │
                   │  Suppress if so. Otherwise log +              │                                                                        │
                   │  pass through                                    │                                                                        │
                   └───────────────┬─────────────────┘                                                                        │
                                 │ new/changed signal                                                                              │
                                 ▼                                                                                                  │
                   ┌─────────────────────────────┐                                                                                  │
                   │    HUMAN APPROVAL GATE          │──────────────────────────────────────────────────────────────────────────────┘
                   │  Alert shown with both signals       │        (approved action forwarded to Agent B)
                   │  and combined rationale                  │
                   │  Approve / Reject / Modify                  │
                   │  Rejected → logged, no action taken             │
                   └─────────────────────────────────────────────┘
```

---

## 6. Agent A1 — The Chart Watcher (Pattern Signal Agent)

**Responsibility:** Continuously monitor a stock screener/charting page for technical patterns on watchlisted tickers, and hand off clean, structured signals to the Strategist. This is the direct realization of the original idea — "looks into patterns of the stock market graph" — built as a first-class agent, not a secondary check.

**webcmd role:** Learns how to read the chosen screener/chart page's price, volume, and indicator data, and converts that into a reusable read command so each polling cycle is fast and doesn't require re-parsing the page from scratch.

**Patterns detected (v1 — see Section 18 for full rule definitions):**
- Volume spike relative to trailing average
- Short/long moving average crossover
- RSI crossing an overbought/oversold threshold

**Output format (structured signal object):**
```
{
  "ticker": "string",
  "pattern_type": "volume_spike | ma_crossover | rsi_threshold",
  "pattern_details": "e.g. RSI at 78, crossed above 70",
  "price": "number",
  "volume": "number",
  "timestamp": "ISO 8601"
}
```

**Polling behavior:** Runs on a fixed interval (e.g. every 15–30 seconds for the demo). Only forwards a signal when a pattern newly triggers or meaningfully changes, not on every cycle it remains true — the first layer of noise reduction, before the memory layer's dedup check.

---

## 7. Agent A2 — The News Watcher (Sentiment Signal Agent)

**Responsibility:** Continuously monitor one or more financial news sources for content relevant to the user's watchlist, and hand off clean, structured signals to the Strategist.

**webcmd role:** Learns how the chosen news site lays out headlines, ticker mentions, timestamps, and article snippets, and converts that into a reusable read command.

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

**Primary source for the hackathon build:** one reliable financial news page — chosen specifically because it is stable, doesn't require login, and renders consistently, which protects the live-reliability score.

**Secondary/stretch source:** Twitter/X — included only as a stretch goal, tested extensively beforehand, with a documented fallback to the primary source if X's anti-scraping measures cause instability during rehearsal.

---

## 8. The Strategist — LLM Reasoning Layer

**Responsibility:** Take signals from Agent A1 (chart) and/or Agent A2 (news) for the same ticker, plus relevant memory context, and produce a specific, explainable proposed action.

**Context assembled before calling the LLM:**
- Any active chart pattern signal(s) for the ticker from Agent A1
- Any recent news signal(s) for the ticker from Agent A2
- Memory layer's record of past signals and past user decisions on this ticker (did the user usually approve or reject similar proposals?)

**Key reasoning behavior:** the Strategist explicitly reasons about *agreement or disagreement* between the two signal types — e.g. a bullish chart pattern paired with negative news should lower confidence and prompt a `hold`/`watch_only`, while a chart pattern and news pointing the same direction should raise confidence. This cross-signal reasoning is the single most important "intelligence" moment in the whole system and should be called out explicitly in the demo narration.

**Output format (structured proposal object):**
```
{
  "ticker": "string",
  "action": "buy | sell | hold | watch_only",
  "suggested_quantity": "number (paper units)",
  "rationale": "plain-English explanation naming which signal(s) drove this",
  "signals_considered": ["chart: rsi_threshold", "news: positive sentiment"],
  "confidence": "low | medium | high",
  "source_signal_ids": ["reference(s) back to A1/A2 signal(s)"]
}
```

**Key design choice:** The LLM never sees itself as "deciding" — its output is explicitly framed and labeled as a *proposal*, and the system prompt reinforces that its job is to inform a human, not to act. `hold` / `watch_only` is a valid and expected output for weak, ambiguous, or conflicting signals — the Strategist should not manufacture actionable trades out of noise or disagreement between its two signal sources.

---

## 9. Human Approval Gate

**Responsibility:** Present the Strategist's proposal to the user clearly — including both the chart and news evidence that produced it — and require an explicit decision before anything reaches Agent B.

**What the user sees:**
- Ticker and current context
- The specific chart pattern (if any) that contributed, from Agent A1
- The specific headline/snippet (if any) that contributed, from Agent A2
- The proposed action, quantity, and combined rationale in plain English
- Confidence level
- Three options: **Approve**, **Reject**, **Modify** (adjust quantity/action before approving)

**On Approve:** the (possibly modified) action object is forwarded to Agent B with a timestamp and an approval record.

**On Reject:** the proposal and the reason (if given) are logged to the memory layer, and nothing is sent to Agent B. This rejection also feeds back into future Strategist context (see Section 11).

This gate is not a formality — it is the architectural centerpiece that keeps the entire system compliant with the hackathon's human-approval rule for sensitive actions, and it should be given real visual weight in the demo UI, not buried as a small popup.

---

## 10. Agent B — The Executor (Action Agent)

**Responsibility:** Sit idle at (or be able to quickly navigate to) the paper trading platform, and execute an approved action precisely as specified — and only after approval.

**webcmd role:** Learns the paper trading platform's order entry flow once — how to search for a ticker, select order type, enter quantity, set stop-loss/take-profit if applicable, and where the confirm button is. This becomes a reusable, parameterized command: `place_order(ticker, action, quantity)`.

**Critical behavior:** Agent B **pre-fills the order form and stops.** It never clicks the final confirm/submit button autonomously. The human clicks that button — either directly on the platform (screen-shared for the demo) or via a final in-app "confirm execution" step that then triggers the very last click. Either way, the last action-causing click is human-originated. This is documented and demoed explicitly so judges can verify compliance with the hard rule.

**Target platform:** TradingView Paper Trading (primary recommendation) — fully web-based, real order-entry UI, globally recognized by judges, no app install required. Moneybhai (Moneycontrol) is a documented India-specific alternative if a more locally-flavored demo is preferred.

---

## 11. Memory Layer (Knowledge Graph)

**Responsibility:** Prevent alert fatigue across both signal sources, track state over time, and make the system demonstrably "self-learning" rather than stateless.

**What it tracks:**
- Every chart signal (from A1) and news signal (from A2) seen, per ticker, with a resolved/active state
- Every proposal made by the Strategist, and the user's decision (approve/reject/modify) on it
- A lightweight per-ticker "user trust" signal — if a user has rejected similar proposals on a ticker repeatedly, the Strategist is told this in its context and can lower its confidence or hold rather than propose again immediately

**Why this matters for the demo:** it lets you show behavior beyond "it alerted once" — you can show the system *not* re-alerting on a still-active chart pattern, show it combining a fresh news signal with an already-known chart pattern without double-counting, and show it *changing its behavior* based on a prior rejection — three genuinely compelling "self-learning" moments for judges.

**Implementation note:** this does not need to be a heavyweight graph database for the hackathon — a structured local store (ticker → signal history [chart + news] → decision history) is sufficient to demonstrate the concept live. The architecture should be described as knowledge-graph-*style* memory, keeping the door open to a fuller KG implementation post-hackathon.

---

## 12. Target Platforms

| Role | Platform | Why |
|---|---|---|
| Chart/screener signal source | A stable stock screener or charting page with visible price/volume/indicator data | No login wall ideally, consistent structure, safe for repeated automated reads |
| News signal source (primary) | One stable financial news/markets page | No login wall, consistent structure, safe for repeated automated reads |
| News signal source (stretch) | Twitter/X | High information value but fragile to automate reliably — stretch only |
| Paper trading / execution | TradingView Paper Trading | Real order-entry UI, free, no real money at risk, globally recognizable |
| Paper trading (alternative) | Moneybhai (Moneycontrol) | India-specific, NSE/BSE flavored, good for a locally-grounded demo narrative |

---

## 13. Data Flow, End to End

1. Agent A1 polls the chart/screener source (webcmd-learned read command) → produces a chart signal when a pattern triggers
2. Agent A2 polls the news source (webcmd-learned read command) → produces a news signal when relevant content appears
3. Signals pass through the memory layer's dedup check → if genuinely new/changed, proceed
4. Strategist assembles context (any active chart signal + any active news signal for the ticker + memory history) → calls the LLM → produces a structured proposal explicitly reasoning over both
5. Proposal is logged to memory and shown at the Human Approval Gate with both pieces of evidence
6. User approves, rejects, or modifies
7. On approval, the (possibly modified) action is sent to Agent B
8. Agent B navigates to the paper trading platform (webcmd-learned command), pre-fills the order exactly as approved, and stops at the confirm step
9. User performs the final confirm click
10. Outcome (order placed) is logged back to memory, closing the loop for that ticker's active signals

---

## 14. Tech Stack

| Layer | Tool / Approach |
|---|---|
| Browser automation & self-learning core | **webcmd** (sponsor-mandated, used for all three agents) |
| LLM reasoning | Any capable LLM API accessible during the hackathon (API key brought on the day) |
| Memory / dedup / decision history | Lightweight structured local store (ticker → chart + news signal history → decision history) |
| Orchestration between agents | A simple message-passing layer coordinating Agent A1 + Agent A2 → Strategist → Memory → Gate → Agent B |
| Frontend / demo UI | A minimal live dashboard: incoming chart signals, incoming news signals, Strategist proposals with combined rationale, approval controls, and a running decision log |
| Build environment | **Antigravity**, structured from the ground up with clear module boundaries (see Section 16) |
| Chart/screener source | One stable public screener/charting page |
| News source | One stable public financial news/markets page |
| Execution target | TradingView Paper Trading (primary) |

---

## 15. Build Plan — Core vs Stretch Scope

### Core scope (must be bulletproof — this is what gets rehearsed 10+ times before demo day)

1. Agent A1 reads one screener/chart source via a webcmd-learned command and detects at least one technical pattern (start with volume spike or RSI threshold — pick whichever is easiest to reliably trigger/demo)
2. Agent A2 reads one news source via a webcmd-learned command and extracts a clean signal for a watchlisted ticker
3. Strategist combines whichever signal(s) are active for a ticker into a specific proposed action with a plain-English rationale naming the evidence
4. Human Approval Gate displays the proposal clearly, with both signal types visible, and accepts approve/reject
5. On approval, Agent B (webcmd-learned) navigates to TradingView Paper Trading, pre-fills the order exactly as proposed, and stops at confirm
6. User performs the final click, order appears on the paper trading platform, visible on screen
7. Memory layer suppresses a duplicate alert for the same still-active signal (demoed by letting a cycle repeat without a new alert firing)

### Stretch scope (only after core is fully rehearsed and reliable)

1. Full set of chart pattern rules (moving average crossover in addition to volume spike/RSI)
2. Twitter/X as a secondary news signal source
3. Confidence scoring that visibly adjusts based on past user approvals/rejections (memory-driven Strategist behavior change)
4. Live "cockpit" dashboard showing all three agents' status and a running decision log in real time
5. Self-healing demo — deliberately altering a page's state mid-demo and showing webcmd re-explore and recover the broken command
6. Voice-gated confirmation step (spoken alert, spoken/voice-triggered approval) — natural extension given prior work on a voice + memory stack

---

## 16. Project Structure (for Antigravity build)

```
stocksentinel/
├── agents/
│   ├── agent_a1_chart_watcher/
│   │   ├── webcmd_chart_explore.*      # first-run exploration of screener/chart source
│   │   ├── webcmd_chart_read.*         # saved, reusable read command
│   │   └── pattern_detector.*          # applies RSI/MA/volume-spike rules to fresh data
│   ├── agent_a2_news_watcher/
│   │   ├── webcmd_news_explore.*       # first-run exploration of news source
│   │   ├── webcmd_news_read.*          # saved, reusable read command
│   │   └── signal_extractor.*          # parses raw page data into news signal objects
│   ├── agent_b_executor/
│   │   ├── webcmd_trade_explore.*      # first-run exploration of paper trading platform
│   │   ├── webcmd_trade_place.*        # saved, reusable order-placement command (pre-fill only)
│   │   └── order_formatter.*           # turns an approved action object into platform-specific field values
├── strategist/
│   ├── prompt_templates/
│   ├── context_builder.*               # assembles chart signal + news signal + memory history
│   └── llm_client.*
├── memory/
│   ├── store.*                         # ticker → chart/news signal history → decision history
│   ├── dedup.*                         # active/resolved signal state tracking, per signal type
│   └── trust_score.*                   # per-ticker approval/rejection pattern tracking
├── approval_gate/
│   ├── ui/                             # dashboard: chart signals, news signals, proposals, approve/reject/modify controls
│   └── gate_logic.*                    # enforces the "nothing proceeds without approval" rule
├── orchestration/
│   └── pipeline.*                      # coordinates Agent A1 + Agent A2 → Strategist → Memory → Gate → Agent B
├── config/
│   ├── watchlist.*
│   └── settings.*                      # polling intervals, source URLs, risk preferences
└── docs/
    └── PROJECT.md                      # this file
```

---

## 17. LLM Prompting Strategy

The Strategist's system prompt should explicitly encode:
- Its role is advisory only — it proposes, it never executes
- It must always include a plain-English rationale a non-expert can understand, explicitly naming which signal(s) — chart, news, or both — drove the proposal
- It must output `hold` / `watch_only` when signals are weak, ambiguous, or conflict with each other (e.g. bullish chart pattern with negative news) — fabricating an actionable call from noise or disagreement is a failure mode to actively guard against
- It should incorporate the user's past approval/rejection pattern on that ticker (from memory) as context, and note in its rationale if it's adjusting confidence because of that history
- Output must be structured (the proposal object format from Section 8), not free-form prose, so the Approval Gate UI can render it consistently

---

## 18. Pattern & Signal Rules (v1)

**Chart signals (Agent A1):**
- **Volume spike** — current volume noticeably above trailing average
- **Moving average crossover** — short-term MA crosses long-term MA
- **RSI threshold** — price crosses a common overbought/oversold level (e.g. 70/30)

**News signals (Agent A2):**
- Headline/snippet mentioning a watchlisted ticker, tagged with a raw sentiment hint (positive/negative/neutral/mixed)

**Cross-signal reasoning (handled by the Strategist, not a fixed rule):**
- Chart and news agreeing → raises confidence
- Chart and news disagreeing → lowers confidence, biases toward `hold`/`watch_only`
- Only one signal type active → proposal is made on that evidence alone, and the rationale states clearly that only one source contributed

---

## 19. Self-Healing & Recovery Behavior

All three agents rely on webcmd-learned commands. If any target site changes its layout mid-run (or is deliberately altered for the demo — e.g. switching a filter view or page variant), the corresponding saved command will start failing. The system should detect this failure explicitly (not silently retry forever) and trigger webcmd's exploration phase again on that specific site, producing a new saved command automatically. This is the single most convincing live proof of "self-learning agent browser" the demo can offer, and should be staged deliberately as part of the demo script (Section 21) — ideally on the chart/screener source, since that's the agent most directly tied to the original idea.

---

## 20. Failure Modes & Mitigations

| Failure mode | Mitigation |
|---|---|
| Chart/screener source layout changes mid-demo | Self-healing re-exploration (Section 19); rehearsed fallback screen recording per hackathon rules |
| News source layout changes mid-demo | Same self-healing path; independent from the chart agent so one failure doesn't take down both signal types |
| Paper trading platform requires login/session timeout | Pre-authenticate and keep session warm before demo; test session persistence beforehand |
| LLM produces a low-quality or nonsensical proposal live | System prompt hardened to default to `hold`/`watch_only` on uncertainty or conflicting signals; have a pre-tested ticker/signal pairing ready as a reliable demo path |
| Twitter/X scraping breaks | Treated as stretch-only; primary news source never depends on X |
| Network/API issues during live demo | Screen-recorded fallback captured from a real prior execution, per hackathon hard rules |
| Judges question "isn't this basically a trading bot?" | Approval Gate is demoed prominently and explicitly narrated as the architectural centerpiece, not a footnote |

---

## 21. Demo Script

**Act 1 — The manual chore (20s):** Briefly show how tedious it is to manually watch a screener for a pattern *and* track news separately, then mentally combine the two before deciding to act.

**Act 2 — Learn once, reuse forever (60–75s):** Run Agent A1's exploration phase live on the chart/screener source (narrate: "first time, it's mapping the page"), then trigger a second cycle and show the saved command executing fast. Briefly repeat the same beat for Agent A2 on the news source, and for Agent B on the paper trading platform.

**Act 3 — Live signals to human-gated execution (90–120s):** Let a real (or pre-arranged) chart pattern and/or news signal come through, show the Strategist's proposal appear with its combined rationale naming both pieces of evidence, approve it live, and show Agent B pre-fill the real order form on the paper trading platform — pausing visibly at the confirm button before the final human click completes it.

**Act 4 — Self-healing (20–30s, if time allows):** Deliberately alter the chart/screener page's state and show the system detect the broken command, re-explore, and recover — live.

**Close:** One sentence tying it back to the pitch — "It watches the charts, it watches the news, it reasons across both — but you always pull the trigger."

---

## 22. Judging Criteria Alignment

| Criteria | Points | How this project addresses it |
|---|---|---|
| Live reliability | 30 | Single stable chart/screener source and news source; TradingView as a well-known, stable execution target; rehearsed core path; visible self-healing rather than silent failure |
| Real-world usefulness | 25 | Solves a real, common problem — tracking both technical patterns and news, and translating them into a prepared, ready-to-review trade — without removing human control |
| Technical depth & recovery | 20 | Three independent webcmd-learned commands chained into one pipeline; explicit explore-vs-reuse demo moments; live recovery from a broken command; cross-signal reasoning; memory-driven behavior change |
| Creativity | 15 | Three-agent architecture (chart watcher + news watcher + executor) coordinated through an LLM strategist that explicitly reasons across two different evidence types, gated by a human — a genuinely novel structure, not just "if pattern then alert" |
| Demo & storytelling | 10 | Four-act live demo with a forced self-healing moment and a visibly human-clicked final confirm |

---

## 23. Hard Rules Compliance

- ✅ **Built with webcmd**, the hackathon's sponsor infrastructure, as the core browser automation and self-learning engine for all three agents
- ✅ Demo runs live, with a screen-recorded fallback captured from a real execution, per the rules
- ✅ Uses the builder's own accounts on the chart/screener source, news source, and paper trading platform — no shared or scraped credentials
- ✅ Respects target platforms' terms of use — read-only automated reading of public screener/chart and news pages, and normal interactive use of a paper trading platform intended for practice
- ✅ Human approval step enforced before any order is finalized — Agent B never clicks submit autonomously
- ✅ Built solo

---

## 24. Setup Instructions

1. Set up webcmd per the sponsor's provided repo/instructions
2. Configure `config/watchlist.*` with the tickers to track for the demo
3. Configure `config/settings.*` with the chosen chart/screener source URL, news source URL, polling intervals, and the paper trading platform target
4. Run Agent A1's first-pass exploration against the chart/screener source to generate its saved webcmd command
5. Run Agent A2's first-pass exploration against the news source to generate its saved webcmd command
6. Run Agent B's first-pass exploration against the paper trading platform's order form to generate its saved webcmd command
7. Wire the Strategist's LLM client with an API key on the day of the hackathon
8. Start the orchestration pipeline and confirm signals from both A1 and A2 flow end to end through to the Approval Gate
9. Rehearse the full demo script (Section 21) at least 10 times before presenting, including the deliberate self-healing break

---

## 25. Roadmap Beyond the Hackathon

- Expand chart signals beyond RSI/MA/volume to include more advanced technical patterns
- Expand news signals to include earnings calendars, filings, and analyst rating changes
- Move from a lightweight local memory store to a fuller knowledge-graph implementation for richer historical reasoning
- Add voice-triggered status checks and voice-gated approval, building on existing voice + memory infrastructure
- Support multiple paper trading platforms and eventually a supervised path toward real (still human-gated) execution
- Build out the per-ticker trust score into a genuine personalization layer — the Strategist learning each individual user's risk appetite over time

---

## 26. One-Line Pitch

*"StockSentinel watches the charts and the news, reasons across both like an analyst, and prepares the trade — but the trigger always stays in your hand."*