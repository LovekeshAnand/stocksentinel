/**
 * StockSentinel Telegram Approval Gate Bot
 * Sends real-time trade proposals to Telegram with interactive inline buttons
 * Enforces human-in-the-loop control directly from your phone!
 */

const TelegramBot = require('node-telegram-bot-api');
const settings = require('../config/settings');
const gateLogic = require('./gate_logic');
const memoryStore = require('../memory/store');

class SentinelTelegramBot {
  constructor() {
    this.token = settings.telegram.token;
    this.chatId = settings.telegram.chatId;
    this.bot = null;
    this.activeModifications = new Map(); // chatId -> proposalId waiting for new quantity

    if (this.token && this.token !== 'your_bot_token_here') {
      this.init();
    } else {
      console.log('[TelegramBot] ⚠️ No valid TELEGRAM_BOT_TOKEN set in .env. Bot is in standby mode.');
    }

    // Bind to gate events
    gateLogic.on('proposal_created', (proposal) => this.sendProposalAlert(proposal));
    gateLogic.on('proposal_approved', (proposal) => this.notifyExecution(proposal));
  }

  init() {
    try {
      this.bot = new TelegramBot(this.token, { polling: true });
      console.log('[TelegramBot] 🤖 Telegram bot initialized and polling for commands.');
      this.registerHandlers();
    } catch (err) {
      console.error('[TelegramBot] Failed to start polling:', err.message);
    }
  }

