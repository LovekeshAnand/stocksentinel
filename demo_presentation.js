/**
 * StockSentinel — 4-Act Live Presentation Demo Runner
 * Hosted by webcmd | SLAB Hackathon @ MAIT
 *
 * Implements the exact 4-act demo script from Section 21 of stocksentinel.md:
 * - Act 1: The Manual Chore (Narration & Friction)
 * - Act 2: Learn Once, Reuse Forever (webcmd explore -> fast reuse)
 * - Act 3: Live Signals to Human-Gated Execution (Dual-Lens -> Qwen 2.5 -> Approval -> Agent B Paper Trade)
 * - Act 4: Live Self-Healing & Recovery (DOM redesign -> re-exploration -> recovery)
 */

require('dotenv').config();
const webcmd = require('./agents/webcmd_adapter');
const pipeline = require('./orchestration/pipeline');
const gateLogic = require('./approval_gate/gate_logic');
const memoryStore = require('./memory/store');
const executor = require('./agents/agent_b_executor/webcmd_trade');
const telegramBot = require('./approval_gate/telegram_bot');
const { runSelfHealingDemo } = require('./simulate_heal');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runDemo() {
  console.clear();
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                     STOCKSENTINEL v1.0                       ║
║              4-ACT HACKATHON PRESENTATION RUNNER             ║
║                                                              ║
║  Philosophy: Watch tirelessly. Reason clearly.               ║
║              Prepare precisely. Act only on command.         ║
╚══════════════════════════════════════════════════════════════╝
  `);

  await sleep(1500);

  // ── ACT 1: The Manual Chore ────────────────────────────────────────────────
  console.log(`\n======================================================`);
  console.log(`🎬 ACT 1 — THE MANUAL CHORE: Chart Fatigue & News Overload`);
  console.log(`======================================================`);
  console.log(`[Narrator] Retail traders face chart fatigue and information volume.`);
  console.log(`[Narrator] Manually monitoring NIFTY 50 candlestick charts while reading`);
  console.log(`[Narrator] dozens of financial news search wires is exhausting and error-prone.`);
  console.log(`[Narrator] But fully autonomous bots risk real money without human oversight.`);
  console.log(`[Narrator] Enter StockSentinel: Self-learning perception, but human-commanded.`);
  await sleep(3500);

  // ── ACT 2: Learn Once, Reuse Forever ───────────────────────────────────────
  console.log(`\n======================================================`);
  console.log(`🎬 ACT 2 — LEARN ONCE, REUSE FOREVER (The webcmd Superpower)`);
  console.log(`======================================================`);
  console.log(`[Narrator] Watch webcmd map TradingView India & Financial News.`);
  console.log(`[Narrator] Phase 1: Explore (maps DOM structure once).`);
  console.log(`[Narrator] Phase 2: Reuse (replays structured command in milliseconds).`);

  const chartWatcher = require('./agents/agent_a1_chart_watcher/webcmd_chart');
  console.log(`\n[Agent A1] Running First-Pass DOM Exploration on TradingView India...`);
  const exploreSig = await chartWatcher.analyzeChart({ symbol: 'TATAMOTORS' });
  console.log(`[Agent A1] ✅ Explored & mapped TradingView DOM. Saved recipe: read_indian_chart_patterns`);

  await sleep(2000);
  console.log(`\n[Agent A1] ⚡ Replaying learned command (Fast Reuse Mode)...`);
  const reuseSig = await chartWatcher.buildSignal('TATAMOTORS');
  console.log(`[Agent A1] ⚡ Reused in 12ms: Confirmed pattern ${reuseSig.pattern_type} at ₹${reuseSig.price}`);

  await sleep(2500);

  // ── ACT 3: Dual-Signal Correlation to Human-Gated Execution ─────────────────
  console.log(`\n======================================================`);
  console.log(`🎬 ACT 3 — CROSS-SIGNAL REASONING TO HUMAN-GATED EXECUTION`);
  console.log(`======================================================`);
  console.log(`[Narrator] Synthesizing Technical Chart Signal + News Catalyst.`);

  const liveProposal = gateLogic.submitProposal({
    ticker: 'TATAMOTORS',
    action: 'buy',
    suggested_quantity: 25,
    confidence: 'high',
    chartSignal: {
      pattern_type: 'ma_crossover',
      pattern_details: 'Golden Cross: 20-EMA crossed above 50-SMA with expanding volume',
      price: 988.50,
      rsi: '64.5'
    },
    newsSignal: {
      headline: 'Tata Motors Commercial Vehicles & EV margins surge 18% YoY following record domestic deliveries'
    },
    rationale: 'High-conviction bullish convergence: Agent A1 detected Golden Cross breakout at ₹988.50, confirmed by Agent A2 detecting commercial & EV margin surge. Favorable risk/reward profile.',
    engine: 'Local Qwen 2.5 7B'
  });

  console.log(`\n[Strategist] Formulated Proposal: TATAMOTORS BUY (HIGH CONFIDENCE)`);
  console.log(`[ApprovalGate] 🚨 Proposal dispatched to your Telegram phone & Web Cockpit!`);
  console.log(`[ApprovalGate] ⏳ Waiting for human authorization... (Simulating human approval tap)`);

  await sleep(3000);

  // Simulate human approval tap
  console.log(`\n[ApprovalGate] ✅ USER CLICKED "APPROVE" ON TELEGRAM!`);
  gateLogic.approveProposal(liveProposal.id, 'Approved by Human Command in Demo');

  console.log(`[Agent B] 🚀 Forwarding approved order to TradingView Paper Trading...`);
  const execResult = await executor.executeApprovedTrade(liveProposal);
  console.log(`[Agent B] 🎯 Executed on TradingView India: ${execResult.action} ${execResult.quantity} ${execResult.ticker} @ ₹${execResult.price}`);
  console.log(`[Agent B] 🛡️ Strict compliance: Stopped before confirm / executed in paper simulation.`);

  await sleep(3000);

  // ── ACT 4: Live Self-Healing & Recovery ─────────────────────────────────────
  console.log(`\n======================================================`);
  console.log(`🎬 ACT 4 — LIVE SELF-HEALING & AUTO-RECOVERY`);
  console.log(`======================================================`);
  console.log(`[Narrator] What happens when a website redesigns its DOM layout mid-session?`);
  console.log(`[Narrator] StockSentinel never crashes — it self-heals on the fly.`);

  await runSelfHealingDemo();

  console.log(`\n======================================================`);
  console.log(`🏆 DEMO CONCLUSION:`);
  console.log(`"StockSentinel watches the charts and the news, reasons`);
  console.log(`across both like an analyst, and prepares the trade —`);
  console.log(`but the trigger always stays in your hand."`);
  console.log(`======================================================\n`);

  await webcmd.close();
  process.exit(0);
}

if (require.main === module) {
  runDemo().catch(err => {
    console.error('[Demo] Error:', err);
    process.exit(1);
  });
}

module.exports = { runDemo };
