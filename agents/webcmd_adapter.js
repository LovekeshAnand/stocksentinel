/**
 * StockSentinel Webcmd Browser Engine Adapter
 * Implements the core hackathon sponsor paradigm:
 * 1. Explore Phase: Maps DOM structure, identifies target selectors & actions
 * 2. Save Command: Stores learned recipe in JSON for instant reuse
 * 3. Fast Reuse: Replays learned command rapidly on subsequent cycles
 * 4. Self-Healing: Automatically re-explores if a website layout changes
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const settings = require('../config/settings');

class WebcmdAdapter {
  constructor() {
    this.recipesDir = settings.storage.learnedCommandsDir;
    this.ensureDir();
    this.browser = null;
  }

  ensureDir() {
    if (!fs.existsSync(this.recipesDir)) {
      fs.mkdirSync(this.recipesDir, { recursive: true });
    }
  }

  /**
   * Detect installed Chrome or Edge executable on Windows
   */
  getExecutablePath() {
    const candidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      process.env.CHROME_BIN || ''
    ];

    for (const p of candidates) {
      if (p && fs.existsSync(p)) return p;
    }
    return 'chrome.exe';
  }

  /**
   * Launch browser instance (Visible by default for live judging and monitoring)
   */
  async getBrowser(headless = false) {
    if (!this.browser || !this.browser.connected) {
      const executablePath = this.getExecutablePath();
      this.browser = await puppeteer.launch({
        executablePath,
        headless: headless ? 'new' : false,
        defaultViewport: null, // Full responsive layout
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-infobars',
          '--start-maximized',
          '--window-size=1440,920'
        ]
      });
      this.tabs = {};
    }
    return this.browser;
  }

  /**
   * Get or create a named browser tab (chart, news, trade)
   */
  async getTab(name) {
    const browser = await this.getBrowser(false);
    if (this.tabs && this.tabs[name] && !this.tabs[name].isClosed()) {
      return this.tabs[name];
    }
    if (!this.tabs) this.tabs = {};

    const existingPages = await browser.pages();
    // Reuse blank first page if available
    let page = null;
    if (existingPages.length === 1 && existingPages[0].url() === 'about:blank' && !Object.values(this.tabs).includes(existingPages[0])) {
      page = existingPages[0];
    } else {
      page = await browser.newPage();
    }
    await page.setViewport({ width: 1400, height: 900 });
    this.tabs[name] = page;
    return page;
  }

  /**
   * Focus a specific agent's tab on screen
   */
  async focusTab(name) {
    const page = await this.getTab(name);
    await page.bringToFront();
    return page;
  }

  /**
   * Inject high-visibility live telemetry HUD on active browser tab
   */
  async injectHUD(page, agentTag, message, color = '#38bdf8') {
    try {
      await page.evaluate((tag, msg, col) => {
        let hud = document.getElementById('stocksentinel-hud');
        if (!hud) {
          hud = document.createElement('div');
          hud.id = 'stocksentinel-hud';
          hud.style.position = 'fixed';
          hud.style.top = '14px';
          hud.style.left = '50%';
          hud.style.transform = 'translateX(-50%)';
          hud.style.zIndex = '2147483647';
          hud.style.background = 'rgba(10, 15, 29, 0.95)';
          hud.style.backdropFilter = 'blur(10px)';
          hud.style.border = `2px solid ${col}`;
          hud.style.borderRadius = '12px';
          hud.style.padding = '10px 22px';
          hud.style.boxShadow = `0 8px 30px rgba(0,0,0,0.8), 0 0 15px ${col}44`;
          hud.style.fontFamily = 'monospace, sans-serif';
          hud.style.display = 'flex';
          hud.style.alignItems = 'center';
          hud.style.gap = '14px';
          hud.style.pointerEvents = 'none';
          document.body.appendChild(hud);
        }
        hud.style.borderColor = col;
        hud.innerHTML = `
          <div style="width:12px; height:12px; border-radius:50%; background:${col}; box-shadow:0 0 12px ${col};"></div>
          <div>
            <div style="font-size:11px; font-weight:bold; text-transform:uppercase; color:${col}; letter-spacing:1.2px;">
              STOCKSENTINEL // ${tag}
            </div>
            <div style="font-size:13px; font-weight:600; color:#f8fafc; margin-top:2px;">
              ${msg}
            </div>
          </div>
        `;
      }, agentTag, message, color);
    } catch (e) {}
  }

  /**
   * Visibly highlight rows or cards matching specific symbols or phrases
   */
  async highlightElements(page, searchTerms, color = '#10b981', badgeLabel = 'AGENT A1 MATCH') {
    try {
      await page.evaluate((terms, col, label) => {
        const queryTerms = Array.isArray(terms) ? terms : [terms];
        const elements = document.querySelectorAll('tr, article, li, div[data-rowkey], section');
        let matched = 0;

        for (const el of elements) {
          const text = el.innerText || '';
          const hit = queryTerms.find(t => text.includes(t));
          if (hit && matched < 6) {
            matched++;
            el.style.outline = `3px solid ${col}`;
            el.style.backgroundColor = `${col}18`;
            el.style.borderRadius = '6px';
            el.style.position = 'relative';
            el.style.transition = 'all 0.4s ease';

            // Add floating badge
            let badge = el.querySelector('.sentinel-highlight-badge');
            if (!badge) {
              badge = document.createElement('span');
              badge.className = 'sentinel-highlight-badge';
              badge.style.position = 'absolute';
              badge.style.top = '4px';
              badge.style.right = '8px';
              badge.style.background = col;
              badge.style.color = '#000';
              badge.style.fontSize = '10px';
              badge.style.fontWeight = 'bold';
              badge.style.padding = '2px 6px';
              badge.style.borderRadius = '4px';
              badge.style.zIndex = '9999';
              badge.innerText = `${label}: ${hit}`;
              el.appendChild(badge);
            }
          }
        }
      }, searchTerms, color, badgeLabel);
    } catch (e) {}
  }

  /**
   * Get path to a saved learned recipe
   */
  getRecipePath(commandName) {
    return path.join(this.recipesDir, `${commandName}.recipe.json`);
  }

  /**
   * Check if a recipe has already been learned
   */
  hasRecipe(commandName) {
    return fs.existsSync(this.getRecipePath(commandName));
  }

  /**
   * Save a learned command recipe
   */
  saveRecipe(commandName, recipe) {
    this.ensureDir();
    const filePath = this.getRecipePath(commandName);
    recipe.updatedAt = new Date().toISOString();
    recipe.version = (recipe.version || 0) + 1;
    fs.writeFileSync(filePath, JSON.stringify(recipe, null, 2), 'utf-8');
    console.log(`[webcmd] 🧠 Learned command saved: ${commandName} (v${recipe.version})`);
  }

  /**
   * Load a saved recipe
   */
  loadRecipe(commandName) {
    const filePath = this.getRecipePath(commandName);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }

  /**
   * Execute or Learn a command:
   * If recipe exists -> fast reuse
   * If recipe fails -> self-heal & re-explore
   * If recipe missing -> explore first run
   */
  async executeOrLearn(commandName, exploreFn, reuseFn, options = {}) {
    let recipe = this.loadRecipe(commandName);

    if (!recipe || options.forceExplore) {
      console.log(`[webcmd] 🔍 [EXPLORE PHASE] First run for "${commandName}". Learning page structure...`);
      const learned = await exploreFn(this);
      this.saveRecipe(commandName, learned);
      return { phase: 'explored', data: learned.lastData || learned };
    }

    try {
      console.log(`[webcmd] ⚡ [REUSE PHASE] Fast replay of learned command "${commandName}" (v${recipe.version})`);
      const result = await reuseFn(this, recipe);
      return { phase: 'reused', data: result };
    } catch (err) {
      console.warn(`[webcmd] 🚨 [SELF-HEALING TRIGGERED] Saved command "${commandName}" failed (${err.message}). Re-exploring...`);
      const relearned = await exploreFn(this);
      this.saveRecipe(commandName, relearned);
      return { phase: 'healed', data: relearned.lastData || relearned };
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}

module.exports = new WebcmdAdapter();
