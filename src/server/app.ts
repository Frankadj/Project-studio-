import express from "express";
import cors from "cors";
import path from "path";
import helmet from "helmet";
import morgan from "morgan";
import marketRouter from "./routes/market";
import companiesRouter from "./routes/companies";
import systemRouter from "./routes/system";
import dataRouter from "./routes/data";
import portfolioRouter from "./routes/portfolio";
import { fetchAggregatedNews } from "./services/newsService";
import { seedHistoricalQuotes } from "./services/scraper";
import { createServer as createViteServer } from "vite";
import { db } from "./database";

export const app = express();

// Middleware
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: false, // Don't break inline scripts in Vite during dev
}));
app.use(express.json());
app.use(morgan("dev"));

// API Routes
app.use("/api/v1/market", marketRouter);
app.use("/api/v1/companies", companiesRouter);
app.use("/api/v1/system", systemRouter);
app.use("/api/v1/data", dataRouter);
app.use("/api/v1/portfolio", portfolioRouter);

// Legacy/Compatibility API routes for frontend
// Simple cache for indices
let cachedIndices: any = null;
let lastIndicesFetch: number = 0;

app.get("/api/indices", async (_req, res) => {
  if (cachedIndices && Date.now() - lastIndicesFetch < 5 * 60 * 1000) {
    return res.json(cachedIndices);
  }

  try {
    const codes = ["GSE-CI", "GSE-FSI"];
    const names: Record<string, string> = {
      "GSE-CI": "GSE Composite Index",
      "GSE-FSI": "GSE Financial Stock Index",
    };

    let marketSummary: any = null;
    try {
      const summaryResp = await fetch("https://wallflake.com/api/market/summary");
      if (summaryResp.ok) {
        marketSummary = await summaryResp.json();
      } else {
        marketSummary = {
          totalMarketCap: "GH¢ 120,400.50 M",
          totalVolume: "1.2 M",
          totalValueTraded: "GH¢ 5.4 M"
        };
      }
    } catch (e) {
      console.error("[Indices API] Failed to fetch market summary:", e);
      marketSummary = {
        totalMarketCap: "GH¢ 120,400.50 M",
        totalVolume: "1.2 M",
        totalValueTraded: "GH¢ 5.4 M"
      };
    }

    const results = await Promise.all(codes.map(async (code) => {
      const resp = await fetch(`https://wallflake.com/api/market-index/${code}`);
      if (!resp.ok) {
        throw new Error(`Failed to fetch ${code}`);
      }
      const data = await resp.json() as { date: string, value: number }[];
      
      data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      if (data.length === 0) {
        return {
          code,
          name: names[code],
          value: 0,
          change: 0,
          changePercent: 0,
          ytdChange: 0,
          ytdChangePercent: 0,
          lastDate: new Date().toISOString().split("T")[0],
        };
      }

      const latest = data[data.length - 1];
      const previous = data.length > 1 ? data[data.length - 2] : latest;

      const currentYear = new Date().getFullYear();
      let ytdStartValue = data[0].value;
      
      const previousYearData = data.filter(d => new Date(d.date).getFullYear() < currentYear);
      const firstOfCurrentYear = data.find(d => new Date(d.date).getFullYear() === currentYear);
      
      if (previousYearData.length > 0) {
        ytdStartValue = previousYearData[previousYearData.length - 1].value;
      } else if (firstOfCurrentYear) {
        ytdStartValue = firstOfCurrentYear.value;
      }

      const value = latest.value;
      const change = value - previous.value;
      const changePercent = previous.value !== 0 ? (change / previous.value) * 100 : 0;
      
      const ytdChange = value - ytdStartValue;
      const ytdChangePercent = ytdStartValue !== 0 ? (ytdChange / ytdStartValue) * 100 : 0;

      // Extract values to compute 52-week low and 52-week high
      const values = data.map(d => d.value);
      const low52Week = values.length > 0 ? Math.min(...values) : 0;
      const high52Week = values.length > 0 ? Math.max(...values) : 0;

      let keyStats = null;
      if (code === "GSE-CI" && marketSummary) {
        keyStats = {
          low52Week,
          high52Week,
          marketCap: marketSummary.totalMarketCapLabel || marketSummary.totalMarketCap || 0,
          volume: marketSummary.totalVolume || 0,
          valueTraded: marketSummary.totalValueTraded || 0,
        };
      } else {
        // Default Key Stats for GSE-FSI or other indices (calculating high/low from history)
        keyStats = {
          low52Week,
          high52Week,
          marketCap: null,
          volume: null,
          valueTraded: null,
        };
      }

      return {
        code,
        name: names[code],
        value,
        change,
        changePercent,
        ytdChange,
        ytdChangePercent,
        lastDate: latest.date,
        keyStats,
      };
    }));

    cachedIndices = results;
    lastIndicesFetch = Date.now();
    res.json(results);
  } catch (error) {
    console.error("[Indices API] Error fetching indices:", error);
    if (cachedIndices) {
      res.json(cachedIndices);
    } else {
      res.status(500).json({ error: "Failed to fetch indices" });
    }
  }
});

