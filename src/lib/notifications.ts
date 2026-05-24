export type NotificationType = "buy" | "sell" | "alert";

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  symbol: string;
  shares?: number;
  price?: number;
};

const NOTIFICATIONS_STORAGE_KEY = "plutus_notifications_list";
const NOTIFICATIONS_UPDATED_EVENT = "plutus:notifications-updated";

function dispatchNotificationsUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(NOTIFICATIONS_UPDATED_EVENT));
  }
}

export function getNotifications(): AppNotification[] {
  if (typeof localStorage === "undefined") {
    return [];
  }
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.sort((a, b) => b.timestamp - a.timestamp);
    }
    return [];
  } catch {
    return [];
  }
}

export function saveAllNotifications(notifications: AppNotification[]) {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifications));
    dispatchNotificationsUpdated();
  } catch {
    // Ignore local storage write errors
  }
}

export function addNotification(input: {
  type: NotificationType;
  title: string;
  message: string;
  symbol: string;
  shares?: number;
  price?: number;
}): AppNotification {
  const notifications = getNotifications();
  const newNotification: AppNotification = {
    id: `${input.type}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type: input.type,
    title: input.title,
    message: input.message,
    timestamp: Date.now(),
    read: false,
    symbol: input.symbol.toUpperCase(),
    shares: input.shares,
    price: input.price,
  };

  const nextNotifications = [newNotification, ...notifications];
  saveAllNotifications(nextNotifications);
  return newNotification;
}

export function markAsRead(id: string) {
  const notifications = getNotifications();
  const nextNotifications = notifications.map((n) =>
    n.id === id ? { ...n, read: true } : n
  );
  saveAllNotifications(nextNotifications);
}

export function markAllAsRead() {
  const notifications = getNotifications();
  const nextNotifications = notifications.map((n) => ({ ...n, read: true }));
  saveAllNotifications(nextNotifications);
}

export function clearAllNotifications() {
  saveAllNotifications([]);
}

export function getUnreadNotificationsCount(): number {
  return getNotifications().filter((n) => !n.read).length;
}

export function subscribeNotifications(onChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleCustomEvent = () => {
    onChange();
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === NOTIFICATIONS_STORAGE_KEY) {
      onChange();
    }
  };

  window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, handleCustomEvent);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, handleCustomEvent);
    window.removeEventListener("storage", handleStorage);
  };
}
