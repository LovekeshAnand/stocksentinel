/**
 * StockSentinel Telegram Approval Gate Bot
 * Native long-polling Telegram client (zero-dependency, robust across all environments)
 * Provides interactive push alerts, inline buttons, and auto-detects user Chat ID!
 */

const fs = require('fs');
const path = require('path');
const settings = require('../config/settings');
const gateLogic = require('./gate_logic');
const memoryStore = require('../memory/store');

class SentinelTelegramBot {
  constructor() {
    this.token = settings.telegram.token;
    this.chatId = settings.telegram.chatId;
    this.polling = false;
    this.offset = 0;
    this.activeModifications = new Map(); // chatId -> proposalId waiting for new quantity

    if (this.token && this.token !== 'your_bot_token_here') {
      this.startPolling();
    } else {
      console.log('[TelegramBot] ⚠️ No valid TELEGRAM_BOT_TOKEN set in .env. Bot is in standby mode.');
    }

    // Bind to gate events
    gateLogic.on('proposal_created', (proposal) => this.sendProposalAlert(proposal));
    gateLogic.on('proposal_approved', (proposal) => this.notifyExecution(proposal));
  }

  async callApi(method, body = {}) {
    if (!this.token) return null;
    const url = `https://api.telegram.org/bot${this.token}/${method}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!data.ok) {
        console.warn(`[TelegramBot] API Error on ${method}:`, data.description);
      }
      return data;
    } catch (err) {
      console.error(`[TelegramBot] Network Error on ${method}:`, err.message);
      return null;
    }
  }

  async startPolling() {
    if (this.polling) return;
    this.polling = true;
    console.log('[TelegramBot] 🤖 Native Telegram poller active. Listening for messages from your phone...');

    while (this.polling) {
      try {
        const data = await this.callApi('getUpdates', {
          offset: this.offset,
          timeout: 25
        });

        if (data && data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            this.offset = update.update_id + 1;
            await this.handleUpdate(update);
          }
        }
      } catch (err) {
        console.warn('[TelegramBot] Polling loop notice:', err.message);
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  stopPolling() {
    this.polling = false;
  }

  async handleUpdate(update) {
    if (update.message) {
      await this.handleIncomingMessage(update.message);
    } else if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
    }
  }

  async handleIncomingMessage(msg) {
    const chatId = msg.chat.id;
    const text = (msg.text || '').trim();

    // Auto-capture Chat ID
    if (!this.chatId || this.chatId !== String(chatId)) {
      this.chatId = String(chatId);
      settings.telegram.chatId = this.chatId;
      console.log(`\n======================================================`);
      console.log(`[TelegramBot] 🎉 YOUR TELEGRAM CHAT ID CAPTURED: ${chatId}`);
      console.log(`======================================================\n`);
      this.saveChatIdToEnv(chatId);
    }

    if (!text) return;

    if (text.startsWith('/start')) {
      const welcome = `
🛡️ *StockSentinel Approval Gate Connected!*

Your Chat ID is: \`${chatId}\`
I am now actively linked to your phone for all trade approvals!

*Commands:*
• /status - View agent status & pending approvals
• /demo - Trigger a test market signal right now
• /watchlist - View active watchlisted tickers
• /trust - View memory trust score graph per ticker
• /help - Display full operational manual

*CRITICAL RULE:*
I will *NEVER* submit an order without your explicit confirmation tap!
`.trim();
      return this.sendMessage(chatId, welcome);
    }

    if (text.startsWith('/status')) {
      const pending = gateLogic.getPendingList();
      const statusText = `
📊 *System Cockpit Status*
• Active Watchlist: TSLA, NVDA, AAPL, MSFT, GOOGL
• Reasoning Engine: Local Epsilon Qwen 2.5 7B
• Pending Human Approvals: *${pending.length}*
${pending.map(p => `  - [${p.id}] ${p.ticker} ${p.action.toUpperCase()} (${p.suggested_quantity} units)`).join('\n')}
`.trim();
      return this.sendMessage(chatId, statusText);
    }

    if (text.startsWith('/demo')) {
      const mockProposal = {
        ticker: 'TSLA',
        action: 'buy',
        suggested_quantity: 15,
        confidence: 'high',
        rationale: 'Tesla announced European regulatory green-light for Cybercab fleet trials ahead of schedule, sparking heavy pre-market momentum.',
        headline: 'Tesla expands European robotaxi pilot with formal regulatory clearance',
        engine: 'Local Qwen 2.5 7B'
      };
      gateLogic.submitProposal(mockProposal);
      return this.sendMessage(chatId, '⚡ *Demo proposal generated!* Review below:');
    }

