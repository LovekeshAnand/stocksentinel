/**
 * StockSentinel Paper Trading Simulation Runner
 *
 * Runs a standalone live test of Agent B's Paper Trading Simulation:
 * 1. Launches or focuses the desktop browser on TradingView India.
 * 2. Injects the high-fidelity Paper Trading Terminal and Order Pad.
 * 3. Animates order quantity typing and button click.
 * 4. Displays the official FIX 4.4 Order Fill confirmation modal.
 * 5. Updates and docks the live open positions and paper portfolio.
 *
 * Usage:
 *   node simulate_trade.js
 *   node simulate_trade.js RELIANCE BUY 15
 *   node simulate_trade.js TATAMOTORS BUY 25
 */

require('dotenv').config();
const executor = require('./agents/agent_b_executor/webcmd_trade');
const memoryStore = require('./memory/store');

async function run() {
  const ticker = (process.argv[2] || 'TATAMOTORS').toUpperCase();
  const action = (process.argv[3] || 'BUY').toUpperCase();
  const qty = parseInt(process.argv[4] || '25', 10);
  const price = executor.getBenchmarkPrice(ticker);

  console.log(`\n${'═'.repeat(64)}`);
  console.log(`  STOCKSENTINEL // PAPER TRADING SIMULATION TEST`);
  console.log(`  Target Security: NSE:${ticker} | Action: ${action} | Qty: ${qty} shares`);
  console.log(`  Market Benchmark Price: ₹${price.toLocaleString('en-IN')}`);
  console.log(`${'═'.repeat(64)}\n`);

  try {
    const result = await executor.executeApprovedTrade({
      id: `sim_manual_${Date.now()}`,
      ticker,
      action,
      suggested_quantity: qty,
      price
    });

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`✅ Simulation executed successfully!`);
    console.log(`  Trade ID: ${result.tradeId}`);
    console.log(`  Security: NSE:${result.ticker}`);
    console.log(`  Filled: ${result.action} ${result.quantity} shares @ ₹${result.price}`);
    console.log(`  Portfolio Cash: ₹${result.portfolio.cash.toLocaleString('en-IN')}`);
    console.log(`  Open Positions: ${result.portfolio.positions.length}`);
    console.log(`${'─'.repeat(64)}\n`);
    console.log(`Check your desktop browser to view the interactive Trading Pad and Fill Modal!\n`);

  } catch (err) {
    console.error('Simulation error:', err.message);
  }
}

run();
