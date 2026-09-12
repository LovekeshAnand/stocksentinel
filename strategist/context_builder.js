/**
 * StockSentinel Context Builder
 * Assembles market signal, technical context, and memory layer history for The Strategist
 */

const memoryStore = require('../memory/store');

class ContextBuilder {
  /**
   * Build complete context payload for a signal
   */
  buildContext(signal) {
    const ticker = (signal.ticker || '').toUpperCase();
    const trustContext = memoryStore.getTickerContext(ticker);

    const formattedText = `
=== MARKET SIGNAL ===
Ticker: ${ticker}
Headline: "${signal.headline}"
Snippet: "${signal.snippet || 'N/A'}"
Source: ${signal.source || 'Financial News Wire'}
Timestamp: ${signal.timestamp || new Date().toISOString()}
Initial Sentiment Hint: ${signal.raw_sentiment_hint || 'neutral'}

=== USER MEMORY & TRUST PROFILE ===
Historical Trust Score: ${(trustContext.trustScore * 100).toFixed(0)}%
Total Approved Trades on ${ticker}: ${trustContext.approvedCount}
Total Rejected Trades on ${ticker}: ${trustContext.rejectedCount}
Last User Decision: ${trustContext.lastDecision || 'None (First time signal)'}

=== TASK ===
Analyze the news impact on ${ticker} considering both the market catalyst and user history.
Formulate a clear proposed action (buy, sell, hold, or watch_only), suggested quantity, and concise 1-3 sentence rationale.
`.trim();

    return {
      ticker,
      signalId: signal.id || `sig_${Date.now()}`,
      headline: signal.headline,
      snippet: signal.snippet,
      sentiment: signal.raw_sentiment_hint,
      trustContext,
      formattedText
    };
  }
}

module.exports = new ContextBuilder();
