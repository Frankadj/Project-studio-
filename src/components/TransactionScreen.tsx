import React, { useState } from "react";
import { C } from "../theme/colors";
import CustomDatePicker from "./CustomDatePicker";
import useIsCompactLayout from "../hooks/useIsCompactLayout";

type Props = {
  symbol: string;
  onBack: () => void;
  onSuccess: () => void;
};

export default function TransactionScreen({ symbol, onBack, onSuccess }: Props) {
  const isCompactLayout = useIsCompactLayout();
  const [type, setType] = useState<"BUY" | "SELL">("BUY");
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  
  // Format initial date to YYYY-MM-DD local time
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const [date, setDate] = useState(`${yyyy}-${mm}-${dd}`);

  const [fees, setFees] = useState("");
  const [notes, setNotes] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/v1/portfolio/transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          type,
          shares: Number(shares),
          price_per_share: Number(price),
          transaction_date: date ? new Date(`${date}T12:00:00Z`).toISOString() : new Date().toISOString(),
          fees: Number(fees || 0),
          notes: notes || null
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add transaction");
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
          padding: isCompactLayout ? "14px 14px 24px" : "18px 20px 28px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 24,
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
            aria-label="Go back"
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

          <h1
            style={{
              margin: 0,
              fontSize: isCompactLayout ? "28px" : "32px",
              fontWeight: 600,
              color: C.text,
              lineHeight: 1.1,
            }}
          >
            Add Transaction
          </h1>
        </div>

        <div
          style={{
            width: "100%",
            maxWidth: 500,
            background: C.bg,
          }}
        >
          {error && (
            <div style={{ color: C.red, background: "rgba(239,68,68,0.1)", padding: 16, borderRadius: 12, marginBottom: 20, fontSize: 15, fontWeight: 500 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1, display: "flex", background: C.card, borderRadius: 12, padding: 4, border: `1px solid ${C.border}` }}>
                 <button
                    type="button"
                    onClick={() => setType("BUY")}
                    style={{
                       flex: 1, padding: "12px 0", borderRadius: 8, border: "none", fontSize: 15, fontWeight: 600,
                       background: type === "BUY" ? "rgba(34, 197, 94, 0.15)" : "transparent",
                       color: type === "BUY" ? C.green : C.sub,
                       cursor: "pointer",
                       transition: "all 0.2s"
                    }}
                 >Buy</button>
                 <button
                    type="button"
                    onClick={() => setType("SELL")}
                    style={{
                       flex: 1, padding: "12px 0", borderRadius: 8, border: "none", fontSize: 15, fontWeight: 600,
                       background: type === "SELL" ? "rgba(239, 68, 68, 0.15)" : "transparent",
                       color: type === "SELL" ? C.red : C.sub,
                       cursor: "pointer",
                       transition: "all 0.2s"
                    }}
                 >Sell</button>
              </div>
              
              <div
                 style={{
                   flex: 1,
                   display: "flex",
                   alignItems: "center",
                   justifyContent: "center",
                   fontSize: 22,
                   fontWeight: 700,
                   background: C.card,
                   border: `1px solid ${C.border}`,
                   borderRadius: 12,
                   color: C.text
                 }}
              >
                {symbol}
              </div>
            </div>

            <div>
              <label style={{ color: C.sub, fontSize: 14, display: "block", marginBottom: 8, fontWeight: 500 }}>Shares / Quantity</label>
              <input
                type="number"
                step="0.00001"
                required
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                style={{
                  width: "100%",
                  padding: "16px",
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: 12,
                  color: C.text,
                  fontSize: 16,
                  outline: "none",
                  boxSizing: "border-box"
                }}
                placeholder="e.g. 10"
              />
            </div>

            <div>
              <label style={{ color: C.sub, fontSize: 14, display: "block", marginBottom: 8, fontWeight: 500 }}>Price Per Share</label>
              <input
                type="number"
                step="0.01"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                style={{
                  width: "100%",
                  padding: "16px",
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: 12,
                  color: C.text,
                  fontSize: 16,
                  outline: "none",
                  boxSizing: "border-box"
                }}
                placeholder="e.g. 150.00"
              />
            </div>

            <div style={{ position: "relative", zIndex: 10 }}>
              <label style={{ color: C.sub, fontSize: 14, display: "block", marginBottom: 8, fontWeight: 500 }}>Transaction Date</label>
              <CustomDatePicker value={date} onChange={setDate} />
            </div>

            <div style={{ display: "flex", gap: 16, position: "relative", zIndex: 1 }}>
               <div style={{ flex: 1 }}>
                <label style={{ color: C.sub, fontSize: 14, display: "block", marginBottom: 8, fontWeight: 500 }}>Fees</label>
                <input
                  type="number"
                  step="0.01"
                  value={fees}
                  onChange={(e) => setFees(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "16px",
                    background: C.card,
                    border: `1px solid ${C.border}`,
                    borderRadius: 12,
                    color: C.text,
                    fontSize: 16,
                    outline: "none",
                    boxSizing: "border-box"
                  }}
                  placeholder="0.00"
                />
              </div>
              <div style={{ flex: 2 }}>
                <label style={{ color: C.sub, fontSize: 14, display: "block", marginBottom: 8, fontWeight: 500 }}>Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "16px",
                    background: C.card,
                    border: `1px solid ${C.border}`,
                    borderRadius: 12,
                    color: C.text,
                    fontSize: 16,
                    outline: "none",
                    boxSizing: "border-box"
                  }}
                  placeholder="Options exercise, etc."
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "18px",
                background: C.text,
                color: C.bg,
                border: "none",
                borderRadius: 12,
                fontSize: 16,
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                marginTop: 16,
                opacity: loading ? 0.7 : 1,
                position: "relative",
                zIndex: 1
              }}
            >
              {loading ? "Saving..." : "Save Transaction"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
