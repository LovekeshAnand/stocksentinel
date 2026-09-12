/**
 * StockSentinel Market Insights Bot
 *
 * A dedicated second Telegram bot that:
 *   1. Auto-detects its Chat ID the first time you send /start to it.
 *   2. Saves the Chat ID to .env automatically (no manual copy-paste needed).
 *   3. Pushes a full watchlist market insights summary on a configurable schedule.
 *   4. Responds to /insights, /watchlist, /status, /pause, /resume on demand.
 *
 * This bot is READ-ONLY — it never sends trade proposals or approval requests.
 * Those are handled by the main Approval Gate bot (telegram_bot.js).
 *
 * Setup:
 *   1. Create a new bot via @BotFather → /newbot
 *   2. Add INSIGHTS_BOT_TOKEN=<token> to .env
 *   3. Run `npm start` and send /start to your new bot
 *   4. Chat ID is auto-detected and written to INSIGHTS_BOT_CHAT_ID in .env
 */

const fs       = require('fs');
const path     = require('path');
const settings = require('../config/settings');
const memoryStore  = require('../memory/store');
const watchlistCfg = require('../config/watchlist');

class InsightsBot {
  constructor() {
    this.token     = settings.insightsBot.token;
    this.chatId    = settings.insightsBot.chatId;
    this.intervalMin = settings.insightsBot.intervalMin;
    this.polling   = false;
    this.paused    = false;
    this.offset    = 0;
    this.timer     = null;

    if (!this.token) {
      console.log('[InsightsBot] No INSIGHTS_BOT_TOKEN set. Add your second bot token to .env to activate.');
      return;
    }

    this.startPolling();
    this.schedulePeriodicInsights();
    console.log(`[InsightsBot] Market Insights Bot active. Periodic push every ${this.intervalMin} min.`);

    // Push initial market insights immediately on startup (zero delay)
    if (this.chatId) {
      setTimeout(() => {
        console.log('[InsightsBot] ⚡ Pushing immediate startup market insights to Telegram...');
        this.sendMessage(this.chatId, this.buildInsightsMessage());
      }, 1200);
    }
  }

  // ── Telegram API wrapper ──────────────────────────────────────────────────

