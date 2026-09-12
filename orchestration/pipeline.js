/**
 * StockSentinel Orchestration Pipeline
 * Coordinates the full multi-agent loop:
 * Agent A1 (Chart Watcher) + Agent A2 (News Watcher) -> Dedup -> The Strategist (Qwen 2.5 7B) -> Approval Gate (Telegram + Cockpit) -> Agent B (Executor)
 */

const { EventEmitter } = require('events');
const chartWatcher = require('../agents/agent_a1_chart_watcher/webcmd_chart');
const newsWatcher = require('../agents/agent_a_watcher/webcmd_news');
const executor = require('../agents/agent_b_executor/webcmd_trade');
const dedup = require('../memory/dedup');
const memoryStore = require('../memory/store');
const contextBuilder = require('../strategist/context_builder');
const epsilonClient = require('../strategist/epsilon_client');
const gateLogic = require('../approval_gate/gate_logic');
const settings = require('../config/settings');

class SentinelPipeline extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.pollTimer = null;
    this.pollIntervalMs = settings.pollIntervalSec * 1000;

    // Listen for human approvals from Telegram / Dashboard
    gateLogic.on('proposal_approved', async (approvedProposal) => {
      try {
        console.log(`[Pipeline] ⚡ Forwarding approved action to Agent B: ${approvedProposal.ticker} ${approvedProposal.action.toUpperCase()}`);
        const result = await executor.executeApprovedTrade(approvedProposal);
        this.emit('execution_complete', result);
      } catch (err) {
        console.error(`[Pipeline] Error executing approved trade: ${err.message}`);
      }
    });
  }

  /**
   * Start automated polling loop
   */
  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[Pipeline] 🛡️ StockSentinel multi-agent pipeline active. Polling interval: ${settings.pollIntervalSec}s`);

    // Run first cycle immediately
    await this.runCycle();

    this.pollTimer = setInterval(async () => {
      if (this.isRunning) {
        await this.runCycle();
      }
    }, this.pollIntervalMs);
  }

  /**
   * Stop automated polling
   */
  stop() {
    this.isRunning = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    console.log('[Pipeline] 🛑 Pipeline stopped.');
  }

  /**
   * Execute one complete pipeline cycle with visible browser automation
   */
  async runCycle(forceExplore = false) {
    console.log(`\n────────────────────────────────────────────────────────────`);
    console.log(`[Pipeline] 🔄 Multi-Agent Cycle start: ${new Date().toLocaleTimeString()}`);

    try {
      // 1. Agent A1: Poll chart & technical patterns via visible webcmd automation
      console.log(`[Pipeline] 📊 Executing Agent A1 (The Chart Watcher)...`);
      const chartResult = await chartWatcher.pollChartSignals(forceExplore);
      console.log(`[Pipeline] Agent A1 [${chartResult.phase.toUpperCase()}]: Discovered ${chartResult.count} technical pattern triggers.`);

      // 2. Agent A2: Poll news & sentiment wires via visible webcmd + Scrapling
      console.log(`[Pipeline] 📰 Executing Agent A2 (The News Watcher)...`);
      const newsResult = await newsWatcher.pollSignals(forceExplore);
      console.log(`[Pipeline] Agent A2 [${newsResult.phase.toUpperCase()}]: Ingested ${newsResult.count} market catalyst signals.`);

      // 3. Correlate incoming signals by ticker
      const tickerMap = new Map();

      for (const cs of chartResult.signals || []) {
        if (!tickerMap.has(cs.ticker)) tickerMap.set(cs.ticker, {});
        tickerMap.get(cs.ticker).chartSignal = cs;
      }

      for (const ns of newsResult.signals || []) {
        if (!tickerMap.has(ns.ticker)) tickerMap.set(ns.ticker, {});
        tickerMap.get(ns.ticker).newsSignal = ns;
      }

      console.log(`[Pipeline] 🔗 Active tickers for cross-signal evaluation: ${Array.from(tickerMap.keys()).join(', ')}`);

      // 4. Process each correlated ticker through Dedup and The Strategist
      for (const [ticker, signals] of tickerMap.entries()) {
        const { chartSignal, newsSignal } = signals;

        // Dedup check to prevent repeated alert fatigue
        const primarySignal = newsSignal || chartSignal;
        if (dedup.isDuplicate(primarySignal)) {
          console.log(`[Pipeline] 🔇 Suppressed duplicate signal for ${ticker}`);
          continue;
        }

        // Store signals in knowledge base
        if (chartSignal) memoryStore.addSignal(chartSignal);
        if (newsSignal) memoryStore.addSignal(newsSignal);

        // 5. Build dual-lens context payload
        const contextPayload = contextBuilder.buildContext(ticker, { chartSignal, newsSignal });

        // 6. The Strategist: Reason on dual evidence using local Qwen 2.5 7B (Epsilon)
        console.log(`[Pipeline] 🧠 The Strategist: Synthesizing Chart + News evidence for ${ticker} via Qwen 2.5 7B...`);
        const proposal = await epsilonClient.generateProposal(contextPayload);
        proposal.chartSignal = chartSignal;
        proposal.newsSignal = newsSignal;

        console.log(`[Pipeline] 💡 Proposal Generated: ${proposal.ticker} ${proposal.action.toUpperCase()} (${proposal.confidence.toUpperCase()} confidence)`);
        console.log(`[Pipeline] 📝 Rationale: ${proposal.rationale}`);

        // 7. Submit to Human Approval Gate (Telegram + Web Cockpit)
        const queued = gateLogic.submitProposal(proposal);
        this.emit('new_proposal', queued);
      }

    } catch (err) {
      console.error(`[Pipeline] Error in multi-agent cycle: ${err.message}`);
    }

    console.log(`[Pipeline] 🏁 Multi-Agent Cycle completed.\n`);
  }
}

module.exports = new SentinelPipeline();
