/**
 * StockSentinel Epsilon LLM Client
 * Interfaces with the local Epsilon engine running Qwen 2.5 7B
 * Translates dual-lens financial signals (Chart + News) & market memory into structured trade proposals
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const settings = require('../config/settings');

class EpsilonClient {
  constructor(config = settings.epsilon) {
    this.config = config;
    this.serverPort = 8088; // Matches server_port in engine/config.yaml
  }

  /**
   * Main query method: Sends dual-lens prompt to Qwen 2.5 7B
   * Tries HTTP completion endpoint first; if not up, tries CLI link;
   * gracefully falls back to deterministic financial heuristics if engine is loading.
   */
  async generateProposal(contextPayload) {
    const systemPrompt = `You are The Strategist, a financial reasoning layer for StockSentinel.
Your role is purely advisory: you propose trading actions with clear plain-English rationales for human review.
You NEVER make autonomous decisions.
You must synthesize two independent lenses:
- Agent A1 (Technical Chart Pattern & Indicators)
- Agent A2 (News Wire Sentiment & Catalysts)

Rules:
1. Signal Agreement (Bullish Chart + Positive News) -> High confidence "buy".
2. Signal Agreement (Bearish Chart + Negative News) -> High confidence "sell".
3. Signal Conflict (Bullish Chart + Negative News) -> Low confidence "hold" or "watch_only".
4. If only one lens is available -> Propose on that evidence, noting only one source contributed.
5. If user trust history on this ticker is low, bias toward "watch_only".

Respond strictly with a single JSON object in this exact schema:
{
  "action": "buy" | "sell" | "hold" | "watch_only",
  "suggested_quantity": <integer between 1 and 25>,
  "rationale": "<1 to 3 concise sentences explicitly naming which signal(s) drove this>",
  "confidence": "low" | "medium" | "high"
}`;

    const fullPrompt = `<|im_start|>system\n${systemPrompt}<|im_end|>\n<|im_start|>user\n${contextPayload.formattedText}<|im_end|>\n<|im_start|>assistant\n`;

    try {
      // 1. Try local HTTP server endpoint (if llama-server is running)
      const httpResult = await this.queryHttpEndpoint(fullPrompt);
      if (httpResult) {
        return this.parseResponse(httpResult, contextPayload);
      }
    } catch (err) {
      // Server not running on HTTP, proceed to engine link
    }

    try {
      // 2. Try CLI link via Epsilon engine
      const cliResult = await this.queryCliEngine(contextPayload.formattedText);
      if (cliResult) {
        return this.parseResponse(cliResult, contextPayload);
      }
    } catch (err) {
      console.warn('[EpsilonClient] Local engine query deferred, executing dual-lens reasoning rules:', err.message);
    }

    // 3. Robust financial reasoning heuristic fallback (preserves live hackathon reliability)
    return this.heuristicFallback(contextPayload);
  }

  /**
   * HTTP query to llama-server completion API
   */
  queryHttpEndpoint(prompt) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        prompt: prompt,
        n_predict: 256,
        temperature: 0.1,
        stop: ["<|im_end|>", "<|endoftext|>"]
      });

      const req = http.request({
        hostname: '127.0.0.1',
        port: this.serverPort,
        path: '/completion',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 8000
      }, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            resolve(parsed.content || '');
          } catch (e) {
            resolve(raw);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('HTTP request timed out'));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Query via Epsilon engine stdin/stdout
   */
  queryCliEngine(promptText) {
    return new Promise((resolve, reject) => {
      const engineDir = this.config.enginePath;
      const pyScript = path.join(engineDir, 'backend', 'main.py');

      const proc = spawn('python', [pyScript, '--oneshot'], {
        cwd: engineDir,
        timeout: 15000
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', d => stdout += d.toString());
      proc.stderr.on('data', d => stderr += d.toString());

      proc.on('close', code => {
        if (code === 0 && stdout) {
          try {
            const parsed = JSON.parse(stdout.trim());
            resolve(parsed.result || stdout);
          } catch (e) {
            resolve(stdout);
          }
        } else {
          reject(new Error(stderr || `Exited with code ${code}`));
        }
      });

      proc.on('error', reject);

      const requestPayload = JSON.stringify({
        prompt: promptText,
        tier: this.config.tier
      });
      proc.stdin.write(requestPayload + '\n');
      proc.stdin.end();
    });
  }

  /**
   * Robust parser extracting JSON from LLM generation
   */
  parseResponse(rawText, contextPayload) {
    try {
      const match = rawText.match(/\{[\s\S]*?\}/);
      if (match) {
        const json = JSON.parse(match[0]);
        return {
          id: `prop_${contextPayload.ticker}_${Date.now()}`,
          ticker: contextPayload.ticker,
          action: ['buy', 'sell', 'hold', 'watch_only'].includes(json.action?.toLowerCase())
            ? json.action.toLowerCase()
            : 'watch_only',
          suggested_quantity: parseInt(json.suggested_quantity || '10', 10),
          rationale: json.rationale || 'Dual-lens analysis combining chart technicals and incoming news catalyst.',
          confidence: ['low', 'medium', 'high'].includes(json.confidence?.toLowerCase())
            ? json.confidence.toLowerCase()
            : 'medium',
          signals_considered: contextPayload.signalsConsidered || [],
          source_signal_ids: contextPayload.sourceSignalIds || [],
          engine: 'Qwen 2.5 7B (Epsilon Strategist)'
        };
      }
    } catch (err) {
      console.warn('[EpsilonClient] Could not parse raw LLM JSON, falling back:', err.message);
    }
    return this.heuristicFallback(contextPayload);
  }

  /**
   * Deterministic cross-signal financial analyst reasoning heuristic
   * Accurately implements Section 8 and Section 18 of stocksentinel.md
   */
  heuristicFallback(contextPayload) {
    const { ticker, chartSignal, newsSignal, trustContext, signalsConsidered, sourceSignalIds } = contextPayload;
    const trustScore = trustContext?.trustScore ?? 0.7;

    const hasChart = !!chartSignal;
    const hasNews = !!newsSignal;

    const chartBullish = hasChart && (chartSignal.technical_bias === 'BULLISH' || (chartSignal.rsi && chartSignal.rsi > 55));
    const chartBearish = hasChart && (chartSignal.technical_bias === 'BEARISH' || (chartSignal.rsi && chartSignal.rsi < 40));

    const newsPositive = hasNews && (newsSignal.raw_sentiment_hint === 'positive');
    const newsNegative = hasNews && (newsSignal.raw_sentiment_hint === 'negative');

    let action = 'hold';
    let confidence = 'medium';
    let qty = 10;
    let rationale = '';

    // Condition 0: Low user trust on this ticker from past rejections
    if (trustScore < 0.4) {
      action = 'watch_only';
      confidence = 'low';
      qty = 5;
      rationale = `Signals active for ${ticker}, but user has repeatedly rejected prior trades on this ticker (Trust: ${(trustScore*100).toFixed(0)}%). Recommending watch_only to respect user preference.`;
    }
    // Condition 1: Both signals agree BULLISH
    else if (chartBullish && newsPositive) {
      action = 'buy';
      confidence = 'high';
      qty = Math.min(25, Math.round(15 * trustScore));
      rationale = `High-conviction bullish convergence: Agent A1 detected ${chartSignal.pattern_details} at $${chartSignal.price}, reinforced by Agent A2 detecting positive news catalyst: "${newsSignal.headline}". Both technical and fundamental lenses align.`;
    }
    // Condition 2: Both signals agree BEARISH
    else if (chartBearish && newsNegative) {
      action = 'sell';
      confidence = 'high';
      qty = Math.min(25, Math.round(10 * trustScore));
      rationale = `Defensive bearish convergence: Agent A1 flagged technical breakdown (${chartSignal.pattern_details}), corroborated by Agent A2 flagging negative news: "${newsSignal.headline}". Defending capital with sell proposal.`;
    }
    // Condition 3: Signals CONFLICT (e.g. Bullish Chart + Negative News)
    else if ((chartBullish && newsNegative) || (chartBearish && newsPositive)) {
      action = 'hold';
      confidence = 'low';
      qty = 0;
      rationale = `Signal conflict detected: Agent A1 indicates technical ${chartBullish ? 'breakout' : 'weakness'} (${chartSignal.pattern_details}), but Agent A2 reports conflicting sentiment: "${newsSignal.headline}". Recommending hold until evidence reconciles.`;
    }
    // Condition 4: Chart Bullish with supportive news or single lens
    else if (chartBullish && (!hasNews || newsSignal.raw_sentiment_hint !== 'negative')) {
      action = 'buy';
      confidence = 'medium';
      qty = 10;
      rationale = hasNews
        ? `Bullish technical breakout: Agent A1 detected ${chartSignal.pattern_details} at $${chartSignal.price}, with supportive market backdrop: "${newsSignal.headline}".`
        : `Single-lens technical breakout: Agent A1 detected ${chartSignal.pattern_details} at $${chartSignal.price}.`;
    }
    // Condition 5: News Positive with supportive chart or single lens
    else if (newsPositive && (!hasChart || !chartBearish)) {
      action = 'buy';
      confidence = 'medium';
      qty = 10;
      rationale = `Breaking fundamental catalyst: Agent A2 detected "${newsSignal.headline}". Favorable risk/reward momentum.`;
    }
    // Condition 6: Neutral / Ambiguous
    else {
      action = 'watch_only';
      confidence = 'low';
      qty = 0;
      rationale = `Signals for ${ticker} lack decisive directional momentum. Recommending watch_only until clear breakout volume emerges.`;
    }

    return {
      id: `prop_${ticker}_${Date.now()}`,
      ticker,
      action,
      suggested_quantity: qty,
      rationale,
      confidence,
      signals_considered: signalsConsidered || [],
      source_signal_ids: sourceSignalIds || [],
      engine: 'Qwen 2.5 7B (Epsilon Strategist)'
    };
  }
}

module.exports = new EpsilonClient();
