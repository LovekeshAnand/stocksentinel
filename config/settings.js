/**
 * StockSentinel Settings Configuration
 */
require('dotenv').config();
const path = require('path');

module.exports = {
  // Polling interval in seconds
  pollIntervalSec: parseInt(process.env.POLL_INTERVAL_SEC || '30', 10),

  // Web Server Port
  port: parseInt(process.env.PORT || '3000', 10),

  // Telegram Config
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || ''
  },

  // Local Epsilon Engine Configuration (Qwen 2.5 7B)
  epsilon: {
    enginePath: path.resolve(__dirname, '..', process.env.EPSILON_ENGINE_PATH || 'engine'),
    tier: process.env.EPSILON_TIER || 'balanced', // balanced = Qwen2.5-Coder 7B
    timeoutMs: parseInt(process.env.EPSILON_TIMEOUT_MS || '60000', 10)
  },

  // Paper Trading Configuration
  paperTrading: {
    platform: 'TradingView',
    url: process.env.PAPER_TRADING_URL || 'https://www.tradingview.com/chart/',
    timeoutMs: 30000,
    headless: false // Show browser window for live demo visibility
  },

  // News Sources
  newsSources: [
    {
      id: 'yahoo-finance',
      name: 'Yahoo Finance Top Market News',
      url: 'https://finance.yahoo.com/topic/stock-market-news/',
      selectorHints: {
        itemSelector: 'section[data-testid="storyitem"], li.stream-item, .js-stream-content',
        headlineSelector: 'h3, a.subtle-link, a',
        snippetSelector: 'p',
        timeSelector: 'time, span.publishing'
      }
    },
    {
      id: 'marketwatch',
      name: 'MarketWatch Top Stories',
      url: 'https://www.marketwatch.com/markets',
      selectorHints: {
        itemSelector: '.article__content, .element--article',
        headlineSelector: '.article__headline a, h3 a',
        snippetSelector: '.article__summary, p',
        timeSelector: '.article__timestamp'
      }
    }
  ],

  // Storage Paths
  storage: {
    dataDir: path.resolve(__dirname, '..', 'data'),
    memoryFile: path.resolve(__dirname, '..', 'data', 'memory.json'),
    learnedCommandsDir: path.resolve(__dirname, '..', 'data', 'learned_commands')
  }
};
