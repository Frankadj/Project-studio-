import { db } from './src/server/database/index.ts';

try { db.exec(`ALTER TABLE companies ADD COLUMN eps REAL`); } catch(e) {}
try { db.exec(`ALTER TABLE companies ADD COLUMN pe REAL`); } catch(e) {}
try { db.exec(`ALTER TABLE companies ADD COLUMN dividendYield REAL`); } catch(e) {}
try { db.exec(`ALTER TABLE companies ADD COLUMN dividendPerShare REAL`); } catch(e) {}
console.log('done');
