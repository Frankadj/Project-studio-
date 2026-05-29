import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const dbPath = process.env.DB_PATH || path.join(process.cwd(), "plutus_market.db");

function connectWithSafeguard() {
  try {
    const conn = new Database(dbPath);
    // Execute a simple pragma to test if it's corrupt.
    // If it's malformed, this will throw SQLITE_CORRUPT.
    conn.pragma("journal_mode = WAL");
    return conn;
  } catch (error: any) {
    if (
      error.code === "SQLITE_CORRUPT" ||
      error.code === "SQLITE_NOTADB" ||
      (error.message && error.message.includes("malformed"))
    ) {
      console.warn("Database appears corrupted. Deleting and recreating fresh instance...");
      try { fs.unlinkSync(dbPath); } catch (e) {}
      try { fs.unlinkSync(dbPath + "-wal"); } catch (e) {}
      try { fs.unlinkSync(dbPath + "-shm"); } catch (e) {}
      
      const conn = new Database(dbPath);
      conn.pragma("journal_mode = WAL");
      return conn;
    }
    throw error;
  }
}

export const db = connectWithSafeguard();

export function initDatabase() {
  // Create companies table
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      symbol TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sector TEXT,
      logoUrl TEXT,
      eps REAL,
      pe REAL,
      dividendYield REAL,
      dividendPerShare REAL,
      updatedAt TEXT NOT NULL
    )
  `);

  // Market quotes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_quotes (
      symbol TEXT PRIMARY KEY,
      price REAL,
      changePercent REAL,
      rawMarketCap REAL,
      calculatedChange REAL,
      volume INTEGER,
      high52Week REAL,
      low52Week REAL,
      dataTimestamp TEXT,
      dataQuality TEXT,
      sourceIntegrity TEXT,
      
      verificationStatus TEXT,
      referencePrice REAL,
      priceDifference REAL,
      percentDifference REAL,
      sourceIntegrityScore INTEGER,

      updatedAt TEXT NOT NULL,
      FOREIGN KEY(symbol) REFERENCES companies(symbol)
    )
  `);

  try {
    db.exec(`ALTER TABLE market_quotes ADD COLUMN high52Week REAL`);
    db.exec(`ALTER TABLE market_quotes ADD COLUMN low52Week REAL`);
    db.exec(`ALTER TABLE market_quotes ADD COLUMN dataTimestamp TEXT`);
  } catch (e) {
    // Columns probably already exist
  }

  // Create historical quotes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS historical_quotes (
      symbol TEXT,
      tradingDate TEXT,
      open REAL,
      high REAL,
      low REAL,
      close REAL,
      volume INTEGER,
      PRIMARY KEY (symbol, tradingDate),
      FOREIGN KEY(symbol) REFERENCES companies(symbol)
    )
  `);

  // Create audit logs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      runAt TEXT NOT NULL,
      scrapedRows INTEGER,
      rejectedRows INTEGER,
      missingFieldsCount INTEGER,
      computedFieldsCount INTEGER,
      nullFieldsCount INTEGER,
      schemaError TEXT,
      status TEXT,
      message TEXT
    )
  `);

  // Create accounts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY,
      cash_balance REAL NOT NULL DEFAULT 100000.0
    )
  `);

  // Seed default account
  const defaultAccount = db.prepare("SELECT * FROM accounts WHERE id = 1").get();
  if (!defaultAccount) {
    db.prepare("INSERT INTO accounts (id, cash_balance) VALUES (1, 100000.0)").run();
  }

  // Create transactions table (Transaction-Ledger Architecture)
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 1,
      symbol TEXT NOT NULL,
      type TEXT NOT NULL,
      shares REAL NOT NULL,
      price_per_share REAL NOT NULL,
      transaction_date TEXT NOT NULL,
      fees REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(symbol) REFERENCES companies(symbol)
    )
  `);

  try {
    db.exec(`ALTER TABLE transactions ADD COLUMN notes TEXT`);
  } catch(e) {}
  
  try {
    db.exec(`ALTER TABLE transactions ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1`);
  } catch(e) {}


  // Create portfolio_snapshots table
  db.exec(`
    CREATE TABLE IF NOT EXISTS portfolio_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 1,
      timestamp TEXT NOT NULL,
      portfolio_value REAL NOT NULL,
      cash_balance REAL NOT NULL,
      invested_value REAL NOT NULL,
      total_return REAL NOT NULL
    )
  `);

  try {
    db.exec(`ALTER TABLE portfolio_snapshots ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1`);
  } catch(e) {}
  try {
    db.exec('ALTER TABLE portfolio_snapshots RENAME COLUMN snapshot_date TO timestamp');
  } catch(e) {}

  // Backfill portfolio snapshots for the last 90 days if the table is empty
  const snapshotsCountRow = db.prepare("SELECT COUNT(*) as count FROM portfolio_snapshots").get() as { count: number } | undefined;
  const snapshotsCount = snapshotsCountRow ? snapshotsCountRow.count : 0;
  if (snapshotsCount === 0) {
    const insertSnapshot = db.prepare(`
      INSERT INTO portfolio_snapshots (
        user_id, timestamp, portfolio_value, cash_balance, invested_value, total_return
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const now = new Date();
    db.transaction(() => {
      for (let i = 90; i >= 1; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const iso = date.toISOString().replace('T', ' ').substring(0, 19);
        insertSnapshot.run(1, iso, 100000.0, 100000.0, 0.0, 0.0);
      }
    })();
  }
}
