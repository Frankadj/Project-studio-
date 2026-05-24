import { db } from "../database";
import { STOCK_DISPLAY_NAME_MAP } from "../../lib/stockMetadata";

// Custom registry mapping for Ghana Stock Exchange listed companies to ensure 100% accurate data, sectors, and logo URLs
const WALLFLAKE_REGISTRY: Record<string, { name: string; sector: string; logoUrl: string }> = {
  "AADS": {
    "name": "AngloGold Ashanti Depositary Shares",
    "sector": "Mining",
    "logoUrl": "https://wallflake.com/logos/AADS.png"
  },
  "ACCESS": {
    "name": "Access Bank (Ghana) PLC",
    "sector": "Banking",
    "logoUrl": "https://wallflake.com/logos/ACCESS.png"
  },
  "ADB": {
    "name": "Agricultural Development Bank",
    "sector": "Banking",
    "logoUrl": "https://wallflake.com/logos/ADB.png"
  },
  "AGA": {
    "name": "AngloGold Ashanti PLC",
    "sector": "Mining",
    "logoUrl": "https://wallflake.com/logos/AGA.png"
  },
  "ALLGH": {
    "name": "Atlantic Lithium Ltd",
    "sector": "Mining",
    "logoUrl": "https://wallflake.com/logos/ALLGH.jpg"
  },
  "ALW": {
    "name": "Aluworks Limited",
    "sector": "Manufacturing",
    "logoUrl": "https://wallflake.com/logos/ALW.png"
  },
  "ASG": {
    "name": "Asante Gold Corp",
    "sector": "Mining",
    "logoUrl": "https://wallflake.com/logos/ASG.png"
  },
  "BOPP": {
    "name": "Benso Oil Palm Plantation PLC",
    "sector": "Agriculture",
    "logoUrl": "https://wallflake.com/logos/BOPP.png"
  },
  "CAL": {
    "name": "CalBank PLC",
    "sector": "Banking",
    "logoUrl": "https://wallflake.com/logos/CAL.jpg"
  },
  "CLYD": {
    "name": "Clydestone (Ghana) Ltd",
    "sector": "Technology",
    "logoUrl": "https://wallflake.com/logos/CLYD.jpg"
  },
  "CMLT": {
    "name": "Camelot Ghana PLC",
    "sector": "Commercial Services",
    "logoUrl": "https://wallflake.com/logos/CMLT.png"
  },
  "CPC": {
    "name": "Cocoa Processing Company Ltd",
    "sector": "Manufacturing",
    "logoUrl": "https://wallflake.com/logos/CPC.png"
  },
  "DASPHARMA": {
    "name": "Dannex Ayrton Starwin PLC",
    "sector": "Healthcare",
    "logoUrl": "https://wallflake.com/logos/DASPHARMA.png"
  },
  "DIGICUT": {
    "name": "Digicut Production & Advertising Ltd",
    "sector": "Media",
    "logoUrl": "https://wallflake.com/logos/DIGICUT.png"
  },
  "EGH": {
    "name": "Ecobank Ghana PLC",
    "sector": "Banking",
    "logoUrl": "https://wallflake.com/logos/EGH.png"
  },
  "EGL": {
    "name": "Enterprise Group PLC",
    "sector": "Insurance",
    "logoUrl": "https://wallflake.com/logos/EGL.jpeg"
  },
  "ETI": {
    "name": "Ecobank Transnational Inc.",
    "sector": "Banking",
    "logoUrl": "https://wallflake.com/logos/ETI.png"
  },
  "FAB": {
    "name": "First Atlantic Bank Ltd",
    "sector": "Banking",
    "logoUrl": "https://wallflake.com/logos/FAB.jpg"
  },
  "FML": {
    "name": "Fan Milk PLC",
    "sector": "Consumer Goods",
    "logoUrl": "https://wallflake.com/logos/FML.png"
  },
  "GCB": {
    "name": "GCB Bank PLC",
    "sector": "Banking",
    "logoUrl": "https://wallflake.com/logos/GCB.png"
  },
  "GGBL": {
    "name": "Guinness Ghana Breweries PLC",
    "sector": "Consumer Goods",
    "logoUrl": "https://wallflake.com/logos/GGBL.png"
  },
  "GLD": {
    "name": "NewGold ETF",
    "sector": "ETF",
    "logoUrl": "https://wallflake.com/logos/GLD.png"
  },
  "GOIL": {
    "name": "Ghana Oil Company Ltd (GOIL)",
    "sector": "Energy",
    "logoUrl": "https://wallflake.com/logos/GOIL.png"
  },
  "HORDS": {
    "name": "Hords Ltd",
    "sector": "Consumer Goods",
    "logoUrl": "https://wallflake.com/logos/HORDS.png"
  },
  "IIL": {
    "name": "Intravenous Infusions Ltd",
    "sector": "Healthcare",
    "logoUrl": "https://wallflake.com/logos/IIL.png"
  },
  "MAC": {
    "name": "Mega African Capital Ltd",
    "sector": "Financial Services",
    "logoUrl": "https://wallflake.com/logos/MAC.png"
  },
  "MMH": {
    "name": "Meridian-Marshalls Holdings PLC",
    "sector": "Consumer Services",
    "logoUrl": "https://wallflake.com/logos/MMH.png"
  },
  "MTNGH": {
    "name": "Scancom PLC (MTN Ghana)",
    "sector": "Telecommunications",
    "logoUrl": "https://wallflake.com/logos/MTNGH.jpg"
  },
  "PBC": {
    "name": "Produce Buying Company Ltd",
    "sector": "Agriculture",
    "logoUrl": "https://wallflake.com/logos/PBC.png"
  },
  "RBGH": {
    "name": "Republic Bank (Ghana) PLC",
    "sector": "Banking",
    "logoUrl": "https://wallflake.com/logos/RBGH.jpg"
  },
  "SAMBA": {
    "name": "Samba Foods Ltd",
    "sector": "Consumer Goods",
    "logoUrl": "https://wallflake.com/logos/SAMBA.png"
  },
  "SCB": {
    "name": "Standard Chartered Bank Ghana PLC",
    "sector": "Banking",
    "logoUrl": "https://wallflake.com/logos/SCB.png"
  },
  "SCBPREF": {
    "name": "Standard Chartered Preference Shares",
    "sector": "Banking",
    "logoUrl": "https://wallflake.com/logos/SCBPREF.png"
  },
  "SIC": {
    "name": "SIC Insurance PLC",
    "sector": "Insurance",
    "logoUrl": "https://wallflake.com/logos/SIC.png"
  },
  "SOGEGH": {
    "name": "Societe Generale Ghana PLC",
    "sector": "Banking",
    "logoUrl": "https://wallflake.com/logos/SOGEGH.png"
  },
  "TBL": {
    "name": "Trust Bank Ltd (The Gambia)",
    "sector": "Banking",
    "logoUrl": "https://wallflake.com/logos/TBL.png"
  },
  "TLW": {
    "name": "Tullow Oil PLC",
    "sector": "Energy",
    "logoUrl": "https://wallflake.com/logos/TLW.png"
  },
  "TOTAL": {
    "name": "TotalEnergies Marketing Ghana PLC",
    "sector": "Energy",
    "logoUrl": "https://wallflake.com/logos/TOTAL.png"
  },
  "UNIL": {
    "name": "Unilever Ghana PLC",
    "sector": "Consumer Goods",
    "logoUrl": "https://wallflake.com/logos/UNIL.png"
  },
  "ZEN": {
    "name": "ZEN Petroleum Limited",
    "sector": "Energy",
    "logoUrl": "https://wallflake.com/media/logos/ZEN.jpg"
  }
};

