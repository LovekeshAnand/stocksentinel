/**
 * StockSentinel Watchlist Configuration — Indian Equities (NSE / BSE)
 * High-liquidity Nifty 50 market leaders for live pattern & catalyst monitoring
 */

module.exports = {
  currency: 'INR',
  currencySymbol: '₹',
  exchange: 'NSE',
  tickers: [
    {
      symbol: 'RELIANCE',
      name: 'Reliance Industries Ltd.',
      keywords: ['Reliance', 'RIL', 'Mukesh Ambani', 'Jio', 'Reliance Retail', 'Jio Financial'],
      defaultQuantity: 15,
      maxQuantity: 100,
      sector: 'Energy / Telecommunications / Retail'
    },
    {
      symbol: 'TATAMOTORS',
      name: 'Tata Motors Ltd.',
      keywords: ['Tata Motors', 'TATAMOTORS', 'JLR', 'Jaguar Land Rover', 'Nexon EV', 'TaMo', 'Tata EV'],
      defaultQuantity: 25,
      maxQuantity: 150,
      sector: 'Automotive / Electric Vehicles'
    },
    {
      symbol: 'HDFCBANK',
      name: 'HDFC Bank Ltd.',
      keywords: ['HDFC Bank', 'HDFCBANK', 'HDFC', 'Shashidhar Jagdishan', 'private bank credit'],
      defaultQuantity: 20,
      maxQuantity: 100,
      sector: 'Banking & Financial Services'
    },
    {
      symbol: 'TCS',
      name: 'Tata Consultancy Services Ltd.',
      keywords: ['TCS', 'Tata Consultancy', 'K Krithivasan', 'IT export', 'BFSI tech'],
      defaultQuantity: 10,
      maxQuantity: 50,
      sector: 'Information Technology'
    },
    {
      symbol: 'INFY',
      name: 'Infosys Ltd.',
      keywords: ['Infosys', 'INFY', 'Salil Parekh', 'Narayana Murthy', 'digital transformation'],
      defaultQuantity: 15,
      maxQuantity: 75,
      sector: 'Information Technology'
    },
    {
      symbol: 'ICICIBANK',
      name: 'ICICI Bank Ltd.',
      keywords: ['ICICI Bank', 'ICICIBANK', 'Sandeep Bakhshi', 'retail loan growth'],
      defaultQuantity: 20,
      maxQuantity: 100,
      sector: 'Banking & Financial Services'
    }
  ]
};