  registerHandlers() {
    // /start command
    this.bot.onText(/\/start/, (msg) => {
      this.chatId = msg.chat.id;
      const welcome = `
🛡️ *StockSentinel Approval Gate* 🛡️

Welcome! I am your human-in-the-loop trading watchdog.
I watch financial news, reason on market catalysts via local Qwen 2.5 7B, and prepare paper trades.

*CRITICAL RULE*: I will *NEVER* submit a trade without your explicit confirmation click!

Commands:
• /status - View agent status & pending approvals
• /demo - Trigger a test market signal right now
• /watchlist - View active watchlisted tickers
• /help - Display instructions
`.trim();
      this.bot.sendMessage(msg.chat.id, welcome, { parse_mode: 'Markdown' });
      console.log(`[TelegramBot] User connected. Chat ID registered: ${msg.chat.id}`);
    });

    // /status command
    this.bot.onText(/\/status/, (msg) => {
      const pending = gateLogic.getPendingList();
      const statusText = `
📊 *System Cockpit Status*
• Active Watchlist: TSLA, NVDA, AAPL, MSFT, GOOGL
• Reasoning Engine: Epsilon Local Qwen 2.5 7B
• Pending Human Approvals: *${pending.length}*
${pending.map(p => `  - [${p.id}] ${p.ticker} ${p.action.toUpperCase()} (${p.suggested_quantity} units)`).join('\n')}
`.trim();
      this.bot.sendMessage(msg.chat.id, statusText, { parse_mode: 'Markdown' });
    });

    // /demo command to trigger a test proposal immediately
    this.bot.onText(/\/demo/, (msg) => {
      this.chatId = msg.chat.id;
      const mockProposal = {
        ticker: 'TSLA',
        action: 'buy',
        suggested_quantity: 15,
        confidence: 'high',
        rationale: 'Tesla announced European regulatory green-light for Cybercab fleet trials ahead of schedule, sparking heavy pre-market momentum.',
        headline: 'Tesla expands European robotaxi pilot with formal regulatory clearance'
      };
      gateLogic.submitProposal(mockProposal);
      this.bot.sendMessage(msg.chat.id, '⚡ *Demo proposal generated!* Review below:', { parse_mode: 'Markdown' });
    });

    // /watchlist command
    this.bot.onText(/\/watchlist/, (msg) => {
      const watchlist = require('../config/watchlist');
      const list = watchlist.tickers.map(t => `• *${t.symbol}* (${t.name})\n  Sector: ${t.sector} | Default Qty: ${t.defaultQuantity}`).join('\n\n');
      this.bot.sendMessage(msg.chat.id, `📋 *Active Sentinel Watchlist*\n\n${list}`, { parse_mode: 'Markdown' });
    });

    // /trust command
    this.bot.onText(/\/trust/, (msg) => {
      const watchlist = require('../config/watchlist');
      const stats = watchlist.tickers.map(t => {
        const ctx = memoryStore.getTickerContext(t.symbol);
        const bar = '█'.repeat(Math.round(ctx.trustScore * 10)) + '░'.repeat(10 - Math.round(ctx.trustScore * 10));
        return `• *${t.symbol}*: [${bar}] ${(ctx.trustScore * 100).toFixed(0)}%\n  Approved: ${ctx.approvedCount} | Rejected: ${ctx.rejectedCount} | Last: ${ctx.lastDecision || 'None'}`;
      }).join('\n\n');
      this.bot.sendMessage(msg.chat.id, `🧠 *Memory Layer — User Trust Ratings*\n\n${stats}\n\n_Trust scores dynamically tune Strategist proposal confidence._`, { parse_mode: 'Markdown' });
    });

    // /help command
    this.bot.onText(/\/help/, (msg) => {
      const help = `
🤖 *StockSentinel Commands & Controls*

• /start - Connect chat and wake the agent
• /status - View pending approvals & active engine
• /demo - Trigger a live simulated trade proposal
• /watchlist - View actively monitored tickers
• /trust - View memory trust score graph per ticker
• /help - View this guide

💡 *Interactive Natural Language*:
You can also ask me natural questions anytime!
Try asking:
- "What do you think of TSLA?"
- "Why do you need human approval?"
- "What is your strategy?"
`.trim();
      this.bot.sendMessage(msg.chat.id, help, { parse_mode: 'Markdown' });
    });

    // Handle all non-command text queries (Unknown Query Handler)
    this.bot.on('message', async (msg) => {
      if (!msg.text || msg.text.startsWith('/')) return;

      const chatId = msg.chat.id;
      this.chatId = chatId; // capture active user

      // Check if user was in middle of modifying a trade quantity
      const proposalId = this.activeModifications.get(chatId);
      if (proposalId) {
        const newQty = parseInt(msg.text.trim(), 10);
        if (!isNaN(newQty) && newQty > 0) {
          this.activeModifications.delete(chatId);
          const result = gateLogic.modifyAndApprove(proposalId, { quantity: newQty });
          this.bot.sendMessage(chatId, `✏️ *Quantity updated to ${newQty}!* Trade approved and sent to Agent B for paper trading pre-fill.`, { parse_mode: 'Markdown' });
        } else {
          this.bot.sendMessage(chatId, '❌ Please enter a valid positive number for quantity.');
        }
        return;
      }

      // Handle Arbitrary / Unknown User Queries with Financial Intelligence
      const query = msg.text.trim();
      console.log(`[TelegramBot] 💬 Received natural language query: "${query}"`);
      await this.handleUnknownQuery(chatId, query);
    });

    // Handle Inline Keyboard Button Taps
    this.bot.on('callback_query', async (query) => {
      const data = query.data || '';
      const [action, proposalId] = data.split(':');
      const chatId = query.message.chat.id;
      const messageId = query.message.message_id;

      try {
        if (action === 'approve') {
          const result = gateLogic.approveProposal(proposalId, 'Approved via Telegram button');
          await this.bot.answerCallbackQuery(query.id, { text: 'Trade Approved!' });
          await this.bot.editMessageText(
            query.message.text + `\n\n✅ *STATUS: APPROVED BY YOU*\n⚡ *Agent B pre-filling order on paper trading platform...*`,
            {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: 'Markdown'
            }
          );
        } else if (action === 'reject') {
          const result = gateLogic.rejectProposal(proposalId, 'Rejected via Telegram button');
          await this.bot.answerCallbackQuery(query.id, { text: 'Trade Rejected' });
          await this.bot.editMessageText(
            query.message.text + `\n\n❌ *STATUS: REJECTED BY YOU*\nLogged to memory. No action taken.`,
            {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: 'Markdown'
            }
          );
        } else if (action === 'modify') {
          this.activeModifications.set(chatId, proposalId);
          await this.bot.answerCallbackQuery(query.id, { text: 'Type new quantity' });
          this.bot.sendMessage(chatId, `✏️ Please type the *new quantity* you wish to execute for proposal *${proposalId}*:`, { parse_mode: 'Markdown' });
        } else if (action === 'demo') {
          const sym = proposalId || 'TSLA';
          await this.bot.answerCallbackQuery(query.id, { text: `Simulating ${sym}...` });
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
          await this.bot.answerCallbackQuery(query.id, { text: 'Loading status...' });
          const pending = gateLogic.getPendingList();
          this.bot.sendMessage(chatId, `📊 *Cockpit Status*\nPending Approvals: *${pending.length}*\nWatching: *TSLA, NVDA, AAPL, MSFT, GOOGL*`, { parse_mode: 'Markdown' });
        }
      } catch (err) {
        await this.bot.answerCallbackQuery(query.id, { text: `Error: ${err.message}` });
      }
    });
  }

