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

    // Text reply for quantity modification
    this.bot.on('message', (msg) => {
      if (msg.text && msg.text.startsWith('/')) return; // handled by commands

      const proposalId = this.activeModifications.get(msg.chat.id);
      if (proposalId) {
        const newQty = parseInt(msg.text.trim(), 10);
        if (!isNaN(newQty) && newQty > 0) {
          this.activeModifications.delete(msg.chat.id);
          const result = gateLogic.modifyAndApprove(proposalId, { quantity: newQty });
          this.bot.sendMessage(msg.chat.id, `✏️ *Quantity updated to ${newQty}!* Trade approved and sent to Agent B for paper trading pre-fill.`, { parse_mode: 'Markdown' });
        } else {
          this.bot.sendMessage(msg.chat.id, '❌ Please enter a valid positive number for quantity.');
        }
      }
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
