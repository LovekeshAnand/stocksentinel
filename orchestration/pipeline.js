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
    console.log(`[Pipeline] StockSentinel multi-agent pipeline active. Polling every ${settings.pollIntervalSec}s`);

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
    const cycleTime = new Date().toLocaleTimeString();
    console.log(`\n${'━'.repeat(64)}`);
    console.log(`[Pipeline] CYCLE @ ${cycleTime} — Chart Watcher + News Watcher + Strategist`);
    console.log(`${'━'.repeat(64)}`);

    try {
      // ── Agent A1 + Agent A2: Active Perception (Chart Analysis then News Search) ──
      console.log(`[Pipeline] [A1] Scanning live chart patterns on TradingView India...`);
      const chartResult = await chartWatcher.pollChartSignals(forceExplore);

      console.log(`[Pipeline] [A2] Searching breaking financial news across watchlist tickers...`);
      const newsResult = await newsWatcher.pollSignals(forceExplore);

      console.log(`[Pipeline] [A1] ${chartResult.count} chart pattern(s) | [A2] ${newsResult.count} news catalyst(s) confirmed.`);

      // ── Correlate signals by ticker ─────────────────────────────────────────
      const tickerMap = new Map();
      for (const cs of chartResult.signals || []) {
        tickerMap.set(cs.ticker, { chartSignal: cs });
      }
      for (const ns of newsResult.signals || []) {
        if (!tickerMap.has(ns.ticker)) tickerMap.set(ns.ticker, {});
        tickerMap.get(ns.ticker).newsSignal = ns;
      }

      console.log(`[Pipeline] Cross-signal tickers: ${Array.from(tickerMap.keys()).join(', ')}`);

      // ── Strategist: Reason on actively scrutinized ticker ─────────────────
      for (const [ticker, signals] of tickerMap.entries()) {
        const { chartSignal, newsSignal } = signals;

        // Record signals to memory
        if (chartSignal) memoryStore.addSignal(chartSignal);
        if (newsSignal)  memoryStore.addSignal(newsSignal);

        // Strict Single-Stock Quality Gate:
        // Only generate trade proposals for the ticker actively scanned on TradingView in this cycle
        if (!chartSignal) {
          console.log(`[Pipeline] Background news logged for ${ticker} (awaiting chart scan in next rotation)`);
          continue;
        }

        const primarySignal = newsSignal || chartSignal;
        if (dedup.isDuplicate(primarySignal)) {
          console.log(`[Pipeline] Duplicate proposal suppressed for ${ticker}`);
          continue;
        }

        const contextPayload = contextBuilder.buildContext(ticker, { chartSignal, newsSignal });

        console.log(`[Pipeline] [Strategist] Dual-Lens reasoning on ${ticker} via Qwen 2.5 7B...`);
        const proposal = await epsilonClient.generateProposal(contextPayload);
        proposal.chartSignal = chartSignal;
        proposal.newsSignal  = newsSignal;

        console.log(`[Pipeline] Proposal: ${proposal.ticker} ${proposal.action.toUpperCase()} (${proposal.confidence.toUpperCase()})`);
        console.log(`[Pipeline] Rationale: ${proposal.rationale}`);

        const queued = gateLogic.submitProposal(proposal);
        this.emit('new_proposal', queued);
      }

    } catch (err) {
      console.error(`[Pipeline] Error in cycle: ${err.message}`);
    }

    console.log(`[Pipeline] Cycle complete. Next scan in ${settings.pollIntervalSec}s\n`);
  }
}

module.exports = new SentinelPipeline();
