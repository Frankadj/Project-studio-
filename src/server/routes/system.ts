import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../database";

const router = Router();

router.get("/status", (_req: Request, res: Response) => {
  try {
    const lastLog = db.prepare(`
      SELECT * FROM audit_logs ORDER BY id DESC LIMIT 1
    `).get() as any;

    const successLog = db.prepare(`
      SELECT * FROM audit_logs WHERE status = 'SUCCESS' ORDER BY id DESC LIMIT 1
    `).get() as any;

    res.json({
        data: {
            lastScrapeTime: lastLog ? lastLog.runAt : null,
            lastSuccessfulScrape: successLog ? successLog.runAt : null,
            rowsIngested: lastLog ? lastLog.scrapedRows : 0,
            rowsRejected: lastLog ? lastLog.rejectedRows : 0,
            sourceAvailability: "wallflake.com",
            databaseHealth: "OK"
        }
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch system status", databaseHealth: "ERROR" });
  }
});

router.get("/data/audit", (_req: Request, res: Response) => {
  try {
    const lastLog = db.prepare(`
      SELECT * FROM audit_logs ORDER BY id DESC LIMIT 1
    `).get() as any;

    if (!lastLog) {
      res.json({ data: null, message: "No audit logs available." });
      return;
    }

    res.json({
      data: {
        runAt: lastLog.runAt,
        scrapedRows: lastLog.scrapedRows,
        rejectedRows: lastLog.rejectedRows,
        missingFieldsCount: lastLog.missingFieldsCount,
        computedFieldsCount: lastLog.computedFieldsCount,
        nullFieldsCount: lastLog.nullFieldsCount,
        status: lastLog.status,
        message: lastLog.message
      }
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch audit data" });
  }
});

export default router;
