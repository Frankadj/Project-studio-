import { useEffect, useMemo, useRef, useState } from "react";
import { C } from "../theme/colors";
import StockChart from "./StockChart";
import ChartLoadingSkeleton from "./ChartLoadingSkeleton";
import ChartRefreshOverlay from "./ChartRefreshOverlay";
import PriceAlertModal from "./PriceAlertModal";
import TickerLogo from "./TickerLogo";
import ChartPeriodTabs from "./ChartPeriodTabs";
import CorporateActionsSkeleton from "./CorporateActionsSkeleton";
import type { PortfolioTransaction, Position } from "../App";
import useIsCompactLayout from "../hooks/useIsCompactLayout";
import { getApiBase } from "../lib/api";
import { useMiniHistoryMap } from "../hooks/useMiniHistoryMap";
import MiniSparkline from "./MiniSparkline";
import { getStockMovementTone, formatStockChangePercent } from "../utils/stockMovement";
import {
  readPriceAlert,
  removePriceAlert,
  savePriceAlert,
  subscribePriceAlerts,
  type PriceAlert,
} from "../lib/priceAlerts";
import {
  readStockPageCache,
  writeStockPageCache,
} from "../lib/stockPageCache";
import {
  getChartPeriodLabel,
  type ChartPeriod,
} from "../utils/chartPeriods";
import {
  MARKET_CATEGORY_DEFINITIONS,
  resolveMarketCategory,
} from "../utils/marketCategories";

type Stock = {
  symbol?: string;
  ticker?: string;
  code?: string;
  name: string;
  companyName?: string;
  sector?: string;
  website?: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  high52Week?: number;
  low52Week?: number;
  dataTimestamp?: string;
};

type HistoryPoint = {
  date: string;
  value: number;
};

type CompanyInfo = {
  description?: string;
  companyName: string;
  sector: string;
  source?: string;
  pageUrl?: string;
};

type StockProfileResponse = {
  companyName?: string;
  description?: string;
  sector?: string;
  industry?: string;
  website?: string;
  capital?: number | null;
  dps?: number | null;
  pe?: number | null;
  eps?: number | null;
  shares?: number | null;
  previousClose?: number | null;
  dividendYield?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  high52?: number | null;
  low52?: number | null;
  volume?: number | null;
  company?: {
    name?: string;
    address?: string;
    directors?: string[];
    email?: string;
    facsimile?: string;
    sector?: string;
    industry?: string;
    telephone?: string;
    website?: string;
  };
};

type StockAboutResponse = {
  description?: string;
  source?: string;
  pageTitle?: string;
  pageUrl?: string;
  pending?: boolean;
};

type CorporateActionItem = {
  id: string | number;
  title: string;
  source: string;
  time: string;
  url?: string;
  company?: string;
  publishedAt?: string;
  tags?: string[];
  scope?: "stock" | "market";
};

type StockCorporateActionsResponse = {
  fallbackUsed?: boolean;
  items?: CorporateActionItem[];
  pending?: boolean;
};

type StockDetailProps = {
  stock: Stock;
  stocks?: Stock[];
  onSelect?: (stock: Stock) => void;
  onBack: () => void;
  positions: Record<string, Position>;
  hasTransactions: boolean;
  isInWatchlist: boolean;
  onToggleWatchlist: (symbol: string) => void;
  onNavigateToTransaction: (symbol: string) => void;
};

type StockPeriod = ChartPeriod;

const STOCK_PROFILE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const STOCK_ABOUT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const STOCK_HISTORY_CACHE_TTL_MS = 20 * 60 * 1000;
const STOCK_YEAR_HISTORY_CACHE_TTL_MS = 60 * 60 * 1000;
const STOCK_CORPORATE_ACTIONS_CACHE_TTL_MS = 45 * 60 * 1000;

const MARKET_CATEGORY_LABELS = new Map(
  MARKET_CATEGORY_DEFINITIONS.map((item) => [item.key, item.label] as const)
);

function filterCorporateActionItems(items: CorporateActionItem[]) {
  return (Array.isArray(items) ? items : []).filter(
    (item) => item && item.scope !== "market"
  );
}

function useAnimatedNumber(target: number, duration = 120) {
  const [displayValue, setDisplayValue] = useState(target);
  const currentValueRef = useRef(target);

  useEffect(() => {
    currentValueRef.current = displayValue;
  }, [displayValue]);

  useEffect(() => {
    if (!Number.isFinite(target)) {
      const handle = requestAnimationFrame(() => {
        setDisplayValue(target);
        currentValueRef.current = target;
      });
      return () => cancelAnimationFrame(handle);
    }

    const startValue = currentValueRef.current;
    const delta = target - startValue;

    if (Math.abs(delta) < 0.0001) {
      const handle = requestAnimationFrame(() => {
        setDisplayValue(target);
        currentValueRef.current = target;
      });
      return () => cancelAnimationFrame(handle);
    }

    let frameId = 0;
    let startTime: number | null = null;

    const animate = (timestamp: number) => {
      if (startTime === null) {
        startTime = timestamp;
      }

      const progress = Math.min(1, (timestamp - startTime) / duration);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const nextValue = startValue + delta * easedProgress;

      currentValueRef.current = nextValue;
      setDisplayValue(nextValue);

      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      } else {
        currentValueRef.current = target;
        setDisplayValue(target);
      }
    };

    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [duration, target]);

  return displayValue;
}

function getFallbackSectorLabel(stock: Stock, symbol: string) {
  if (stock.sector) {
    return stock.sector;
  }

  const category = resolveMarketCategory({
    symbol,
    ticker: stock.ticker,
    code: stock.code,
    name: stock.name,
    sector: stock.sector,
  });

  return category ? MARKET_CATEGORY_LABELS.get(category) || "Not available" : "Not available";
}

function createBootstrapCompanyInfo(stock: Stock, symbol: string): CompanyInfo {
  const companyName = stock.companyName || stock.name || symbol || "Not available";
  const sector = getFallbackSectorLabel(stock, symbol);

  return {
    description: undefined,
    companyName,
    sector,
  };
}

