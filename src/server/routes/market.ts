import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../database";
import { z } from "zod";

const router = Router();

router.get("/quotes", (_req: Request, res: Response) => {
  try {
    const quotes = db.prepare(`
      SELECT mq.*, c.name, c.sector 
      FROM market_quotes mq
      JOIN companies c ON mq.symbol = c.symbol
    `).all();
    
    res.json({
        data: quotes.map((q: any) => ({
            symbol: q.symbol,
            companyName: q.name,
            sector: q.sector,
            price: q.price,
            changePercent: q.changePercent,
            rawMarketCap: q.rawMarketCap,
            change: q.calculatedChange,
            volume: q.volume,
            high52Week: q.high52Week,
            low52Week: q.low52Week,
            dataTimestamp: q.dataTimestamp || q.updatedAt,
            data_quality: Math.abs(q.percentDifference || 0) > 2 ? "conflicted" : q.dataQuality,
            source_integrity: q.sourceIntegrity,
            verification_status: q.verificationStatus,
            source_integrity_score: q.sourceIntegrityScore,
            data_conflict: (q.priceDifference !== null && q.percentDifference !== null) ? {
              scraped_price: q.price,
              reference_price: q.referencePrice,
              difference: q.priceDifference,
              percent_difference: q.percentDifference
            } : null,
            raw_scraped: {
                price: q.price,
                changePercent: q.changePercent,
                rawMarketCap: q.rawMarketCap
            },
            computed: {
                change: q.calculatedChange
            },
            unknown: {
                volume: q.volume
            },
            updatedAt: q.updatedAt
        }))
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch quotes" });
  }
});

router.get("/quotes/:symbol", (_req: Request, res: Response) => {
  const symbol = (_req.params.symbol as string).toUpperCase();
  try {
    const quote = db.prepare(`
      SELECT mq.*, c.name, c.sector 
      FROM market_quotes mq
      JOIN companies c ON mq.symbol = c.symbol
      WHERE mq.symbol = ?
    `).get(symbol) as any;

    if (!quote) {
      res.status(404).json({ error: "Symbol not found", symbol });
      return;
    }

    res.json({
        data: {
            symbol: quote.symbol,
            companyName: quote.name,
            sector: quote.sector,
            price: quote.price,
            changePercent: quote.changePercent,
            rawMarketCap: quote.rawMarketCap,
            change: quote.calculatedChange,
            volume: quote.volume,
            high52Week: quote.high52Week,
            low52Week: quote.low52Week,
            dataTimestamp: quote.dataTimestamp || quote.updatedAt,
            data_quality: Math.abs(quote.percentDifference || 0) > 2 ? "conflicted" : quote.dataQuality,
            source_integrity: quote.sourceIntegrity,
            verification_status: quote.verificationStatus,
            source_integrity_score: quote.sourceIntegrityScore,
            data_conflict: (quote.priceDifference !== null && quote.percentDifference !== null) ? {
              scraped_price: quote.price,
              reference_price: quote.referencePrice,
              difference: quote.priceDifference,
              percent_difference: quote.percentDifference
            } : null,
            raw_scraped: {
                price: quote.price,
                changePercent: quote.changePercent,
                rawMarketCap: quote.rawMarketCap
            },
            computed: {
                change: quote.calculatedChange
            },
            unknown: {
                volume: quote.volume
            },
            updatedAt: quote.updatedAt
        }
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch quote" });
  }
});

const historyQuerySchema = z.object({
  days: z.string().optional().transform(val => val ? parseInt(val, 10) : 30),
  from: z.string().optional(),
  to: z.string().optional()
});

router.get("/history/:symbol", (_req: Request, res: Response) => {
  const symbol = (_req.params.symbol as string).toUpperCase();
  
  try {
    const parsed = historyQuerySchema.safeParse(_req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query parameters" });
      return;
    }

    const { days, from, to } = parsed.data;

    let sql = `SELECT * FROM historical_quotes WHERE symbol = ?`;
    const params: any[] = [symbol];

    if (from && to) {
        sql += ` AND tradingDate BETWEEN ? AND ?`;
        params.push(from, to);
    } else if (from) {
        sql += ` AND tradingDate >= ?`;
        params.push(from);
    } else if (to) {
        sql += ` AND tradingDate <= ?`;
        params.push(to);
    } else {
        sql += ` ORDER BY tradingDate DESC LIMIT ?`;
        params.push(days || 30);
    }

    let history = db.prepare(sql).all(...params) as any[];

    // If query used limit, it's descending. Reverse it to chronologic
    if (!from && !to) {
        history.reverse();
    }

    res.json({
      symbol,
      source: "GSE Historical Records",
      data: history.map(h => ({
        tradingDate: h.tradingDate,
        raw_scraped: {
            close: h.close
        },
        computed: {
            open: h.open,
            high: h.high,
            low: h.low
        },
        unknown: {
            volume: h.volume
        }
      }))
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch historical data" });
  }
});

export default router;
