import { db } from "../database/index.js";

export interface Transaction {
  id: number;
  symbol: string;
  type: "BUY" | "SELL";
  shares: number;
  price: number;
  timestamp: string;
}

export interface Holding {
  symbol: string;
  shares: number;
  averageCost: number;
  totalCostBasis: number;
}

export function getTransactions(accountId: number = 1): Transaction[] {
  return db.prepare(`
    SELECT id, symbol, type, shares, price, timestamp 
    FROM transactions 
    WHERE account_id = ? 
    ORDER BY timestamp ASC, id ASC
  `).all(accountId) as Transaction[];
}

export function addTransaction(
  accountId: number = 1,
  symbol: string,
  type: "BUY" | "SELL",
  shares: number,
  price: number
) {
  const stmt = db.prepare(`
    INSERT INTO transactions (account_id, symbol, type, shares, price, timestamp)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `);
  stmt.run(accountId, symbol, type, shares, price);
}

export function calculateHoldings(transactions: Transaction[]): Record<string, Holding> {
  const holdings: Record<string, Holding> = {};

  for (const tx of transactions) {
    if (!holdings[tx.symbol]) {
      holdings[tx.symbol] = {
        symbol: tx.symbol,
        shares: 0,
        averageCost: 0,
        totalCostBasis: 0,
      };
    }

    const holding = holdings[tx.symbol];

    if (tx.type === "BUY") {
      const cost = tx.shares * tx.price;
      holding.totalCostBasis += cost;
      holding.shares += tx.shares;
      holding.averageCost = holding.shares > 0 ? holding.totalCostBasis / holding.shares : 0;
    } else if (tx.type === "SELL") {
      holding.shares -= tx.shares;
      if (holding.shares <= 0) {
        holding.shares = 0;
        holding.totalCostBasis = 0;
        holding.averageCost = 0;
      } else {
        // Average cost remains the same, reduce totalCostBasis proportionally
        holding.totalCostBasis = holding.shares * holding.averageCost;
      }
    }
  }

  // Remove empty holdings
  for (const symbol in holdings) {
    if (holdings[symbol].shares <= 0) {
      delete holdings[symbol];
    }
  }

  return holdings;
}
