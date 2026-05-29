import { useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import type { PortfolioTransaction, Position, Stock } from "../App";
import { C } from "../theme/colors";
import useIsCompactLayout from "../hooks/useIsCompactLayout";
import { fmt, formatCompactCurrency } from "../utils/format";
import { type ChartPeriod } from "../utils/chartPeriods";
import {
  getPortfolioHistorySymbols,
  hasCompletePortfolioHistory,
} from "../utils/portfolioAnalytics";
import ChartPeriodTabs from "./ChartPeriodTabs";
import ChartLoadingSkeleton from "./ChartLoadingSkeleton";
import ChartRefreshOverlay from "./ChartRefreshOverlay";
import StockChart from "./StockChart";

type HistoryPoint = {
  date: string;
  value: number;
  holdingsValue: number;
  holdingsReturn: number;
  holdingsReturnPercent: number;
};

type PortfolioCardProps = {
  stocks: Stock[];
  positions: Record<string, Position>;
  transactions: PortfolioTransaction[];
  apiBase: string;
  onOpenBreakdown: () => void;
};

type PortfolioPeriod = ChartPeriod;

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

function PortfolioCard({
  stocks,
  positions,
  transactions,
  apiBase,
  onOpenBreakdown,
}: PortfolioCardProps) {
  const isCompactLayout = useIsCompactLayout();
  const [viewMode, setViewMode] = useState<"returns" | "value">("returns");
  const [menuOpen, setMenuOpen] = useState(false);
  const [period, setPeriod] = useState<PortfolioPeriod>("1W");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyRefreshing, setHistoryRefreshing] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [hoveredHistoryPoint, setHoveredHistoryPoint] =
    useState<HistoryPoint | null>(null);
  const hasLoadedHistoryRef = useRef(false);
  const historyRequestIdRef = useRef(0);
  const latestFetchContextRef = useRef("");

  const stockMap = useMemo(() => {
    const entries = stocks
      .map((stock) => {
        const symbol = (stock.symbol || stock.ticker || stock.code || "")
          .toUpperCase()
          .trim();
        return [symbol, stock] as const;
      })
      .filter(([symbol]) => Boolean(symbol));

    return Object.fromEntries(entries);
  }, [stocks]);

  const positionEntries = useMemo(() => {
    return Object.entries(positions)
      .map(([symbol, position]) => ({
        symbol: symbol.toUpperCase().trim(),
        shares: toNumber(position.shares),
      }))
      .filter((holding) => holding.symbol && holding.shares > 0)
      .sort((left, right) => left.symbol.localeCompare(right.symbol));
  }, [positions]);

  const totalHoldingsValue = positionEntries.reduce(
    (sum, entry) => sum + toNumber(stockMap[entry.symbol]?.price) * entry.shares,
    0
  );
  const historySymbols = useMemo(
    () => getPortfolioHistorySymbols(positions, transactions),
    [positions, transactions]
  );
  const historySymbolsKey = historySymbols.join(",");
  const hasRecordedTrades = transactions.length > 0;
  // Always true for history backend tracking engine now
  const hasCompleteHistory = true;

  const resetPortfolioChartState = (keepLoading = true) => {
    historyRequestIdRef.current += 1;
    hasLoadedHistoryRef.current = false;
    setHistoryError("");
    setHistoryLoading(keepLoading);
    setHistoryRefreshing(false);
    setHoveredHistoryPoint(null);
  };

  const handlePeriodChange = (nextPeriod: PortfolioPeriod) => {
    if (nextPeriod === period) {
      return;
    }

    setHoveredHistoryPoint(null);
    setPeriod(nextPeriod);
  };

  useEffect(() => {
    resetPortfolioChartState(
      hasRecordedTrades && hasCompleteHistory && historySymbols.length > 0
    );
  }, [hasCompleteHistory, hasRecordedTrades, historySymbolsKey]);

  const fetchContextKey = `${period}|${historySymbolsKey}|${
    hasCompleteHistory ? "complete" : "incomplete"
  }`;
  latestFetchContextRef.current = fetchContextKey;

  const [portfolioHistory, setPortfolioHistory] = useState<HistoryPoint[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    const loadHistory = async () => {
      setHistoryLoading(portfolioHistory.length === 0);
      setHistoryRefreshing(portfolioHistory.length > 0);
      setHistoryError("");

      try {
        const res = await fetch(`${apiBase}/api/v1/portfolio/chart?range=${period}`, {
          signal: controller.signal
        });

        if (!res.ok) throw new Error();
        
        const data = await res.json();
        const mapped = data.map((d: any) => {
          const cashBalance = d.cashBalance || 0;
          const portfolioValue = d.portfolioValue || 0;
          const investedValue = d.investedValue || 0;
          const holdingsValue = Math.max(0, portfolioValue - cashBalance);
          const holdingsReturn = holdingsValue - investedValue;
          const holdingsReturnPercent = investedValue > 0 ? (holdingsReturn / investedValue) * 100 : 0;
          
          return {
            date: d.timestamp,
            value: portfolioValue,
            holdingsValue,
            holdingsReturn,
            holdingsReturnPercent,
          };
        });

        setPortfolioHistory(mapped);
        if (mapped.length < 2) {
          setHistoryError("No portfolio history in this range yet.");
        }
      } catch {
        if (!controller.signal.aborted) {
           setHistoryError("Unable to load portfolio chart right now.");
        }
      } finally {
        if (!controller.signal.aborted) {
           setHistoryLoading(false);
           setHistoryRefreshing(false);
        }
      }
    };

    loadHistory();
    return () => controller.abort();
  }, [apiBase, period]);

  useEffect(() => {
    setHoveredHistoryPoint(null);
  }, [period]);

  const chartPoints = useMemo(() => {
    const pts = portfolioHistory.map((point) => ({
      date: point.date,
      value: viewMode === "returns" ? point.holdingsReturnPercent : point.holdingsValue,
      holdingsValue: point.holdingsValue,
      holdingsReturn: point.holdingsReturn,
      holdingsReturnPercent: point.holdingsReturnPercent,
    }));

    const firstRealIndex = pts.findIndex((point) => point.holdingsValue > 0);
    
    if (firstRealIndex > 0) {
      return pts.slice(firstRealIndex);
    } else if (firstRealIndex === -1 && pts.length > 0) {
      // Never had any holdings
      return [pts[pts.length - 1]];
    }

    return pts;
  }, [portfolioHistory, viewMode]);

  const firstRealPoint =
    chartPoints.find((point) => point.holdingsValue > 0) ||
    chartPoints[0] ||
    null;
  const latestPoint =
    chartPoints.length > 0 ? chartPoints[chartPoints.length - 1] : null;

  const rangeStartPoint = firstRealPoint;
  const previewPoint = hoveredHistoryPoint 
    ? {
        date: hoveredHistoryPoint.date,
        value: viewMode === "returns" ? hoveredHistoryPoint.holdingsReturnPercent : hoveredHistoryPoint.holdingsValue,
        holdingsValue: hoveredHistoryPoint.holdingsValue,
        holdingsReturn: hoveredHistoryPoint.holdingsReturn,
        holdingsReturnPercent: hoveredHistoryPoint.holdingsReturnPercent,
      }
    : latestPoint;

  // Set target values for display and animations
  const currentHoldingsValue = previewPoint ? previewPoint.holdingsValue : totalHoldingsValue;
  
  // Note: firstRealPoint is the first day they owned a stock. If they hover BEFORE they owned a stock, the date is earlier.
  const isHoveringBeforeFirstInvestment = rangeStartPoint && previewPoint && previewPoint.date < rangeStartPoint.date;

  const displayValueTarget = currentHoldingsValue;
  
  let displayPeriodReturnAmountTarget = 0;
  let displayPeriodReturnPercentTarget = 0;

  // Use the actual tracked return from the backend (total return up to that point)
  // To get the return for the period, subtract the start-of-period return.
  if (previewPoint) {
    if (currentHoldingsValue === 0) {
      displayPeriodReturnAmountTarget = 0;
      displayPeriodReturnPercentTarget = 0;
    } else {
      const currentReturn = previewPoint.holdingsReturn;
      const startReturn = (rangeStartPoint && !isHoveringBeforeFirstInvestment) ? rangeStartPoint.holdingsReturn : 0;
      
      displayPeriodReturnAmountTarget = currentReturn - startReturn;
      
      // For percent, find what the baseline starting portfolio value was for this return
      // We can approximate the invested capital for this period
      const currentInvested = currentHoldingsValue - currentReturn;
      if (currentInvested > 0) {
        displayPeriodReturnPercentTarget = (displayPeriodReturnAmountTarget / currentInvested) * 100;
      } else {
        displayPeriodReturnPercentTarget = previewPoint.holdingsReturnPercent;
      }
    }
  }
  
  const displayValue = useAnimatedNumber(displayValueTarget);
  const displayPeriodReturnAmount = useAnimatedNumber(displayPeriodReturnAmountTarget);
  const displayPeriodReturnPercent = useAnimatedNumber(displayPeriodReturnPercentTarget);

  const chartPositive = (() => {
    if (!rangeStartPoint || !latestPoint) return true;
    if (viewMode === "value") {
      return latestPoint.holdingsValue >= rangeStartPoint.holdingsValue;
    } else {
      return latestPoint.holdingsReturnPercent >= rangeStartPoint.holdingsReturnPercent;
    }
  })();

  const periodLabels: Record<string, string> = {
    "1W": "Past week",
    "1M": "Past month",
    "3M": "Past 3 months",
    "6M": "Past 6 months",
    "YTD": "YTD",
    "1Y": "Past year",
    "5Y": "Past 5 years",
    "ALL": "All time",
  };
  const currentPeriodLabel = periodLabels[period] || "Selected period";

  const formatChangeText = (value: number, percent: number, label: string) => {
    const isPositive = value >= 0;
    const sign = isPositive ? "+" : "-";
    return `${sign}₵${fmt(Math.abs(value))} (${isPositive ? "+" : "-"}${Math.abs(percent).toFixed(2)}%) ${label}`;
  };

  const hasPortfolioChart = chartPoints.length >= 2;
  const emptyStateMessage = !hasRecordedTrades
    ? "Your investing chart will appear after your first recorded trade."
    : !hasCompleteHistory
      ? "Portfolio chart becomes available after your trades are fully recorded."
      : historyError || "No portfolio history in this range yet.";

  return (
    <div
      style={{
        marginTop: 12,
        borderBottom: `1px solid ${C.border}`,
        paddingBottom: 20,
        marginBottom: 20,
      }}
    >
      <div style={{ paddingBottom: 8 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              fontSize: isCompactLayout ? 32 : 36,
              fontWeight: 500,
              color: C.text,
              lineHeight: 1,
              textAlign: "left",
            }}
          >
            Investing
          </div>

          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              title="Change view mode"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px 8px",
                borderRadius: 6,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: C.green,
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = C.border;
                e.currentTarget.style.transform = "scale(1.05)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              <MoreHorizontal size={28} />
            </button>

            {menuOpen && (
              <>
                <div
                  onClick={() => setMenuOpen(false)}
                  style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 999,
                    cursor: "default",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    marginTop: 6,
                    background: C.card,
                    border: `1px solid ${C.border}`,
                    borderRadius: 12,
                    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)",
                    padding: "4px 0",
                    zIndex: 1000,
                    minWidth: 140,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode("returns");
                      setMenuOpen(false);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "10px 16px",
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      color: viewMode === "returns" ? C.green : C.text,
                      fontWeight: viewMode === "returns" ? 600 : 400,
                      fontSize: 14,
                      cursor: "pointer",
                      transition: "background-color 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = C.border;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    By Returns {viewMode === "returns" && "✓"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode("value");
                      setMenuOpen(false);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "10px 16px",
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      color: viewMode === "value" ? C.green : C.text,
                      fontWeight: viewMode === "value" ? 600 : 400,
                      fontSize: 14,
                      cursor: "pointer",
                      transition: "background-color 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = C.border;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    By Value {viewMode === "value" && "✓"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div
          style={{
            marginTop: 10,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: isCompactLayout ? 8 : 12,
          }}
        >
          <div
            style={{
              fontSize: isCompactLayout ? 28 : 32,
              fontWeight: 400,
              color: C.text,
              lineHeight: 1,
              textAlign: "left",
            }}
          >
            ₵{displayValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>

          <button
            type="button"
            onClick={onOpenBreakdown}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: C.green,
              cursor: "pointer",
              fontSize: isCompactLayout ? 14 : 15,
              fontWeight: 700,
              letterSpacing: "0.01em",
              textAlign: "right",
              whiteSpace: "nowrap",
            }}
          >
            Breakdown
          </button>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            marginTop: 8,
            textAlign: "left",
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 400,
              color: displayPeriodReturnAmount >= 0 ? C.green : C.red,
            }}
          >
            {formatChangeText(displayPeriodReturnAmount, displayPeriodReturnPercent, currentPeriodLabel)}
          </div>
        </div>
      </div>

      <div
        style={{
          marginLeft: isCompactLayout ? "-4px" : "-8px",
          marginRight: isCompactLayout ? "-4px" : "-8px",
          marginTop: -4,
        }}
      >
        {historyLoading && portfolioHistory.length < 2 ? (
          <ChartLoadingSkeleton />
        ) : hasPortfolioChart ? (
          <div style={{ position: "relative" }}>
            <StockChart
              history={chartPoints}
              positive={chartPositive}
              onHoverChange={setHoveredHistoryPoint}
            />
            {historyRefreshing ? <ChartRefreshOverlay /> : null}
          </div>
        ) : (
          <div
            style={{
              height: 214,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: C.sub,
              background: C.card,
              borderRadius: 18,
              border: `1px solid ${C.border}`,
              textAlign: "center",
              padding: "0 20px",
            }}
          >
            {emptyStateMessage}
          </div>
        )}

        {historyError && hasPortfolioChart && !historyRefreshing ? (
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

      <div style={{ marginTop: 16 }}>
        <ChartPeriodTabs period={period} onChange={handlePeriodChange} />
      </div>

    </div>
  );
}

export default PortfolioCard;
