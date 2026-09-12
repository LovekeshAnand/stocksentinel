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
const { exec } = require('child_process');
const os = require('os');
const puppeteer = require('puppeteer-core');
const settings = require('../config/settings');

class WebcmdAdapter {
  constructor() {
    this.recipesDir = settings.storage.learnedCommandsDir;
    this.ensureDir();
    this.browser = null;
    this.tabs = {};
    this.launchPromise = null;
    this.tabPromises = {};
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
    const localAppData = process.env.LOCALAPPDATA || '';
    const candidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      localAppData + '\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      process.env.CHROME_BIN || ''
    ];

    for (const p of candidates) {
      if (p && fs.existsSync(p)) {
        console.log(`[webcmd] Using browser executable: ${p}`);
        return p;
      }
    }
    console.warn('[webcmd] WARNING: No browser executable found. Falling back to "chrome".');
    return 'chrome';
  }

  /**
   * Force-focus the Chrome window on Windows via PowerShell.
   * Chrome may open behind other windows — this brings it to front.
   */
  focusWindowOnWindows() {
    try {
      const pid = this.browser?.process()?.pid;
      const pidScript = pid ? `$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($p) { $w.AppActivate($p.Id) }` : '';
      const ps = `
        $w = New-Object -ComObject WScript.Shell;
        ${pidScript}
        $w.AppActivate('TradingView');
        $w.AppActivate('Google Chrome');
        $w.AppActivate('Chrome');
      `.replace(/\r?\n/g, ' ');
      exec(`powershell -NonInteractive -WindowStyle Hidden -Command "${ps}"`, () => {});
    } catch (e) { /* best-effort */ }
  }

  /**
   * Launch browser instance with Mutex to prevent duplicate launches when agents run in parallel
   */
  async getBrowser(headless = false) {
    if (this.browser && this.browser.connected) {
      return this.browser;
    }
    if (this.launchPromise) {
      return this.launchPromise;
    }

    this.launchPromise = (async () => {
      try {
        const executablePath = this.getExecutablePath();
        const userDataDir = path.join(os.tmpdir(), 'stocksentinel-chrome-profile');
        if (!fs.existsSync(userDataDir)) {
          fs.mkdirSync(userDataDir, { recursive: true });
        }

        console.log(`[webcmd] Launching isolated Chrome instance (headless=${headless})...`);
        console.log(`[webcmd] Profile dir: ${userDataDir}`);

        this.browser = await puppeteer.launch({
          executablePath,
          headless: headless ? 'new' : false,
          slowMo: headless ? 0 : 50,
          userDataDir,
          defaultViewport: null,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--new-window',
            '--start-maximized',
            '--window-position=0,0',
            '--window-size=1440,900'
          ]
        });
        this.tabs = {};

        setTimeout(() => this.focusWindowOnWindows(), 800);
        console.log('[webcmd] Browser launched. Window should now be visible on your desktop.');
        return this.browser;
      } finally {
        this.launchPromise = null;
      }
    })();

    return this.launchPromise;
  }

  /**
   * Get or create a named browser tab (chart, news_search, trade) with safe concurrency lock
   */
  async getTab(name) {
    if (this.tabs[name] && !this.tabs[name].isClosed()) {
      return this.tabs[name];
    }
    if (this.tabPromises[name]) {
      return this.tabPromises[name];
    }

    this.tabPromises[name] = (async () => {
      try {
        const browser = await this.getBrowser(false);
        const existingPages = await browser.pages();
        const assignedPages = Object.values(this.tabs);

        // Find an unassigned blank tab or open new page
        let page = existingPages.find(p => !assignedPages.includes(p) && (p.url() === 'about:blank' || p.url() === 'chrome://newtab/'));
        if (!page) {
          page = await browser.newPage();
        }

        // Register immediately to prevent other concurrent calls from grabbing it
        this.tabs[name] = page;
        await page.setViewport({ width: 1400, height: 900 });
        return page;
      } finally {
        delete this.tabPromises[name];
      }
    })();

    return this.tabPromises[name];
  }

  /**
   * Focus a specific agent's tab on screen
   */
  async focusTab(name) {
    const page = await this.getTab(name);
    await page.bringToFront().catch(() => {});
    this.focusWindowOnWindows();
    return page;
  }

  /**
   * Inject institutional trading desk live telemetry HUD on active browser tab
   */
  async injectHUD(page, agentTag, message, color = '#38bdf8') {
    try {
      await page.evaluate((tag, msg, col) => {
        let hud = document.getElementById('stocksentinel-hud');
        if (!hud) {
          hud = document.createElement('div');
          hud.id = 'stocksentinel-hud';
          hud.style.cssText = `
            position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
            z-index: 2147483647; pointer-events: none;
            background: rgba(8, 12, 22, 0.94);
            backdrop-filter: blur(16px) saturate(180%);
            -webkit-backdrop-filter: blur(16px) saturate(180%);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-top: 2px solid ${col};
            border-radius: 10px;
            padding: 8px 18px;
            box-shadow: 0 16px 36px -6px rgba(0, 0, 0, 0.85), 0 0 20px ${col}33;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif;
            display: flex; align-items: center; gap: 16px;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            max-width: 90vw;
          `;
          document.body.appendChild(hud);
        }
        hud.style.borderTopColor = col;
        hud.style.boxShadow = `0 16px 36px -6px rgba(0, 0, 0, 0.85), 0 0 20px ${col}33`;

        const timeStr = new Date().toLocaleTimeString('en-IN', { hour12: false });
        hud.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="position: relative; display: flex; width: 8px; height: 8px;">
              <span style="position: absolute; width: 100%; height: 100%; border-radius: 50%; background: ${col}; opacity: 0.75; animation: ss-hud-ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>
              <span style="position: relative; width: 8px; height: 8px; border-radius: 50%; background: ${col};"></span>
            </span>
            <span style="font-family: 'JetBrains Mono', Menlo, monospace; font-size: 10px; font-weight: 800; letter-spacing: 1.2px; color: #f8fafc; text-transform: uppercase;">
              STOCKSENTINEL<span style="color: ${col}; opacity: 0.8;">::OS</span>
            </span>
          </div>

          <div style="width: 1px; height: 22px; background: rgba(255, 255, 255, 0.14);"></div>

          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="background: ${col}1a; border: 1px solid ${col}66; color: ${col}; font-family: 'JetBrains Mono', Menlo, monospace; font-size: 9.5px; font-weight: 700; padding: 3px 8px; border-radius: 5px; letter-spacing: 0.8px; text-transform: uppercase; white-space: nowrap;">
              ${tag}
            </span>
            <span style="font-size: 12px; font-weight: 500; color: #e2e8f0; letter-spacing: 0.2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 580px;">
              ${msg}
            </span>
          </div>

          <div style="width: 1px; height: 22px; background: rgba(255, 255, 255, 0.14);"></div>

          <div style="display: flex; align-items: center; gap: 8px; font-family: 'JetBrains Mono', Menlo, monospace; font-size: 9.5px; color: #94a3b8; letter-spacing: 0.5px;">
            <span style="color: #38bdf8; font-weight: 600;">NSE EQUITIES</span>
            <span>•</span>
            <span>${timeStr}</span>
          </div>
        `;

        if (!document.getElementById('ss-hud-style')) {
          const st = document.createElement('style');
          st.id = 'ss-hud-style';
          st.textContent = `@keyframes ss-hud-ping { 75%, 100% { transform: scale(2.2); opacity: 0; } }`;
          document.head.appendChild(st);
        }
      }, agentTag, message, color);
    } catch (e) {}
  }

  /**
   * Visibly highlight target elements with professional Bloomberg-grade bounding frames
   */
  async highlightElements(page, searchTerms, color = '#10b981', badgeLabel = 'TARGET IDENTIFIED') {
    try {
      await page.evaluate((terms, col, label) => {
        const queryTerms = Array.isArray(terms) ? terms : [terms];
        const elements = document.querySelectorAll('tr, article, li, div[data-rowkey], section, .news-card');
        let matched = 0;

        for (const el of elements) {
          const text = el.innerText || '';
          const hit = queryTerms.find(t => text.toLowerCase().includes(t.toLowerCase()));
          if (hit && matched < 6) {
            matched++;
            el.style.outline = `1.5px solid ${col}`;
            el.style.backgroundColor = `${col}0d`;
            el.style.borderRadius = '8px';
            el.style.position = 'relative';
            el.style.boxShadow = `0 0 16px ${col}26, inset 0 0 12px ${col}0d`;
            el.style.transition = 'all 0.3s ease';

            // Add sleek floating telemetry badge
            let badge = el.querySelector('.sentinel-highlight-badge');
            if (!badge) {
              badge = document.createElement('span');
              badge.className = 'sentinel-highlight-badge';
              badge.style.cssText = `
                position: absolute; top: 6px; right: 10px; z-index: 9999;
                background: rgba(8, 12, 22, 0.92);
                backdrop-filter: blur(8px);
                border: 1px solid ${col}88;
                box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 9.5px; font-weight: 700; letter-spacing: 0.6px;
                padding: 3px 8px; border-radius: 4px;
                display: flex; align-items: center; gap: 6px;
                pointer-events: none;
              `;
              badge.innerHTML = `
                <span style="width: 5px; height: 5px; border-radius: 50%; background: ${col}; box-shadow: 0 0 6px ${col};"></span>
                <span>${label}: <b style="color: ${col};">${hit}</b></span>
              `;
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
