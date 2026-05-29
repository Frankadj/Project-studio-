import { C } from "../theme/colors";

type ChartLoadingSkeletonProps = {
  height?: number;
  rounded?: number;
};

function ChartLoadingSkeleton({
  height = 214,
  rounded = 18,
}: ChartLoadingSkeletonProps) {
  return (
    <div
      className="chart-skeleton"
      style={{
        position: "relative",
        height,
        borderRadius: rounded,
        overflow: "hidden",
        background: C.card,
        border: `1px solid ${C.border}`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "18px 18px 24px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          pointerEvents: "none",
        }}
      >


        <div
          style={{
            position: "relative",
            flex: 1,
            marginTop: 14,
            borderRadius: 14,
            overflow: "hidden",
            background: "rgba(142, 142, 147, 0.05)" // Added a subtle background for the blank area
          }}
        >
          <div
            className="chart-skeleton-shimmer"
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.08) 48%, rgba(255,255,255,0.18) 52%, rgba(255,255,255,0.08) 56%, rgba(255,255,255,0) 100%)",
              transform: "translateX(-100%)",
            }}
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 10,
            marginTop: 14,
          }}
        >
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              style={{
                height: 8,
                borderRadius: 999,
                background: "rgba(142, 142, 147, 0.14)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default ChartLoadingSkeleton;