app.get("/api/stocks/mini-history", async (_req, res) => {
  try {
    const symbolsParam = (_req.query.symbols as string) || "";
    if (!symbolsParam) {
      res.json({ seriesBySymbol: {}, missingSymbols: [] });
      return;
    }
    const symbols = symbolsParam.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
    if (symbols.length === 0) {
      res.json({ seriesBySymbol: {}, missingSymbols: [] });
      return;
    }

    // Ensure our local database is seeded with historical EOD quotes for these symbols from Wallflake
    seedHistoricalQuotes(symbols).catch(err => {
      console.error("[Historical Seeder] bg fetch failed:", err);
    });
    
    const range = (_req.query.range as string) || "1W";
    let days = 7;
    switch (range.toUpperCase()) {
      case "1D": days = 1; break;
      case "1W": days = 7; break;
      case "1M": days = 30; break;
      case "3M": days = 90; break;
      case "6M": days = 180; break;
      case "1Y": days = 365; break;
      case "5Y": days = 1825; break;
    }
    
    const start = new Date();
    start.setDate(start.getDate() - days);
    const startStr = start.toISOString().split("T")[0];

    const placeholders = symbols.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT symbol, close 
      FROM historical_quotes 
      WHERE symbol IN (${placeholders}) AND tradingDate >= ?
      ORDER BY tradingDate ASC
    `).all(...symbols, startStr) as { symbol: string, close: number }[];
    
    const seriesBySymbol: Record<string, number[]> = {};
    for (const row of rows) {
      if (!seriesBySymbol[row.symbol]) {
        seriesBySymbol[row.symbol] = [];
      }
      seriesBySymbol[row.symbol].push(row.close);
    }
    
    const currentQuotes = db.prepare(`
      SELECT symbol, price, calculatedChange FROM market_quotes WHERE symbol IN (${placeholders})
    `).all(...symbols) as { symbol: string, price: number, calculatedChange: number }[];

    for (const q of currentQuotes) {
      if (!seriesBySymbol[q.symbol]) {
        seriesBySymbol[q.symbol] = [];
      }
      seriesBySymbol[q.symbol].push(q.price);
    }

    const missingSymbols = symbols.filter(s => !seriesBySymbol[s]);
    res.json({ seriesBySymbol, missingSymbols });
  } catch (err: unknown) {
    res.json({ seriesBySymbol: {}, missingSymbols: [] });
  }
});

app.get("/api/stocks", (_req, res) => {
  try {
      const quotes = db.prepare(`
        SELECT mq.*, c.name, c.sector, c.logoUrl
        FROM market_quotes mq
        JOIN companies c ON mq.symbol = c.symbol
      `).all() as Array<{
        symbol: string;
        name: string;
        sector: string;
        logoUrl: string | null;
        price: number;
        referencePrice: number | null;
        priceDifference: number | null;
        percentDifference: number | null;
        calculatedChange: number;
        changePercent: number;
        volume: number;
        rawMarketCap: number;
        high52Week: number;
        low52Week: number;
        dataTimestamp: string;
        updatedAt: string;
        dataQuality: string;
        verificationStatus: string;
        sourceIntegrityScore: number;
      }>;
      
      const formatted = quotes.map(q => {
        let conflictData = undefined;
        if (q.priceDifference !== null && q.percentDifference !== null) {
          conflictData = {
            scraped_price: q.price,
            reference_price: q.referencePrice,
            difference: q.priceDifference,
            percent_difference: q.percentDifference
          };
        }

        return {
          symbol: q.symbol,
          ticker: q.symbol,
          code: q.symbol,
          name: q.name,
          companyName: q.name,
          sector: q.sector,
          logoUrl: q.logoUrl,
          price: q.price || 0,
          changePercent: q.changePercent || 0,
          change: q.calculatedChange || 0,
          volume: q.volume ?? 0,
          marketCap: q.rawMarketCap ?? null,
          high52Week: q.high52Week ?? null,
          low52Week: q.low52Week ?? null,
          dataTimestamp: q.dataTimestamp || q.updatedAt,
          dataQuality: Math.abs(q.percentDifference || 0) > 2 ? "conflicted" : q.dataQuality,
          verification_status: q.verificationStatus,
          data_conflict: conflictData,
          source_integrity_score: q.sourceIntegrityScore
        };
      });
      res.json(formatted);
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to fetch quotes for old API wrapper" });
  }
});

app.get("/api/stocks/:symbol/history", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const range = (req.query.range as string) || "1Y";

  try {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - getDaysForRange(range));
    
    const startStr = start.toISOString().split("T")[0];
    const endStr = end.toISOString().split("T")[0];

    const wallflakeUrl = `https://wallflake.com/api/eod/${encodeURIComponent(symbol)}?start=${startStr}&end=${endStr}`;
    const apiRes = await fetch(wallflakeUrl);
    if (!apiRes.ok) throw new Error("Wallflake API error");
    
    const data = await apiRes.json() as Array<{
      date: string;
      close: number | null;
      price: number | null;
      open?: number | null;
      high?: number | null;
      low?: number | null;
      volume?: number | null;
    }>;

    // Cache to SQLite historical_quotes for mini-history to use
    if (Array.isArray(data) && data.length > 0) {
      try {
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
            const open = typeof item.open === "number" ? item.open : (item.close ?? item.price ?? 0);
            const high = typeof item.high === "number" ? item.high : (item.close ?? item.price ?? 0);
            const low = typeof item.low === "number" ? item.low : (item.close ?? item.price ?? 0);
            const close = typeof item.close === "number" ? item.close : (item.price ?? 0);
            const volume = typeof item.volume === "number" ? item.volume : 0;
            
            insertStmt.run(symbol, tradingDate, open, high, low, close, volume);
          }
        })();
      } catch (cacheErr: any) {
        console.error(`[History API] Failed to cache history for ${symbol}:`, cacheErr.message);
      }
    }

    let currentPrice: number | null = null;
    try {
      const quote = db.prepare(`SELECT price FROM market_quotes WHERE symbol = ?`).get(symbol) as { price: number } | undefined;
      if (quote) {
        currentPrice = quote.price;
      }
    } catch {
      // Ignore
    }

    const history = data.map((d) => ({
      date: d.date,
      value: d.close ?? d.price,
    }));
    
    // Always append today's latest quote if available for the frontend to show latest price
    if (currentPrice !== null && history.length > 0) {
      const lastDate = history[history.length - 1].date;
      const todayDate = endStr;
      if (lastDate !== todayDate) {
         history.push({
           date: todayDate,
           value: currentPrice,
         });
      } else {
         history[history.length - 1].value = currentPrice;
      }
    }

    res.json(history);
  } catch (err: unknown) {
    console.error(`[History API] Error fetching history for ${symbol}:`, err);
    res.status(500).json({ error: "Failed to fetch stock history" });
  }
});

