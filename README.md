# StockSentinel 🛡️

> **"Watch tirelessly. Reason clearly. Prepare precisely. Act only on command."**

**SLAB (Self-Learning Agent Browser) Hackathon @ MAIT — Hosted by webcmd**  
*Built with webcmd & Scrapling · Local Qwen 2.5 7B Engine · Human-Approval-Gated via Telegram*

---

## 1. Executive Summary

**StockSentinel** is a decision-support and execution-assistance trading agent system designed to solve information overload and execution friction for retail traders without ever sacrificing human control.

StockSentinel continuously watches financial news wires for market catalysts affecting a user's watchlist, reasons through those signals using a **locally-hosted Qwen 2.5 7B LLM (via the Epsilon Engine)**, formulates explainable trade proposals with plain-English rationales, and pushes interactive alerts to the user's **Telegram**.

Only after the user explicitly taps **Approve** on Telegram does **Agent B (The Executor)** navigate to the paper trading platform (TradingView Paper Trading), automatically pre-fill the order form with the exact approved parameters, and **strictly halt before the final submit button**. The last action-causing click remains in human hands.

```
┌────────────────────────────────────────────────────────┐
│               AGENT A: THE WATCHER                     │
│  ┌────────────────────┐      ┌──────────────────────┐  │
│  │ Scrapling Engine   │ ──►  │ webcmd Pattern Match │  │
│  │ (Stealth / Fast)   │      │ (Explore / Reuse)    │  │
│  └────────────────────┘      └──────────────────────┘  │
└───────────────────────────┬────────────────────────────┘
                            │ Raw Signals
                            ▼
┌────────────────────────────────────────────────────────┐
│           MEMORY LAYER (Dedup & Trust Graph)           │
└───────────────────────────┬────────────────────────────┘
                            │ Filtered Catalyst
                            ▼
┌────────────────────────────────────────────────────────┐
│         THE STRATEGIST (Epsilon Local LLM)             │
│            Running Qwen 2.5 7B Locally                 │
│    (Structured proposal: Buy/Sell/Hold + Rationale)    │
└───────────────────────────┬────────────────────────────┘
                            │ Trade Proposal
                            ▼
┌────────────────────────────────────────────────────────┐
│         HUMAN APPROVAL GATE (Telegram & Cockpit)       │
│  📱 Telegram Bot: [✅ Approve] [❌ Reject] [✏️ Modify] │
│  🖥️ Real-Time WebSocket Web Cockpit for Live Demos     │
└───────────────────────────┬────────────────────────────┘
                            │ (Only after human taps Approve)
                            ▼
┌────────────────────────────────────────────────────────┐
│               AGENT B: THE EXECUTOR                    │
│     (webcmd Paper Trading pre-fill on TradingView)     │
│        *Strictly halts before final submit click*      │
└────────────────────────────────────────────────────────┘
```

---

## 2. Core Pillars & Design Philosophy

1. **Human Authority is Non-Negotiable**: No matter how confident the LLM's reasoning is, the system never places an order autonomously. Sensitive actions require explicit human command.
2. **Speed is Honest**: Browser automation combined with stealth DOM retrieval provides tireless correctness and rapid response without false claims of microsecond co-location.
3. **Learn Once, Act Fast Forever**: Targets are explored once via webcmd to map DOM layouts, saved as reusable recipes, and re-executed at high speed.
4. **Self-Healing Recovery**: If a target layout shifts, webcmd detects the breakdown and automatically re-explores the page rather than crashing silently.
5. **Memory Prevents Noise**: A signal deduplication engine suppresses repetitive alerts on the same catalyst, while a per-ticker trust score adapts LLM confidence based on historical human approvals and rejections.

---

## 3. Technology Stack

| Layer | Component | Description |
|---|---|---|
| **Core Runtime** | Node.js (v18+) | Async event-driven pipeline and agent coordinator |
| **Browser Engine** | `webcmd` + Puppeteer Core | Explore-then-reuse automation and paper trading operator |
| **Fast DOM Retrieval** | `Scrapling` (Python) | Undetected, millisecond-grade stealth news extraction |
| **Reasoning Core** | `Epsilon Engine` | Locally hosted **Qwen 2.5 7B** parameter model (zero external API keys) |
| **Approval Gate** | `Telegram Bot API` | Rich interactive alerts with inline buttons (`[Approve]`, `[Reject]`, `[Modify]`) |
| **Live Cockpit** | Express + WebSockets | High-contrast dark-mode telemetry dashboard for judges |
| **Target Platform** | TradingView Paper Trading | Real order-entry UI, risk-free simulation |

---

## 4. Why webcmd & Scrapling Work Together

- **Scrapling**: Financial news sites (Yahoo Finance, MarketWatch) often deploy aggressive anti-bot protections. Scrapling uses stealth fingerprinting to bypass anti-scraping barriers and extract clean article cards in milliseconds.
- **webcmd**: Takes Scrapling's fast input to formulate structural DOM memory, manages learned recipes (`data/learned_commands/`), detects layout drift to trigger self-healing, and drives Agent B's interactive form automation on TradingView.

