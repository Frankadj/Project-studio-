import { C } from "./theme/colors";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import StockList from "./components/StockList";
import StockDetail from "./components/StockDetail";
import PortfolioCard from "./components/PortfolioCard";
import WatchlistSection from "./components/WatchlistSection";
import HomeHeader from "./components/HomeHeader";
import BottomNav from "./components/BottomNav";
import NewsSection from "./components/NewsSection";
import NewsScreen from "./components/NewsScreen";
import ProfileScreen from "./components/ProfileScreen";
import MarketScreen from "./components/MarketScreen";
import PortfolioBreakdownScreen from "./components/PortfolioBreakdownScreen";
import IndexDetailScreen from "./components/IndexDetailScreen";
import MarketHeatmapScreen from "./components/MarketHeatmapScreen";
import AppLoadingSkeleton from "./components/AppLoadingSkeleton";
import AlertToastStack, {
  type AlertToastItem,
} from "./components/AlertToastStack";
import { getApiBase } from "./lib/api";
import { DEFAULT_MARKET_CATEGORY, type MarketCategoryKey } from "./utils/marketCategories";

import {
  deriveStockChangePercent,
  resolveStockDisplayName,
  resolveStockSymbolFromIdentity,
} from "./lib/stockMetadata";
import {
  markPriceAlertTriggered,
  readEnabledPriceAlerts,
} from "./lib/priceAlerts";
import {
  getUnreadNotificationsCount,
  subscribeNotifications,
  addNotification,
} from "./lib/notifications";
import NotificationsScreen from "./components/NotificationsScreen";
import TransactionScreen from "./components/TransactionScreen";
import {
  applyThemeMode,
  persistThemeMode,
  readStoredThemeMode,
  type ThemeMode,
} from "./lib/theme";
import useIsCompactLayout from "./hooks/useIsCompactLayout";
import { auth, googleProvider, getClientUuid } from "./lib/firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import {
  savePortfolioToFirestore,
  saveTransactionToFirestore,
  loadPortfolioFromFirestore,
  migratePortfolio,
  type PortfolioTransaction,
} from "./lib/portfolioFirestore";
import type { FirebaseUser } from "./components/ProfileScreen";

export type Stock = {
  symbol?: string;
  ticker?: string;
  code?: string;
  name: string;
  companyName?: string;
  sector?: string;
  industry?: string;
  website?: string;
  logoUrl?: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  high52Week?: number;
  low52Week?: number;
  dataTimestamp?: string;
};

export type Position = {
  shares: number;
  totalCost: number;
};

export type IndexSummary = {
  code: string;
  name: string;
  value: number;
  change: number;
  changePercent: number;
  ytdChange?: number;
  ytdChangePercent?: number;
  lastDate?: string;
  keyStats?: {
    low52Week: number;
    high52Week: number;
    marketCap: number | string | null;
    volume: number | null;
    valueTraded: number | null;
  } | null;
};

type NewsItem = {
  id: string | number;
  headline: string;
  source: string;
  time: string;
  url?: string;
  image?: string;
};

const CASH_STORAGE_KEY = "plutus_cash";
const POSITIONS_STORAGE_KEY = "plutus_positions";
const TRANSACTIONS_STORAGE_KEY = "plutus_transactions";
const WATCHLIST_STORAGE_KEY = "plutus_watchlist";
const STOCK_ACTIVE_REFRESH_MS = 15000;
const INDEX_ACTIVE_REFRESH_MS = 60 * 1000;
const NEWS_ACTIVE_REFRESH_MS = 120 * 1000;
const NEWS_BACKGROUND_REFRESH_MS = 15 * 60 * 1000;
const INITIAL_NEWS_FETCH_DELAY_MS = 350;
const NEWS_COLD_START_RETRY_MS = 3000;
const ALERT_TOAST_DURATION_MS = 6500;
const MAX_ALERT_TOASTS = 4;

function resolveStockSymbol(stock: Partial<Stock>) {
  return resolveStockSymbolFromIdentity(stock);
}

function normalizeStock(stock: Stock): Stock {
  const resolvedSymbol = resolveStockSymbol(stock);
  const price = Number(stock.price ?? 0);
  const change = Number(stock.change ?? 0);
  const displayName = resolveStockDisplayName(stock, resolvedSymbol);
  const changePercent = deriveStockChangePercent(
    price,
    change,
    stock.changePercent
  );

  return {
    symbol: resolvedSymbol,
    ticker: stock.ticker || resolvedSymbol,
    code: stock.code || resolvedSymbol,
    name: displayName,
    companyName: displayName,
    sector: stock.sector || "",
    industry: stock.industry || "",
    website: stock.website || "",
    logoUrl: stock.logoUrl || "",
    price,
    change,
    changePercent,
    volume: Number(stock.volume ?? 0),
  };
}

