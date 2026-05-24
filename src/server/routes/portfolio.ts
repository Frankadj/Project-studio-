import { Router } from "express";
import { buildPortfolio, getAccountCashBalance, updateAccountCashBalance, generatePortfolioSnapshot } from "../services/portfolioService.js";
import { getLatestPrice } from "../services/pricingService.js";
import { addTransaction, getTransactions, calculateHoldings } from "../services/holdingsService.js";
import { db } from "../database/index.js";

const router = Router();

router.get("/", (req, res) => {
  try {
    const portfolio = buildPortfolio(1);
    res.json(portfolio);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/trade/buy", (req, res) => {
  try {
    const { symbol, shares } = req.body;
    if (!symbol || !shares || shares <= 0) {
      return res.status(400).json({ error: "Invalid request" });
    }

    const priceData = getLatestPrice(symbol);
    if (!priceData || priceData.price <= 0) {
      return res.status(400).json({ error: "Invalid symbol or price not available" });
    }

    const cost = priceData.price * shares;
    const cash = getAccountCashBalance(1);

    if (cash < cost) {
      return res.status(400).json({ error: "Insufficient buying power" });
    }

    updateAccountCashBalance(1, cash - cost);
    addTransaction(1, symbol, "BUY", shares, priceData.price);
    
    // trigger snapshot update
    generatePortfolioSnapshot(1);

    res.json({ success: true, message: "Trade executed" });
  } catch(error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/trade/sell", (req, res) => {
  try {
    const { symbol, shares } = req.body;
    if (!symbol || !shares || shares <= 0) {
      return res.status(400).json({ error: "Invalid request" });
    }

    const txs = getTransactions(1);
    const holdings = calculateHoldings(txs);
    const holding = holdings[symbol];

    if (!holding || holding.shares < shares) {
      return res.status(400).json({ error: "Insufficient shares" });
    }

    const priceData = getLatestPrice(symbol);
    if (!priceData || priceData.price <= 0) {
      return res.status(400).json({ error: "Invalid symbol or price not available" });
    }

    const proceeds = priceData.price * shares;
    const cash = getAccountCashBalance(1);

    updateAccountCashBalance(1, cash + proceeds);
    addTransaction(1, symbol, "SELL", shares, priceData.price);

    // trigger snapshot update
    generatePortfolioSnapshot(1);

    res.json({ success: true, message: "Trade executed" });
  } catch(error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/history", (req, res) => {
  try {
    const txs = getTransactions(1);
    res.json(txs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/chart", (req, res) => {
  try {
    const range = (req.query.range as string) || "1M";
    
    let days = 30; // default 1M
    switch(range) {
      case "1W": days = 7; break;
      case "1M": days = 30; break;
      case "3M": days = 90; break;
      case "6M": days = 180; break;
      case "1Y": days = 365; break;
      case "5Y": days = 365 * 5; break;
      case "ALL": days = 365 * 10; break;
    }

    const snapshots = db.prepare(`
      SELECT timestamp, total_portfolio_value, cash_balance, invested_value
      FROM portfolio_snapshots
      WHERE account_id = 1 AND timestamp >= datetime('now', ?)
      ORDER BY timestamp ASC
    `).all(`-${days} days`) as any[];

    res.json(snapshots.map(s => {
      const holdingsValue = Math.max(0, s.total_portfolio_value - s.cash_balance);
      const costBasis = s.invested_value || 0;
      const holdingsReturn = holdingsValue - costBasis;
      const holdingsReturnPercent = costBasis > 0 ? (holdingsReturn / costBasis) * 100 : 0;
      return {
        timestamp: s.timestamp,
        totalPortfolioValue: s.total_portfolio_value,
        cashBalance: s.cash_balance,
        holdingsValue,
        holdingsReturn,
        holdingsReturnPercent
      };
    }));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/restore", (req, res) => {
  try {
    const { cash, transactions } = req.body;
    if (typeof cash !== "number" || !Array.isArray(transactions)) {
      return res.status(400).json({ error: "Invalid restore payload" });
    }

    db.transaction(() => {
      // Clear existing transactions
      db.prepare("DELETE FROM transactions WHERE account_id = 1").run();
      // Clear existing snapshots
      db.prepare("DELETE FROM portfolio_snapshots WHERE account_id = 1").run();
      // Update cash balance
      db.prepare("UPDATE accounts SET cash_balance = ? WHERE id = 1").run(cash);

      // Re-insert transactions
      const insertTx = db.prepare(`
        INSERT INTO transactions (account_id, symbol, type, shares, price, timestamp)
        VALUES (1, ?, ?, ?, ?, ?)
      `);

      for (const tx of transactions) {
        const symbol = String(tx.symbol).toUpperCase();
        const type = String(tx.type).toUpperCase() === "SELL" ? "SELL" : "BUY";
        const shares = Number(tx.shares);
        const price = Number(tx.price);
        // Ensure accurate formatted SQLite timestamp
        const txDate = tx.timestamp ? new Date(tx.timestamp) : new Date();
        const timestampIso = txDate.toISOString().replace('T', ' ').substring(0, 19);
        
        insertTx.run(symbol, type, shares, price, timestampIso);
      }

      // Backfill 90 days of baseline $100,000 snapshots so we have historical context for charts
      const defaultCash = 100000.0;
      const now = new Date();
      const insertSnapshot = db.prepare(`
        INSERT INTO portfolio_snapshots (
          account_id, timestamp, total_portfolio_value, cash_balance, invested_value, total_return, daily_return
        ) VALUES (1, ?, ?, ?, ?, ?, ?)
      `);

      for (let i = 90; i >= 1; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const iso = date.toISOString().replace('T', ' ').substring(0, 19);
        insertSnapshot.run(1, iso, defaultCash, defaultCash, 0.0, 0.0, 0.0);
      }
    })();

    // trigger fresh snapshot for current state
    generatePortfolioSnapshot(1);

    res.json({ success: true, message: "Portfolio successfully restored from client-side backup" });
  } catch (error: unknown) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