  async callApi(method, body = {}) {
    if (!this.token) return null;
    const url = `https://api.telegram.org/bot${this.token}/${method}`;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res  = await fetch(url, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body)
        });
        const data = await res.json();
        if (!data.ok) console.warn(`[InsightsBot] API error on ${method}:`, data.description);
        return data;
      } catch (err) {
        if (attempt === 1) {
          await new Promise(r => setTimeout(r, 600));
          continue;
        }
        console.error(`[InsightsBot] Network error on ${method}:`, err.message);
        return null;
      }
    }
  }

  async sendMessage(chatId, text, parseMode = 'HTML') {
    const body = { chat_id: chatId, text };
    if (parseMode) body.parse_mode = parseMode;
    const res = await this.callApi('sendMessage', body);
    if (!res || !res.ok) {
      // Fallback: strip HTML tags and resend as plain text
      const plainText = text.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      return this.callApi('sendMessage', { chat_id: chatId, text: plainText });
    }
    return res;
  }

  // ── Long-polling loop ─────────────────────────────────────────────────────

  async startPolling() {
    if (this.polling) return;
    this.polling = true;

    while (this.polling) {
      try {
        const data = await this.callApi('getUpdates', { offset: this.offset, timeout: 20 });
        if (data?.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            this.offset = update.update_id + 1;
            if (update.message) await this.handleMessage(update.message);
          }
        }
      } catch (err) {
        console.warn('[InsightsBot] Polling notice:', err.message);
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  stopPolling() { this.polling = false; }

  // ── Message handler ───────────────────────────────────────────────────────

  async handleMessage(msg) {
    const chatId = String(msg.chat.id);
    const text   = (msg.text || '').trim();

    // ── Auto-detect & save Chat ID on first contact ──────────────────────────
    if (!this.chatId || this.chatId !== chatId) {
      this.chatId = chatId;
      settings.insightsBot.chatId = chatId;
      this.saveChatIdToEnv(chatId);
      console.log(`[InsightsBot] Chat ID auto-detected and saved: ${chatId}`);
    }

    if (!text) return;

    if (text.startsWith('/start')) {
      const welcome = [
        '*StockSentinel Market Insights Bot — Connected*',
        '',
        `Your Chat ID: \`${chatId}\` _(saved automatically)_`,
        '',
        'I will push a watchlist market summary every ' + this.intervalMin + ' minutes.',
        '',
        '*Commands:*',
        '• /insights — Get market insights right now',
        '• /watchlist — View your monitored NSE tickers',
        '• /status — Agent pipeline and memory status',
        '• /pause — Pause periodic push notifications',
        '• /resume — Resume periodic push notifications',
        '',
        '_This bot is read-only. Trade approvals go to your other bot._'
      ].join('\n');
      return this.sendMessage(chatId, welcome);
    }

    if (text.startsWith('/insights')) {
      return this.sendMessage(chatId, this.buildInsightsMessage());
    }

    if (text.startsWith('/watchlist')) {
      const list = watchlistCfg.tickers.map(t =>
        `• *${t.symbol}* — ${t.name}\n  Sector: ${t.sector}`
      ).join('\n\n');
      return this.sendMessage(chatId, `*Monitored Watchlist (NSE)*\n\n${list}`);
    }

    if (text.startsWith('/status')) {
      const proposals = memoryStore.data.proposals || [];
      const pending   = proposals.filter(p => p.status === 'PENDING').length;
      const approved  = proposals.filter(p => p.status === 'APPROVED').length;
      const rejected  = proposals.filter(p => p.status === 'REJECTED').length;
      const totalSig  = (memoryStore.data.signals || []).length;
      const statusMsg = [
        '*Pipeline Status*',
        '',
        `Signals ingested: *${totalSig}*`,
        `Proposals generated: *${proposals.length}*`,
        `  — Pending: *${pending}*`,
        `  — Approved: *${approved}*`,
        `  — Rejected: *${rejected}*`,
        '',
        `Insights push interval: every *${this.intervalMin} min* | ${this.paused ? '_Paused_' : '_Active_'}`
      ].join('\n');
      return this.sendMessage(chatId, statusMsg);
    }

    if (text.startsWith('/pause')) {
      this.paused = true;
      return this.sendMessage(chatId, '_Periodic insights paused. Send /resume to re-activate._');
    }

    if (text.startsWith('/resume')) {
      this.paused = false;
      return this.sendMessage(chatId, '_Periodic insights resumed._');
    }

    // Unknown — send a helpful hint
    const hint = [
      `I received: _"${text}"_`,
      '',
      'Commands: /insights  /watchlist  /status  /pause  /resume'
    ].join('\n');
    return this.sendMessage(chatId, hint);
  }

  // ── Periodic insights scheduler ───────────────────────────────────────────

  schedulePeriodicInsights() {
    if (this.intervalMin <= 0) return; // 0 = on-demand only

    const ms = this.intervalMin * 60 * 1000;
    this.timer = setInterval(async () => {
      if (this.paused || !this.chatId) return;
      console.log('[InsightsBot] Pushing scheduled market insights...');
      try {
        await this.sendMessage(this.chatId, this.buildInsightsMessage());
      } catch (err) {
        console.warn('[InsightsBot] Could not send scheduled insights:', err.message);
      }
    }, ms);
  }

  // ── Insights message builder ──────────────────────────────────────────────

  buildInsightsMessage() {
    const parts = watchlistCfg.tickers.map(t => {
      const ctx            = memoryStore.getTickerContext(t.symbol);
      const recentProposal = (memoryStore.data.proposals || []).filter(p => p.ticker === t.symbol).slice(-1)[0];
      const recentSignal   = (memoryStore.data.signals   || []).filter(s => s.ticker === t.symbol && s.headline).slice(-1)[0];

      const filled = Math.round(ctx.trustScore * 10);
      const bar    = '\u2588'.repeat(filled) + '\u2591'.repeat(10 - filled);

      const lastAction = recentProposal
        ? `${recentProposal.action.toUpperCase()} (${recentProposal.confidence || 'medium'})`
        : 'Monitoring';

      const headline = recentSignal
        ? (recentSignal.headline.slice(0, 80) + (recentSignal.headline.length > 80 ? '...' : ''))
        : 'No recent headline';

      return [
        `<b>${escapeHtml(t.symbol)}</b> — ${escapeHtml(t.sector)}`,
        `  Trust: [${bar}] ${(ctx.trustScore * 100).toFixed(0)}% | Signal: <b>${escapeHtml(lastAction)}</b>`,
        `  <i>${escapeHtml(headline)}</i>`
      ].join('\n');
    });

    const timeStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    return [
      '📊 <b>Market Insights — Watchlist (NSE)</b>',
      `<i>${timeStr} IST</i>`,
      '\u2500'.repeat(24),
      ...parts
    ].join('\n\n');
  }

  // ── Persist Chat ID to .env ───────────────────────────────────────────────

  saveChatIdToEnv(chatId) {
    try {
      const envPath = path.resolve(__dirname, '..', '.env');
      if (!fs.existsSync(envPath)) return;

      let content = fs.readFileSync(envPath, 'utf-8');

      if (content.includes('INSIGHTS_BOT_CHAT_ID=')) {
        content = content.replace(/INSIGHTS_BOT_CHAT_ID=.*/, `INSIGHTS_BOT_CHAT_ID=${chatId}`);
      } else {
        content += `\nINSIGHTS_BOT_CHAT_ID=${chatId}\n`;
      }

      fs.writeFileSync(envPath, content, 'utf-8');
      console.log(`[InsightsBot] Saved INSIGHTS_BOT_CHAT_ID=${chatId} to .env`);
    } catch (err) {
      console.warn('[InsightsBot] Could not write Chat ID to .env:', err.message);
    }
  }

  // ── Called by pipeline whenever a new proposal is generated ──────────────
  // Sends a lightweight market-intel ping (not an approval request).

  async notifyNewSignal(proposal) {
    if (!this.chatId || this.paused) return;
    if (proposal.action === 'watch_only') return; // Never send noise

    const priceStr = proposal.chartSignal?.price
      ? '₹' + Number(proposal.chartSignal.price).toLocaleString('en-IN')
      : '';

    const lines = [
      `⚡ <b>New Signal Detected — NSE:${escapeHtml(proposal.ticker)}</b>`,
      `Action: <b>${escapeHtml(proposal.action.toUpperCase())}</b> | Confidence: <code>${escapeHtml(proposal.confidence)}</code>`,
      priceStr ? `Price: <b>${priceStr}</b> | RSI: <code>${proposal.chartSignal?.rsi || 'N/A'}</code>` : '',
      `<i>${escapeHtml(proposal.rationale.slice(0, 130))}...</i>`,
      '',
      '<i>Approval request sent to your main bot.</i>'
    ].filter(Boolean).join('\n');

    try {
      await this.sendMessage(this.chatId, lines, 'HTML');
    } catch (err) {
      console.warn('[InsightsBot] Signal notify error:', err.message);
    }
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = new InsightsBot();
