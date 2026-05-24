import { runScraper } from './src/server/services/scraper.ts';
import { initDatabase } from './src/server/database/index.ts';

initDatabase();
void runScraper();