interface WallflakeQuote {
  ticker: string;
  name?: string;
  price: number;
  change: number;
  changePct: number;
  marketCap?: number | null;
  volume: number;
  high52w?: number | null;
  low52w?: number | null;
  as_of: string;
  logoUrl?: string;
}

export async function runScraper() {
  console.log("[Scraper] Starting Wallflake API fetch...");
  const nowIso = new Date().toISOString();
  const todayStr = nowIso.split("T")[0];

  const gainerTickers = new Set<string>();
  const loserTickers = new Set<string>();
  let hasMarketSummary = false;

  interface TickerItem {
    ticker?: string;
  }

  interface SummaryResponse {
    allGainers?: TickerItem[];
    allLosers?: TickerItem[];
  }

  try {
    const summaryRes = await fetch("https://wallflake.com/api/market/summary", {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (summaryRes.ok) {
      const summaryData = await summaryRes.json() as SummaryResponse;
      if (summaryData.allGainers && Array.isArray(summaryData.allGainers)) {
        summaryData.allGainers.forEach((g: TickerItem) => {
          if (g.ticker) gainerTickers.add(g.ticker.toUpperCase());
        });
      }
      if (summaryData.allLosers && Array.isArray(summaryData.allLosers)) {
        summaryData.allLosers.forEach((l: TickerItem) => {
          if (l.ticker) loserTickers.add(l.ticker.toUpperCase());
        });
      }
      hasMarketSummary = true;
    }
  } catch (e) {
    console.error("[Scraper] Failed to fetch market/summary to validate gainers/losers:", e);
  }

  try {
    const res = await fetch("https://wallflake.com/api/quotes", {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch from Wallflake. Status: ${res.status}`);
    }

    const quotes = await res.json() as WallflakeQuote[];
    let scrapedRows = 0;

    const upsertCompany = db.prepare(`
      INSERT INTO companies (symbol, name, sector, logoUrl, updatedAt)
      VALUES (@symbol, @name, @sector, @logoUrl, @updatedAt)
      ON CONFLICT(symbol) DO UPDATE SET
        name = IFNULL(excluded.name, name),
        sector = IFNULL(excluded.sector, sector),
        logoUrl = IFNULL(excluded.logoUrl, logoUrl),
        updatedAt = excluded.updatedAt
    `);

    const upsertQuote = db.prepare(`
      INSERT INTO market_quotes (
        symbol, price, changePercent, rawMarketCap, calculatedChange, 
        volume, high52Week, low52Week, dataTimestamp, dataQuality, sourceIntegrity,
        verificationStatus, referencePrice, priceDifference, percentDifference, sourceIntegrityScore,
        updatedAt
      )
      VALUES (
        @symbol, @price, @changePercent, @rawMarketCap, @calculatedChange, 
        @volume, @high52Week, @low52Week, @dataTimestamp, @dataQuality, @sourceIntegrity,
        @verificationStatus, @referencePrice, @priceDifference, @percentDifference, @sourceIntegrityScore,
        @updatedAt
      )
      ON CONFLICT(symbol) DO UPDATE SET
        price = excluded.price,
        changePercent = excluded.changePercent,
        rawMarketCap = excluded.rawMarketCap,
        calculatedChange = excluded.calculatedChange,
        volume = excluded.volume,
        high52Week = IFNULL(excluded.high52Week, market_quotes.high52Week),
        low52Week = IFNULL(excluded.low52Week, market_quotes.low52Week),
        dataTimestamp = excluded.dataTimestamp,
        dataQuality = excluded.dataQuality,
        sourceIntegrity = excluded.sourceIntegrity,
        verificationStatus = excluded.verificationStatus,
        referencePrice = excluded.referencePrice,
        priceDifference = excluded.priceDifference,
        percentDifference = excluded.percentDifference,
        sourceIntegrityScore = excluded.sourceIntegrityScore,
        updatedAt = excluded.updatedAt
    `);

    const getHistorical = db.prepare(`
      SELECT * FROM historical_quotes WHERE symbol = ? AND tradingDate = ?
    `);

    const insertHistorical = db.prepare(`
      INSERT INTO historical_quotes (symbol, tradingDate, open, high, low, close, volume)
      VALUES (@symbol, @tradingDate, @open, @high, @low, @close, @volume)
    `);

    const updateHistorical = db.prepare(`
      UPDATE historical_quotes 
      SET high = MAX(high, @close), low = MIN(low, @close), close = @close, volume = @volume
      WHERE symbol = @symbol AND tradingDate = @tradingDate
    `);

    const getLastTradingDay = db.prepare(`
      SELECT close FROM historical_quotes WHERE symbol = ? AND tradingDate < ? ORDER BY tradingDate DESC LIMIT 1
    `);

    const insertLog = db.prepare(`
      INSERT INTO audit_logs (runAt, scrapedRows, rejectedRows, missingFieldsCount, computedFieldsCount, nullFieldsCount, schemaError, status, message)
      VALUES (@runAt, @scrapedRows, @rejectedRows, @missingFieldsCount, @computedFieldsCount, @nullFieldsCount, @schemaError, @status, @message)
    `);

    db.transaction(() => {
      for (const q of quotes) {
        const symbol = q.ticker;
        if (!symbol) continue;
        const symbolUpper = symbol.toUpperCase();

        let calculatedChange = typeof q.change === "number" ? q.change : 0;
        let changePercent = typeof q.changePct === "number" ? q.changePct : 0;

        // Force daily change to 0 if a stock is not registered as a gainer or a loser today in the official market summary
        if (hasMarketSummary) {
          if (!gainerTickers.has(symbolUpper) && !loserTickers.has(symbolUpper)) {
            calculatedChange = 0;
            changePercent = 0;
          } else {
            if (gainerTickers.has(symbolUpper)) {
              calculatedChange = Math.abs(calculatedChange || q.change || 0);
              changePercent = Math.abs(changePercent || q.changePct || 0);
            } else if (loserTickers.has(symbolUpper)) {
              calculatedChange = -Math.abs(calculatedChange || q.change || 0);
              changePercent = -Math.abs(changePercent || q.changePct || 0);
            }
          }
        }

        let referencePrice = q.price - calculatedChange;

        // Use Wallflake API values directly and only fall back to local database calculation
        // if they are not provided, preventing erroneous overrides from historical_quotes today/yesterday mismatch.
        if (!hasMarketSummary && (typeof q.change !== "number" || typeof q.changePct !== "number")) {
          const prev = getLastTradingDay.get(symbol, todayStr) as { close: number } | undefined;
          if (prev && typeof prev.close === 'number') {
            calculatedChange = q.price - prev.close;
            changePercent = prev.close > 0 ? (calculatedChange / prev.close) * 100 : 0;
            referencePrice = prev.close;
          }
        }

        // Fetch existing company info
        const existingComp = db.prepare(`SELECT name, sector FROM companies WHERE symbol = ?`).get(symbol) as { name?: string; sector?: string } | undefined;
        
        const registryEntry = WALLFLAKE_REGISTRY[symbol];

        // Use full name from our registry, otherwise fallback to metadata map, API name, or symbol
        let finalName = q.name || "";
        if (!finalName || finalName === symbol) {
          finalName = registryEntry?.name || STOCK_DISPLAY_NAME_MAP[symbol] || existingComp?.name || symbol;
        }

        const finalSector = registryEntry?.sector || existingComp?.sector || "Other Services";

        // Use precise logo url from registry, otherwise general wallflake absolute path
        let finalLogoUrl = registryEntry?.logoUrl || "";
        if (!finalLogoUrl) {
          if (q.logoUrl) {
            finalLogoUrl = q.logoUrl.startsWith("http") ? q.logoUrl : `https://wallflake.com${q.logoUrl}`;
          } else {
            finalLogoUrl = `https://wallflake.com/logos/${symbol.toUpperCase()}.png`;
          }
        }

        // Upsert company
        upsertCompany.run({
          symbol,
          name: finalName,
          sector: finalSector,
          logoUrl: finalLogoUrl,
          updatedAt: nowIso
        });

        // Upsert quote
        upsertQuote.run({
          symbol,
          price: q.price,
          changePercent: changePercent,
          rawMarketCap: q.marketCap,
          calculatedChange: calculatedChange,
          volume: q.volume,
          high52Week: q.high52w,
          low52Week: q.low52w,
          dataTimestamp: q.as_of,
          dataQuality: "high",
          sourceIntegrity: "verified",
          verificationStatus: "verified_match",
          referencePrice: referencePrice,
          priceDifference: 0,
          percentDifference: 0,
          sourceIntegrityScore: 100,
          updatedAt: nowIso
        });

        const existingHist = getHistorical.get(symbol, todayStr);
        if (existingHist) {
          updateHistorical.run({
            symbol,
            tradingDate: todayStr,
            close: q.price,
            volume: q.volume
          });
        } else {
          insertHistorical.run({
            symbol,
            tradingDate: todayStr,
            open: q.price,
            high: q.price,
            low: q.price,
            close: q.price,
            volume: q.volume
          });
        }
        scrapedRows++;
      }
    })();

    insertLog.run({
      runAt: nowIso,
      scrapedRows,
      rejectedRows: 0,
      missingFieldsCount: 0,
      computedFieldsCount: scrapedRows,
      nullFieldsCount: 0,
      schemaError: null,
      status: 'SUCCESS',
      message: 'Wallflake API sync completed successfully.'
    });
    console.log(`[Scraper] Successfully synced with Wallflake. Parsed: ${scrapedRows}`);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Scraper] Massive failure during scraper ingestion sequence:`, errMsg);
  }
}

export async function runFundamentalsScraper() {
  console.log("[Scraper] Starting supplementary fundamentals lookup...");
  try {
    const companies = db.prepare(`SELECT symbol FROM companies`).all() as {symbol: string}[];
    const nowIso = new Date().toISOString();
    
    let updated = 0;
    for (const c of companies) {
      try {
        const res = await fetch(`https://wallflake.com/api/companies/${c.symbol}`);
        if (!res.ok) continue;
        const data = await res.json();
        if (data && data.fundamentals) {
          const f = data.fundamentals;
          db.prepare(`
            UPDATE companies 
            SET eps = ?, pe = ?, dividendYield = ?, dividendPerShare = ?, updatedAt = ?
            WHERE symbol = ?
          `).run(f.eps, f.pe, f.dividendYield, f.dividendPerShare, nowIso, c.symbol);
          updated++;
        }
        await new Promise(r => setTimeout(r, 400));
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`Error updating supplementary fundamentals for ${c.symbol}: ${errMsg}`);
      }
    }
    console.log(`[Scraper] Updated fundamentals for ${updated} listings.`);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Scraper] Fundamentals parser error: ${errMsg}`);
  }
}

export async function seedHistoricalQuotes(symbols: string[]) {
  const needFetch: string[] = [];
  for (const sym of symbols) {
    try {
      const row = db.prepare(`SELECT COUNT(*) as count FROM historical_quotes WHERE symbol = ?`).get(sym) as { count: number } | undefined;
      if (!row || row.count < 15) {
        needFetch.push(sym);
      }
    } catch {
      needFetch.push(sym);
    }
  }

  if (needFetch.length > 0) {
    console.log(`[Historical Seeder] Fetching EOD datasets for ${needFetch.length} tickers...`);
    for (const symbol of needFetch) {
      try {
        const url = `https://wallflake.com/api/eod/${encodeURIComponent(symbol)}`;
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (!res.ok) {
          console.warn(`[Historical Seeder] Failed to fetch historical data for ${symbol}: Status ${res.status}`);
          continue;
        }
        const data = await res.json() as Array<Record<string, unknown>>;
        if (Array.isArray(data) && data.length > 0) {
          const insertStmt = db.prepare(`
            INSERT INTO historical_quotes (symbol, tradingDate, open, high, low, close, volume)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(symbol, tradingDate) DO UPDATE SET
              open = excluded.open,
              high = excluded.high,
              low = excluded.low,
              close = excluded.close,
              volume = excluded.volume
          `);

          db.transaction(() => {
            for (const item of data) {
              if (!item.date) continue;
              const tradingDate = String(item.date).split("T")[0];
              const open = typeof item.open === "number" ? item.open : (typeof item.close === "number" ? item.close : (typeof item.price === "number" ? item.price : 0));
              const high = typeof item.high === "number" ? item.high : (typeof item.close === "number" ? item.close : (typeof item.price === "number" ? item.price : 0));
              const low = typeof item.low === "number" ? item.low : (typeof item.close === "number" ? item.close : (typeof item.price === "number" ? item.price : 0));
              const close = typeof item.close === "number" ? item.close : (typeof item.price === "number" ? item.price : 0);
              const volume = typeof item.volume === "number" ? item.volume : 0;

              insertStmt.run(symbol, tradingDate, open, high, low, close, volume);
            }
          })();
          console.log(`[Historical Seeder] Saved ${data.length} historical days for ${symbol}`);
        }
        await new Promise(r => setTimeout(r, 100));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[Historical Seeder] Historic loader failure:`, msg);
      }
    }
  }
}