const MANUAL_WIKI_MAPPING: Record<string, string | null> = {
  "AADS": "AngloGold_Ashanti",
  "ACCESS": "Access_Bank_Ghana_Plc",
  "ADB": "Agricultural_Development_Bank_of_Ghana",
  "CLYD": "Clydestone_Ghana",
  "CPC": "Cocoa_Processing_Company",
  "TBL": "Trust_Bank_Limited_(Gambia)",
  // Temporarily skip Wikipedia fetch for these, waiting for manual links
  "SCB": "Standard_Chartered_Ghana",
  "SCBPREF": "Standard_Chartered_Ghana",
  "RBGH": "Republic_Bank_Ghana_Limited",
  "EGL": "Enterprise_Group_(Ghana)",
};

const MANUAL_CUSTOM_ABOUT: Record<string, { description: string; source: string; pageTitle?: string; pageUrl?: string; }> = {
  "ALLGH": {
    description: "Atlantic Lithium is a lithium-focused exploration and development company advancing its flagship Ewoyaa Project in Ghana, West Africa to production.",
    source: "Atlantic Lithium",
    pageTitle: "About Us - Atlantic Lithium",
    pageUrl: "https://www.atlanticlithium.com.au/"
  },
  "ASG": {
    description: "Asante Gold Corporation is a gold production, exploration and development company with a high-quality portfolio of mines and projects in Ghana, Africa’s largest and safest gold producer.",
    source: "Asante Gold",
    pageTitle: "About Us - Asante Gold",
    pageUrl: "https://www.asantegold.com/"
  },
  "DIGICUT": {
    description: "Digicut Production & Advertising PLC is an Accra-based, full-service advertising, branding, and public relations agency. Located in the Avenor area of Accra, they provide 360-degree marketing solutions, including large-format printing, billboard rentals, event planning, and digital media production.",
    source: "Digicut",
    pageTitle: "About Digicut",
    pageUrl: "https://digicutghana.com/"
  },
  "GLD": {
    description: "The NewGold Exchange Traded Fund remains the primary gold-backed ETF trading on the Ghana Stock Exchange. Sponsored by Absa, it allows investors to track the real-time global spot price of physical gold without needing to store bullion.",
    source: "NewGold ETF",
  },
  "HORDS": {
    description: "Hords Limited is a wholly Ghanaian-owned agro-processing and manufacturing company that researches, develops, and produces a range of cereals, food supplements, beverages, and household detergents.",
    source: "Hords Limited",
  },
  "MAC": {
    description: "Mega African Capital Limited is a long-term private investment company headquartered in Accra, Ghana, and listed on the Ghana Stock Exchange. It primarily targets high-net-worth investors seeking exposure to high-growth opportunities across Africa.",
    source: "Mega African Capital",
  },
  "IIL": {
    description: "Intravenous Infusions PLC is a Ghanaian pharmaceutical company producing and distributing Intravenous Fluids in Ghana and the West African sub region. Being the market leader and listed on the Ghana Alternative Market since December 2015, Intravenous Infusions PLC was incorporated in 1969 and began operations in 1974 as the first pharmaceutical company producing intravenous infusions in Ghana.",
    source: "Intravenous Infusions PLC",
    pageTitle: "About Us - Intravenous Infusions PLC",
    pageUrl: "https://iil.com.gh/about-us/"
  },
  "MMH": {
    description: "Meridian-Marshalls Holdings PLC (GSE: MMH) is a Ghanaian education and research company. Headquartered in Accra, the firm administers and manages post-secondary educational institutions, including Meridian Pre-University and Marshalls College, while also engaging in the import and export of educational materials.",
    source: "Meridian-Marshalls",
  },
  "SAMBA": {
    description: "Samba Foods Limited is a wholly Ghanaian-owned food processing and packaging company headquartered in Tema, Ghana. Founded in 1993.",
    source: "Samba Foods",
  },
  "TLW": {
    description: "Tullow Ghana Limited, a subsidiary of the British independent oil and gas exploration company Tullow Oil plc, is the primary operator of Ghana's major offshore oil fields. Headquartered in London, the company has shifted its strategy to create a distinct, Ghana-focused operating platform after divesting from other African assets",
    source: "Tullow Oil",
    pageTitle: "About Us - Tullow Oil",
    pageUrl: "https://www.tullowoil.com/about-us/"
  },
  "UNIL": {
    description: "Unilever Ghana PLC is the country's leading manufacturer of fast-moving consumer goods (FMCG). Headquartered in the Heavy Industrial Area in Tema, the company produces and distributes personal care, home care, and food products.",
    source: "Unilever",
  },
  "ZEN": {
    description: "ZEN Petroleum supplies Fuel, Lubricants and related services to Mines nationwide. They also operate a fast-growing retail network of 58 active service stations, employing over 1,300 staff and supplying over 30 million litres of fuel a month.",
    source: "ZEN",
    pageTitle: "About Us - ZEN Petroleum",
    pageUrl: "https://www.zenpetroleum.com/about-us"
  }
};

