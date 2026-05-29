import { useEffect, useMemo, useRef, useState } from "react";
import { C } from "../theme/colors";
import type { IndexSummary } from "../App";
import StockChart from "./StockChart";
import ChartLoadingSkeleton from "./ChartLoadingSkeleton";
import ChartRefreshOverlay from "./ChartRefreshOverlay";
import ChartPeriodTabs from "./ChartPeriodTabs";
import useIsCompactLayout from "../hooks/useIsCompactLayout";
import {
  getChartPeriodLabel,
  type ChartPeriod,
} from "../utils/chartPeriods";

type HistoryPoint = {
  date: string;
  value: number;
};

type IndexDetailScreenProps = {
  index: IndexSummary;
  apiBase: string;
  onBack: () => void;
};

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

function formatIndexValue(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || value === 0) return "-";
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || value === 0) return "-";
  return "GH₵" + new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatMarketCap(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === 0) return "-";
  if (typeof value === "string") return value;
  if (value >= 1e12) {
    return `GH₵${(value / 1e12).toFixed(2)}Tr`;
  } else if (value >= 1e9) {
    return `GH₵${(value / 1e9).toFixed(2)}Bn`;
  } else if (value >= 1e6) {
    return `GH₵${(value / 1e6).toFixed(2)}Mn`;
  }
  return `GH₵${new Intl.NumberFormat("en-US").format(value)}`;
}

