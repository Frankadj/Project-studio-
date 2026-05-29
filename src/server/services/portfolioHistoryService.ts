import { reconstructPortfolioAtDate } from "./portfolioReconstructionEngine.js";
import { db } from "../database/index.js";

function getDaysForRange(userId: number, range: string): number {
  const now = new Date();
  
  switch (range) {
    case "1W": return 7;
    case "1M": return 30;
    case "3M": return 90;
    case "6M": return 180;
    case "YTD": {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      return Math.max(1, Math.floor((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)));
    }
    case "1Y": return 365;
    case "5Y": return 1825;
    case "ALL": {
      const row = db.prepare('SELECT MIN(transaction_date) as minDate FROM transactions WHERE user_id = ?').get(userId) as { minDate: string | null };
      if (row && row.minDate) {
        const firstDate = new Date(row.minDate);
        const diffDays = Math.floor((now.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
        return Math.max(30, diffDays + 7); // add a week before first transaction for context
      }
      return 30; // fallback if no transactions
    }
    default: return 30; // Default to 1M
  }
}

export function generateHistoricalPortfolioChart(userId: number, range: string) {
  const days = getDaysForRange(userId, range);
  const now = new Date();
  const chartData = [];

  // Reconstruct portfolio for each day in range
  for (let i = days; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateIso = d.toISOString().replace('T', ' ').substring(0, 19);
    
    const snapshot = reconstructPortfolioAtDate(userId, dateIso);
    chartData.push({
      timestamp: snapshot.timestamp,
      portfolioValue: snapshot.portfolioValue,
      cashBalance: snapshot.cashBalance,
      investedValue: snapshot.investedValue,
      totalReturn: snapshot.portfolioValue - 100000 // assuming 100k starting cash
    });
  }

  return chartData;
}
