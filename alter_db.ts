import { db } from './src/server/database/index.ts';

db.exec(`ALTER TABLE market_quotes ADD COLUMN high52Week REAL`);
db.exec(`ALTER TABLE market_quotes ADD COLUMN low52Week REAL`);
db.exec(`ALTER TABLE market_quotes ADD COLUMN dataTimestamp TEXT`);