  /**
   * Broadcast structured proposal to Telegram
   */
  async sendProposalAlert(proposal) {
    if (!this.bot) return;
    const targetChat = this.chatId || settings.telegram.chatId;
    if (!targetChat) {
      console.warn('[TelegramBot] No chatId registered yet. Send /start to the bot on Telegram.');
      return;
    }

    const actionBadge = proposal.action.toUpperCase() === 'BUY' ? '🟢 BUY' : (proposal.action.toUpperCase() === 'SELL' ? '🔴 SELL' : '🟡 HOLD');

    const text = `
🚨 *STOCK SENTINEL TRADE PROPOSAL* 🚨
━━━━━━━━━━━━━━━━━━━━━━━━
📈 *Ticker:* \`${proposal.ticker}\`
🎯 *Action:* *${actionBadge}*
🔢 *Quantity:* \`${proposal.suggested_quantity}\` units
📊 *Confidence:* \`${(proposal.confidence || 'medium').toUpperCase()}\`
🧠 *Engine:* \`${proposal.engine || 'Local Qwen 2.5 7B'}\`

📰 *Market Catalyst:*
"${proposal.headline || 'Incoming news wire'}"

💡 *Strategist Rationale:*
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

    try {
      await this.bot.sendMessage(targetChat, text, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard }
      });
      console.log(`[TelegramBot] 📤 Proposal alert sent to Telegram (${targetChat})`);
    } catch (err) {
      console.error('[TelegramBot] Failed to send Telegram alert:', err.message);
    }
  }

  /**
   * Intelligently handle arbitrary or unknown natural language user queries
   */
  async handleUnknownQuery(chatId, query) {
    if (!this.bot) return;

    const lower = query.toLowerCase();
    const watchlist = require('../config/watchlist');

    // 1. Check if user is asking about a specific ticker
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

      return this.bot.sendMessage(chatId, reply, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: `⚡ Test ${sym} Signal`, callback_data: `demo:${sym}` }]
          ]
        }
      });
    }

    // 2. Check if user is asking about system identity, philosophy, or strategy
    if (lower.includes('who are you') || lower.includes('how it works') || lower.includes('strategy') || lower.includes('philosophy') || lower.includes('what is this') || lower.includes('rules')) {
      const explain = `
🛡️ *About StockSentinel*

StockSentinel is an advanced *human-gated trading agent* built for the SLAB Hackathon:

1. 👁️ *The Watcher (Agent A)*: Scrapes financial news in milliseconds via *Scrapling* and maps DOM structures using *webcmd*.
2. 🧠 *The Strategist*: Uses a local *Qwen 2.5 7B LLM (Epsilon)* to evaluate news catalysts against your historical trust profile.
3. 📱 *Human Approval Gate*: Sends interactive alerts here. *NO ORDER CAN PROCEED WITHOUT YOUR EXPLICIT TAP!*
4. ⚡ *The Executor (Agent B)*: Navigates to TradingView Paper Trading, pre-fills the ticket, and *strictly halts before confirm*.

💡 *Core Philosophy*: _Watch tirelessly. Reason clearly. Prepare precisely. Act only on command._
`.trim();
      return this.bot.sendMessage(chatId, explain, { parse_mode: 'Markdown' });
    }

    // 3. Fallback intelligent response for general market/financial questions
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

    this.bot.sendMessage(chatId, fallbackText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '⚡ Trigger Demo Signal', callback_data: 'demo:TSLA' },
            { text: '📊 Cockpit Status', callback_data: 'cmd_status' }
          ]
        ]
      }
    });
  }

  /**
   * Notify execution progress
   */
  async notifyExecution(proposal) {
    if (!this.bot) return;
    const targetChat = this.chatId || settings.telegram.chatId;
    if (!targetChat) return;

    const message = `
⚡ *Execution Notice* ⚡
Agent B has received your approval for *${proposal.ticker}* (${proposal.action.toUpperCase()} ${proposal.suggested_quantity} shares).
Order pre-fill in progress on the paper trading platform.
Final submit click remains strictly unclicked awaiting your review.
`.trim();

    this.bot.sendMessage(targetChat, message, { parse_mode: 'Markdown' }).catch(() => {});
  }
}

module.exports = new SentinelTelegramBot();
