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
   * Launch browser instance
   */
  async getBrowser(headless = true) {
    if (!this.browser || !this.browser.isConnected()) {
      const executablePath = this.getExecutablePath();
      this.browser = await puppeteer.launch({
        executablePath,
        headless: headless ? 'new' : false,
        defaultViewport: { width: 1280, height: 800 },
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-infobars',
          '--window-size=1280,800'
        ]
      });
    }
    return this.browser;
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