function formatIndexDate(date: string | undefined) {
  if (!date) {
    return "-";
  }

  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

function IndexDetailScreen({
  index,
  apiBase,
  onBack,
}: IndexDetailScreenProps) {
  const isCompactLayout = useIsCompactLayout();
  const code = index.code;
  const [period, setPeriod] = useState<ChartPeriod>("1W");
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyRefreshing, setHistoryRefreshing] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [hoveredHistoryPoint, setHoveredHistoryPoint] = useState<HistoryPoint | null>(
    null
  );
  const hasChartHistoryRef = useRef(false);
  const historyRequestIdRef = useRef(0);
  const latestFetchContextRef = useRef("");

  const fetchContextKey = `${code}|${period}`;
  latestFetchContextRef.current = fetchContextKey;

  useEffect(() => {
    hasChartHistoryRef.current = false;
    historyRequestIdRef.current += 1;
    setHistory([]);
    setHistoryError("");
    setHistoryLoading(true);
    setHistoryRefreshing(false);
    setHoveredHistoryPoint(null);
    setPeriod("1W");
  }, [code]);

  useEffect(() => {
    const fetchContext = `${code}|${period}`;
    const controller = new AbortController();

    const fetchHistory = async () => {
      const requestId = historyRequestIdRef.current + 1;
      historyRequestIdRef.current = requestId;
      const hasExistingChart = hasChartHistoryRef.current;

      setHistoryLoading(!hasExistingChart);
      setHistoryRefreshing(hasExistingChart);
      setHistoryError("");

      try {
        const response = await fetch(
          `${apiBase}/api/indices/${encodeURIComponent(code)}/history?range=${period}`,
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
          throw new Error(`Failed to load index history: ${response.status}`);
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
          throw new Error("Invalid index history response");
        }

        const cleanedHistory: HistoryPoint[] = data
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
          setHistoryError("No index history available.");
        } else {
          hasChartHistoryRef.current = true;
          setHistory(cleanedHistory);
        }
      } catch (error) {
        if (
          controller.signal.aborted ||
          requestId !== historyRequestIdRef.current ||
          latestFetchContextRef.current !== fetchContext
        ) {
          return;
        }

        console.error("Failed to load index history:", error);
        if (!hasExistingChart) {
          hasChartHistoryRef.current = false;
          setHistory([]);
        }
        setHistoryError(
          hasExistingChart
            ? "Unable to refresh index chart right now."
            : "Unable to load index chart right now."
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
  }, [apiBase, code, period]);

  const hasHistoryChart = history.length >= 2;
  const previewPoint =
    hoveredHistoryPoint || (hasHistoryChart ? history[history.length - 1] : null);
  const rangeStartPoint = hasHistoryChart ? history[0] : null;
  const displayValueTarget =
    previewPoint?.value ?? Number(index.value ?? 0);
  const displayChangeTarget =
    previewPoint && rangeStartPoint
      ? previewPoint.value - rangeStartPoint.value
      : Number(index.change ?? 0);
  const displayChangePercentTarget =
    previewPoint && rangeStartPoint && rangeStartPoint.value !== 0
      ? (displayChangeTarget / rangeStartPoint.value) * 100
      : Number(index.changePercent ?? 0);
  const displayValue = useAnimatedNumber(displayValueTarget);
  const displayChange = useAnimatedNumber(displayChangeTarget);
  const displayChangePercent = useAnimatedNumber(displayChangePercentTarget);
  const displayPositive = displayChange >= 0;
  const selectedPeriodLabel = getChartPeriodLabel(period);
  const chartPositive =
    hasHistoryChart && rangeStartPoint
      ? history[history.length - 1].value >= rangeStartPoint.value
      : Number(index.change) >= 0;

  const ytdText = useMemo(() => {
    const ytdChange = Number(index.ytdChange ?? 0);
    const ytdChangePercent = Number(index.ytdChangePercent ?? 0);
    const positive = ytdChange >= 0;
    return `${positive ? "+" : "-"}${Math.abs(ytdChange).toFixed(2)} (${positive ? "+" : "-"}${Math.abs(ytdChangePercent).toFixed(2)}%)`;
  }, [index.ytdChange, index.ytdChangePercent]);

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
          gap: 12,
          padding: "18px 20px 16px",
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

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: C.text,
              lineHeight: 1.1,
            }}
          >
            {code}
          </div>

          <div
            style={{
              fontSize: 13,
              color: C.sub,
              marginTop: 5,
              lineHeight: 1.2,
            }}
          >
            {index.name}
          </div>
        </div>
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: "900px",
          margin: "0 auto",
          padding: isCompactLayout ? "18px 14px 128px" : "24px 20px 140px",
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
            {formatIndexValue(displayValue)}
          </div>

          <div style={{ marginTop: 12, textAlign: "left" }}>
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
              {historyError || "No index history available."}
            </div>
          )}
        </div>

        {hasHistoryChart ? (
          <div style={{ marginBottom: 40 }}>
            <ChartPeriodTabs period={period} onChange={setPeriod} />
          </div>
        ) : null}

        {/* Year to Date and Last Updated Row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginTop: 8,
            marginBottom: 24,
            textAlign: "left",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                color: C.sub,
                marginBottom: 4,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Year to Date
            </div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: Number(index.ytdChange ?? 0) >= 0 ? C.green : C.red,
              }}
            >
              {ytdText}
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 11,
                color: C.sub,
                marginBottom: 4,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Last Updated
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: C.text,
              }}
            >
              {formatIndexDate(index.lastDate)}
            </div>
          </div>
        </div>

        {/* Key Stats Section */}
        {(() => {
          const keyStats = index.keyStats;
          const low52WeekValue = keyStats?.low52Week || (history.length > 0 ? Math.min(...history.map(h => h.value)) : 0);
          const high52WeekValue = keyStats?.high52Week || (history.length > 0 ? Math.max(...history.map(h => h.value)) : 0);

          return (
            <div style={{ marginTop: 32, marginBottom: 40, textAlign: "left" }}>
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: C.text,
                  borderBottom: `1px solid ${C.border}`,
                  paddingBottom: 10,
                  marginBottom: 20,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Key Stats
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isCompactLayout ? "1fr 1fr" : "1fr 1fr 1fr",
                  gap: isCompactLayout ? "20px 16px" : "28px 32px",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 12,
                      color: C.sub,
                      marginBottom: 6,
                      textTransform: "uppercase",
                      letterSpacing: "0.02em",
                    }}
                  >
                    52-Week Low
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: C.text,
                    }}
                  >
                    {low52WeekValue > 0 ? formatIndexValue(low52WeekValue) : "-"}
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 12,
                      color: C.sub,
                      marginBottom: 6,
                      textTransform: "uppercase",
                      letterSpacing: "0.02em",
                    }}
                  >
                    52-Week High
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: C.text,
                    }}
                  >
                    {high52WeekValue > 0 ? formatIndexValue(high52WeekValue) : "-"}
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 12,
                      color: C.sub,
                      marginBottom: 6,
                      textTransform: "uppercase",
                      letterSpacing: "0.02em",
                    }}
                  >
                    Market Cap
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: C.text,
                    }}
                  >
                    {formatMarketCap(keyStats?.marketCap)}
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 12,
                      color: C.sub,
                      marginBottom: 6,
                      textTransform: "uppercase",
                      letterSpacing: "0.02em",
                    }}
                  >
                    Volume
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: C.text,
                    }}
                  >
                    {keyStats?.volume !== undefined ? formatNumber(keyStats?.volume) : "-"}
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 12,
                      color: C.sub,
                      marginBottom: 6,
                      textTransform: "uppercase",
                      letterSpacing: "0.02em",
                    }}
                  >
                    Value Traded
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: C.text,
                    }}
                  >
                    {keyStats?.valueTraded !== undefined ? formatCurrency(keyStats?.valueTraded) : "-"}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

export default IndexDetailScreen;
