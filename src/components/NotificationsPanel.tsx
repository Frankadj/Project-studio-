import { useEffect, useState, useRef } from "react";
import { C } from "../theme/colors";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  clearAllNotifications,
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
  onClose: () => void;
};

export default function NotificationsPanel({ onClose }: Props) {
  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    getNotifications()
  );
  const panelRef = useRef<HTMLDivElement>(null);

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

  // Close panel on clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [onClose]);

  const handleMarkAsRead = (id: string) => {
    markAsRead(id);
  };

  const handleMarkAllAsRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    markAllAsRead();
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearAllNotifications();
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 2000,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          maxHeight: "80vh",
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 20,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        {/* Header Control Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 20px",
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 600,
                color: C.text,
              }}
            >
              Notifications
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: C.sub,
              cursor: "pointer",
              padding: 4,
              fontSize: 18,
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Toolbar of commands */}
        {notifications.length > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 20px",
              background: C.bg,
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            <button
              onClick={handleMarkAllAsRead}
              style={{
                background: "none",
                border: "none",
                color: C.accent || C.green,
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                padding: 0,
              }}
            >
              Mark all read
            </button>
            <button
              onClick={handleClearAll}
              style={{
                background: "none",
                border: "none",
                color: C.red,
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                padding: 0,
              }}
            >
              Clear all
            </button>
          </div>
        )}

        {/* List content */}
        <div
          className="custom-scrollbar"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "10px 0",
            minHeight: 160,
          }}
        >
          {notifications.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "48px 24px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: "50%",
                  background: C.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 16,
                }}
              >
                <svg
                  width="24"
                  height="24"
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
              <div style={{ color: C.text, fontWeight: 500, fontSize: 15, marginBottom: 4 }}>
                All Caught Up!
              </div>
              <div style={{ color: C.sub, fontSize: 13, maxWidth: 280 }}>
                You have no active notifications at the moment.
              </div>
            </div>
          ) : (
            notifications.map((n) => {
              // Icon configuration based on type
              let typeIconColor = C.sub;
              let typeBg = C.bg;
              let iconSvg = null;

              if (n.type === "buy") {
                typeIconColor = C.green;
                typeBg = "rgba(16, 185, 129, 0.1)";
                iconSvg = (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={C.green}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                    <polyline points="17 6 23 6 23 12" />
                  </svg>
                );
              } else if (n.type === "sell") {
                typeIconColor = C.red;
                typeBg = "rgba(239, 68, 68, 0.1)";
                iconSvg = (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={C.red}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
                    <polyline points="17 18 23 18 23 12" />
                  </svg>
                );
              } else {
                typeIconColor = C.gold || "#eab308";
                typeBg = "rgba(234, 179, 8, 0.1)";
                iconSvg = (
                  <svg
                    width="16"
                    height="16"
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
                    padding: "12px 20px",
                    borderBottom: `1px solid ${C.border}`,
                    background: n.read ? "transparent" : `${C.bg}22`,
                    cursor: "pointer",
                    display: "flex",
                    gap: 14,
                    alignItems: "flex-start",
                    transition: "background 0.2s ease",
                    position: "relative",
                  }}
                >
                  {/* Read dot indicator */}
                  {!n.read && (
                    <div
                      style={{
                        position: "absolute",
                        top: 14,
                        right: 14,
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
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: typeBg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {iconSvg}
                  </div>

                  {/* Text Container */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: n.read ? 500 : 600,
                        color: C.text,
                        marginBottom: 4,
                        paddingRight: n.read ? 0 : 12,
                        wordBreak: "break-word",
                      }}
                    >
                      {n.title}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: C.sub,
                        lineHeight: 1.4,
                        marginBottom: 6,
                        wordBreak: "break-word",
                      }}
                    >
                      {n.message}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: C.sub,
                        fontWeight: 500,
                      }}
                    >
                      {formatRelativeTime(n.timestamp)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
