export const marketIndices = [
  { label: 'S&P 500', value: '5,842.31', change: '+0.82%', positive: true, points: [18, 24, 20, 31, 27, 39, 35, 48, 43, 57, 53, 66] },
  { label: 'NASDAQ', value: '18,421.67', change: '+1.24%', positive: true, points: [20, 17, 28, 25, 38, 31, 47, 43, 52, 49, 63, 70] },
  { label: 'DOW JONES', value: '42,164.08', change: '−0.18%', positive: false, points: [62, 55, 60, 48, 53, 40, 44, 32, 37, 28, 34, 30] },
]

export const watchlist = [
  { symbol: 'NVDA', company: 'NVIDIA Corporation', price: '$142.87', change: '+2.41%', positive: true, spark: [22, 31, 25, 43, 35, 54, 49, 72] },
  { symbol: 'AAPL', company: 'Apple Inc.', price: '$231.42', change: '+0.73%', positive: true, spark: [30, 28, 42, 36, 48, 44, 57, 61] },
  { symbol: 'TSLA', company: 'Tesla, Inc.', price: '$338.59', change: '−1.14%', positive: false, spark: [64, 55, 62, 47, 51, 38, 43, 32] },
  { symbol: 'MSFT', company: 'Microsoft Corp.', price: '$521.08', change: '+0.36%', positive: true, spark: [32, 40, 36, 47, 42, 55, 51, 59] },
]

export const newsDemo = [
  { time: '09:42 AM', tag: 'MARKETS', headline: 'Treasury yields ease as investors await the latest inflation data', source: 'MarketWire' },
  { time: '09:18 AM', tag: 'TECHNOLOGY', headline: 'Chipmakers lead early session gains after upbeat sector outlook', source: 'Alpha Desk' },
  { time: '08:56 AM', tag: 'ECONOMY', headline: 'Small-cap index extends weekly advance into the open', source: 'MarketWire' },
]

export const featureCatalog = [
  { name: 'Market Overview', code: 'market-overview', icon: '◉', description: 'Major indices and a quick simulated market snapshot.' },
  { name: 'Stock Watchlist', code: 'watchlist', icon: '☆', description: 'Track selected symbols with illustrative prices.' },
  { name: 'Stock Charts', code: 'basic-charts', icon: '⌁', description: 'Simple price movement charts using demo data.' },
  { name: 'Market News', code: 'market-news', icon: '▤', description: 'A short list of example market headlines.' },
  { name: 'Portfolio Summary', code: 'portfolio-analytics', icon: '◒', description: 'An illustrative portfolio value and daily move.' },
]
