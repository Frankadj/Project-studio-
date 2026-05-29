import { getTransactions, calculateHoldings } from "./holdingsService.js";
import { getHistoricalClosePrice } from "./historicalPricingService.js";

interface ReconstructedSnapshot {
  timestamp: string;
  portfolioValue: number;
  cashBalance: number;
  investedValue: number;
}

export function reconstructPortfolioAtDate(userId: number, dateIso: string): ReconstructedSnapshot {
  // 1. Get all transactions before or on this date
  const allTx = getTransactions(userId);
  const relevantTx = allTx.filter(tx => tx.transaction_date.localeCompare(dateIso) <= 0);

  // Let's assume baseline Starting Cash
  let reconstructedCash = 100000;
  
  const sharesOwned: Record<string, number> = {};

  for (const tx of relevantTx) {
    if (!sharesOwned[tx.symbol]) sharesOwned[tx.symbol] = 0;

    const value = tx.shares * tx.price_per_share + tx.fees;
    if (tx.type === "BUY") {
      reconstructedCash -= value;
      // update average cost and shares
      sharesOwned[tx.symbol] += tx.shares;
    } else if (tx.type === "SELL") {
      reconstructedCash += (tx.shares * tx.price_per_share - tx.fees);
      sharesOwned[tx.symbol] -= tx.shares;
      if (sharesOwned[tx.symbol] < 0.0001) sharesOwned[tx.symbol] = 0;
    }
  }

  let totalHoldingsValue = 0;
  // Cost basis recalculation using calculateHoldings logic
  const holdingsMap = calculateHoldings(relevantTx);
  let investedValue = 0;

  for (const symbol in holdingsMap) {
    const holding = holdingsMap[symbol];
    if (holding.shares <= 0) continue;

    investedValue += holding.totalCostBasis;
    const historicalPrice = getHistoricalClosePrice(symbol, dateIso) || holding.averageCost;
    totalHoldingsValue += (holding.shares * historicalPrice);
  }

  return {
    timestamp: dateIso,
    portfolioValue: reconstructedCash + totalHoldingsValue,
    cashBalance: reconstructedCash,
    investedValue
  };
}