---

## 5. Local Reasoning with Qwen 2.5 7B (Epsilon Engine)

StockSentinel runs with **100% data privacy and zero API costs** by using the builder's custom **Epsilon IDE Engine** running **Qwen 2.5 7B**:
- Located in `./engine`
- Balanced tier configured with `qwen2.5-coder-7b-instruct-q4_k_m.gguf`
- Evaluates incoming catalysts against historical trust scores
- Generates structured JSON trade proposals containing:
  - `action`: `buy` | `sell` | `hold` | `watch_only`
  - `suggested_quantity`: Scaled by user trust and risk limits
  - `rationale`: Explainable, plain-English market analysis
  - `confidence`: `low` | `medium` | `high`

---

## 6. Telegram Approval Gate (Your Phone in Control)

When The Strategist formulates a proposal, an interactive alert is pushed to Telegram:

```text
🚨 STOCK SENTINEL TRADE PROPOSAL 🚨
━━━━━━━━━━━━━━━━━━━━━━━━
📈 Ticker: TSLA
🎯 Action: 🟢 BUY
🔢 Quantity: 15 units
📊 Confidence: HIGH
🧠 Engine: Local Qwen 2.5 7B

📰 Market Catalyst:
"Tesla surges 6% following announcement of accelerated Cybercab production"

💡 Strategist Rationale:
Strong positive catalyst with European regulatory approvals progressing ahead of schedule. Momentum indicates favorable risk/reward.
━━━━━━━━━━━━━━━━━━━━━━━━
[✅ Approve (15 TSLA)]  [❌ Reject]
[✏️ Modify Quantity]
```

### Supported Actions:
- **`✅ Approve`**: Commits the trade to memory and triggers Agent B to pre-fill the order on TradingView.
- **`❌ Reject`**: Cancels the trade, logs the rejection to memory, and decreases future LLM confidence on this ticker.
- **`✏️ Modify Quantity`**: Reply with a new share quantity directly from chat.
- **Chat Commands**: `/status`, `/demo`, `/start`.

---

## 7. Setup & Installation

### Prerequisites
- Node.js (v18+)
- Python (v3.10+)
- Google Chrome or Microsoft Edge installed on Windows

### 1. Clone and Install Dependencies
```bash
cd d:\stocksentinel
npm install
python -m pip install scrapling curl_cffi playwright patchright
```

### 2. Configure Environment (.env)
Create or edit `.env`:
```env
# Telegram Bot Token from @BotFather
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=

# Epsilon Local Engine Configuration
EPSILON_ENGINE_PATH=./engine
EPSILON_TIER=balanced

# Server & Pipeline
PORT=3000
POLL_INTERVAL_SEC=30
PAPER_TRADING_URL=https://www.tradingview.com/chart/
```

### 3. Telegram Bot Setup (2 Minutes)
1. Open Telegram and search for `@BotFather`.
2. Send `/newbot`, name your bot (e.g. `MyStockSentinelBot`), and copy the API token into `.env`.
3. Open your new bot in Telegram and send `/start`.

---

## 8. Running the Application

Start StockSentinel:
```bash
npm start
```

Open your browser to the Live Cockpit Dashboard:
```
http://localhost:3000
```

---

## 9. The 4-Act Live Demo Script (For Judges)

### Act 1: The Manual Problem (20s)
> *"Tracking dozens of ticker news feeds manually is exhausting, and opening order tickets on trading platforms introduces fatal friction."*

### Act 2: Learn Once, Act Fast Forever (60s)
- Point to Agent A: Show Scrapling harvesting market news in milliseconds, and webcmd forming structural memory.
- Show how the memory layer deduplicates repetitive noise.

### Act 3: Live Signal to Human-Gated Execution (90s)
- Tap **"⚡ Trigger Live Demo Signal"** on the dashboard (or type `/demo` in Telegram).
- Observe the alert appear instantly on your phone with local Qwen 2.5 7B reasoning.
- Tap **`✅ Approve`** on Telegram.
- Watch Agent B open TradingView on screen, input the ticker, fill the quantity, and **pause visibly before the final confirm button**.
- Show judges: *"Agent B pre-filled everything, but the final trigger click is mine."*

### Act 4: Self-Learning Memory Feedback (30s)
- Reject a subsequent trade on TSLA.
- Open the **Memory & Trust Graph** panel on the web cockpit: show the TSLA trust score adapt dynamically, proving genuine self-learning behavior.

---

## 10. Compliance with Hackathon Hard Rules

- ✅ **Built with webcmd**: Sponsor infrastructure powers workflow exploration, learned command replay, and Agent B order automation.
- ✅ **Local Qwen 2.5 7B Engine**: Completely offline reasoning via the Epsilon engine.
- ✅ **Human Approval Gate Enforced**: Agent B never clicks submit autonomously.
- ✅ **Live Reliability**: Single stable news sources, Scrapling stealth anti-bot protection, and rehearsed demo workflows.
- ✅ **Solo Build**: Engineered end-to-end for the SLAB Hackathon @ MAIT.
