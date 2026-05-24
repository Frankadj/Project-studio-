import { app } from "./src/server/app";
import { setupScheduler } from "./src/server/jobs/scraper";
import { initDatabase } from "./src/server/database";

const PORT = 3000;

async function startServer() {
  try {
    // Initialize database
    console.log("Initializing database...");
    initDatabase();

    // Start background jobs
    console.log("Starting scheduled jobs...");
    setupScheduler();

    // Start Express server
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
