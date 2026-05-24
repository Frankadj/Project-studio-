import { db, initDatabase } from "./src/server/database";

async function backfill() {
  initDatabase();
  const companies = db.prepare(`SELECT symbol FROM companies`).all() as { symbol: string }[];
  console.log(`Backfilling history for ${companies.length} companies...`);
  
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30); // Backfill 30 days
  const startStr = start.toISOString().split("T")[0];
  const endStr = end.toISOString().split("T")[0];
  
  const insertHistorical = db.prepare(`
    INSERT INTO historical_quotes (symbol, tradingDate, open, high, low, close, volume)
    VALUES (@symbol, @tradingDate, @open, @high, @low, @close, @volume)
    ON CONFLICT(symbol, tradingDate) DO UPDATE SET
      close = excluded.close,
      volume = excluded.volume
  `);

  for (const c of companies) {
    try {
      const res = await fetch(`https://wallflake.com/api/eod/${c.symbol}?start=${startStr}&end=${endStr}`);
      if (!res.ok) continue;
      const history = await res.json() as any[];
      if (!Array.isArray(history)) continue;
      
      db.transaction(() => {
        for (const record of history) {
          if (!record.date || !record.close) continue;
          insertHistorical.run({
            symbol: c.symbol,
            tradingDate: record.date,
            open: record.open || record.close,
            high: record.high || record.close,
            low: record.low || record.close,
            close: record.close,
            volume: record.volume || 0
          });
        }
      })();
      console.log(`Backfilled ${history.length} records for ${c.symbol}`);
    } catch (err: any) {
      console.error(`Error backfilling ${c.symbol}: ${err.message}`);
    }
  }
}

backfill();
