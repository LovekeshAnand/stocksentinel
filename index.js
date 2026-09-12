/**
 * StockSentinel — Main Application Entry Point
 * Self-Learning, Human-Gated Trading Agent
 * Hosted by webcmd | SLAB Hackathon @ MAIT
 */

require('dotenv').config();
const pipeline = require('./orchestration/pipeline');
const dashboardServer = require('./approval_gate/server');
const telegramBot = require('./approval_gate/telegram_bot');
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

    // 2. Report Telegram Bot status
    if (settings.telegram.token && settings.telegram.token !== 'your_bot_token_here') {
      console.log('[System] 📱 Telegram Approval Gate: ACTIVE.');
    } else {
      console.log('[System] ℹ️  Telegram Approval Gate: STANDBY. (Add TELEGRAM_BOT_TOKEN to .env to connect your phone)');
    }

    // 3. Report Local LLM Epsilon Engine status
    console.log(`[System] 🧠 Reasoning Layer: Local Epsilon Engine (${settings.epsilon.tier.toUpperCase()} / Qwen 2.5 7B)`);

    // 4. Pre-launch Visible Browser immediately on desktop
    console.log('[System] 🚀 Launching visible browser automation window...');
    const webcmd = require('./agents/webcmd_adapter');
    const chartPage = await webcmd.focusTab('chart');
    const targetUrl = settings.chartSources[0].url;
    console.log(`[System] 👁️  Opening Indian Market Screener: ${targetUrl}`);
    chartPage.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
      .then(() => webcmd.injectHUD(chartPage, 'AGENT A1 (CHART WATCHER)', 'Monitoring Indian Equities (NSE/BSE): Volume Spikes & MA Breakouts', '#10b981'))
      .catch(() => {});

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
