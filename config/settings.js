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

  // Approval Gate Bot (trade proposals)
  telegram: {
    token:  process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID   || ''
  },

  // Market Insights Bot (periodic watchlist summaries — second bot)
  insightsBot: {
    token:       process.env.INSIGHTS_BOT_TOKEN        || '',
    chatId:      process.env.INSIGHTS_BOT_CHAT_ID      || '',
    intervalMin: parseInt(process.env.INSIGHTS_INTERVAL_MIN || '30', 10)
  },

  // Local Epsilon Engine Configuration (Qwen 2.5 7B)
  epsilon: {
    enginePath: path.resolve(__dirname, '..', process.env.EPSILON_ENGINE_PATH || 'engine'),
    tier: process.env.EPSILON_TIER || 'balanced', // balanced = Qwen2.5-Coder 7B
    timeoutMs: parseInt(process.env.EPSILON_TIMEOUT_MS || '60000', 10)
  },

  // Paper Trading Configuration
  paperTrading: {
    platform: 'TradingView India',
    url: process.env.PAPER_TRADING_URL || 'https://in.tradingview.com/chart/',
    timeoutMs: 30000,
    headless: false // Show browser window for live visual automation
  },

  // Chart & Screener Sources (Agent A1) — Indian Equities (NSE/BSE)
  chartSources: [
    {
      id: 'tradingview-india',
      name: 'TradingView India Screener (NSE)',
      url: 'https://in.tradingview.com/markets/stocks-india/market-movers-gainers/',
      selectorHints: {
        tableSelector: 'tr.listRow, tr[data-rowkey]',
        symbolSelector: 'a.tickerName-grids, .tickerNameBox-grids',
        priceSelector: 'td:nth-child(2), .cell-numeric',
        volumeSelector: 'td:nth-child(6)'
      }
    },
    {
      id: 'moneycontrol-nse',
      name: 'Moneycontrol NSE Most Active',
      url: 'https://www.moneycontrol.com/stocks/marketstats/nse-mostactive-stocks.html',
      selectorHints: {
        tableSelector: 'table.mctable1 tbody tr, table tbody tr',
        symbolSelector: 'td:nth-child(1) a',
        priceSelector: 'td:nth-child(4), td:nth-child(2)',
        volumeSelector: 'td:nth-child(7)'
      }
    }
  ],

  // News Sources (Agent A2) — Indian Financial Wires
  newsSources: [
    {
      id: 'moneycontrol-markets',
      name: 'Moneycontrol Indian Markets News',
      url: 'https://www.moneycontrol.com/news/business/markets/',
      selectorHints: {
        itemSelector: 'li.clearfix, article, section',
        headlineSelector: 'h2 a, h3 a, a',
        snippetSelector: 'p',
        timeSelector: 'span'
      }
    },
    {
      id: 'economictimes-markets',
      name: 'The Economic Times Markets',
      url: 'https://economictimes.indiatimes.com/markets/stocks/news',
      selectorHints: {
        itemSelector: '.eachStory, article',
        headlineSelector: 'h3 a, a',
        snippetSelector: 'p',
        timeSelector: 'time'
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
