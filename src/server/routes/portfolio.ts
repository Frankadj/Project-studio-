import { Router } from "express";
import { buildPortfolio, generatePortfolioSnapshot } from "../services/portfolioService.js";
import { addTransaction, getTransactions, calculateHoldings } from "../services/holdingsService.js";
import { db } from "../database/index.js";
import { generateHistoricalPortfolioChart } from "../services/portfolioHistoryService.js";

const router = Router();

router.get("/", (req, res) => {
  try {
    const portfolio = buildPortfolio(1);
    res.json(portfolio);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/transaction", (req, res) => {
  try {
    const { symbol, type, shares, price_per_share, transaction_date, fees, notes } = req.body;
    
    if (!symbol || !type || !shares || shares <= 0 || !price_per_share || price_per_share < 0) {
      return res.status(400).json({ error: "Invalid transaction details" });
    }

    if (type !== "BUY" && type !== "SELL") {
      return res.status(400).json({ error: "Transaction type must be BUY or SELL" });
    }

    // Allow selling short? The prompt doesn't say, but typical trackers just add it.
    // For now, we'll just add the transaction straight away.
    const dateToStore = transaction_date ? new Date(transaction_date).toISOString() : new Date().toISOString();
    
    addTransaction(1, symbol, type as "BUY"| "SELL", shares, price_per_share, dateToStore, fees || 0, notes || null);
    
    // trigger snapshot update
    generatePortfolioSnapshot(1);

    res.json({ success: true, message: "Transaction added" });
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
    const chartData = generateHistoricalPortfolioChart(1, range);
    res.json(chartData);
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
      db.prepare("DELETE FROM transactions WHERE user_id = 1").run();
      // Clear existing snapshots
      db.prepare("DELETE FROM portfolio_snapshots WHERE user_id = 1").run();
      // Update cash balance (keeping it around in accounts table but not relying on it for transaction limits)
      db.prepare("UPDATE accounts SET cash_balance = ? WHERE id = 1").run(cash);

      // Re-insert transactions
      const insertTx = db.prepare(`
        INSERT INTO transactions (user_id, symbol, type, shares, price_per_share, transaction_date, fees, notes, created_at)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const tx of transactions) {
        const symbol = String(tx.symbol).toUpperCase();
        const type = String(tx.type).toUpperCase() === "SELL" ? "SELL" : "BUY";
        const shares = Number(tx.shares);
        // support both old and new payload format
        const price = typeof tx.price_per_share === "number" ? Number(tx.price_per_share) : Number(tx.price);
        
        // Ensure accurate formatted SQLite timestamp
        const txDateRaw = tx.transaction_date || tx.timestamp;
        const txDate = txDateRaw ? new Date(txDateRaw) : new Date();
        const timestampIso = txDate.toISOString().replace('T', ' ').substring(0, 19);
        
        insertTx.run(symbol, type, shares, price, timestampIso, tx.fees || 0, tx.notes || null, new Date().toISOString());
      }

      // Backfill 90 days of baseline $100,000 snapshots so we have historical context for charts
      const defaultCash = 100000.0;
      const now = new Date();
      const insertSnapshot = db.prepare(`
        INSERT INTO portfolio_snapshots (
          user_id, timestamp, portfolio_value, cash_balance, invested_value, total_return
        ) VALUES (1, ?, ?, ?, ?, ?)
      `);

      for (let i = 90; i >= 1; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const iso = date.toISOString().replace('T', ' ').substring(0, 19);
        insertSnapshot.run(1, iso, defaultCash, defaultCash, 0.0, 0.0);
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
