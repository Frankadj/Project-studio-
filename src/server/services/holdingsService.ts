import { db } from "../database/index.js";

export interface Transaction {
  id: number;
  user_id: number;
  symbol: string;
  type: "BUY" | "SELL";
  shares: number;
  price_per_share: number;
  transaction_date: string;
  fees: number;
  notes?: string | null;
  created_at: string;
}

export interface Holding {
  symbol: string;
  shares: number;
  averageCost: number;
  totalCostBasis: number;
}

export function getTransactions(userId: number = 1): Transaction[] {
  return db.prepare(`
    SELECT id, user_id, symbol, type, shares, price_per_share, transaction_date, fees, notes, created_at 
    FROM transactions 
    WHERE user_id = ? 
    ORDER BY transaction_date ASC, id ASC
  `).all(userId) as Transaction[];
}

export function addTransaction(
  userId: number = 1,
  symbol: string,
  type: "BUY" | "SELL",
  shares: number,
  price: number,
  date?: string,
  fees: number = 0,
  notes: string | null = null
) {
  const transactionTime = date || new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO transactions (user_id, symbol, type, shares, price_per_share, transaction_date, fees, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(userId, symbol, type, shares, price, transactionTime, fees, notes, new Date().toISOString());
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
      const cost = tx.shares * tx.price_per_share;
      holding.totalCostBasis += cost;
      holding.shares += tx.shares;
      holding.averageCost = holding.shares > 0 ? holding.totalCostBasis / holding.shares : 0;
    } else if (tx.type === "SELL") {
      holding.shares -= tx.shares;
      if (holding.shares <= 0.0001) { // Floating point safety
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
