/**
 * StockSentinel Watchlist Configuration
 * Defines target tickers, search keywords, and risk thresholds
 */

module.exports = {
  tickers: [
    {
      symbol: 'TSLA',
      name: 'Tesla, Inc.',
      keywords: ['Tesla', 'TSLA', 'Elon Musk', 'Supercharger', 'Gigafactory', 'Cybercab'],
      defaultQuantity: 10,
      maxQuantity: 50,
      sector: 'Automotive / Tech'
    },
    {
      symbol: 'NVDA',
      name: 'NVIDIA Corporation',
      keywords: ['Nvidia', 'NVDA', 'Jensen Huang', 'Blackwell', 'Hopper', 'AI chip', 'GPU demand'],
      defaultQuantity: 5,
      maxQuantity: 25,
      sector: 'Semiconductors'
    },
    {
      symbol: 'AAPL',
      name: 'Apple Inc.',
      keywords: ['Apple', 'AAPL', 'iPhone', 'Tim Cook', 'Apple Intelligence', 'Vision Pro'],
      defaultQuantity: 15,
      maxQuantity: 100,
      sector: 'Consumer Electronics'
    },
    {
      symbol: 'MSFT',
      name: 'Microsoft Corporation',
      keywords: ['Microsoft', 'MSFT', 'Satya Nadella', 'Azure', 'Copilot', 'OpenAI'],
      defaultQuantity: 10,
      maxQuantity: 50,
      sector: 'Enterprise Software'
    },
    {
      symbol: 'GOOGL',
      name: 'Alphabet Inc.',
      keywords: ['Google', 'GOOGL', 'Alphabet', 'Sundar Pichai', 'Gemini', 'Google Cloud'],
      defaultQuantity: 10,
      maxQuantity: 50,
      sector: 'Internet Services'
    }
  ]
};