function createFallbackCompanyInfo(stockName: string, symbol: string): CompanyInfo {
  return {
    description: undefined,
    companyName: stockName || symbol || "Not available",
    sector: "Not available",
  };
}

function createHistoryFallback(stock: Stock, period: StockPeriod): HistoryPoint[] {
  const currentPrice = Number(stock.price);
  const previousClose = currentPrice - Number(stock.change || 0);
  const safeCurrentPrice = Number.isFinite(currentPrice) ? currentPrice : 0;
  const safePreviousClose =
    Number.isFinite(previousClose) && previousClose > 0
      ? previousClose
      : safeCurrentPrice;

  const endDate = new Date();
  const startDate = new Date(endDate);

  switch (period) {
    case "1W":
      startDate.setDate(endDate.getDate() - 7);
      break;
    case "1M":
      startDate.setMonth(endDate.getMonth() - 1);
      break;
    case "3M":
      startDate.setMonth(endDate.getMonth() - 3);
      break;
    case "6M":
      startDate.setMonth(endDate.getMonth() - 6);
      break;
    case "YTD":
      startDate.setMonth(0, 1);
      break;
    case "1Y":
      startDate.setFullYear(endDate.getFullYear() - 1);
      break;
    case "5Y":
      startDate.setFullYear(endDate.getFullYear() - 5);
      break;
    case "ALL":
      startDate.setFullYear(endDate.getFullYear() - 8);
      break;
  }

  return [
    {
      date: startDate.toISOString().slice(0, 10),
      value: safePreviousClose,
    },
    {
      date: endDate.toISOString().slice(0, 10),
      value: safeCurrentPrice,
    },
  ];
}

function formatMoney(value: number | null | undefined) {
  const safeValue = Number(value);
  return Number.isFinite(safeValue) ? `₵${safeValue.toFixed(2)}` : "-";
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }
  const safeValue = Number(value);
  return Number.isFinite(safeValue) ? `${safeValue.toFixed(2)}%` : "-";
}

import { formatFinancialValue, formatCompactCurrency } from "../utils/format";

function formatCompactMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  const safeValue = Number(value);
  if (!Number.isFinite(safeValue)) return "-";
  return formatCompactCurrency(safeValue, "₵");
}

function StatCell({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={{ textAlign: "left" }}>
      <div
        style={{
          fontSize: 12,
          color: C.sub,
          marginBottom: 4,
          textTransform: "uppercase",
          letterSpacing: "0.02em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: C.text,
        }}
      >
        {value || "-"}
      </div>
    </div>
  );
}

