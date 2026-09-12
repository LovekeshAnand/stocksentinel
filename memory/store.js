/**
 * StockSentinel Memory Store
 * Lightweight JSON-backed Knowledge Graph store for:
 * - Signal history per ticker
 * - Proposal history and approval/rejection outcomes
 * - Per-ticker Trust Scores (self-learning user feedback loop)
 */

const fs = require('fs');
const path = require('path');
const settings = require('../config/settings');

class MemoryStore {
  constructor(filePath = settings.storage.memoryFile) {
    this.filePath = filePath;
    this.data = {
      signals: [],       // Array of past signals
      proposals: [],     // Array of proposals with state: PENDING, APPROVED, REJECTED, MODIFIED, EXECUTED
      tickerHistory: {}, // symbol -> { approvedCount, rejectedCount, trustScore, lastSignalTime }
      executionLog: [],  // Array of executed orders
      portfolio: {       // Simulated Paper Trading Portfolio (NSE)
        initialCapital: 1000000,
        cash: 1000000,
        positions: [],   // Array of { id, ticker, action, quantity, entryPrice, currentPrice, pnl, openedAt }
        totalTrades: 0,
        realizedPnl: 0
      }
    };
    this.ensureDir();
    this.load();
  }

  ensureDir() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.data = Object.assign(this.data, JSON.parse(raw));
      } else {
        this.save();
      }
    } catch (err) {
      console.error('[MemoryStore] Failed to load store, initializing fresh store:', err.message);
      this.save();
    }
  }

  save() {
    try {
      this.ensureDir();
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[MemoryStore] Failed to save store:', err.message);
    }
  }

  /**
   * Log an incoming signal
   */
  addSignal(signal) {
    this.data.signals.push({
      ...signal,
      receivedAt: new Date().toISOString()
    });

    if (this.data.signals.length > 500) {
      this.data.signals = this.data.signals.slice(-500); // keep recent 500
    }

    this.save();
  }

  /**
   * Log a new Strategist proposal
   */
  addProposal(proposal) {
    this.data.proposals.push(proposal);
    this.save();
    return proposal;
  }

  /**
   * Update proposal status
   */
  updateProposalStatus(proposalId, status, details = {}) {
    const proposal = this.data.proposals.find(p => p.id === proposalId);
    if (!proposal) return null;

    proposal.status = status; // 'APPROVED' | 'REJECTED' | 'MODIFIED' | 'EXECUTED'
    proposal.updatedAt = new Date().toISOString();
    Object.assign(proposal, details);

    // Update ticker trust score
    this.updateTrustScore(proposal.ticker, status);
    this.save();
    return proposal;
  }

  getProposal(proposalId) {
    return this.data.proposals.find(p => p.id === proposalId);
  }

  getPendingProposals() {
    return this.data.proposals.filter(p => p.status === 'PENDING');
  }

  /**
   * Update user trust score based on user decisions
   */
  updateTrustScore(ticker, status) {
    if (!ticker) return;
    const key = ticker.toUpperCase();

    if (!this.data.tickerHistory[key]) {
      this.data.tickerHistory[key] = {
        approvedCount: 0,
        rejectedCount: 0,
        trustScore: 0.70, // default neutral-positive trust
        lastDecision: null
      };
    }

    const hist = this.data.tickerHistory[key];
    if (status === 'APPROVED' || status === 'MODIFIED') {
      hist.approvedCount += 1;
      hist.trustScore = Math.min(1.0, hist.trustScore + 0.05);
      hist.lastDecision = 'APPROVED';
    } else if (status === 'REJECTED') {
      hist.rejectedCount += 1;
      hist.trustScore = Math.max(0.1, hist.trustScore - 0.15); // Rejections penalize faster
      hist.lastDecision = 'REJECTED';
    }

    hist.lastDecisionAt = new Date().toISOString();
  }

  /**
   * Get ticker intelligence for Strategist context
   */
  getTickerContext(ticker) {
    const key = (ticker || '').toUpperCase();
    const hist = this.data.tickerHistory[key] || {
      approvedCount: 0,
      rejectedCount: 0,
      trustScore: 0.70,
      lastDecision: null
    };

    const recentProposals = this.data.proposals
      .filter(p => p.ticker === key)
      .slice(-5);

    return {
      ticker: key,
      trustScore: parseFloat(hist.trustScore.toFixed(2)),
      approvedCount: hist.approvedCount,
      rejectedCount: hist.rejectedCount,
      lastDecision: hist.lastDecision,
      recentProposalsCount: recentProposals.length
    };
  }

  /**
   * Record paper trading execution
   */
  /**
   * Record paper trading execution and update simulated portfolio
   */
  logExecution(record) {
    this.data.executionLog.push({
      ...record,
      executedAt: new Date().toISOString()
    });
    this.save();
  }

  /**
   * Execute paper trade and maintain real-time positions & balances
   */
  executePaperTrade(trade) {
    if (!this.data.portfolio) {
      this.data.portfolio = { initialCapital: 1000000, cash: 1000000, positions: [], totalTrades: 0, realizedPnl: 0 };
    }

    const portfolio = this.data.portfolio;
    const ticker = trade.ticker.toUpperCase();
    const action = trade.action.toUpperCase();
    const qty = Number(trade.quantity || trade.suggested_quantity || 10);
    const price = Number(trade.price || 1000);
    const consideration = qty * price;
    const fee = 20; // flat NSE brokerage/exchange fee in paper mode

    if (action === 'BUY') {
      portfolio.cash = Math.max(0, portfolio.cash - consideration - fee);
      const existing = portfolio.positions.find(p => p.ticker === ticker && p.action === 'BUY');
      if (existing) {
        const totalCost = (existing.quantity * existing.entryPrice) + consideration;
        existing.quantity += qty;
        existing.entryPrice = parseFloat((totalCost / existing.quantity).toFixed(2));
        existing.currentPrice = price;
        existing.pnl = parseFloat(((existing.currentPrice - existing.entryPrice) * existing.quantity).toFixed(2));
      } else {
        portfolio.positions.push({
          id: `pos_${ticker}_${Date.now()}`,
          ticker,
          action: 'BUY',
          quantity: qty,
          entryPrice: price,
          currentPrice: price,
          pnl: 0,
          openedAt: new Date().toISOString()
        });
      }
    } else if (action === 'SELL') {
      portfolio.cash += (consideration - fee);
      const existing = portfolio.positions.find(p => p.ticker === ticker);
      if (existing) {
        const realized = (price - existing.entryPrice) * Math.min(existing.quantity, qty);
        portfolio.realizedPnl = parseFloat((portfolio.realizedPnl + realized).toFixed(2));
        existing.quantity -= qty;
        if (existing.quantity <= 0) {
          portfolio.positions = portfolio.positions.filter(p => p.ticker !== ticker);
        }
      }
    }

    portfolio.totalTrades += 1;
    this.save();

    return {
      portfolio,
      tradeId: `TX-NSE-${Date.now().toString().slice(-6)}`,
      ticker,
      action,
      quantity: qty,
      price,
      consideration,
      cashRemaining: portfolio.cash
    };
  }

  getPortfolio() {
    if (!this.data.portfolio) {
      this.data.portfolio = { initialCapital: 1000000, cash: 1000000, positions: [], totalTrades: 0, realizedPnl: 0 };
    }
    return this.data.portfolio;
  }
}

module.exports = new MemoryStore();