app.get("/api/stocks/:symbol/about", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    if (MANUAL_CUSTOM_ABOUT[symbol]) {
      return res.json(MANUAL_CUSTOM_ABOUT[symbol]);
    }

    const company = db.prepare(`SELECT name FROM companies WHERE symbol = ?`).get(symbol) as { name: string } | undefined;
    if (!company) return res.status(404).json({ error: "Company not found" });

    const headers = { "User-Agent": "AIStudio/1.0" };

    // Check if we have a manual mapping for this symbol
    if (MANUAL_WIKI_MAPPING[symbol] !== undefined) {
      const explicitTitle = MANUAL_WIKI_MAPPING[symbol];
      if (explicitTitle === null) {
          return res.status(404).json({ error: "Skipping Wikipedia fetch for this symbol" });
      }

      const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&redirects=1&titles=${encodeURIComponent(explicitTitle)}&format=json`;
      const extractRes = await fetch(extractUrl, { headers });
      
      if (extractRes.ok) {
        const extractData = await extractRes.json();
        const pages = extractData?.query?.pages || {};
        const pageId = Object.keys(pages)[0];
        if (pageId && pageId !== "-1" && pages[pageId].extract) {
           return res.json({
               description: pages[pageId].extract,
               source: "Wikipedia",
               pageTitle: pages[pageId].title,
               pageUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(pages[pageId].title.replace(/ /g, '_'))}`
           });
        }
      }
      return res.status(404).json({ error: "No Wikipedia entry found for manual mapping" });
    }

    // Clean up name for better search results
    let searchQuery = company.name;
    const match = company.name.match(/\(([^)]+)\)/);
    if (match) {
        searchQuery = match[1]; // Use text like "MTN Ghana" or "GOIL"
    } else {
        searchQuery = searchQuery.replace(/[^a-z0-9 ]/gi, ' ')
                                 .replace(/\b(?:PLC|LTD|LIMITED|INC|CORP|COMPANY|GROUP)\b/gi, '')
                                 .replace(/\s+/g, ' ')
                                 .trim();
        if (!searchQuery) searchQuery = company.name;
    }

    const searchRes = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchQuery)}&format=json`, { headers });
    if (!searchRes.ok) throw new Error("Wikipedia search failed");
    
    const searchData = await searchRes.json();
    const results = searchData?.query?.search || [];
    
    // Filter out generic lists that just mention the company
    const validResults = results.filter((r: any) => !r.title.includes("Ghana Club 100") && !r.title.includes("Ghana Stock Exchange"));

    if (validResults.length > 0) {
      const title = validResults[0].title;
      // Fetch the actual extract
      const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&redirects=1&titles=${encodeURIComponent(title)}&format=json`;
      const extractRes = await fetch(extractUrl, { headers });
      
      if (extractRes.ok) {
        const extractData = await extractRes.json();
        const pages = extractData?.query?.pages || {};
        const pageId = Object.keys(pages)[0];
        if (pageId && pageId !== "-1" && pages[pageId].extract) {
           const extract = pages[pageId].extract;
           if (!extract.includes("is a surname") && !extract.includes("may refer to:")) {
             return res.json({
                 description: extract,
                 source: "Wikipedia",
                 pageTitle: pages[pageId].title,
                 pageUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(pages[pageId].title.replace(/ /g, '_'))}`
             });
           }
        }
      }
    }

    return res.status(404).json({ error: "No Wikipedia entry found" });
    
  } catch (err) {
    console.error(`[About API] Error fetching about for ${symbol}:`, err);
    res.status(500).json({ error: "Internal error" });
  }
});

app.get("/api/stocks/:symbol/branding", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    const company = db.prepare(`SELECT name, logoUrl FROM companies WHERE symbol = ?`).get(symbol) as { name: string, logoUrl: string | null } | undefined;
    if (!company) return res.status(404).json({ error: "Not found" });
    res.json({ name: company.name, logoUrl: company.logoUrl });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

app.get("/api/indices/:code/history", async (req, res) => {
  const code = req.params.code.toUpperCase();
  const range = (req.query.range as string) || "1Y";

  try {
    const end = new Date();
    const start = new Date();
    const days = getDaysForRange(range);
    start.setDate(end.getDate() - days);

    const wallflakeUrl = `https://wallflake.com/api/market-index/${encodeURIComponent(code)}`;
    const apiRes = await fetch(wallflakeUrl);
    if (!apiRes.ok) throw new Error("Wallflake API error");
    
    const data = await apiRes.json() as Array<{ date: string; value: number }>;

    const history = data
      .filter((d) => {
         const dDate = new Date(d.date);
         return dDate >= start && dDate <= end;
      })
      .map((d) => ({
        date: d.date,
        value: d.value,
      }));

    res.json(history);
  } catch (err: unknown) {
    console.error(`[History API] Error fetching index history for ${code}:`, err);
    res.status(500).json({ error: "Failed to fetch index history" });
  }
});

function getDaysForRange(range: string): number {
  switch (range) {
    case "1W": return 7;
    case "1M": return 30;
    case "3M": return 90;
    case "6M": return 180;
    case "YTD": {
      const now = new Date();
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      return Math.floor((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
    }
    case "1Y": return 365;
    case "5Y": return 365 * 5;
    case "ALL": return 365 * 10; // arbitrary max
    default: return 365;
  }
}

app.get("/api/stocks/:symbol/corporate-actions", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    const companyRow = db.prepare("SELECT name FROM companies WHERE symbol = ?").get(symbol) as { name: string } | undefined;
    const companyName = companyRow?.name || "";

    const url = `https://gse.com.gh/?s=${encodeURIComponent(symbol)}`;
    const response = await fetch(url, { headers: { "User-Agent": "AIStudio/1.0" } });
    if (!response.ok) {
      return res.status(500).json({ error: "Failed to fetch from GSE" });
    }

    const html = await response.text();
    const itemsMatch = html.match(/<article[\s\S]*?<\/article>/gi) || [];
    
    // Some basic filtering because global search returns any post containing the ticker
    const items = itemsMatch.map((item, index) => {
      const titleMatch = item.match(/<h2[^>]*>.*?<a[^>]*>(.*?)<\/a>/i);
      const linkMatch = item.match(/<h2[^>]*>.*?<a[^>]*href=["'](.*?)["']/i);
      const dateMatch = item.match(/<span class="meta-date">([^<]+)<\/span>/i);
      
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
      const extractUrl = linkMatch ? linkMatch[1] : '';
      let time = dateMatch ? dateMatch[1].trim() : '';

      // Fallback: try to extract year/date from the title if available
      if (!time) {
         const yearMatch = title.match(/202[0-9]/);
         if (yearMatch) time = yearMatch[0];
      }

      if (!title) return null;

      const currentYear = new Date().getFullYear().toString();
      if (!time.includes(currentYear) && !title.includes(currentYear)) {
          return null;
      }

      const titleUpper = title.toUpperCase();
      const symbolUpper = symbol.toUpperCase();
      const nameWords = companyName.toUpperCase().split(' ').filter(w => w.length > 3);
      
      const strictlyTied = titleUpper.includes(symbolUpper) || nameWords.some(w => titleUpper.includes(w));
      if (!strictlyTied) {
          return null;
      }

      return {
        id: `${symbol}-ca-${index}`,
        title,
        source: "Ghana Stock Exchange",
        time,
        url: extractUrl,
        company: symbol,
        publishedAt: time,
      };
    }).filter(Boolean);

    res.json({ items });
  } catch (err: any) {
    console.error(`[API] Error fetching corporate actions for ${symbol}:`, err);
    res.status(500).json({ error: "Failed to fetch corporate actions" });
  }
});


app.get("/api/stocks/:symbol/profile", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    const quote = db.prepare(`SELECT * FROM market_quotes WHERE symbol = ?`).get(symbol) as any;
    const company = db.prepare(`SELECT * FROM companies WHERE symbol = ?`).get(symbol) as any;
    
    console.log("PROFILE ROUTE HIT for", symbol, !!company);
    if (!company) {
      return res.status(404).json({ error: "Not found" });
    }

    const latestHistory = db.prepare(`SELECT open, high, low, close, volume FROM historical_quotes WHERE symbol = ? ORDER BY tradingDate DESC LIMIT 2`).all(symbol) as Array<any>;
    const todayHistory = latestHistory[0] || {};
    const prevHistory = latestHistory[1] || {};

    // Get open and high from history (today), if not fallback to current quote
    const todayOpen = todayHistory.open || quote?.price || 0;
    const todayHigh = todayHistory.high || quote?.price || 0;
    const todayLow = todayHistory.low || quote?.price || 0;
    const prevClose = prevHistory.close || quote?.referencePrice || null;

    res.json({
      companyName: company.name,
      sector: company.sector,
      capital: quote?.rawMarketCap ?? null,
      eps: company.eps ?? null,
      pe: company.pe ?? null,
      dividendYield: company.dividendYield ?? null,
      dps: company.dividendPerShare ?? null,
      previousClose: prevClose,
      open: todayOpen,
      high: todayHigh,
      low: todayLow,
      high52: quote?.high52Week ?? null,
      low52: quote?.low52Week ?? null,
      logoUrl: company.logoUrl ?? null,
      volume: quote?.volume ?? todayHistory?.volume ?? null
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

app.get("/api/news", async (_req, res) => {
  try {
    const items = await fetchAggregatedNews();
    res.json(items);
  } catch (error) {
    console.error("News error:", error);
    res.json([]);
  }
});

// Basic health check route
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 404 for unhandled API routes to prevent Vite from proxying them
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Vite & Static file serving
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve the built dist directory
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
}

setupVite();
