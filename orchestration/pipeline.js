/**
 * StockSentinel Orchestration Pipeline
 * Coordinates the full loop:
 * Agent A (Watcher) -> Dedup -> The Strategist (Qwen 2.5 7B) -> Approval Gate (Telegram) -> Agent B (Executor)
 */

const { EventEmitter } = require('events');
const watcher = require('../agents/agent_a_watcher/webcmd_news');
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
    console.log(`[Pipeline] 🛡️ StockSentinel pipeline active. Polling interval: ${settings.pollIntervalSec}s`);

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
   * Execute one complete pipeline cycle
   */
  async runCycle(forceExplore = false) {
    console.log(`\n────────────────────────────────────────────────────────────`);
    console.log(`[Pipeline] 🔄 Cycle start: ${new Date().toLocaleTimeString()}`);

    try {
      // 1. Agent A: Poll signals via webcmd-learned workflow (powered by Scrapling)
      const pollResult = await watcher.pollSignals(forceExplore);
      console.log(`[Pipeline] Agent A [${pollResult.phase.toUpperCase()}]: Detected ${pollResult.count} ticker signals.`);

      for (const rawSignal of pollResult.signals) {
        // 2. Memory Dedup check
        if (dedup.isDuplicate(rawSignal)) {
          console.log(`[Pipeline] 🔇 Suppressed duplicate signal for ${rawSignal.ticker}: "${rawSignal.headline.slice(0, 50)}..."`);
          continue;
        }

        memoryStore.addSignal(rawSignal);

        // 3. Assemble context for The Strategist
        const contextPayload = contextBuilder.buildContext(rawSignal);

        // 4. The Strategist: Reason on catalyst using local Qwen 2.5 7B (Epsilon)
        console.log(`[Pipeline] 🧠 Reasoning with local Qwen 2.5 7B on ${rawSignal.ticker}...`);
        const proposal = await epsilonClient.generateProposal(contextPayload);
        proposal.headline = rawSignal.headline;
        proposal.snippet = rawSignal.snippet;

        // 5. Submit to Human Approval Gate (Telegram + Live Web Dashboard)
        const queued = gateLogic.submitProposal(proposal);
        this.emit('new_proposal', queued);
      }
    } catch (err) {
      console.error(`[Pipeline] Error in cycle: ${err.message}`);
    }

    console.log(`[Pipeline] 🏁 Cycle completed.\n`);
  }
}

module.exports = new SentinelPipeline();