    if (text.startsWith('/watchlist')) {
      const watchlist = require('../config/watchlist');
      const list = watchlist.tickers.map(t => `• *${t.symbol}* (${t.name})\n  Sector: ${t.sector} | Default Qty: ${t.defaultQuantity}`).join('\n\n');
      return this.sendMessage(chatId, `📋 *Active Sentinel Watchlist*\n\n${list}`);
    }

    if (text.startsWith('/trust')) {
      const watchlist = require('../config/watchlist');
      const stats = watchlist.tickers.map(t => {
        const ctx = memoryStore.getTickerContext(t.symbol);
        const bar = '█'.repeat(Math.round(ctx.trustScore * 10)) + '░'.repeat(10 - Math.round(ctx.trustScore * 10));
        return `• *${t.symbol}*: [${bar}] ${(ctx.trustScore * 100).toFixed(0)}%\n  Approved: ${ctx.approvedCount} | Rejected: ${ctx.rejectedCount} | Last: ${ctx.lastDecision || 'None'}`;
      }).join('\n\n');
      return this.sendMessage(chatId, `🧠 *Memory Layer — User Trust Ratings*\n\n${stats}\n\n_Trust scores dynamically tune Strategist proposal confidence._`);
    }

    if (text.startsWith('/help')) {
      const help = `
🤖 *StockSentinel Commands & Controls*

• /start - Connect chat and wake the agent
• /status - View pending approvals & active engine
• /demo - Trigger a live simulated trade proposal
• /watchlist - View actively monitored tickers
• /trust - View memory trust score graph per ticker
• /help - View this guide

💡 *Interactive Natural Language*:
You can ask me questions anytime (e.g., "What do you think of TSLA?", "What is your strategy?").
`.trim();
      return this.sendMessage(chatId, help);
    }

    // Check if user is answering a quantity modification request
    const modProposalId = this.activeModifications.get(chatId);
    if (modProposalId) {
      const newQty = parseInt(text, 10);
      if (!isNaN(newQty) && newQty > 0) {
        this.activeModifications.delete(chatId);
        gateLogic.modifyAndApprove(modProposalId, { quantity: newQty });
        return this.sendMessage(chatId, `✏️ *Quantity updated to ${newQty}!* Trade approved and sent to Agent B for paper trading pre-fill.`);
      } else {
        return this.sendMessage(chatId, '❌ Please enter a valid positive number for quantity.');
      }
    }

