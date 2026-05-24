import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../database";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  try {
    const companies = db.prepare(`
      SELECT * FROM companies ORDER BY symbol ASC
    `).all() as any[];

    res.json({
        data: companies
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch companies" });
  }
});

router.get("/:symbol", (_req: Request, res: Response) => {
  const symbol = (_req.params.symbol as string).toUpperCase();
  try {
    const company = db.prepare(`
      SELECT * FROM companies WHERE symbol = ?
    `).get(symbol) as any;

    if (!company) {
      res.status(404).json({ error: "Company not found", symbol });
      return;
    }

    res.json({
        data: company
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch company" });
  }
});

export default router;
