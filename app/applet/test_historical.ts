import Database from 'better-sqlite3';

async function run() {
  const db = new Database('plutus_market.db');
  console.log(db.prepare('SELECT count(*) from historical_quotes where symbol = ?').get('TOTAL'));
  const res = await fetch('https://wallflake.com/api/eod/TOTAL?start=2026-04-19&end=2026-05-19');
  const hi = await res.json();
  console.log(hi.length, hi[0]);
  db.prepare('INSERT OR IGNORE INTO historical_quotes (symbol, tradingDate, open, close, high, low, volume) VALUES (?, ?, ?, ?, ?, ?, ?)').run('TOTAL', hi[0].date, hi[0].open, hi[0].close, hi[0].high, hi[0].low, hi[0].volume);
  console.log(db.prepare('SELECT count(*) from historical_quotes where symbol = ?').get('TOTAL'));
}

run().catch(console.error);
