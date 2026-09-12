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

    // API: Memory stats & trust scores
    this.app.get('/api/memory/stats', (req, res) => {
      res.json({
        signalsCount: memoryStore.data.signals.length,
        proposalsCount: memoryStore.data.proposals.length,
        executionsCount: memoryStore.data.executionLog.length,
        tickerHistory: memoryStore.data.tickerHistory
      });
    });

    // API: Web-based Approval
    this.app.post('/api/proposals/:id/approve', (req, res) => {
      try {
        const result = gateLogic.approveProposal(req.params.id, 'Approved via Web Dashboard');
        res.json(result);
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

    // API: Trigger demo test proposal
    this.app.post('/api/demo/trigger', (req, res) => {
      const demoProposal = {
        ticker: req.body.ticker || 'TSLA',
        action: req.body.action || 'buy',
        suggested_quantity: req.body.quantity || 15,
        confidence: 'high',
        headline: req.body.headline || 'Tesla accelerates Cybercab commercial deployment following European regulatory waiver',
        rationale: 'Positive multi-market catalyst with significant volume confirmation. Strategic long entry recommended.',
        engine: 'Local Qwen 2.5 7B'
      };
      const queued = gateLogic.submitProposal(demoProposal);
      res.json({ ok: true, proposal: queued });
    });
  }

  initWebSocket() {
    this.wss.on('connection', (ws) => {
      console.log('[DashboardServer] 🔌 Client connected to live cockpit stream.');
      // Send initial state
      ws.send(JSON.stringify({
        type: 'INIT_STATE',
        pending: gateLogic.getPendingList(),
        history: memoryStore.data.tickerHistory,
        recentSignals: memoryStore.data.signals.slice(-10)
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
    gateLogic.on('proposal_approved', (p) => this.broadcast('PROPOSAL_APPROVED', p));
    gateLogic.on('proposal_rejected', (p) => this.broadcast('PROPOSAL_REJECTED', p));
  }

  start() {
    this.server.listen(this.port, () => {
      console.log(`[DashboardServer] 🌐 StockSentinel Live Cockpit running at http://localhost:${this.port}`);
    });
  }
}

module.exports = new DashboardServer();
