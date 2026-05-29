import cron from "node-cron";
import { runScraper, runFundamentalsScraper, seedHistoricalQuotes } from "../services/scraper";
import { db } from "../database";
import { fetchAggregatedNews } from "../services/newsService";

export function setupScheduler() {
  // Run immediately on boot to ensure data is populated
  runScraper().then(() => {
    try {
      const companies = db.prepare("SELECT symbol FROM companies").all() as { symbol: string }[];
      const symbolsList = companies.map(c => c.symbol);
      if (symbolsList.length > 0) {
        seedHistoricalQuotes(symbolsList);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Jobs] Failed to trigger historical quotes seeder on boot:", msg);
    }
  });
  runFundamentalsScraper();

  // Pre-fetch latest business news on boot
  console.log("[Jobs] Triggering initial business news pre-fetch on boot...");
  fetchAggregatedNews(true).then(() => {
    console.log("[Jobs] Initial business news pre-fetch completed.");
  }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Jobs] Initial business news pre-fetch failed:", msg);
  });

  // Run the scraper every 3 minutes to get the very latest market prices safely and prevent rate-limiting (429)
  setInterval(() => {
    runScraper();
  }, 180000);
  
  // Run fundamentals scraper once every 4 hours to keep company details fresh (fundamentals change quarterly)
  cron.schedule("0 */4 * * *", () => {
    runFundamentalsScraper();
  });

  // Pre-fetch and update aggregated news every 5 minutes to keep news section up-to-date
  cron.schedule("*/5 * * * *", () => {
    console.log("[Jobs] Triggering scheduled business news pre-fetch (every 5 mins)...");
    fetchAggregatedNews(true).then(() => {
      console.log("[Jobs] Scheduled business news auto-update complete.");
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Jobs] Scheduled business news pre-fetch failed:", msg);
    });
  });
}
