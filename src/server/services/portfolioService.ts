import { db } from "../database/index.js";
import { getLatestPrices } from "./pricingService.js";
import { getTransactions, calculateHoldings, Holding } from "./holdingsService.js";

export interface PortfolioHolding extends Holding {
  currentPrice: number;
  previousClose: number;
  marketValue: number;
  todayReturn: number;
  todayReturnPercent: number;
  totalReturn: number;
  totalReturnPercent: number;
  name: string;
}

export interface PortfolioSummary {
  cashBalance: number;
  totalPortfolioValue: number;
  investedValue: number;
  todayReturn: number;
  todayReturnPercent: number;
  totalReturn: number;
  totalReturnPercent: number;
}

export interface FullPortfolio {
  summary: PortfolioSummary;
  holdings: PortfolioHolding[];
}

export function getAccountCashBalance(accountId: number = 1): number {
  const row = db.prepare("SELECT cash_balance FROM accounts WHERE id = ?").get(accountId) as any;
  return row ? row.cash_balance : 0;
}

export function updateAccountCashBalance(accountId: number, newBalance: number) {
  db.prepare("UPDATE accounts SET cash_balance = ? WHERE id = ?").run(newBalance, accountId);
}

export function buildPortfolio(accountId: number = 1): FullPortfolio {
  const cashBalance = getAccountCashBalance(accountId);
  const transactions = getTransactions(accountId);
  const holdingsMap = calculateHoldings(transactions);
  
  const prices = getLatestPrices();

  // Get company names
  const companies = db.prepare("SELECT symbol, name FROM companies").all() as any[];
  const companyNameMap: Record<string, string> = {};
  for (const c of companies) {
    companyNameMap[c.symbol] = c.name;
  }

  const portfolioHoldings: PortfolioHolding[] = [];
  let investedValue = 0;
  let totalMarketValue = 0;
  let summaryTodayReturn = 0;
  let summaryTotalReturn = 0;

  for (const symbol in holdingsMap) {
    const h = holdingsMap[symbol];
    const priceData = prices[symbol] || { symbol, price: h.averageCost, previousClose: h.averageCost };
    
    const currentPrice = priceData.price;
    const previousClose = priceData.previousClose || currentPrice;
    
    const marketValue = h.shares * currentPrice;
    
    const todayReturn = (currentPrice - previousClose) * h.shares;
    const todayReturnPercent = previousClose > 0 ? (todayReturn / (previousClose * h.shares)) * 100 : 0;

    const totalReturn = marketValue - h.totalCostBasis;
    const totalReturnPercent = h.totalCostBasis > 0 ? (totalReturn / h.totalCostBasis) * 100 : 0;

    investedValue += h.totalCostBasis;
    totalMarketValue += marketValue;
    summaryTodayReturn += todayReturn;
    summaryTotalReturn += totalReturn;

    portfolioHoldings.push({
      ...h,
      currentPrice,
      previousClose,
      marketValue,
      todayReturn,
      todayReturnPercent,
      totalReturn,
      totalReturnPercent,
      name: companyNameMap[symbol] || symbol,
    });
  }

  const totalPortfolioValue = cashBalance + totalMarketValue;
  
  // Percentages for the whole portfolio can be slightly tricky
  // Usually todayReturnPercent is relative to previous total portfolio value
  const previousPortfolioValue = totalPortfolioValue - summaryTodayReturn;
  const summaryTodayReturnPercent = previousPortfolioValue > 0 ? (summaryTodayReturn / previousPortfolioValue) * 100 : 0;
  
  summaryTotalReturn = totalPortfolioValue - 100000.0;
  const summaryTotalReturnPercent = (summaryTotalReturn / 100000.0) * 100;

  return {
    summary: {
      cashBalance,
      totalPortfolioValue,
      investedValue,
      todayReturn: summaryTodayReturn,
      todayReturnPercent: summaryTodayReturnPercent,
      totalReturn: summaryTotalReturn,
      totalReturnPercent: summaryTotalReturnPercent,
    },
    holdings: portfolioHoldings.sort((a, b) => b.marketValue - a.marketValue),
  };
}

export function generatePortfolioSnapshot(userId: number = 1) {
  const p = buildPortfolio(userId);
  db.prepare(`
    INSERT INTO portfolio_snapshots (
      user_id, timestamp, portfolio_value, cash_balance, 
      invested_value, total_return
    )
    VALUES (?, datetime('now'), ?, ?, ?, ?)
  `).run(
    userId,
    p.summary.totalPortfolioValue,
    p.summary.cashBalance,
    p.summary.investedValue,
    p.summary.totalReturn
  );
}
