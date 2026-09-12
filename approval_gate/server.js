/**
 * StockSentinel Web Cockpit & Approval Gate Server
 * Serves the live judging dashboard and syncs real-time events over WebSocket
 */

const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const settings = require('../config/settings');
const gateLogic = require('./gate_logic');
const memoryStore = require('../memory/store');

class DashboardServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    this.port = settings.port;

    this.initMiddleware();
    this.initRoutes();
    this.initWebSocket();
    this.bindGateEvents();
  }

  initMiddleware() {
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, 'public')));
  }

  initRoutes() {
    // API: Pending proposals
    this.app.get('/api/proposals/pending', (req, res) => {
      res.json(gateLogic.getPendingList());
    });

    // API: Virtual Paper Trading Portfolio (Cash, Positions, Realized P&L)
    this.app.get('/api/portfolio', (req, res) => {
      res.json(memoryStore.getPortfolio());
    });

    // API: Recent signals from Agent A1 (Chart) & Agent A2 (News)
    this.app.get('/api/signals/recent', (req, res) => {
      const signals = memoryStore.data.signals || [];
      res.json({
        chartSignals: signals.filter(s => s.pattern_type).slice(-10),
        newsSignals: signals.filter(s => s.headline && !s.pattern_type).slice(-10)
      });
    });

    // API: Memory stats & trust scores
    this.app.get('/api/memory/stats', (req, res) => {
      res.json({
        signalsCount: (memoryStore.data.signals || []).length,
        proposalsCount: (memoryStore.data.proposals || []).length,
        executionsCount: (memoryStore.data.executionLog || []).length,
        tickerHistory: memoryStore.data.tickerHistory || {},
        portfolio: memoryStore.getPortfolio()
      });
    });

    // API: Web-based Approval (Supports action/qty override, e.g. SELL held stock)
    this.app.post('/api/proposals/:id/approve', (req, res) => {
      try {
        let result;
        if (req.body && (req.body.action || req.body.quantity)) {
          result = gateLogic.modifyAndApprove(req.params.id, {
            action: req.body.action,
            quantity: req.body.quantity
          });
        } else {
          result = gateLogic.approveProposal(req.params.id, 'Approved via Web Dashboard');
        }
        this.broadcast('PORTFOLIO_UPDATED', memoryStore.getPortfolio());
        res.json(result);
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    // API: Direct Exit / Sell of held portfolio position
    this.app.post('/api/portfolio/sell', async (req, res) => {
      const sym = (req.body.ticker || '').toUpperCase();
      const qty = parseInt(req.body.quantity, 10) || 10;
      try {
        const executor = require('../agents/agent_b_executor/webcmd_trade');
        const tradeRes = await executor.executeApprovedTrade({
          id: `web_exit_${Date.now()}`,
          ticker: sym,
          action: 'SELL',
          suggested_quantity: qty,
          price: executor.getBenchmarkPrice(sym)
        });
        this.broadcast('PORTFOLIO_UPDATED', memoryStore.getPortfolio());
        res.json({ ok: true, trade: tradeRes });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    // API: Web-based Rejection
    this.app.post('/api/proposals/:id/reject', (req, res) => {
      try {
        const result = gateLogic.rejectProposal(req.params.id, req.body.reason || 'Declined via Web');
        res.json(result);
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    // API: Trigger demo test proposal (NSE Indian Equities)
    this.app.post('/api/demo/trigger', (req, res) => {
      const sym = (req.body.ticker || 'TATAMOTORS').toUpperCase();
      const demoProposal = {
        ticker: sym,
        action: req.body.action || 'buy',
        suggested_quantity: req.body.quantity || 15,
        confidence: 'high',
        headline: req.body.headline || `${sym} expands commercial vehicle and EV operations with record margins`,
        rationale: `Dual-lens convergence: Bullish volume expansion + clean technical breakout confirmed by positive news catalyst for NSE:${sym}.`,
        engine: 'Local Qwen 2.5 7B'
      };
      const queued = gateLogic.submitProposal(demoProposal);
      res.json({ ok: true, proposal: queued });
    });

    // API: Trigger on-demand pipeline scan
    this.app.post('/api/demo/run-cycle', async (req, res) => {
      try {
        const pipeline = require('../orchestration/pipeline');
        res.json({ ok: true, message: 'Scan cycle triggered' });
        await pipeline.runCycle();
        this.broadcast('SCAN_COMPLETE', { timestamp: new Date().toISOString() });
      } catch (err) {
        console.error('[DashboardServer] Scan error:', err.message);
      }
    });

    // API: Trigger Self-Healing demonstration
    this.app.post('/api/demo/self-heal', async (req, res) => {
      try {
        res.json({ ok: true, message: 'Self-healing demo started' });
        this.broadcast('SELF_HEAL_START', { timestamp: new Date().toISOString() });
        const { runSelfHealingDemo } = require('../simulate_heal');
        const healResult = await runSelfHealingDemo();
        this.broadcast('SELF_HEAL_COMPLETE', healResult);
      } catch (err) {
        this.broadcast('SELF_HEAL_ERROR', { error: err.message });
      }
    });

    // API: Trigger Paper Trade simulation on TradingView
    this.app.post('/api/demo/simulate-trade', async (req, res) => {
      const sym = (req.body.ticker || 'TATAMOTORS').toUpperCase();
      const action = (req.body.action || 'BUY').toUpperCase();
      const qty = parseInt(req.body.quantity || '25', 10);
      try {
        res.json({ ok: true, message: `Simulating ${action} ${qty} ${sym}` });
        const executor = require('../agents/agent_b_executor/webcmd_trade');
        const tradeRes = await executor.executeApprovedTrade({
          id: `web_sim_${Date.now()}`,
          ticker: sym,
          action,
          suggested_quantity: qty,
          price: executor.getBenchmarkPrice(sym)
        });
        this.broadcast('PORTFOLIO_UPDATED', memoryStore.getPortfolio());
      } catch (err) {
        console.error('[DashboardServer] Trade simulation error:', err.message);
      }
    });
  }

  initWebSocket() {
    this.wss.on('connection', (ws) => {
      console.log('[DashboardServer] 🔌 Client connected to live cockpit stream.');
      ws.send(JSON.stringify({
        type: 'INIT_STATE',
        pending: gateLogic.getPendingList(),
        history: memoryStore.data.tickerHistory || {},
        portfolio: memoryStore.getPortfolio(),
        recentSignals: (memoryStore.data.signals || []).slice(-15)
      }));
    });
  }

  broadcast(type, payload) {
    const message = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  bindGateEvents() {
    gateLogic.on('proposal_created', (p) => this.broadcast('PROPOSAL_CREATED', p));
    gateLogic.on('proposal_approved', (p) => {
      this.broadcast('PROPOSAL_APPROVED', p);
      this.broadcast('PORTFOLIO_UPDATED', memoryStore.getPortfolio());
    });
    gateLogic.on('proposal_rejected', (p) => this.broadcast('PROPOSAL_REJECTED', p));
  }

  start() {
    this.server.listen(this.port, () => {
      console.log(`[DashboardServer] 🌐 StockSentinel Live Cockpit running at http://localhost:${this.port}`);
    });
  }
}

module.exports = new DashboardServer();