function StockDetail({
  stock,
  stocks = [],
  onSelect,
  onBack,
  positions,
  hasTransactions,
  isInWatchlist,
  onToggleWatchlist,
  onNavigateToTransaction,
}: StockDetailProps) {
  const apiBase = getApiBase();
  const isCompactLayout = useIsCompactLayout();
  const symbol = stock.symbol || stock.ticker || stock.code || "";
  const bootstrapCompanyInfo = useMemo(
    () => createBootstrapCompanyInfo(stock, symbol),
    [symbol, stock.code, stock.companyName, stock.name, stock.sector, stock.ticker]
  );
  const cachedBootstrapHistory = useMemo(
    () =>
      readStockPageCache<HistoryPoint[]>("history", symbol, "1W") ||
      createHistoryFallback(stock, "1W"),
    [stock.change, stock.price, symbol]
  );
  const cachedBootstrapYearHistory = useMemo(
    () => readStockPageCache<HistoryPoint[]>("history", symbol, "1Y") || [],
    [symbol]
  );
  const cachedBootstrapProfile = useMemo(
    () => readStockPageCache<StockProfileResponse>("profile", symbol),
    [symbol]
  );
  const cachedBootstrapAbout = useMemo(
    () => readStockPageCache<StockAboutResponse>("about", symbol),
    [symbol]
  );
  const cachedBootstrapCorporateActions = useMemo(
    () => readStockPageCache<StockCorporateActionsResponse>("corporate-actions", symbol),
    [symbol]
  );

  const [period, setPeriod] = useState<StockPeriod>("1W");
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showPriceAlertModal, setShowPriceAlertModal] = useState(false);
  const [activePriceAlert, setActivePriceAlert] = useState<PriceAlert | null>(() =>
    readPriceAlert(symbol)
  );

  const [history, setHistory] = useState<HistoryPoint[]>(cachedBootstrapHistory);
  const [yearHistory, setYearHistory] = useState<HistoryPoint[]>(
    cachedBootstrapYearHistory
  );
  const [historyLoading, setHistoryLoading] = useState(
    cachedBootstrapHistory.length < 2
  );
  const [historyRefreshing, setHistoryRefreshing] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const hasChartHistoryRef = useRef(cachedBootstrapHistory.length >= 2);
  const historyRequestIdRef = useRef(0);
  const latestFetchContextRef = useRef("");
  const [hoveredHistoryPoint, setHoveredHistoryPoint] = useState<HistoryPoint | null>(
    null
  );

  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(() => {
    if (cachedBootstrapAbout?.description) {
      return {
        description: cachedBootstrapAbout.description,
        source: cachedBootstrapAbout.source,
        pageUrl: cachedBootstrapAbout.pageUrl,
        companyName:
          cachedBootstrapProfile?.companyName ||
          cachedBootstrapProfile?.company?.name ||
          bootstrapCompanyInfo.companyName,
        sector:
          cachedBootstrapProfile?.company?.sector ||
          cachedBootstrapProfile?.sector ||
          bootstrapCompanyInfo.sector,
      };
    }

    if (cachedBootstrapProfile) {
      return {
        description:
          cachedBootstrapProfile.description || bootstrapCompanyInfo.description,
        companyName:
          cachedBootstrapProfile.companyName ||
          cachedBootstrapProfile.company?.name ||
          bootstrapCompanyInfo.companyName,
        sector:
          cachedBootstrapProfile.company?.sector ||
          cachedBootstrapProfile.sector ||
          bootstrapCompanyInfo.sector,
      };
    }

    return bootstrapCompanyInfo;
  });
  const [stockProfile, setStockProfile] = useState<StockProfileResponse | null>(
    cachedBootstrapProfile
  );
  const [corporateActions, setCorporateActions] = useState<CorporateActionItem[]>(
    () => filterCorporateActionItems(cachedBootstrapCorporateActions?.items || [])
  );
  const [corporateActionsLoading, setCorporateActionsLoading] = useState(
    !Array.isArray(cachedBootstrapCorporateActions?.items)
  );
  const [corporateActionsError, setCorporateActionsError] = useState("");

  // RELATED STOCKS / RELATED ASSETS FEATURE
  const isEtf = useMemo(() => {
    const sym = symbol.toUpperCase();
    return (
      sym === "GLD" ||
      stock.sector?.toLowerCase() === "etf" ||
      stockProfile?.sector?.toLowerCase() === "etf" ||
      stockProfile?.industry?.toLowerCase() === "etf" ||
      stock.name?.toLowerCase().includes("etf")
    );
  }, [stock, stockProfile, symbol]);

  const currentSector =
    stockProfile?.company?.sector ||
    stockProfile?.sector ||
    companyInfo.sector ||
    stock.sector ||
    bootstrapCompanyInfo.sector;

  const relatedStocks = useMemo(() => {
    if (!stocks || stocks.length === 0) return [];
    const currentSymbol = symbol.toUpperCase();
    
    // Filter out current stock
    const otherStocks = stocks.filter(s => {
      const sym = (s.symbol || s.ticker || s.code || "").toUpperCase();
      return sym !== currentSymbol;
    });

    if (isEtf) {
      // It's an ETF, find other ETFs/Assets
      const etfs = otherStocks.filter(s => {
        const sym = (s.symbol || s.ticker || s.code || "").toUpperCase();
        return (
          sym === "GLD" ||
          s.sector?.toLowerCase() === "etf" ||
          s.name?.toLowerCase().includes("etf")
        );
      });
      
      if (etfs.length > 0) {
        return etfs.slice(0, 4);
      }
      
      // Fallback: financial sector assets
      const financials = otherStocks.filter(s => {
        const cat = resolveMarketCategory({
          symbol: s.symbol || s.ticker || s.code || "",
          name: s.name,
          sector: s.sector
        });
        return cat === "financials";
      });
      return financials.slice(0, 4);
    } else {
      // It's a regular stock, find stocks in the same sector/market category
      const currentCat = resolveMarketCategory({
        symbol: stock.symbol || stock.ticker || stock.code || "",
        name: stock.name,
        sector: currentSector
      });
      
      const sameSector = otherStocks.filter(s => {
        const cat = resolveMarketCategory({
          symbol: s.symbol || s.ticker || s.code || "",
          name: s.name,
          sector: s.sector
        });
        return cat === currentCat;
      });

      // Sort by volume/activity
      sameSector.sort((a, b) => (b.volume || 0) - (a.volume || 0));

      if (sameSector.length >= 4) {
        return sameSector.slice(0, 4);
      }

      // Fill remaining from top stocks in other categories
      const sameSectorSymbols = new Set(sameSector.map(s => (s.symbol || s.ticker || s.code || "").toUpperCase()));
      const remaining = otherStocks.filter(s => {
        const sym = (s.symbol || s.ticker || s.code || "").toUpperCase();
        return !sameSectorSymbols.has(sym);
      });

      remaining.sort((a, b) => (b.volume || 0) - (a.volume || 0));
      return [...sameSector, ...remaining].slice(0, 4);
    }
  }, [stocks, stock, isEtf, currentSector, symbol]);

  const relatedMiniCharts = useMiniHistoryMap({
    apiBase,
    stocks: relatedStocks,
    range: "1W"
  });

  const fetchContextKey = `${symbol}|${period}`;
  latestFetchContextRef.current = fetchContextKey;

  const resetChartState = () => {
    historyRequestIdRef.current += 1;
    const nextBootstrapHistory =
      readStockPageCache<HistoryPoint[]>("history", symbol, "1W") ||
      createHistoryFallback(stock, "1W");
    hasChartHistoryRef.current = nextBootstrapHistory.length >= 2;
    setHistory(nextBootstrapHistory);
    setHistoryError("");
    setHistoryLoading(nextBootstrapHistory.length < 2);
    setHistoryRefreshing(nextBootstrapHistory.length >= 2);
    setHoveredHistoryPoint(null);
  };

  const handlePeriodChange = (nextPeriod: StockPeriod) => {
    if (nextPeriod === period) {
      return;
    }

    setHoveredHistoryPoint(null);
    setPeriod(nextPeriod);
  };

  useEffect(() => {
    resetChartState();
    setActivePriceAlert(readPriceAlert(symbol));
    setYearHistory(readStockPageCache<HistoryPoint[]>("history", symbol, "1Y") || []);
    setStockProfile(readStockPageCache<StockProfileResponse>("profile", symbol));
    const cachedCorporateActions = readStockPageCache<StockCorporateActionsResponse>(
      "corporate-actions",
      symbol
    );
    setCorporateActions(filterCorporateActionItems(cachedCorporateActions?.items || []));
    setCorporateActionsLoading(!Array.isArray(cachedCorporateActions?.items));
    setCorporateActionsError("");
    const cachedAbout = readStockPageCache<StockAboutResponse>("about", symbol);
    const cachedProfile = readStockPageCache<StockProfileResponse>("profile", symbol);

    if (cachedAbout?.description) {
      setCompanyInfo({
        description: cachedAbout.description,
        source: cachedAbout.source,
        pageUrl: cachedAbout.pageUrl,
        companyName:
          cachedProfile?.companyName ||
          cachedProfile?.company?.name ||
          bootstrapCompanyInfo.companyName,
        sector:
          cachedProfile?.company?.sector ||
          cachedProfile?.sector ||
          bootstrapCompanyInfo.sector,
      });
    } else if (cachedProfile) {
      setCompanyInfo({
        description: cachedProfile.description || bootstrapCompanyInfo.description,
        companyName:
          cachedProfile.companyName ||
          cachedProfile.company?.name ||
          bootstrapCompanyInfo.companyName,
        sector:
          cachedProfile.company?.sector ||
          cachedProfile.sector ||
          bootstrapCompanyInfo.sector,
      });
    } else {
      setCompanyInfo(bootstrapCompanyInfo);
    }

    setPeriod("1W");
  }, [
    bootstrapCompanyInfo.companyName,
    bootstrapCompanyInfo.description,
    bootstrapCompanyInfo.sector,
    symbol,
  ]);

    useEffect(() => {
    const fetchContext = `${symbol}|${period}`;
    const controller = new AbortController();

    const fetchHistory = async () => {
      if (!symbol) {
        setHistory([]);
        setHistoryError("Symbol is required.");
        hasChartHistoryRef.current = false;
        return;
      }

      const requestId = historyRequestIdRef.current + 1;
      historyRequestIdRef.current = requestId;
      const hasExistingChart = hasChartHistoryRef.current;

      setHistoryLoading(!hasExistingChart);
      setHistoryRefreshing(hasExistingChart);
      setHistoryError("");

      try {
        const response = await fetch(
          `${apiBase}/api/stocks/${symbol}/history?range=${period}`,
          {
            signal: controller.signal,
          }
        );

        if (
          controller.signal.aborted ||
          requestId !== historyRequestIdRef.current ||
          latestFetchContextRef.current !== fetchContext
        ) {
          return;
        }

        if (!response.ok) {
          throw new Error(`Failed to load history: ${response.status}`);
        }

        const data = await response.json();

        if (
          controller.signal.aborted ||
          requestId !== historyRequestIdRef.current ||
          latestFetchContextRef.current !== fetchContext
        ) {
          return;
        }

        if (!Array.isArray(data)) {
          throw new Error("Invalid history data");
        }

        const cleanedHistory = data
          .filter(
            (item) =>
              item &&
              typeof item.date !== "undefined" &&
              typeof item.value !== "undefined"
          )
          .map((item) => ({
            date: String(item.date),
            value: Number(item.value),
          }))
          .filter((item) => !Number.isNaN(item.value))
          .sort((left, right) => left.date.localeCompare(right.date));

        if (cleanedHistory.length < 2) {
          hasChartHistoryRef.current = false;
          setHistory([]);
          setHistoryError(
            cleanedHistory.length === 1
              ? "Not enough historical data."
              : "No historical data available."
          );
        } else {
          hasChartHistoryRef.current = true;
          setHistory(cleanedHistory);
          
          writeStockPageCache(
            "history",
            symbol,
            cleanedHistory,
            period === "1Y" ? STOCK_YEAR_HISTORY_CACHE_TTL_MS : STOCK_HISTORY_CACHE_TTL_MS,
            period
          );
          
          if (period === "1Y") {
             setYearHistory(cleanedHistory);
          }
        }
      } catch (error) {
        if (
          controller.signal.aborted ||
          requestId !== historyRequestIdRef.current ||
          latestFetchContextRef.current !== fetchContext
        ) {
          return;
        }
        
        console.error("Failed to load generic chart:", error);
        if (!hasExistingChart) {
          hasChartHistoryRef.current = false;
          setHistory([]);
        }
        setHistoryError(
          hasExistingChart
            ? "Unable to refresh chart right now."
            : "Chart not available."
        );
      } finally {
        if (
          requestId === historyRequestIdRef.current &&
          latestFetchContextRef.current === fetchContext
        ) {
          setHistoryLoading(false);
          setHistoryRefreshing(false);
        }
      }
    };

    void fetchHistory();

    return () => {
      controller.abort();
    };
  }, [apiBase, period, symbol]);

  useEffect(() => {
    return subscribePriceAlerts(() => {
      setActivePriceAlert(readPriceAlert(symbol));
    });
  }, [symbol]);

  useEffect(() => {
    const controller = new AbortController();

    const fetchCompanyInfo = async () => {
      if (!symbol) {
        setStockProfile(null);
        setCompanyInfo(createFallbackCompanyInfo(stock.name, symbol));
        return;
      }

      const cachedProfile = readStockPageCache<StockProfileResponse>("profile", symbol);
      const cachedAbout = readStockPageCache<StockAboutResponse>("about", symbol);
      let resolvedCompanyName =
        cachedProfile?.companyName ||
        cachedProfile?.company?.name ||
        bootstrapCompanyInfo.companyName;
      let resolvedSector =
        cachedProfile?.company?.sector ||
        cachedProfile?.sector ||
        bootstrapCompanyInfo.sector;

      if (cachedProfile) {
        setStockProfile(cachedProfile);
      }

      setCompanyInfo((curr) => {
        if (curr.description) return curr;
        if (cachedProfile) {
          return {
            description: cachedProfile.description || bootstrapCompanyInfo.description,
            companyName: resolvedCompanyName,
            sector: resolvedSector,
          };
        }
        return bootstrapCompanyInfo;
      });

      void (async () => {
        try {
          const aboutRes = await fetch(`${apiBase}/api/stocks/${symbol}/about`, {
            signal: controller.signal,
          });

          if (!aboutRes.ok || controller.signal.aborted) {
            return;
          }

          const aboutData = await aboutRes.json();
          if (controller.signal.aborted || !aboutData?.description) {
            return;
          }

          writeStockPageCache("about", symbol, aboutData, STOCK_ABOUT_CACHE_TTL_MS);
          setCompanyInfo((current) => ({
            description: aboutData.description || current.description,
            source: aboutData.source || current.source,
            pageUrl: aboutData.pageUrl || current.pageUrl,
            companyName: current.companyName || resolvedCompanyName,
            sector: current.sector || resolvedSector,
          }));
        } catch (err) {
          if (!controller.signal.aborted) {
            console.error("[About API] Error:", err);
          }
        }
      })();

      try {
        const res = await fetch(`${apiBase}/api/stocks/${symbol}/profile`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Status " + res.status);
        const data = await res.json();
        if (controller.signal.aborted) return;

        const company = data.company || {};
        const description =
          company.description ||
          company.longBusinessSummary ||
          data.description ||
          undefined;
        resolvedCompanyName =
          data.companyName || company.name || stock.name || symbol;
        resolvedSector =
          company.sector || data.sector || stock.sector || "Not available";

        setStockProfile(data);
        writeStockPageCache("profile", symbol, data, STOCK_PROFILE_CACHE_TTL_MS);
        setCompanyInfo((current) => ({
          description: current.description || description,
          source: current.source,
          pageUrl: current.pageUrl,
          companyName: resolvedCompanyName,
          sector: resolvedSector,
        }));
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        setStockProfile(cachedProfile || null);
        setCompanyInfo((current) => {
          if (current.description) return current;
          if (cachedProfile) {
            return {
              description: cachedProfile.description || bootstrapCompanyInfo.description,
              companyName:
                cachedProfile.companyName ||
                cachedProfile.company?.name ||
                bootstrapCompanyInfo.companyName,
              sector:
                cachedProfile.company?.sector ||
                cachedProfile.sector ||
                bootstrapCompanyInfo.sector,
            };
          }
          return bootstrapCompanyInfo;
        });
      }
    };

    fetchCompanyInfo();

    return () => {
      controller.abort();
    };
  }, [apiBase, bootstrapCompanyInfo, stock.name, symbol]);

  useEffect(() => {
    const controller = new AbortController();
    let retryTimer: number | null = null;
    const hasExistingCorporateActions = corporateActions.length > 0;

    const fetchCorporateActions = async () => {
      if (!symbol) {
        setCorporateActions([]);
        setCorporateActionsLoading(false);
        setCorporateActionsError("Stock symbol missing.");
        return;
      }

      setCorporateActionsLoading((current) => current || !hasExistingCorporateActions);
      setCorporateActionsError("");

      try {
        const res = await fetch(`${apiBase}/api/stocks/${symbol}/corporate-actions`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`Failed to load corporate actions: ${res.status}`);
        }

        const data: StockCorporateActionsResponse = await res.json();
        const items = filterCorporateActionItems(data.items || []);

        if (data.pending && items.length === 0) {
          retryTimer = window.setTimeout(() => {
            void fetchCorporateActions();
          }, 2500);
          return;
        }

        setCorporateActions(items);
        writeStockPageCache(
          "corporate-actions",
          symbol,
          {
            items,
            fallbackUsed: false,
          },
          STOCK_CORPORATE_ACTIONS_CACHE_TTL_MS
        );
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        console.error("Failed to load corporate actions:", error);
        if (!hasExistingCorporateActions) {
          setCorporateActions([]);
        }
        setCorporateActionsError("Unable to load corporate actions right now.");
      } finally {
        if (!controller.signal.aborted) {
          setCorporateActionsLoading(false);
        }
      }
    };

    void fetchCorporateActions();

    return () => {
      controller.abort();
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [apiBase, symbol]);

  const position = positions[symbol] || { shares: 0, totalCost: 0 };
  const ownedShares = position.shares;
  const currentValue = ownedShares * Number(stock.price);
  const avgCost = ownedShares > 0 ? position.totalCost / ownedShares : 0;
  const todaysReturn = ownedShares * Number(stock.change);
  const totalReturn = currentValue - position.totalCost;

  const stats = useMemo(() => {
    return {
      open: stockProfile?.open ?? stock.price,
      high: stockProfile?.high ?? stock.price,
      high52: stockProfile?.high52 ?? stock.high52Week ?? null,
      low52: stockProfile?.low52 ?? stock.low52Week ?? null,
      previousClose: stockProfile?.previousClose ?? (Number(stock.price) - Number(stock.change)),
      marketCap: stockProfile?.capital ?? stock.marketCap ?? null,
      dividendYield: stockProfile?.dividendYield ?? null,
      volume: stockProfile?.volume ?? stock.volume ?? 0,
      eps: stockProfile?.eps ?? null,
      pe: stockProfile?.pe ?? null,
    };
  }, [
    stock,
    stockProfile,
  ]);

  const displayCompanyName =
    stockProfile?.companyName ||
    stockProfile?.company?.name ||
    companyInfo.companyName ||
    stock.companyName ||
    stock.name;
  const displaySector =
    stockProfile?.company?.sector ||
    stockProfile?.sector ||
    companyInfo.sector ||
    stock.sector ||
    bootstrapCompanyInfo.sector;
  const hasHistoryChart = history.length >= 2;
  const latestHistoryPoint = hasHistoryChart ? history[history.length - 1] : null;
  const previewPoint = hoveredHistoryPoint || latestHistoryPoint;
  const rangeStartPoint = hasHistoryChart ? history[0] : null;
  const displayPriceTarget = previewPoint
    ? previewPoint.value
    : Number(stock.price);
  const displayChangeTarget =
    previewPoint && rangeStartPoint
      ? previewPoint.value - rangeStartPoint.value
      : Number(stock.change);
  const displayChangePercentTarget =
    previewPoint && rangeStartPoint && rangeStartPoint.value !== 0
      ? (displayChangeTarget / rangeStartPoint.value) * 100
      : Number(stock.changePercent);
  const displayPrice = useAnimatedNumber(displayPriceTarget);
  const displayChange = useAnimatedNumber(displayChangeTarget);
  const displayChangePercent = useAnimatedNumber(displayChangePercentTarget);
  const displayPositive = displayChange >= 0;
  const selectedPeriodLabel = getChartPeriodLabel(period);
  const chartPositive =
    hasHistoryChart && rangeStartPoint
      ? history[history.length - 1].value >= rangeStartPoint.value
      : Number(stock.change) >= 0;
  const detailGridColumns = "repeat(2, minmax(0, 1fr))";
  const bellStroke = activePriceAlert ? C.green : C.text;

  return (
    <div
      style={{
        background: C.bg,
        minHeight: "100vh",
        color: C.text,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: isCompactLayout ? 10 : 12,
          padding: isCompactLayout ? "14px 14px 12px" : "18px 20px 16px",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            color: C.text,
            cursor: "pointer",
            padding: 0,
            display: "flex",
            alignItems: "center",
          }}
        >
          <svg
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke={C.text}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <TickerLogo
          symbol={symbol}
          size={isCompactLayout ? 42 : 50}
          logoUrl={stockProfile?.logoUrl || stock.logoUrl}
        />

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: isCompactLayout ? 18 : 20,
              fontWeight: 700,
              color: C.text,
              lineHeight: 1.1,
            }}
          >
            {symbol || "N/A"}
          </div>

          <div
            style={{
              fontSize: 13,
              color: C.sub,
              marginTop: 5,
              textTransform: "uppercase",
              letterSpacing: "0.3px",
              lineHeight: 1.2,
            }}
          >
            {displayCompanyName}
          </div>
        </div>

        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: isCompactLayout ? 12 : 14,
            flexShrink: 0,
          }}
        >
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setShowActionMenu(!showActionMenu)}
              aria-label="Add action menu"
              style={{
                background: "none",
                border: "none",
                color: C.text,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
              }}
            >
              <svg
                width="29"
                height="29"
                viewBox="0 0 24 24"
                fill="none"
                stroke={C.text}
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </button>

            {showActionMenu && (
              <>
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 90 }}
                  onClick={() => setShowActionMenu(false)}
                />
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    right: 0,
                    marginTop: 8,
                    background: C.card,
                    border: `1px solid ${C.border}`,
                    borderRadius: 16,
                    padding: 8,
                    minWidth: 200,
                    zIndex: 100,
                    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
                  }}
                >
                  <button
                    onClick={() => {
                      onToggleWatchlist(symbol);
                      setShowActionMenu(false);
                    }}
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      background: "transparent",
                      border: "none",
                      color: C.text,
                      textAlign: "left",
                      fontSize: 16,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      borderRadius: 10,
                    }}
                  >
                    {isInWatchlist ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12.5 9.2 16.5 19 7.5" />
                      </svg>
                    )}
                    {isInWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
                  </button>

                  {!hasTransactions && ownedShares === 0 && (
                    <>
                      <div style={{ height: 1, background: C.border, margin: "4px 0" }} />
                      <button
                        onClick={() => {
                          onNavigateToTransaction(symbol);
                          setShowActionMenu(false);
                        }}
                        style={{
                          width: "100%",
                          padding: "12px 16px",
                          background: "transparent",
                          border: "none",
                          color: C.text,
                          textAlign: "left",
                          fontSize: 16,
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          borderRadius: 10,
                        }}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="4" width="20" height="16" rx="2" />
                          <line x1="2" y1="10" x2="22" y2="10" />
                        </svg>
                        Add to Holdings
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowPriceAlertModal(true)}
            aria-label={`Set price alert for ${symbol || displayCompanyName}`}
            style={{
              background: "none",
              border: "none",
              color: bellStroke,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            <svg
              width="31"
              height="31"
              viewBox="0 0 24 24"
              fill="none"
              stroke={bellStroke}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 17H9c-1.7 0-2.56 0-2.83-.38-.27-.38.03-1.16.62-2.72.29-.77.54-1.64.54-2.9v-.6a4.67 4.67 0 1 1 9.34 0v.6c0 1.26.25 2.13.54 2.9.59 1.56.89 2.34.62 2.72-.27.38-1.13.38-2.83.38Z" />
              <path d="M10.35 20a1.9 1.9 0 0 0 3.3 0" />
              <path d="M5.25 7.8c-.43.37-.73.82-.92 1.36" />
              <path d="M18.75 7.8c.43.37.73.82.92 1.36" />
            </svg>
          </button>
        </div>
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: "900px",
          margin: "0 auto",
          padding: isCompactLayout ? "18px 14px 136px" : "24px 20px 140px",
          boxSizing: "border-box",
        }}
      >
        <div style={{ marginBottom: 24, textAlign: "left" }}>
          <div
            style={{
              fontSize: isCompactLayout ? 36 : 44,
              fontWeight: 600,
              color: C.text,
              lineHeight: 1,
              letterSpacing: "-1px",
            }}
          >
            ₵{displayPrice.toFixed(2)}
          </div>

          <div
            style={{
              marginTop: 12,
              textAlign: "left",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                flexWrap: isCompactLayout ? "wrap" : "nowrap",
                maxWidth: "100%",
              }}
            >
              <div
                style={{
                  fontSize: isCompactLayout ? 16 : 18,
                  color: displayPositive ? C.green : C.red,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                {displayPositive ? "+" : "-"}
                {Math.abs(displayChange).toFixed(2)} ({displayPositive ? "+" : "-"}
                {Math.abs(displayChangePercent).toFixed(2)}%)
              </div>

              <div
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: `1px solid ${C.border}`,
                  background: C.card,
                  color: C.sub,
                  fontSize: isCompactLayout ? 10 : 11,
                  fontWeight: 700,
                  letterSpacing: "0.03em",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {selectedPeriodLabel}
              </div>
            </div>

            {stock.dataTimestamp && (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  color: C.sub,
                  display: "flex",
                  alignItems: "center",
                  gap: 4
                }}
              >
                <span>As of {new Date(stock.dataTimestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                <span style={{ fontSize: 10, padding: '2px 6px', background: C.border, borderRadius: 10 }}>Wallflake verified</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          {historyLoading && !hasHistoryChart ? (
            <ChartLoadingSkeleton />
          ) : hasHistoryChart ? (
            <div style={{ position: "relative" }}>
              <StockChart
                history={history}
                positive={chartPositive}
                onHoverChange={setHoveredHistoryPoint}
              />
              {historyRefreshing ? <ChartRefreshOverlay /> : null}
            </div>
          ) : (
            <div
              style={{
                border: `1px solid ${C.border}`,
                borderRadius: 18,
                padding: 20,
                background: C.card,
                color: C.sub,
              }}
            >
              {historyError || "No historical data available."}
            </div>
          )}

          {hasHistoryChart && historyError && !historyRefreshing ? (
            <div
              style={{
                marginTop: 10,
                color: C.sub,
                fontSize: 13,
                textAlign: "left",
              }}
            >
              {historyError}
            </div>
          ) : null}
        </div>

        <div style={{ marginBottom: 40 }}>
          <ChartPeriodTabs
            period={period}
            onChange={handlePeriodChange}
          />
        </div>

        {(ownedShares > 0 || hasTransactions) && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: 20,
                  fontWeight: 700,
                  color: C.text,
                  textAlign: "left",
                }}
              >
                Ownership
              </h3>
              <button
                onClick={() => onNavigateToTransaction(symbol)}
                style={{
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  color: C.text,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 8,
                  borderRadius: "50%",
                }}
                aria-label="Add New Transaction"
                title="Add New Transaction"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>

            <div style={{ marginBottom: 56, textAlign: "left" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: detailGridColumns,
                  gap: isCompactLayout ? 16 : 20,
                  marginBottom: 20,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, color: C.sub, marginBottom: 4 }}>
                    Shares Owned
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>
                    {ownedShares}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 13, color: C.sub, marginBottom: 4 }}>
                    Market Value
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>
                    {formatMoney(currentValue)}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: detailGridColumns,
                  gap: isCompactLayout ? 16 : 20,
                  marginBottom: 20,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, color: C.sub, marginBottom: 4 }}>
                    Avg. Cost
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>
                    {formatMoney(avgCost)}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 13, color: C.sub, marginBottom: 4 }}>
                    Today's Return
                  </div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: todaysReturn >= 0 ? C.green : C.red,
                    }}
                  >
                    {todaysReturn >= 0 ? "+" : "-"}
                    {formatMoney(Math.abs(todaysReturn))}
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 13, color: C.sub, marginBottom: 4 }}>
                  Total Return
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: totalReturn >= 0 ? C.green : C.red,
                  }}
                >
                  {totalReturn >= 0 ? "+" : "-"}
                  {formatMoney(Math.abs(totalReturn))}
                </div>
              </div>
            </div>
          </>
        )}

        <h3
          style={{
            margin: 0,
            marginBottom: 16,
            fontSize: 20,
            fontWeight: 700,
            color: C.text,
            textAlign: "left",
          }}
        >
          Stats
        </h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: detailGridColumns,
            justifyItems: "start",
            alignItems: "start",
            gap: isCompactLayout ? "18px 18px" : "24px 40px",
            marginBottom: 56,
            textAlign: "left",
          }}
        >
          <StatCell label="Open" value={formatMoney(stats.open)} />
          <StatCell label="Previous Close" value={formatMoney(stats.previousClose)} />
          <StatCell label="High" value={formatMoney(stats.high)} />
          <StatCell label="Volume" value={formatFinancialValue(stats.volume)} />
          <StatCell label="Market Cap" value={formatCompactMoney(stats.marketCap)} />
          <StatCell label="P/E Ratio" value={stats.pe != null ? stats.pe.toFixed(2) : "-"} />
          <StatCell label="EPS" value={stats.eps != null ? stats.eps.toFixed(2) : "-"} />
          <StatCell
            label="Dividend Yield"
            value={formatPercent(stats.dividendYield)}
          />
          <StatCell label="52 WK High" value={formatMoney(stats.high52)} />
          <StatCell label="52 WK Low" value={formatMoney(stats.low52)} />
        </div>

        {companyInfo.description && (
          <>
            <h3
              style={{
                margin: 0,
                marginBottom: 16,
                fontSize: 20,
                fontWeight: 700,
                color: C.text,
                textAlign: "left",
              }}
            >
              About
            </h3>
            <div
              style={{
                color: C.text,
                fontSize: 15,
                lineHeight: 1.6,
                marginBottom: 24,
                textAlign: "left"
              }}
            >
              {companyInfo.description}
              {companyInfo.source && companyInfo.pageUrl && (
                <>
                  {" "}
                  <a
                    href={companyInfo.pageUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: C.green, textDecoration: "none" }}
                  >
                    {companyInfo.source}.
                  </a>
                </>
              )}
            </div>
          </>
        )}

        <h3
          style={{
            margin: 0,
            marginBottom: 16,
            fontSize: 20,
            fontWeight: 700,
            color: C.text,
            textAlign: "left",
          }}
        >
          Profile
        </h3>

        <div style={{ marginBottom: 56, textAlign: "left" }}>

          <div style={{ marginBottom: 18 }}>
            <div style={{ color: C.sub, fontSize: 13, marginBottom: 8 }}>
              Company
            </div>
            <div
              style={{
                color: C.text,
                fontSize: 16,
                fontWeight: 600,
                lineHeight: 1.4,
              }}
            >
              {displayCompanyName}
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ color: C.sub, fontSize: 13, marginBottom: 8 }}>
              Sector
            </div>
            <div
              style={{
                color: C.text,
                fontSize: 16,
                fontWeight: 600,
                lineHeight: 1.4,
              }}
            >
              {displaySector}
            </div>
          </div>
        </div>

        <h3
          style={{
            margin: 0,
            marginBottom: 16,
            fontSize: 20,
            fontWeight: 700,
            color: C.text,
            textAlign: "left",
          }}
        >
          Corporate Actions & Events
        </h3>

        <div style={{ marginBottom: 56, textAlign: "left" }}>
          {corporateActionsLoading ? (
            <CorporateActionsSkeleton rows={3} />
          ) : corporateActionsError ? (
            <div style={{ color: C.sub }}>{corporateActionsError}</div>
          ) : corporateActions.length === 0 ? (
            <div style={{ color: C.sub }}>
              No corporate actions or events for this fiscal year
            </div>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {corporateActions.map((item, index) => (
                  <a
                    key={item.id}
                    href={item.url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "block",
                      padding: "14px 0",
                      borderBottom:
                        index < corporateActions.length - 1
                          ? `1px solid ${C.border}`
                          : "none",
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    {Array.isArray(item.tags) && item.tags.length > 0 ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                          marginBottom: 10,
                        }}
                      >
                        {item.tags.map((tag) => (
                          <span
                            key={`${item.id}-${tag}`}
                            style={{
                              padding: "5px 10px",
                              borderRadius: 999,
                              border: `1px solid ${C.border}`,
                              background: C.card,
                              color: C.sub,
                              fontSize: 11,
                              fontWeight: 700,
                              letterSpacing: "0.03em",
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div
                      style={{
                        color: C.text,
                        fontSize: 15,
                        fontWeight: 600,
                        lineHeight: 1.45,
                        marginBottom: 8,
                      }}
                    >
                      {item.title}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                        color: C.sub,
                        fontSize: 12,
                      }}
                    >
                      <span>{item.source}</span>
                      {item.company ? (
                        <>
                          <span>•</span>
                          <span>{item.company}</span>
                        </>
                      ) : null}
                      <span>•</span>
                      <span>{item.time}</span>
                    </div>
                  </a>
                ))}
              </div>
            </>
          )}
        </div>

        {/* RELATED STOCKS / ASSETS SECTION */}
        {relatedStocks.length > 0 && (
          <>
            <h3
              style={{
                margin: 0,
                marginTop: 40,
                marginBottom: 16,
                fontSize: 20,
                fontWeight: 700,
                color: C.text,
                textAlign: "left",
              }}
            >
              {isEtf ? "Related Assets" : "Related stocks"}
            </h3>

            <div
              key={`related-${symbol}`}
              className="no-scrollbar"
              style={{
                display: "flex",
                gap: "14px",
                overflowX: "auto",
                overflowY: "hidden",
                paddingBottom: "12px",
                marginBottom: 56,
                textAlign: "left",
                scrollbarWidth: "none",
                msOverflowStyle: "none",
                WebkitOverflowScrolling: "touch",
              }}
            >
              {relatedStocks.map((rs) => {
                const rSymbol = String(rs.symbol || rs.ticker || rs.code || "").toUpperCase().trim();
                const tone = getStockMovementTone(rs);
                const isPositive = tone === "positive";
                const isNegative = tone === "negative";
                const textChangeColor = isPositive ? C.green : isNegative ? C.red : C.sub;

                const valuesForSparkline =
                  tone !== "neutral" && Array.isArray(relatedMiniCharts[rSymbol]) && relatedMiniCharts[rSymbol].length >= 2
                    ? relatedMiniCharts[rSymbol]
                    : [Number(rs.price), Number(rs.price)];
                const sparklineTone = tone;

                return (
                  <div
                    key={rSymbol}
                    onClick={() => onSelect && onSelect(rs)}
                    style={{
                      background: C.card,
                      border: `1px solid ${C.border}`,
                      borderRadius: "16px",
                      padding: "16px",
                      display: "flex",
                      flexDirection: "column",
                      cursor: "pointer",
                      transition: "transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease",
                      overflow: "hidden",
                      flex: isCompactLayout ? "0 0 166px" : "0 0 216px",
                    }}
                    className="hover:scale-[1.01] hover:brightness-110"
                  >
                    {/* Symbol */}
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.sub, textTransform: "uppercase" }}>
                      {rSymbol}
                    </div>
                    {/* Name */}
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: C.text,
                        marginTop: 2,
                        textOverflow: "ellipsis",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {rs.name}
                    </div>

                    {/* Price & Change inline beside price */}
                    <div style={{ marginTop: 10, display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
                        ₵{Number(rs.price).toFixed(2)}
                      </div>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 3, color: textChangeColor, fontSize: 13, fontWeight: 700 }}>
                        <span>{formatStockChangePercent(rs)}</span>
                        {isPositive && (
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: "999px",
                            background: "rgba(52, 211, 153, 0.12)",
                            width: "16px",
                            height: "16px",
                          }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="12" y1="19" x2="12" y2="5"></line>
                              <polyline points="5 12 12 5 19 12"></polyline>
                            </svg>
                          </span>
                        )}
                        {isNegative && (
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: "999px",
                            background: "rgba(239, 68, 68, 0.12)",
                            width: "16px",
                            height: "16px",
                          }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="12" y1="5" x2="12" y2="19"></line>
                              <polyline points="19 12 12 19 5 12"></polyline>
                            </svg>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Sparkline chart */}
                    <div style={{ marginTop: 14, display: "flex", justifyContent: "center", width: "100%" }}>
                      <MiniSparkline
                        values={valuesForSparkline}
                        tone={sparklineTone}
                        width={isCompactLayout ? 134 : 184}
                        height={32}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* The rest of the content up to the fixed bottom bar */}
      </div>

      {showPriceAlertModal && (
        <PriceAlertModal
          stock={{ symbol, price: Number(stock.price) }}
          existingAlert={activePriceAlert}
          onSave={(nextAlert) => {
            savePriceAlert(nextAlert);
            setActivePriceAlert(nextAlert);
            setShowPriceAlertModal(false);
          }}
          onRemove={() => {
            removePriceAlert(symbol);
            setActivePriceAlert(null);
            setShowPriceAlertModal(false);
          }}
          onClose={() => setShowPriceAlertModal(false)}
        />
      )}
    </div>
  );
}

export default StockDetail;