    // Natural Language / Unknown Query Handler
    console.log(`[TelegramBot] 💬 Handling natural query from user: "${text}"`);
    await this.handleUnknownQuery(chatId, text);
  }

  async handleCallbackQuery(query) {
    const data = query.data || '';
    const [action, param] = data.split(':');
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    try {
      if (action === 'approve') {
        gateLogic.approveProposal(param, 'Approved via Telegram button');
        await this.callApi('answerCallbackQuery', { callback_query_id: query.id, text: 'Trade Approved!' });
        await this.callApi('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: query.message.text + `\n\n✅ *STATUS: APPROVED BY YOU*\n⚡ *Agent B pre-filling order on TradingView...*`,
          parse_mode: 'Markdown'
        });
      } else if (action === 'reject') {
        gateLogic.rejectProposal(param, 'Rejected via Telegram button');
        await this.callApi('answerCallbackQuery', { callback_query_id: query.id, text: 'Trade Rejected' });
        await this.callApi('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: query.message.text + `\n\n❌ *STATUS: REJECTED BY YOU*\nLogged to memory. No action taken.`,
          parse_mode: 'Markdown'
        });
      } else if (action === 'modify') {
        this.activeModifications.set(chatId, param);
        await this.callApi('answerCallbackQuery', { callback_query_id: query.id, text: 'Type new quantity' });
        await this.sendMessage(chatId, `✏️ Please type the *new quantity* you wish to execute for proposal *${param}*:`);
      } else if (action === 'demo') {
        const sym = param || 'TSLA';
        await this.callApi('answerCallbackQuery', { callback_query_id: query.id, text: `Simulating ${sym}...` });
        gateLogic.submitProposal({
          ticker: sym,
          action: 'buy',
          suggested_quantity: 15,
          confidence: 'high',
          headline: `${sym} records strong upside catalyst with record market volume`,
          rationale: `Strong momentum breakout detected on ${sym}. Favorable risk/reward profile for strategic long entry.`,
          engine: 'Local Qwen 2.5 7B'
        });
      } else if (data === 'cmd_status') {
        await this.callApi('answerCallbackQuery', { callback_query_id: query.id, text: 'Loading status...' });
        const pending = gateLogic.getPendingList();
        await this.sendMessage(chatId, `📊 *Cockpit Status*\nPending Approvals: *${pending.length}*\nWatching: *TSLA, NVDA, AAPL, MSFT, GOOGL*`);
      }
    } catch (err) {
      await this.callApi('answerCallbackQuery', { callback_query_id: query.id, text: `Notice: ${err.message}` });
    }
  }

  async handleUnknownQuery(chatId, query) {
    const lower = query.toLowerCase();
    const watchlist = require('../config/watchlist');

    // 1. Ticker match
    const matchedTicker = watchlist.tickers.find(t => 
      lower.includes(t.symbol.toLowerCase()) || 
      lower.includes(t.name.toLowerCase()) ||
      t.keywords.some(kw => lower.includes(kw.toLowerCase()))
    );

    if (matchedTicker) {
      const sym = matchedTicker.symbol;
      const ctx = memoryStore.getTickerContext(sym);
      const recentSignal = memoryStore.data.signals.filter(s => s.ticker === sym).slice(-1)[0];
      const recentProposal = memoryStore.data.proposals.filter(p => p.ticker === sym).slice(-1)[0];
      const scorePct = Math.round(ctx.trustScore * 100);
      const bar = '█'.repeat(Math.round(ctx.trustScore * 10)) + '░'.repeat(10 - Math.round(ctx.trustScore * 10));

      const reply = `
📊 *Ticker Intelligence: ${sym}* (${matchedTicker.name})
Sector: \`${matchedTicker.sector}\`
━━━━━━━━━━━━━━━━━━━━━━━━
🧠 *Memory Trust Rating:* [${bar}] *${scorePct}%*
• Approved: \`${ctx.approvedCount}\` | Rejected: \`${ctx.rejectedCount}\`
• Last Decision: \`${ctx.lastDecision || 'None yet'}\`

📰 *Latest Catalyst:*
"${recentSignal ? recentSignal.headline : 'No recent headlines detected for ' + sym}"

🎯 *Latest Strategist Proposal:*
${recentProposal ? `*${recentProposal.action.toUpperCase()}* (${recentProposal.suggested_quantity} units) — _${recentProposal.rationale}_` : 'No active proposal. Waiting for next market catalyst.'}
`.trim();

      return this.sendMessage(chatId, reply, [
        [{ text: `⚡ Test ${sym} Signal`, callback_data: `demo:${sym}` }]
      ]);
    }

    // 2. Identity or rules inquiry
    if (lower.includes('who are you') || lower.includes('how it works') || lower.includes('strategy') || lower.includes('what is this') || lower.includes('rules')) {
      const explain = `
🛡️ *About StockSentinel*

StockSentinel is an advanced *human-gated trading agent* built for the SLAB Hackathon:

1. 👁️ *The Watcher (Agent A)*: Scrapes financial news in milliseconds via *Scrapling* and maps DOM structures using *webcmd*.
2. 🧠 *The Strategist*: Uses a local *Qwen 2.5 7B LLM (Epsilon)* to evaluate news catalysts against your historical trust profile.
3. 📱 *Human Approval Gate*: Sends interactive alerts here. *NO ORDER CAN PROCEED WITHOUT YOUR EXPLICIT TAP!*
4. ⚡ *The Executor (Agent B)*: Navigates to TradingView Paper Trading, pre-fills the ticket, and *strictly halts before confirm*.

💡 *Core Philosophy*: _Watch tirelessly. Reason clearly. Prepare precisely. Act only on command._
`.trim();
      return this.sendMessage(chatId, explain);
    }

    // 3. Fallback
    const fallbackText = `
💬 *StockSentinel Assistant*

I received: _"${query}"_

I am actively monitoring the markets for: *TSLA, NVDA, AAPL, MSFT, GOOGL*.
Whenever breaking news breaks on these tickers, I'll formulate a trade proposal and ask for your approval here!

📌 *Quick Actions:*
• /status — Check pipeline status
• /demo — Simulate a trade proposal
• /watchlist — View tracked stocks
• /trust — View memory trust scores
`.trim();

    return this.sendMessage(chatId, fallbackText, [
      [
        { text: '⚡ Trigger Demo Signal', callback_data: 'demo:TSLA' },
        { text: '📊 Cockpit Status', callback_data: 'cmd_status' }
      ]
    ]);
  }

  async sendProposalAlert(proposal) {
    const targetChat = this.chatId || settings.telegram.chatId;
    if (!targetChat) {
      console.log(`[TelegramBot] ℹ️  Waiting for phone connection. Open Telegram, search @stocksentinxl_bot and send /start to capture your Chat ID.`);
      return;
    }

    const actionBadge = proposal.action.toUpperCase() === 'BUY' ? '🟢 BUY' : (proposal.action.toUpperCase() === 'SELL' ? '🔴 SELL' : '🟡 HOLD');

    const chartInfo = proposal.chartSignal 
      ? `📊 *Agent A1 (Chart Evidence):*\n• ${proposal.chartSignal.pattern_type}: ${proposal.chartSignal.pattern_details}\n• Price: $${proposal.chartSignal.price || 'N/A'} | RSI: ${proposal.chartSignal.rsi || 'N/A'}`
      : `📊 *Agent A1 (Chart Evidence):* Technical baseline active`;

    const newsInfo = proposal.newsSignal || proposal.headline
      ? `📰 *Agent A2 (News Evidence):*\n"${proposal.newsSignal?.headline || proposal.headline}"`
      : `📰 *Agent A2 (News Evidence):* Fundamental baseline active`;

    const text = `
🚨 *STOCKSENTINEL TRADE PROPOSAL* 🚨
━━━━━━━━━━━━━━━━━━━━━━━━
📈 *Ticker:* \`${proposal.ticker}\`
🎯 *Action:* *${actionBadge}*
🔢 *Quantity:* \`${proposal.suggested_quantity}\` units
📊 *Confidence:* \`${(proposal.confidence || 'medium').toUpperCase()}\`
🧠 *Engine:* \`${proposal.engine || 'Local Qwen 2.5 7B'}\`

${chartInfo}

${newsInfo}

💡 *Strategist Combined Rationale:*
${proposal.rationale}
━━━━━━━━━━━━━━━━━━━━━━━━
*HUMAN DECISION REQUIRED:*
Tap below to approve, reject, or adjust quantity.
`.trim();

    const inline_keyboard = [
      [
        { text: `✅ Approve (${proposal.suggested_quantity} ${proposal.ticker})`, callback_data: `approve:${proposal.id}` },
        { text: '❌ Reject', callback_data: `reject:${proposal.id}` }
      ],
      [
        { text: '✏️ Modify Quantity', callback_data: `modify:${proposal.id}` }
      ]
    ];

    await this.sendMessage(targetChat, text, inline_keyboard);
    console.log(`[TelegramBot] 📤 Proposal alert sent to Telegram chat: ${targetChat}`);
  }

  async notifyExecution(proposal) {
    const targetChat = this.chatId || settings.telegram.chatId;
    if (!targetChat) return;

    const message = `
⚡ *Execution Notice* ⚡
Agent B has received your approval for *${proposal.ticker}* (${proposal.action.toUpperCase()} ${proposal.suggested_quantity} shares).
Order pre-fill in progress on TradingView Paper Trading.
Final submit click remains strictly unclicked awaiting your review.
`.trim();

    await this.sendMessage(targetChat, message);
  }

  async sendMessage(chatId, text, inlineKeyboard = null) {
    const body = {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    };
    if (inlineKeyboard) {
      body.reply_markup = { inline_keyboard: inlineKeyboard };
    }
    return await this.callApi('sendMessage', body);
  }

  saveChatIdToEnv(chatId) {
    try {
      const envPath = path.resolve(__dirname, '..', '.env');
      if (fs.existsSync(envPath)) {
        let content = fs.readFileSync(envPath, 'utf-8');
        if (content.includes('TELEGRAM_CHAT_ID=')) {
          content = content.replace(/TELEGRAM_CHAT_ID=.*/, `TELEGRAM_CHAT_ID=${chatId}`);
        } else {
          content += `\nTELEGRAM_CHAT_ID=${chatId}\n`;
        }
        fs.writeFileSync(envPath, content, 'utf-8');
        console.log(`[TelegramBot] 💾 Saved TELEGRAM_CHAT_ID=${chatId} to .env`);
      }
    } catch (err) {
      console.warn('[TelegramBot] Could not update .env with Chat ID:', err.message);
    }
  }
}

module.exports = new SentinelTelegramBot();
