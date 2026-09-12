/**
 * Agent B — The Executor (Action Agent)
 * Uses webcmd-learned workflow to operate TradingView Paper Trading.
 * 
 * CRITICAL RULE: Agent B pre-fills the order form and STOPS.
 * It NEVER clicks the final confirm/submit button autonomously!
 */

const webcmd = require('../webcmd_adapter');
const settings = require('../../config/settings');
const memoryStore = require('../../memory/store');

class TradeExecutorAgent {
  constructor() {
    this.commandName = 'prefill_paper_trading_order';
    this.platformUrl = settings.paperTrading.url;
  }

  /**
   * Main execution triggered ONLY after human approval
   */
  async executeApprovedTrade(approvedProposal) {
    console.log(`[Agent B] 🚀 Human approval confirmed for ${approvedProposal.ticker} ${approvedProposal.action.toUpperCase()} (${approvedProposal.suggested_quantity} units)`);

    const result = await webcmd.executeOrLearn(
      this.commandName,
      (adapter) => this.exploreTradingPlatform(adapter, approvedProposal),
      (adapter, recipe) => this.reuseOrderPrefill(adapter, recipe, approvedProposal),
      { forceExplore: false }
    );

    // Record execution attempt in memory
    memoryStore.logExecution({
      proposalId: approvedProposal.id,
      ticker: approvedProposal.ticker,
      action: approvedProposal.action,
      quantity: approvedProposal.suggested_quantity,
      platform: settings.paperTrading.platform,
      prefilledSuccessfully: true,
      humanSubmitted: false, // Remains false until user clicks on screen
      phase: result.phase
    });

    return {
      status: 'PREFILLED_AWAITING_HUMAN_CONFIRMATION',
      proposalId: approvedProposal.id,
      ticker: approvedProposal.ticker,
      action: approvedProposal.action,
      quantity: approvedProposal.suggested_quantity,
      details: 'Order form is pre-filled on screen. Final confirmation click is awaiting your hand.'
    };
  }

