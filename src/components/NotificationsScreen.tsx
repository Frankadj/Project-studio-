import { useEffect, useState } from "react";
import { C } from "../theme/colors";
import useIsCompactLayout from "../hooks/useIsCompactLayout";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  type AppNotification,
} from "../lib/notifications";

// Simple relative time formatter
function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  if (diffMs < 0) return "Just now";
  
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 15) return "Just now";
  if (diffSecs < 60) return `${diffSecs}s ago`;
  
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type Props = {
  onBack: () => void;
};

export default function NotificationsScreen({ onBack }: Props) {
  const isCompactLayout = useIsCompactLayout();
  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    getNotifications()
  );

  const fetchRaw = () => {
    setNotifications(getNotifications());
  };

  useEffect(() => {
    const handleUpdate = () => {
      fetchRaw();
    };

    window.addEventListener("plutus:notifications-updated", handleUpdate);
    return () => {
      window.removeEventListener("plutus:notifications-updated", handleUpdate);
    };
  }, []);

  const handleMarkAsRead = (id: string) => {
    markAsRead(id);
  };

  const handleMarkAllAsRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    markAllAsRead();
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
          padding: isCompactLayout ? "14px 14px 36px" : "18px 20px 44px",
          boxSizing: "border-box",
        }}
      >
        {/* Header Section */}
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
            Notifications
          </h1>
        </div>

        {/* Toolbar of commands with Mark all read on the right page */}
        {notifications.length > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              paddingBottom: "14px",
              borderBottom: `1px solid ${C.border}`,
              marginBottom: "14px",
            }}
          >
            <button
              onClick={handleMarkAllAsRead}
              style={{
                background: "none",
                border: "none",
                color: C.accent || C.green,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                padding: "4px 8px",
                borderRadius: "6px",
                transition: "background 0.2s ease",
              }}
              className="hover:bg-[rgba(255,255,255,0.05)]"
            >
              Mark all read
            </button>
          </div>
        )}

        {/* List Content */}
        <div>
          {notifications.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "80px 24px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 16,
                }}
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={C.sub}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </div>
              <div style={{ color: C.text, fontWeight: 600, fontSize: 17, marginBottom: 6 }}>
                All Caught Up!
              </div>
              <div style={{ color: C.sub, fontSize: 14, maxWidth: 300 }}>
                You have no active notifications at the moment.
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              {notifications.map((n) => {
                let typeIconColor = C.sub;
                let typeBg = C.bg;
                let iconSvg = null;

                if (n.type === "buy") {
                  typeIconColor = C.green;
                  typeBg = "rgba(16, 185, 129, 0.1)";
                  iconSvg = (
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={C.green}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="2" y="5" width="20" height="14" rx="2" strokeWidth="2" />
                      <rect x="4" y="7" width="16" height="10" rx="1" strokeWidth="1" strokeDasharray="2 1" opacity="0.6" />
                      <circle cx="12" cy="12" r="3" strokeWidth="1.5" />
                      <text
                        x="12"
                        y="15.5"
                        textAnchor="middle"
                        fontSize="10"
                        fontFamily="sans-serif"
                        fontWeight="bold"
                        fill={C.green}
                        stroke="none"
                      >
                        ¢
                      </text>
                    </svg>
                  );
                } else if (n.type === "sell") {
                  typeIconColor = C.red;
                  typeBg = "rgba(239, 68, 68, 0.1)";
                  iconSvg = (
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={C.red}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                      <circle cx="7" cy="7" r="1.5" fill={C.red} stroke="none" />
                    </svg>
                  );
                } else {
                  typeIconColor = C.gold || "#eab308";
                  typeBg = "rgba(234, 179, 8, 0.1)";
                  iconSvg = (
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={typeIconColor}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  );
                }

                return (
                  <div
                    key={n.id}
                    onClick={() => handleMarkAsRead(n.id)}
                    style={{
                      padding: "16px 20px",
                      borderRadius: "16px",
                      border: `1px solid ${C.border}`,
                      background: n.read ? C.card : `${C.card}ee`,
                      cursor: "pointer",
                      display: "flex",
                      gap: 16,
                      alignItems: "flex-start",
                      transition: "transform 0.2s ease, background 0.2s ease",
                      position: "relative",
                      boxShadow: n.read ? "none" : `0 4px 12px ${C.border}44`,
                    }}
                    className="hover:scale-[1.005] hover:brightness-105"
                  >
                    {/* Read dot indicator */}
                    {!n.read && (
                      <div
                        style={{
                          position: "absolute",
                          top: 18,
                          right: 18,
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: C.green,
                        }}
                      />
                    )}

                    {/* Icon Block */}
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: "50%",
                        background: typeBg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        border: `1px solid ${typeIconColor}33`,
                      }}
                    >
                      {iconSvg}
                    </div>

                    {/* Text Container */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: n.read ? 600 : 700,
                          color: C.text,
                          marginBottom: 4,
                          paddingRight: n.read ? 0 : 16,
                          wordBreak: "break-word",
                        }}
                      >
                        {n.title}
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          color: C.sub,
                          lineHeight: 1.5,
                          marginBottom: 8,
                          wordBreak: "break-word",
                        }}
                      >
                        {n.message}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: C.sub,
                          fontWeight: 500,
                        }}
                      >
                        {formatRelativeTime(n.timestamp)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
