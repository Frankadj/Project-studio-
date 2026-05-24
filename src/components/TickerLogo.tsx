import { useState } from "react";
import { C } from "../theme/colors";

type TickerLogoProps = {
  symbol: string;
  size?: number;
  logoUrl?: string;
};

// Generates a consistent background color based on the symbol string
function stringToColor(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = Math.floor(Math.abs((Math.sin(hash) * 10000) % 1 * 16777215)).toString(16);
  return "#" + "000000".substring(0, 6 - color.length) + color;
}

function TickerLogo({ symbol, size = 42, logoUrl = "" }: TickerLogoProps) {
  const [imgError, setImgError] = useState(false);
  const safeSymbol = (symbol || "").toUpperCase().trim();
  const label = safeSymbol.slice(0, 3) || "?";
  
  const bgColor = stringToColor(safeSymbol);
  const showImage = Boolean(logoUrl) && !imgError;

  return (
    <div
      aria-label={safeSymbol || "Ticker logo"}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        borderRadius: 12,
        backgroundColor: showImage ? "#FFFFFF" : bgColor,
        color: "#FFFFFF",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: safeSymbol.length > 4 ? size * 0.22 : size * 0.28,
        lineHeight: 1,
        flexShrink: 0,
        border: `1px solid ${C.border}`,
        overflow: "hidden",
      }}
    >
      {showImage ? (
        <img
          src={logoUrl}
          alt={`${safeSymbol} logo`}
          loading="lazy"
          decoding="async"
          onError={() => setImgError(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            padding: Math.max(2, Math.round(size * 0.12)),
            display: "block",
            boxSizing: "border-box",
            backgroundColor: "transparent",
            borderRadius: "inherit",
          }}
        />
      ) : (
        label
      )}
    </div>
  );
}

export default TickerLogo;
