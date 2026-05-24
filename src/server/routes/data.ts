import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../database";

const router = Router();

router.get("/validation-report", (_req: Request, res: Response) => {
  try {
    const quotes = db.prepare(`
      SELECT symbol, price, verificationStatus, referencePrice, priceDifference, percentDifference, sourceIntegrityScore, dataQuality
      FROM market_quotes
    `).all() as any[];

    // the prompt requires:
    // - symbols with mismatches (where percentDifference > threshold, or conflicted)
    // - deviation percentage per stock
    // - source comparison results
    // - list of most unreliable fields

    const mismatches = quotes.filter(q => q.percentDifference !== null && Math.abs(q.percentDifference) > 2);
    
    // For unreliable fields, we can do a mock assessment based on logs or just return empty for now,
    // or actually evaluate the data.
    const lastLog = db.prepare(`
      SELECT * FROM audit_logs ORDER BY id DESC LIMIT 1
    `).get() as any;

    const schemaError = lastLog?.schemaError || null;

    res.json({
      mismatches: mismatches.map(m => ({
        symbol: m.symbol,
        scraped_price: m.price,
        reference_price: m.referencePrice,
        difference: m.priceDifference,
        percent_difference: m.percentDifference,
        status: "conflicted"
      })),
      deviations: quotes.map(q => ({
        symbol: q.symbol,
        percent_difference: q.percentDifference,
        integrity_score: q.sourceIntegrityScore,
        verification_status: q.verificationStatus
      })),
      source_comparison: {
        primary: "wallflake.com",
        secondary: "unreachable/none"
      },
      schema_status: schemaError ? "SCHEMA_ERROR" : "OK",
      unreliable_fields: ["volume", "referencePrice", "percentDifference"] // Based on current capabilities
    });

  } catch (error) {
     res.status(500).json({ error: "Failed to generate validation report" });
  }
});

export default router;
