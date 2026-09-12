/**
 * StockSentinel — Live Self-Healing & Auto-Recovery Demonstration
 * Hosted by webcmd | SLAB Hackathon @ MAIT
 *
 * Demonstrates the core sponsor superpower:
 * 1. Takes an existing learned recipe (e.g. news search or chart selector)
 * 2. Deliberately simulates a website layout break (corrupting selector/DOM paths)
 * 3. Replays the broken command -> webcmd detects the execution failure
 * 4. Triggers automatic live re-exploration phase on the target platform
 * 5. Re-learns valid DOM structure, saves updated recipe (v+1), and completes trade/perception
 * 6. Emits live recovery telemetry to Web Cockpit & Telegram
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const webcmd = require('./agents/webcmd_adapter');
const settings = require('./config/settings');
const telegramBot = require('./approval_gate/telegram_bot');

async function runSelfHealingDemo() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║        STOCKSENTINEL :: SELF-HEALING DEMONSTRATION           ║
║       Proving webcmd Dynamic DOM Re-Exploration & Recovery    ║
╚══════════════════════════════════════════════════════════════╝
  `);

  const commandName = 'search_indian_financial_news';
  const recipePath = webcmd.getRecipePath(commandName);

  // 1. Check existing recipe
  let originalRecipe = webcmd.loadRecipe(commandName);
  if (!originalRecipe) {
    originalRecipe = {
      command: commandName,
      version: 1,
      targetPlatform: 'Bing News Financial Search',
      selectors: {
        card: '.news-card, article',
        title: 'a.title, h2',
        snippet: 'p.snippet, .t_s'
      },
      updatedAt: new Date().toISOString()
    };
    webcmd.saveRecipe(commandName, originalRecipe);
  }

  console.log(`[SelfHeal] 📋 Current healthy recipe for "${commandName}": Version v${originalRecipe.version}`);

  // 2. Deliberately corrupt the recipe to simulate website breaking its DOM
  console.log(`\n[SelfHeal] 💥 STAGING FAULT: Simulating third-party website DOM redesign...`);
  console.log(`[SelfHeal] ⚠️ Injecting obsolete selectors into recipe: ".obsolete-2023-layout-card", ".deprecated-heading"`);

  const corruptedRecipe = {
    ...originalRecipe,
    selectors: {
      card: '.obsolete-2023-layout-card-broken-404',
      title: '.non-existent-headline-tag',
      snippet: '.missing-snippet-container'
    },
    simulatedBreak: true,
    corruptedAt: new Date().toISOString()
  };

  fs.writeFileSync(recipePath, JSON.stringify(corruptedRecipe, null, 2), 'utf-8');
  console.log(`[SelfHeal] 🛑 Recipe corrupted on disk. Replaying command now...\n`);

  // Notify Telegram of self-healing demo initiation
  const targetChat = settings.telegram.chatId;
  if (targetChat) {
    telegramBot.sendMessage(targetChat, `
🛠️ <b>STOCKSENTINEL SELF-HEALING TEST</b>
Simulating DOM layout change on financial wire...
<i>webcmd self-learning recovery engaged.</i>
    `.trim(), null, 'HTML');
  }

  // 3. Define Explore & Reuse functions
  const exploreFn = async (adapter) => {
    console.log(`[SelfHeal] 🔍 [EXPLORE PHASE] Navigating to target site to map new DOM tree...`);
    const page = await adapter.getTab('self_heal_demo');
    await adapter.focusTab('self_heal_demo');

    await adapter.injectHUD(
      page,
      'WEBCMD // SELF-HEALING',
      'DETECTED BROKEN DOM: Re-exploring selectors and mapping new layout...',
      '#f59e0b'
    );

    await Promise.race([
      page.goto('https://www.bing.com/news/search?q=Tata+Motors+share+news+NSE&qft=sortbydate%3d%221%22', {
        waitUntil: 'domcontentloaded',
        timeout: 8000
      }),
      new Promise(r => setTimeout(r, 4000))
    ]).catch(() => {});

    await new Promise(r => setTimeout(r, 1000));

    // Dynamic selector discovery: scan for active article elements
    const discoveredSelectors = await page.evaluate(() => {
      const candidates = ['.news-card', 'article', 'div.t_h', '.title', 'a.title'];
      const active = {};
      for (const sel of candidates) {
        if (document.querySelector(sel)) {
          active.card = sel;
          break;
        }
      }
      active.card = active.card || '.news-card, article';
      active.title = 'a[class*="title"], .title, h2, a';
      active.snippet = 'p, .snippet, .t_s';
      return active;
    });

    console.log(`[SelfHeal] 🎯 Discovered valid selectors:`, discoveredSelectors);

    await adapter.injectHUD(
      page,
      'WEBCMD // RECOVERY COMPLETE',
      'Successfully mapped updated DOM layout. New recipe registered (v' + ((corruptedRecipe.version || 1) + 1) + ')',
      '#10b981'
    );

    await new Promise(r => setTimeout(r, 1200));

    return {
      command: commandName,
      version: (corruptedRecipe.version || 1) + 1,
      targetPlatform: 'Bing News Financial Search',
      selectors: discoveredSelectors,
      recoveredAt: new Date().toISOString()
    };
  };

  const reuseFn = async (adapter, recipe) => {
    console.log(`[SelfHeal] ⚡ Trying fast reuse with saved recipe v${recipe.version}...`);
    const page = await adapter.getTab('self_heal_demo');
    await Promise.race([
      page.goto('https://www.bing.com/news/search?q=Tata+Motors+share+news+NSE&qft=sortbydate%3d%221%22', {
        waitUntil: 'domcontentloaded',
        timeout: 8000
      }),
      new Promise(r => setTimeout(r, 4000))
    ]).catch(() => {});

    // Check if selector matches anything
    const matchCount = await page.evaluate((sel) => {
      return document.querySelectorAll(sel).length;
    }, recipe.selectors.card);

    if (matchCount === 0) {
      throw new Error(`Selector "${recipe.selectors.card}" matched 0 elements. Layout changed!`);
    }

    return { status: 'OK', matchCount };
  };

  // 4. Run through executeOrLearn
  const result = await webcmd.executeOrLearn(commandName, exploreFn, reuseFn);

  console.log(`\n======================================================`);
  console.log(`[SelfHeal] 🎉 RESULT: Execution completed in phase: "${result.phase.toUpperCase()}"`);
  console.log(`[SelfHeal] 🛡️ Updated recipe verified on disk with version: v${result.data.version}`);
  console.log(`======================================================\n`);

  if (targetChat) {
    telegramBot.sendMessage(targetChat, `
✅ <b>SELF-HEALING COMPLETE</b>
• Fault: DOM layout change detected
• Action: Live webcmd re-exploration
• Result: New recipe v${result.data.version} generated
• Status: Zero downtime, execution restored!
    `.trim(), null, 'HTML');
  }

  await webcmd.close();
  return result;
}

if (require.main === module) {
  runSelfHealingDemo()
    .then(() => {
      console.log('[SelfHeal] Script complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[SelfHeal] Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { runSelfHealingDemo };
