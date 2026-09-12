/**
 * StockSentinel — Main Application Entry Point
 * Self-Learning, Human-Gated Trading Agent
 * Hosted by webcmd | SLAB Hackathon @ MAIT
 */

require('dotenv').config();
const pipeline = require('./orchestration/pipeline');
const dashboardServer = require('./approval_gate/server');
const telegramBot = require('./approval_gate/telegram_bot');
const insightsBot = require('./approval_gate/insights_bot');
const settings = require('./config/settings');

console.log(`
╔══════════════════════════════════════════════════════════════╗
║                     STOCKSENTINEL v1.0                       ║
║       A Self-Learning, Human-Gated Trading Agent             ║
║                                                              ║
║  Philosophy: Watch tirelessly. Reason clearly.               ║
║              Prepare precisely. Act only on command.         ║
╚══════════════════════════════════════════════════════════════╝
`);

async function bootstrap() {
  try {
    // 1. Start Web Cockpit & WebSocket Server
    dashboardServer.start();

    // 2. Report bot statuses
    if (settings.telegram.token) {
      console.log('[System] Approval Gate Bot: ACTIVE — BUY/SELL proposals sent to your phone.');
    } else {
      console.log('[System] Approval Gate Bot: STANDBY. (Add TELEGRAM_BOT_TOKEN to .env)');
    }

    if (settings.insightsBot.token) {
      const chatStatus = settings.insightsBot.chatId ? `Chat ID: ${settings.insightsBot.chatId}` : 'Send /start to your insights bot to link it';
      console.log(`[System] Market Insights Bot: ACTIVE — ${chatStatus}`);
    } else {
      console.log('[System] Market Insights Bot: STANDBY. (Add INSIGHTS_BOT_TOKEN to .env)');
    }

    // 3. Forward new proposals to insights bot as a lightweight signal ping
    pipeline.on('new_proposal', (proposal) => insightsBot.notifyNewSignal(proposal));

    // 4. Report Local LLM Epsilon Engine status
    console.log(`[System] Reasoning Layer: Local Epsilon Engine (${settings.epsilon.tier.toUpperCase()} / Qwen 2.5 7B)`);

    // 4. Pre-launch Visible Browser immediately on desktop
    console.log('[System] Launching visible desktop browser automation window...');
    const webcmd = require('./agents/webcmd_adapter');
    const chartTab = await webcmd.focusTab('chart');
    try {
      await chartTab.goto('https://in.tradingview.com/chart/?symbol=NSE%3ATATAMOTORS', { waitUntil: 'domcontentloaded', timeout: 25000 });
      await webcmd.injectHUD(chartTab, 'STOCKSENTINEL :: READY', 'Monitoring Indian Equities (NSE) — TradingView Live Automation', '#10b981');
      webcmd.focusWindowOnWindows();
    } catch (e) {
      console.warn('[System] Initial chart navigation notice:', e.message);
    }

    console.log('[System] Browser window active on TradingView India. Starting multi-agent pipeline immediately...');

    // 5. Start Multi-Agent Orchestration Pipeline
    await pipeline.start();

  } catch (err) {
    console.error('[System] Fatal error during startup:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[System] Shutting down StockSentinel gracefully...');
  pipeline.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  pipeline.stop();
  process.exit(0);
});

bootstrap();
