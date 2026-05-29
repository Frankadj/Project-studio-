import { db } from "../database/index.js";

export function getHistoricalClosePrice(symbol: string, dateIso: string): number | null {
  const dateStr = dateIso.split("T")[0]; // YYYY-MM-DD
  
  // Try to find the exact date
  const exactMatch = db.prepare(`
    SELECT close FROM historical_quotes 
    WHERE symbol = ? AND tradingDate <= ? 
    ORDER BY tradingDate DESC 
    LIMIT 1
  `).get(symbol, dateStr) as { close: number } | undefined;
  
  if (exactMatch && exactMatch.close) {
    return exactMatch.close;
  }
  
  // Fallback to market_quotes if we somehow don't have historical data but it's today
  const today = new Date().toISOString().split("T")[0];
  if (dateStr === today) {
    const liveMatch = db.prepare(`SELECT price as close FROM market_quotes WHERE symbol = ?`).get(symbol) as { close: number } | undefined;
    if (liveMatch) return liveMatch.close;
  }

  return null;
}

export function batchHistoricalClosePrices(symbols: string[], dateIso: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const symbol of symbols) {
    const price = getHistoricalClosePrice(symbol, dateIso);
    if (price !== null) {
      result[symbol] = price;
    }
  }
  return result;
}
