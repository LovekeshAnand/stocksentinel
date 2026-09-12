/**
 * StockSentinel Deduplication Layer
 * Prevents alert fatigue by tracking active signals and suppressing duplicates
 * within a configurable time window (e.g., 2 hours).
 */

class SignalDeduplicator {
  constructor(windowMs = 2 * 60 * 60 * 1000) {
    this.windowMs = windowMs;
    // Map: hash -> timestamp
    this.seenSignals = new Map();
  }

  createHash(signal) {
    const ticker = (signal.ticker || '').toUpperCase();
    const cleanHeadline = (signal.headline || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 40);
    const patternKey = signal.pattern_type || '';
    const priceKey = signal.price ? Math.round(signal.price) : '';

    return `${ticker}:${patternKey}:${cleanHeadline}:${priceKey}`;
  }

  /**
   * Check if a signal is duplicate.
   * If not seen recently, registers it and returns false.
   * If seen within window, returns true.
   */
  isDuplicate(signal) {
    this.cleanup();
    const hash = this.createHash(signal);
    const now = Date.now();

    if (this.seenSignals.has(hash)) {
      const lastSeen = this.seenSignals.get(hash);
      if (now - lastSeen < this.windowMs) {
        return true; // Duplicate! Suppress!
      }
    }

    this.seenSignals.set(hash, now);
    return false;
  }

  cleanup() {
    const now = Date.now();
    for (const [hash, timestamp] of this.seenSignals.entries()) {
      if (now - timestamp > this.windowMs) {
        this.seenSignals.delete(hash);
      }
    }
  }

  clear() {
    this.seenSignals.clear();
  }
}

module.exports = new SignalDeduplicator();
