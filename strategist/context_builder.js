/**
 * StockSentinel Context Builder
 * Assembles dual-lens signals (Agent A1 Chart + Agent A2 News) and memory layer history for The Strategist
 */

const memoryStore = require('../memory/store');

class ContextBuilder {
  /**
   * Build complete dual-lens context payload for a ticker
   * @param {string} ticker
   * @param {Object} signals - { chartSignal, newsSignal }
   */
  buildContext(ticker, signals = {}) {
    const symbol = (ticker || '').toUpperCase();
    const trustContext = memoryStore.getTickerContext(symbol);
    const { chartSignal, newsSignal } = signals;

    const sourceSignalIds = [];
    if (chartSignal?.id) sourceSignalIds.push(chartSignal.id);
    if (newsSignal?.id) sourceSignalIds.push(newsSignal.id);

    const signalsConsidered = [];
    if (chartSignal) {
      signalsConsidered.push(`chart: ${chartSignal.pattern_type} (${chartSignal.pattern_details || 'price/volume breakout'})`);
    }
    if (newsSignal) {
      signalsConsidered.push(`news: ${newsSignal.raw_sentiment_hint} sentiment ("${newsSignal.headline}")`);
    }

    const port = memoryStore.getPortfolio();
    const heldPos = (port.positions || []).find(p => p.ticker === symbol);

    const formattedText = `
=== DUAL-LENS MARKET SIGNALS FOR ${symbol} ===

1. AGENT A1 (CHART & TECHNICAL PATTERN):
${chartSignal ? `
- Pattern Type: ${chartSignal.pattern_type}
- Technical Bias: ${chartSignal.technical_bias || 'NEUTRAL'}
- Details: ${chartSignal.pattern_details}
- Current Price: ₹${chartSignal.price || 'N/A'}
- Volume: ${chartSignal.volume || 'N/A'}
- RSI Indicator: ${chartSignal.rsi || 'N/A'}
- Observed: ${chartSignal.timestamp}
` : '- Status: No active technical chart pattern detected in this cycle.'}

2. AGENT A2 (NEWS & MARKET SENTIMENT):
${newsSignal ? `
- Headline: "${newsSignal.headline}"
- Snippet: "${newsSignal.snippet || 'N/A'}"
- Source: ${newsSignal.source || 'Financial Wire'}
- Raw Sentiment: ${newsSignal.raw_sentiment_hint || 'neutral'}
- Published: ${newsSignal.timestamp}
` : '- Status: No breaking news catalyst detected in this cycle.'}

=== USER PORTFOLIO HOLDINGS FOR ${symbol} ===
${heldPos && heldPos.quantity > 0 ? `
- CURRENTLY HELD: YES (${heldPos.quantity} shares @ avg ₹${heldPos.entryPrice})
- Unrealized P&L: ₹${heldPos.pnl || 0}
- PORTFOLIO DIRECTIVE: User already holds this position. If RSI > 70 (overbought), technical momentum weakens, or negative news emerges, strongly consider proposing SELL / TAKE_PROFIT to defend capital or harvest gains!
` : `- CURRENTLY HELD: NO (0 shares held)`}

=== USER MEMORY & TRUST PROFILE ===
- Historical Approval Rate: ${(trustContext.trustScore * 100).toFixed(0)}%
- Total Approved Trades on ${symbol}: ${trustContext.approvedCount}
- Total Rejected Trades on ${symbol}: ${trustContext.rejectedCount}
- Prior Human Decision: ${trustContext.lastDecision || 'None (First-time signal)'}

=== REASONING INSTRUCTIONS ===
1. Cross-Signal Synthesis:
   - If Chart and News AGREE (e.g. Bullish Chart + Positive News) -> High confidence BUY.
   - If Chart and News AGREE BEARISH (e.g. Breakdown + Negative News) -> High confidence SELL.
   - If User Holds Shares AND signals are overbought (RSI > 70) or bearish -> High confidence SELL (Take Profit / Stop Loss).
   - If Chart and News CONFLICT (e.g. Bullish Chart + Negative News) -> Low confidence HOLD or WATCH_ONLY.
   - If only ONE lens is active -> Base proposal on available evidence, and explicitly state that only one source contributed.
2. Formulate concise 1-3 sentence plain-English rationale naming the exact signals that drove the proposal.
3. Propose action ("buy", "sell", "hold", or "watch_only") and paper quantity (1 to 25 units).
`.trim();

    return {
      ticker: symbol,
      chartSignal,
      newsSignal,
      sourceSignalIds,
      signalsConsidered,
      trustContext,
      heldPos,
      formattedText
    };
  }
}

module.exports = new ContextBuilder();