function formatAlertPrice(value: number) {
  return `₵${Number(value || 0).toFixed(2)}`;
}

function App() {
  const apiBase = getApiBase();
  const isCompactLayout = useIsCompactLayout();
  const scrollPositionsRef = useRef<Record<string, number>>({});
  const previousStocksBySymbolRef = useRef<Map<string, Stock>>(new Map());
  const alertToastTimersRef = useRef<Record<string, number>>({});
  const pendingScrollActionRef = useRef<
    | { type: "reset" }
    | { type: "restore"; key: string }
    | null
  >(null);

  const [stocks, setStocks] = useState<Stock[]>([]);
  const [selectedStockSymbol, setSelectedStockSymbol] = useState<string | null>(
    null
  );
  const [selectedStockSnapshot, setSelectedStockSnapshot] =
    useState<Stock | null>(null);
  const [selectedStockReturnKey, setSelectedStockReturnKey] =
    useState<string>("home");
  const [stockHistoryStack, setStockHistoryStack] = useState<
    { symbol: string; snapshot: Stock; returnKey: string }[]
  >([]);
  const [marketActiveCategory, setMarketActiveCategory] = useState<MarketCategoryKey>(
    DEFAULT_MARKET_CATEGORY
  );
  const [marketSearchText, setMarketSearchText] = useState("");
  const [indices, setIndices] = useState<IndexSummary[]>([]);
  const [selectedIndexCode, setSelectedIndexCode] = useState<string | null>(null);
  const [selectedIndexSnapshot, setSelectedIndexSnapshot] =
    useState<IndexSummary | null>(null);
  const [showNewsScreen, setShowNewsScreen] = useState(false);
  const [showBreakdownScreen, setShowBreakdownScreen] = useState(false);
  const [showHeatmapScreen, setShowHeatmapScreen] = useState(false);
  const [showNotificationsScreen, setShowNotificationsScreen] = useState(false);
  const [transactionScreenSymbol, setTransactionScreenSymbol] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(() => getUnreadNotificationsCount());
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"home" | "market" | "profile">("home");
  const [news, setNews] = useState<NewsItem[]>([]);
  const [stocksError, setStocksError] = useState("");
  const [indicesError, setIndicesError] = useState("");
  const [newsError, setNewsError] = useState("");
  const [newsLoading, setNewsLoading] = useState(true);
  const [alertToasts, setAlertToasts] = useState<AlertToastItem[]>([]);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    readStoredThemeMode()
  );
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>(() => {
    try {
      const savedWatchlist = localStorage.getItem(WATCHLIST_STORAGE_KEY);
      if (!savedWatchlist) return [];
      const parsed = JSON.parse(savedWatchlist);
      return Array.isArray(parsed)
        ? parsed
            .map((value) => String(value || "").toUpperCase().trim())
            .filter(Boolean)
        : [];
    } catch {
      return [];
    }
  });

  const [cash, setCash] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(CASH_STORAGE_KEY);
      return saved !== null ? Number(saved) : 100000.0;
    } catch {
      return 100000.0;
    }
  });

  const [positions, setPositions] = useState<Record<string, Position>>(() => {
    try {
      const saved = localStorage.getItem(POSITIONS_STORAGE_KEY);
      return saved !== null ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [transactions, setTransactions] = useState<PortfolioTransaction[]>(() => {
    try {
      const saved = localStorage.getItem(TRANSACTIONS_STORAGE_KEY);
      return saved !== null ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleSignInWithGoogle = async () => {
    try {
      setIsSyncing(true);
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        const anonymousId = getClientUuid();
        const googleId = result.user.uid;
        
        await migratePortfolio(anonymousId, googleId);
        
        setUser({
          uid: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName,
          photoURL: result.user.photoURL,
        });

        const cloudData = await loadPortfolioFromFirestore(googleId);
        if (cloudData) {
          setCash(cloudData.cash);
          setWatchlistSymbols(cloudData.watchlist);
          setTransactions(cloudData.transactions);
          
          await fetch(`${apiBase}/api/v1/portfolio/restore`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cash: cloudData.cash, transactions: cloudData.transactions })
          });
        }
      }
    } catch (e) {
      console.error("Google login failed", e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setIsSyncing(true);
      await signOut(auth);
      setUser(null);
      const anonymousId = getClientUuid();
      const cloudData = await loadPortfolioFromFirestore(anonymousId);
      if (cloudData) {
        setCash(cloudData.cash);
        setWatchlistSymbols(cloudData.watchlist);
        setTransactions(cloudData.transactions);
        
        await fetch(`${apiBase}/api/v1/portfolio/restore`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cash: cloudData.cash, transactions: cloudData.transactions })
        });
      }
    } catch (e) {
      console.error("Logout failed", e);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        setUser({
          uid: fbUser.uid,
          email: fbUser.email,
          displayName: fbUser.displayName,
          photoURL: fbUser.photoURL,
        });
        
        const cloudData = await loadPortfolioFromFirestore(fbUser.uid);
        if (cloudData) {
          setCash(cloudData.cash);
          setWatchlistSymbols(cloudData.watchlist);
          setTransactions(cloudData.transactions);
          
          await fetch(`${apiBase}/api/v1/portfolio/restore`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cash: cloudData.cash, transactions: cloudData.transactions })
          });
        }
      } else {
        setUser(null);
        const anonymousId = getClientUuid();
        const cloudData = await loadPortfolioFromFirestore(anonymousId);
        if (cloudData) {
          setCash(cloudData.cash);
          setWatchlistSymbols(cloudData.watchlist);
          setTransactions(cloudData.transactions);
          
          await fetch(`${apiBase}/api/v1/portfolio/restore`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cash: cloudData.cash, transactions: cloudData.transactions })
          });
        }
      }
    });

    return unsub;
  }, [apiBase]);

  useEffect(() => {
    const activeId = user ? user.uid : getClientUuid();
    if (!activeId) return;

    const timer = setTimeout(async () => {
      try {
        await savePortfolioToFirestore(activeId, cash, watchlistSymbols);
        for (const tx of transactions) {
          await saveTransactionToFirestore(activeId, tx);
        }
      } catch (err) {
        console.warn("Autosync state change failed:", err);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [cash, watchlistSymbols, transactions, user]);

  useEffect(() => {
    const unsubscribe = subscribeNotifications(() => {
      setUnreadCount(getUnreadNotificationsCount());
    });
    return unsubscribe;
  }, []);

  const refreshPortfolio = async () => {
    try {
      const res = await fetch(`${apiBase}/api/v1/portfolio`);
      const histRes = await fetch(`${apiBase}/api/v1/portfolio/history`);

      let backendCash = 100000.0;
      let backendHoldings: Array<{ symbol: string; shares: number; totalCostBasis: number }> = [];
      let backendHistory: Array<{ id: number | string; symbol: string; type: string; shares: number; price: number; timestamp: string }> = [];
      let hasReceivedBackendData = false;

      if (res.ok) {
        const data = await res.json();
        backendCash = Number(data.summary.cashBalance);
        backendHoldings = data.holdings || [];
        hasReceivedBackendData = true;
      }

      if (histRes.ok) {
        backendHistory = await histRes.json();
      }

      if (hasReceivedBackendData) {
        let localTxs: PortfolioTransaction[] = [];
        let localCash = 100000.0;
        try {
          const lTxs = localStorage.getItem(TRANSACTIONS_STORAGE_KEY);
          if (lTxs) localTxs = JSON.parse(lTxs);
          const lCash = localStorage.getItem(CASH_STORAGE_KEY);
          if (lCash) localCash = Number(lCash);
        } catch {
          // Ignore
        }

        const backendIsDefault = backendHistory.length === 0 && Math.abs(backendCash - 100000.0) < 0.01;
        const clientHasData = localTxs.length > 0 || Math.abs(localCash - 100000.0) >= 0.01;

        if (backendIsDefault && clientHasData) {
          const restoreRes = await fetch(`${apiBase}/api/v1/portfolio/restore`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cash: localCash, transactions: localTxs })
          });

          if (restoreRes.ok) {
            const finalRes = await fetch(`${apiBase}/api/v1/portfolio`);
            const finalHistRes = await fetch(`${apiBase}/api/v1/portfolio/history`);
            
            if (finalRes.ok && finalHistRes.ok) {
              const data = await finalRes.ok ? await finalRes.json() : null;
              const histData = finalHistRes.ok ? await finalHistRes.json() : [];
              
              if (data) {
                setCash(data.summary.cashBalance);
                
                const newPositions: Record<string, Position> = {};
                (data.holdings || []).forEach((h: { symbol: string; shares: number; totalCostBasis: number }) => {
                  newPositions[h.symbol] = {
                    shares: h.shares,
                    totalCost: h.totalCostBasis
                  };
                });
                setPositions(newPositions);

                const nextTransactions: PortfolioTransaction[] & { refreshPortfolio?: () => void } = histData.map((item: { id: number | string; symbol: string; type: string; shares: number; price: number; timestamp: string }) => ({
                  id: String(item.id),
                  symbol: String(item.symbol).toUpperCase(),
                  type: item.type === "SELL" ? "sell" : "buy",
                  shares: Number(item.shares),
                  price: Number(item.price),
                  total: Number(item.price * item.shares),
                  timestamp: new Date(item.timestamp).getTime(),
                  realizedPnl: 0,
                  averageCostPerShare: 0,
                  remainingSharesAfter: 0,
                }));
                nextTransactions.refreshPortfolio = refreshPortfolio;
                setTransactions(nextTransactions);

                localStorage.setItem(CASH_STORAGE_KEY, String(data.summary.cashBalance));
                localStorage.setItem(POSITIONS_STORAGE_KEY, JSON.stringify(newPositions));
                localStorage.setItem(TRANSACTIONS_STORAGE_KEY, JSON.stringify(nextTransactions));
                return;
              }
            }
          }
        }

        setCash(backendCash);
        
        const newPositions: Record<string, Position> = {};
        backendHoldings.forEach((h: { symbol: string; shares: number; totalCostBasis: number }) => {
          newPositions[h.symbol] = {
            shares: h.shares,
            totalCost: h.totalCostBasis
          };
        });
        setPositions(newPositions);

        const nextTransactions: PortfolioTransaction[] & { refreshPortfolio?: () => void } = backendHistory.map((item: { id: number | string; symbol: string; type: string; shares: number; price: number; timestamp: string }) => ({
          id: String(item.id),
          symbol: String(item.symbol).toUpperCase(),
          type: item.type === "SELL" ? "sell" : "buy",
          shares: Number(item.shares),
          price: Number(item.price),
          total: Number(item.price * item.shares),
          timestamp: new Date(item.timestamp).getTime(),
          realizedPnl: 0,
          averageCostPerShare: 0,
          remainingSharesAfter: 0,
        }));
        nextTransactions.refreshPortfolio = refreshPortfolio;
        setTransactions(nextTransactions);

        localStorage.setItem(CASH_STORAGE_KEY, String(backendCash));
        localStorage.setItem(POSITIONS_STORAGE_KEY, JSON.stringify(newPositions));
        localStorage.setItem(TRANSACTIONS_STORAGE_KEY, JSON.stringify(nextTransactions));
      }
    } catch (e) {
      console.warn("Failed to refresh portfolio API:", e);
    }
  };

  useEffect(() => {
    refreshPortfolio();
    const iv = setInterval(refreshPortfolio, 10000);
    return () => clearInterval(iv);
  }, [apiBase]);

  useEffect(() => {
    try {
      localStorage.setItem(
        WATCHLIST_STORAGE_KEY,
        JSON.stringify(watchlistSymbols)
      );
    } catch {
      // Ignore local storage write failures.
    }
  }, [watchlistSymbols]);

  useEffect(() => {
    applyThemeMode(themeMode);
    persistThemeMode(themeMode);
  }, [themeMode]);

  const dismissAlertToast = (id: string) => {
    const existingTimer = alertToastTimersRef.current[id];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      delete alertToastTimersRef.current[id];
    }

    setAlertToasts((current) => current.filter((item) => item.id !== id));
  };

  const pushAlertToast = (toast: AlertToastItem) => {
    setAlertToasts((current) => [toast, ...current].slice(0, MAX_ALERT_TOASTS));

    const existingTimer = alertToastTimersRef.current[toast.id];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    alertToastTimersRef.current[toast.id] = window.setTimeout(() => {
      dismissAlertToast(toast.id);
    }, ALERT_TOAST_DURATION_MS);
  };

  const showBrowserPriceAlertNotification = (
    symbol: string,
    title: string,
    message: string
  ) => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") {
      return;
    }

    if (
      typeof document !== "undefined" &&
      document.visibilityState === "visible" &&
      typeof document.hasFocus === "function" &&
      document.hasFocus()
    ) {
      return;
    }

    try {
      const notification = new Notification(title, {
        body: message,
        tag: `price-alert:${symbol}`,
      });

      notification.onclick = () => {
        if (typeof window !== "undefined") {
          window.focus();
        }
        notification.close();
      };
    } catch {
      // Ignore Notification API failures.
    }
  };

  const evaluatePriceAlerts = (nextStocks: Stock[]) => {
    const previousStocksBySymbol = previousStocksBySymbolRef.current;
    const nextStocksBySymbol = new Map(
      nextStocks.map((stock) => [resolveStockSymbol(stock), stock] as const)
    );

    if (previousStocksBySymbol.size === 0) {
      previousStocksBySymbolRef.current = nextStocksBySymbol;
      return;
    }

    const enabledAlerts = readEnabledPriceAlerts();

    for (const alert of enabledAlerts) {
      const symbol = String(alert.symbol || "").toUpperCase().trim();
      const previousStock = previousStocksBySymbol.get(symbol);
      const currentStock = nextStocksBySymbol.get(symbol);
      if (!previousStock || !currentStock) {
        continue;
      }

      const previousPrice = Number(previousStock.price);
      const currentPrice = Number(currentStock.price);
      const targetPrice = Number(alert.targetPrice);

      if (
        !Number.isFinite(previousPrice) ||
        !Number.isFinite(currentPrice) ||
        !Number.isFinite(targetPrice) ||
        targetPrice <= 0
      ) {
        continue;
      }

      const crossed =
        alert.direction === "above"
          ? previousPrice < targetPrice && currentPrice >= targetPrice
          : previousPrice > targetPrice && currentPrice <= targetPrice;

      if (!crossed) {
        continue;
      }

      markPriceAlertTriggered(symbol, {
        triggerPrice: currentPrice,
        triggeredAt: Date.now(),
      });

      const title = `${symbol} price alert`;
      const message = `${symbol} moved ${
        alert.direction === "above" ? "above" : "below"
      } ${formatAlertPrice(targetPrice)}. Current price: ${formatAlertPrice(
        currentPrice
      )}.`;
      const toastId = `${symbol}-${Date.now()}`;

      pushAlertToast({
        id: toastId,
        symbol,
        title,
        message,
      });
      showBrowserPriceAlertNotification(symbol, title, message);
      addNotification({
        type: "alert",
        title,
        message,
        symbol,
        price: currentPrice,
      });
    }

    previousStocksBySymbolRef.current = nextStocksBySymbol;
  };

  useEffect(() => {
    return () => {
      Object.values(alertToastTimersRef.current).forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      alertToastTimersRef.current = {};
    };
  }, []);

  useEffect(() => {
    let newsTimerId: number | null = null;
    let initialNewsTimerId: number | null = null;
    let isNewsFetchInFlight = false;
    let isUnmounted = false;

    const fetchStocks = async () => {
      try {
        const stocksUrl = `${apiBase}/api/stocks`;
        const stocksRes = await fetch(stocksUrl);

        if (!stocksRes.ok) {
          throw new Error("Failed to load stock data");
        }

        const stocksData = await stocksRes.json();

        if (Array.isArray(stocksData)) {
          const nextStocks = stocksData.map(normalizeStock);
          evaluatePriceAlerts(nextStocks);
          setStocks(nextStocks);
          setStocksError("");
        } else {
          throw new Error("Invalid stock data");
        }
      } catch {
        setStocksError("Unable to load live stock data right now.");
      } finally {
        setLoading(false);
      }
    };

    const scheduleNextNewsFetch = () => {
      if (typeof document === "undefined") {
        return;
      }

      if (newsTimerId !== null) {
        window.clearTimeout(newsTimerId);
      }

      const refreshInterval =
        document.visibilityState === "visible"
          ? NEWS_ACTIVE_REFRESH_MS
          : NEWS_BACKGROUND_REFRESH_MS;

      newsTimerId = window.setTimeout(() => {
        void fetchNews(document.visibilityState === "visible");
      }, refreshInterval);
    };

    const scheduleColdStartNewsRetry = () => {
      if (typeof document === "undefined") {
        return;
      }

      if (newsTimerId !== null) {
        window.clearTimeout(newsTimerId);
      }

      newsTimerId = window.setTimeout(() => {
        void fetchNews(false);
      }, NEWS_COLD_START_RETRY_MS);
    };

    const fetchNews = async (forceRefresh = false) => {
      if (isNewsFetchInFlight) {
        return;
      }

      isNewsFetchInFlight = true;
      let shouldScheduleStandardRefresh = true;

      try {
        const refreshQuery = forceRefresh ? "?refresh=1" : "";
        const newsRes = await fetch(`${apiBase}/api/news${refreshQuery}`);

        if (!newsRes.ok) {
          throw new Error("Failed to load news");
        }

        const newsData = await newsRes.json();

        if (Array.isArray(newsData)) {
          setNewsError("");

          if (newsData.length > 0) {
            setNews(newsData);
            setNewsLoading(false);
          } else if (!isUnmounted) {
            setNewsLoading(true);
            shouldScheduleStandardRefresh = false;
            scheduleColdStartNewsRetry();
            return;
          }
        }
      } catch {
        setNewsError("Unable to load news right now.");
        setNewsLoading(false);
      } finally {
        isNewsFetchInFlight = false;
        if (!isUnmounted && shouldScheduleStandardRefresh) {
          scheduleNextNewsFetch();
        }
      }
    };

    const handleVisibilityChange = () => {
      if (typeof document === "undefined") {
        return;
      }

      if (newsTimerId !== null) {
        window.clearTimeout(newsTimerId);
        newsTimerId = null;
      }

      void fetchNews(document.visibilityState === "visible");
    };

    fetchStocks();
    initialNewsTimerId = window.setTimeout(() => {
      void fetchNews(false);
    }, INITIAL_NEWS_FETCH_DELAY_MS);

    const stocksInterval = setInterval(fetchStocks, STOCK_ACTIVE_REFRESH_MS);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      isUnmounted = true;
      clearInterval(stocksInterval);
      if (initialNewsTimerId !== null) {
        window.clearTimeout(initialNewsTimerId);
      }
      if (newsTimerId !== null) {
        window.clearTimeout(newsTimerId);
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [apiBase]);

  useEffect(() => {
    let isUnmounted = false;

    const fetchIndices = async () => {
      try {
        const indicesRes = await fetch(`${apiBase}/api/indices`);

        if (!indicesRes.ok) {
          throw new Error("Failed to load indices");
        }

        const indicesData = await indicesRes.json();

        if (!isUnmounted && Array.isArray(indicesData)) {
          setIndices(indicesData);
          setIndicesError("");
        }
      } catch {
        if (!isUnmounted) {
          setIndicesError("Unable to load market indices right now.");
        }
      }
    };

    void fetchIndices();
    const indicesInterval = window.setInterval(fetchIndices, INDEX_ACTIVE_REFRESH_MS);

    return () => {
      isUnmounted = true;
      window.clearInterval(indicesInterval);
    };
  }, [apiBase]);

  const ownedStocks = useMemo(() => {
    return stocks.filter((stock) => {
      const symbol = resolveStockSymbol(stock);
      return (positions[symbol]?.shares || 0) > 0;
    });
  }, [stocks, positions]);

  const watchlistStocks = useMemo(() => {
    const liveStocksBySymbol = new Map(
      stocks.map((stock) => [resolveStockSymbol(stock), normalizeStock(stock)] as const)
    );

    return watchlistSymbols
      .map((symbol) => liveStocksBySymbol.get(symbol))
      .filter((stock): stock is Stock => Boolean(stock));
  }, [stocks, watchlistSymbols]);

  const selectedStock = useMemo(() => {
    if (!selectedStockSymbol) return null;

    const liveStock = stocks.find((stock) => {
      const symbol = stock.symbol || stock.ticker || stock.code || "";
      return symbol === selectedStockSymbol;
    });

    if (liveStock) {
      return normalizeStock(liveStock);
    }

    return selectedStockSnapshot ? normalizeStock(selectedStockSnapshot) : null;
  }, [selectedStockSnapshot, selectedStockSymbol, stocks]);

  const selectedIndex = useMemo(() => {
    if (!selectedIndexCode) {
      return null;
    }

    const liveIndex = indices.find((item) => item.code === selectedIndexCode);
    return liveIndex || selectedIndexSnapshot;
  }, [indices, selectedIndexCode, selectedIndexSnapshot]);

  const toggleWatchlistSymbol = (symbol: string) => {
    const normalizedSymbol = String(symbol || "").toUpperCase().trim();
    if (!normalizedSymbol) {
      return;
    }

    setWatchlistSymbols((current) =>
      current.includes(normalizedSymbol)
        ? current.filter((item) => item !== normalizedSymbol)
        : [...current, normalizedSymbol]
    );
  };

  const activeScreenKey = selectedStockSymbol
    ? `stock:${selectedStockSymbol}`
    : selectedIndexCode
      ? `index:${selectedIndexCode}`
    : showHeatmapScreen
      ? "heatmap"
    : showNewsScreen
      ? "news"
      : showBreakdownScreen
        ? "breakdown"
      : activeTab;

  const saveScrollPosition = (key: string) => {
    if (typeof window === "undefined") {
      return;
    }

    scrollPositionsRef.current[key] = window.scrollY;
  };

  const queueScrollReset = () => {
    pendingScrollActionRef.current = { type: "reset" };
  };

  const queueScrollRestore = (key: string) => {
    pendingScrollActionRef.current = { type: "restore", key };
  };

  useEffect(() => {
    if (typeof window === "undefined" || !("scrollRestoration" in window.history)) {
      return;
    }

    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  useLayoutEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const scrollAction = pendingScrollActionRef.current;

    if (!scrollAction) {
      return;
    }

    const targetTop =
      scrollAction.type === "restore"
        ? scrollPositionsRef.current[scrollAction.key] || 0
        : 0;

    const applyScroll = () => {
      window.scrollTo({ top: targetTop, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = targetTop;
      document.body.scrollTop = targetTop;
    };

    applyScroll();

    const frameId = window.requestAnimationFrame(applyScroll);
    pendingScrollActionRef.current = null;

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [activeScreenKey]);

  const handleSelectStock = (stock: Stock, returnKey = activeScreenKey) => {
    const normalizedStock = normalizeStock(stock);
    const symbol =
      normalizedStock.symbol || normalizedStock.ticker || normalizedStock.code || "";

    saveScrollPosition(activeScreenKey);
    queueScrollReset();

    if (selectedStockSymbol && selectedStockSnapshot) {
      setStockHistoryStack((prev) => [
        ...prev,
        {
          symbol: selectedStockSymbol,
          snapshot: selectedStockSnapshot,
          returnKey: selectedStockReturnKey,
        },
      ]);
    }

    setSelectedStockReturnKey(returnKey);
    setSelectedStockSymbol(symbol);
    setSelectedStockSnapshot(normalizedStock);
  };

  const handleBack = () => {
    if (stockHistoryStack.length > 0) {
      const nextStack = [...stockHistoryStack];
      const prevStockInfo = nextStack.pop()!;
      setStockHistoryStack(nextStack);

      queueScrollRestore(selectedStockReturnKey || activeTab);
      setSelectedStockSymbol(prevStockInfo.symbol);
      setSelectedStockSnapshot(prevStockInfo.snapshot);
      setSelectedStockReturnKey(prevStockInfo.returnKey);
    } else {
      queueScrollRestore(selectedStockReturnKey || activeTab);
      setSelectedStockSymbol(null);
      setSelectedStockSnapshot(null);
    }
  };

  const handleSelectIndex = (index: IndexSummary) => {
    saveScrollPosition(activeTab);
    queueScrollReset();
    setSelectedIndexCode(index.code);
    setSelectedIndexSnapshot(index);
  };

  const handleCloseIndex = () => {
    queueScrollRestore(activeTab);
    setSelectedIndexCode(null);
    setSelectedIndexSnapshot(null);
  };

  const handleOpenNewsScreen = () => {
    saveScrollPosition(activeTab);
    queueScrollReset();
    setShowNewsScreen(true);
  };

  const handleCloseNewsScreen = () => {
    queueScrollRestore(activeTab);
    setShowNewsScreen(false);
  };

  const handleOpenBreakdownScreen = () => {
    saveScrollPosition(activeTab);
    queueScrollReset();
    setShowBreakdownScreen(true);
  };

  const handleCloseBreakdownScreen = () => {
    queueScrollRestore(activeTab);
    setShowBreakdownScreen(false);
  };

  const handleOpenHeatmapScreen = () => {
    saveScrollPosition(activeTab);
    queueScrollReset();
    setShowHeatmapScreen(true);
  };

  const handleCloseHeatmapScreen = () => {
    queueScrollRestore(activeTab);
    setShowHeatmapScreen(false);
  };

  const handleOpenNotificationsScreen = () => {
    saveScrollPosition(activeTab);
    queueScrollReset();
    setShowNotificationsScreen(true);
  };

  const handleCloseNotificationsScreen = () => {
    queueScrollRestore(activeTab);
    setShowNotificationsScreen(false);
  };

  const handleOpenTransactionScreen = (symbol: string) => {
    saveScrollPosition(activeTab);
    queueScrollReset();
    setTransactionScreenSymbol(symbol);
  };

  const handleCloseTransactionScreen = () => {
    queueScrollRestore(activeTab);
    setTransactionScreenSymbol(null);
  };

  const handleChangeTab = (tab: "home" | "market" | "profile") => {
    if (tab === activeTab) {
      return;
    }

    saveScrollPosition(activeTab);
    queueScrollReset();
    setActiveTab(tab);
    setStockHistoryStack([]);

    if (tab === "market") {
      setMarketActiveCategory(DEFAULT_MARKET_CATEGORY);
      setMarketSearchText("");
    }
  };

  const alertToastStack = (
    <AlertToastStack items={alertToasts} onDismiss={dismissAlertToast} />
  );

  if (loading) {
    return (
      <>
        <AppLoadingSkeleton />
        {alertToastStack}
      </>
    );
  }

  if (transactionScreenSymbol) {
    return (
      <>
        <TransactionScreen
          symbol={transactionScreenSymbol}
          onBack={handleCloseTransactionScreen}
          onSuccess={() => {
            refreshPortfolio();
            handleCloseTransactionScreen();
          }}
        />
        {alertToastStack}
      </>
    );
  }

  if (selectedStock) {
    return (
      <>
        <StockDetail
          stock={selectedStock}
          stocks={stocks}
          onSelect={handleSelectStock}
          onBack={handleBack}
          positions={positions}
          hasTransactions={transactions.some(t => t.symbol === resolveStockSymbol(selectedStock))}
          isInWatchlist={watchlistSymbols.includes(resolveStockSymbol(selectedStock))}
          onToggleWatchlist={toggleWatchlistSymbol}
          onNavigateToTransaction={handleOpenTransactionScreen}
        />
        {alertToastStack}
      </>
    );
  }

  if (selectedIndex) {
    return (
      <>
        <IndexDetailScreen
          index={selectedIndex}
          apiBase={apiBase}
          onBack={handleCloseIndex}
        />
        {alertToastStack}
      </>
    );
  }

  if (showNewsScreen) {
    return (
      <>
        <NewsScreen items={news} onBack={handleCloseNewsScreen} />
        {alertToastStack}
      </>
    );
  }

  if (showBreakdownScreen) {
    return (
      <>
        <PortfolioBreakdownScreen
          stocks={stocks}
          positions={positions}
          transactions={transactions}
          onBack={handleCloseBreakdownScreen}
        />
        {alertToastStack}
      </>
    );
  }

  if (showNotificationsScreen) {
    return (
      <>
        <NotificationsScreen onBack={handleCloseNotificationsScreen} />
        {alertToastStack}
      </>
    );
  }

  if (showHeatmapScreen) {
    return (
      <>
        <MarketHeatmapScreen
          stocks={stocks}
          apiBase={apiBase}
          onBack={handleCloseHeatmapScreen}
          onSelectStock={(stock) => handleSelectStock(stock, "heatmap")}
        />
        {alertToastStack}
      </>
    );
  }

  const renderContent = () => {
    if (activeTab === "home") {
      return (
        <>
          <HomeHeader
            unreadCount={unreadCount}
            indices={indices}
            indicesError={indicesError}
            onSelectIndex={handleSelectIndex}
            onOpenNotifications={handleOpenNotificationsScreen}
          />
          <PortfolioCard
            stocks={stocks}
            positions={positions}
            transactions={transactions}
            apiBase={apiBase}
            onOpenBreakdown={handleOpenBreakdownScreen}
          />

          <div
            style={{
              marginTop: "24px",
              marginBottom: "12px",
              display: "flex",
              justifyContent: "flex-start",
              alignItems: "center",
              gap: 12,
            }}
          >
            <h2
              style={{
                margin: 0,
                color: C.text,
                textAlign: "left",
                fontSize: "20px",
                fontWeight: 600,
              }}
            >
              Your Holdings
            </h2>
          </div>

          {stocksError ? (
            <div
              style={{
                color: C.red,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: 16,
                background: C.card,
                marginBottom: 20,
              }}
            >
              {stocksError}
            </div>
          ) : ownedStocks.length === 0 ? (
            <div
              style={{
                color: C.sub,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: 16,
                background: C.card,
                marginBottom: 20,
              }}
            >
              No holdings yet
            </div>
          ) : (
            <StockList
              stocks={ownedStocks}
              apiBase={apiBase}
              onSelect={handleSelectStock}
            />
          )}

          <WatchlistSection
            stocks={watchlistStocks}
            apiBase={apiBase}
            onSelect={handleSelectStock}
          />

          {newsError ? (
            <div
              style={{
                color: C.red,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: 16,
                background: C.card,
                marginTop: 20,
              }}
            >
              {newsError}
            </div>
          ) : (
            <NewsSection
              items={news}
              onSeeMore={handleOpenNewsScreen}
              isLoading={newsLoading}
            />
          )}
        </>
      );
    }

    if (activeTab === "market") {
      if (stocksError) {
        return (
          <div>
            <h1 style={{ marginBottom: "20px", color: C.text }}>Market</h1>
            <div
              style={{
                color: C.red,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: 16,
                background: C.card,
              }}
            >
              {stocksError}
            </div>
          </div>
        );
      }

      return (
        <MarketScreen
          stocks={stocks}
          apiBase={apiBase}
          onOpenHeatmap={handleOpenHeatmapScreen}
          onSelect={handleSelectStock}
          activeCategory={marketActiveCategory}
          setActiveCategory={setMarketActiveCategory}
          search={marketSearchText}
          setSearch={setMarketSearchText}
        />
      );
    }

    return (
      <ProfileScreen
        themeMode={themeMode}
        onThemeModeChange={setThemeMode}
        user={user}
        isSyncing={isSyncing}
        onSignInWithGoogle={handleSignInWithGoogle}
        onSignOut={handleSignOut}
      />
    );
  };

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
          width: "100%",
          maxWidth: "900px",
          margin: "0 auto",
          padding: isCompactLayout
            ? "max(14px, env(safe-area-inset-top, 0px)) 14px calc(96px + env(safe-area-inset-bottom, 0px))"
            : "2rem",
          paddingBottom: isCompactLayout
            ? "calc(96px + env(safe-area-inset-bottom, 0px))"
            : "100px",
          boxSizing: "border-box",
          textAlign: "left",
        }}
      >
        {renderContent()}
      </div>

      {alertToastStack}
      <BottomNav activeTab={activeTab} onChangeTab={handleChangeTab} />
    </div>
  );
}

export default App;
