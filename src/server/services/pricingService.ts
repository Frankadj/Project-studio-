import { db } from "../database/index.js";

export interface StockPrice {
  symbol: string;
  price: number;
  previousClose: number;
}

export function getLatestPrices(): Record<string, StockPrice> {
  const rows = db.prepare(`
    SELECT symbol, price, calculatedChange 
    FROM market_quotes
  `).all() as any[];

  const prices: Record<string, StockPrice> = {};
  for (const row of rows) {
    prices[row.symbol] = {
      symbol: row.symbol,
      price: row.price || 0,
      previousClose: (row.price || 0) - (row.calculatedChange || 0),
    };
  }
  return prices;
}

export function getLatestPrice(symbol: string): StockPrice | null {
  const row = db.prepare(`
    SELECT symbol, price, calculatedChange 
    FROM market_quotes
    WHERE symbol = ?
  `).get(symbol) as any;

  if (!row) return null;

  return {
    symbol: row.symbol,
    price: row.price || 0,
    previousClose: (row.price || 0) - (row.calculatedChange || 0),
  };
}
