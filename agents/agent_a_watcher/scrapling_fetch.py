#!/usr/bin/env python3
"""
StockSentinel Scrapling Fetcher
Uses Scrapling for undetected, lightning-fast DOM retrieval of financial news.
Forms webcmd's structural memory in milliseconds.
"""

import sys
import json
import time
from scrapling import Fetcher

def fetch_articles(url: str):
    start_time = time.time()
    try:
        fetcher = Fetcher()
        response = fetcher.get(url, timeout=12)
        
        articles = []
        
        # Scrapling fast DOM selection
        cards = response.css('section, article, li, div[data-testid="storyitem"], .js-stream-content')
        
        for card in cards[:40]:
            title_nodes = card.css('h2, h3, a.subtle-link, [data-testid="headline"]')
            snippet_nodes = card.css('p')

            
            title = ""
            for t in title_nodes:
                text = t.text.strip()
                if len(text) > 15:
                    title = text
                    break
                    
            snippet = ""
            for s in snippet_nodes:
                text = s.text.strip()
                if len(text) > 20 and text != title:
                    snippet = text
                    break
            
            if title:
                articles.append({
                    "headline": title,
                    "snippet": snippet or title,
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "retrieval_ms": int((time.time() - start_time) * 1000)
                })
                
        elapsed_ms = int((time.time() - start_time) * 1000)
        return {
            "ok": True,
            "url": url,
            "elapsed_ms": elapsed_ms,
            "articles": articles
        }
    except Exception as e:
        return {
            "ok": False,
            "url": url,
            "error": str(e),
            "articles": []
        }

if __name__ == "__main__":
    target_url = sys.argv[1] if len(sys.argv) > 1 else "https://finance.yahoo.com/topic/stock-market-news/"
    result = fetch_articles(target_url)
    print(json.dumps(result))