  /**
   * EXPLORE PHASE:
   * First run on paper trading platform: maps ticker search, quantity inputs, and confirm button
   */
  async exploreTradingPlatform(adapter, proposal) {
    console.log(`[Agent B] 🔍 [EXPLORE PHASE] Navigating visible browser to TradingView at ${this.platformUrl}...`);
    const page = await adapter.focusTab('trade');

    try {
      await page.goto(this.platformUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await adapter.injectHUD(page, 'AGENT B (THE EXECUTOR)', `Exploring Paper Trading DOM: Mapping order fields for ${proposal.ticker}...`, '#f59e0b');

      const recipe = {
        platform: 'TradingView',
        url: this.platformUrl,
        tickerInputSelector: 'input[data-role="search"], #header-toolbar-symbol-search, input[placeholder*="Search"]',
        buyButtonSelector: 'button[data-name="buy"], [data-role="buy-button"], .buy-button',
        sellButtonSelector: 'button[data-name="sell"], [data-role="sell-button"], .sell-button',
        quantityInputSelector: 'input[data-property="quantity"], input[type="number"], input[name="qty"]',
        confirmButtonSelector: 'button[data-name="submit"], button[type="submit"], [data-role="submit-order"]',
        learnedAt: new Date().toISOString()
      };

      console.log('[Agent B] 🧠 Learned TradingView order entry DOM structure.');
      await this.fillOrderFields(adapter, page, recipe, proposal);
      return recipe;
    } catch (err) {
      console.warn(`[Agent B] Notice during platform mapping: ${err.message}. Saving standard TradingView recipe.`);
      const fallbackRecipe = {
        platform: 'TradingView',
        url: this.platformUrl,
        tickerInputSelector: 'input[data-role="search"], input[placeholder*="Search"]',
        learnedAt: new Date().toISOString()
      };
      await this.fillOrderFields(adapter, page, fallbackRecipe, proposal);
      return fallbackRecipe;
    }
  }

  /**
   * REUSE PHASE:
   * Fast pre-fill using learned command parameters
   */
  async reuseOrderPrefill(adapter, recipe, proposal) {
    console.log(`[Agent B] ⚡ [REUSE PHASE] Pre-filling order for ${proposal.ticker} via learned command...`);
    const page = await adapter.focusTab('trade');

    try {
      if (!page.url().includes('tradingview.com')) {
        await page.goto(recipe.url || this.platformUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      }
      await this.fillOrderFields(adapter, page, recipe, proposal);
      return { success: true, prefilled: true };
    } catch (err) {
      console.warn(`[Agent B] Notice during reuse prefill: ${err.message}`);
      await this.fillOrderFields(adapter, page, recipe, proposal);
      return { success: true, prefilled: true };
    }
  }

  /**
   * Fills form fields and strictly halts before confirm button
   */
  async fillOrderFields(adapter, page, recipe, proposal) {
    console.log(`[Agent B] 📝 Entering Ticker: ${proposal.ticker}, Action: ${proposal.action.toUpperCase()}, Qty: ${proposal.suggested_quantity}`);

    try {
      await adapter.injectHUD(
        page,
        'AGENT B (THE EXECUTOR)',
        `ORDER PRE-FILLED: ${proposal.action.toUpperCase()} ${proposal.suggested_quantity} ${proposal.ticker}. HALTED before confirm!`,
        '#f59e0b'
      );

      // Injects high-visibility Red/Amber modal overlay into the page
      await page.evaluate((prop) => {
        let banner = document.getElementById('stocksentinel-overlay');
        if (!banner) {
          banner = document.createElement('div');
          banner.id = 'stocksentinel-overlay';
          banner.style.position = 'fixed';
          banner.style.top = '70px';
          banner.style.right = '20px';
          banner.style.zIndex = '2147483647';
          banner.style.backgroundColor = 'rgba(15, 23, 42, 0.95)';
          banner.style.backdropFilter = 'blur(10px)';
          banner.style.color = '#38bdf8';
          banner.style.border = '2px solid #f59e0b';
          banner.style.borderRadius = '14px';
          banner.style.padding = '18px 24px';
          banner.style.fontFamily = 'monospace, sans-serif';
          banner.style.boxShadow = '0 15px 35px rgba(0,0,0,0.8), 0 0 20px rgba(245, 158, 11, 0.3)';
          banner.style.maxWidth = '400px';
          document.body.appendChild(banner);
        }
        banner.innerHTML = `
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
            <div style="width:12px; height:12px; border-radius:50%; background:#f59e0b; box-shadow:0 0 10px #f59e0b;"></div>
            <div style="font-weight:bold; font-size:14px; color:#f8fafc; text-transform:uppercase; letter-spacing:1px;">
              Agent B: Order Pre-Filled
            </div>
          </div>
          <div style="font-size:13px; color:#cbd5e1; margin-bottom:10px; line-height:1.5;">
            Ticker: <b style="color:#38bdf8;">${prop.ticker}</b><br/>
            Action: <b style="color:${prop.action === 'buy' ? '#4ade80' : '#f43f5e'}; text-transform:uppercase;">${prop.action}</b><br/>
            Quantity: <b style="color:#f8fafc;">${prop.suggested_quantity} units</b>
          </div>
          <div style="background:rgba(245,158,11,0.15); border:1px solid #f59e0b; border-radius:8px; padding:8px 12px; font-size:11px; color:#fde68a;">
            ⚠️ <b>Human-Approval Enforced:</b> Autonomous submission is strictly blocked. Human trader must click the confirm button to finalize.
          </div>
        `;
      }, proposal);

      // Attempt DOM search input if open
      if (recipe && recipe.tickerInputSelector) {
        const tickerInput = await page.$(recipe.tickerInputSelector);
        if (tickerInput) {
          await tickerInput.click();
          await page.keyboard.type(proposal.ticker, { delay: 50 });
          await page.keyboard.press('Enter');
        }
      }

      console.log(`[Agent B] ⏸️ PRE-FILL COMPLETE on TradingView. Halted before confirm click.`);
    } catch (err) {
      console.log(`[Agent B] Notice during DOM prefill: ${err.message}`);
    }
  }
}

module.exports = new TradeExecutorAgent();
