import { useCallback, useEffect, useRef, useState } from "react";

import { apiClient } from "@/lib/api-client";

const EMPTY_CENTER = {
  notifications: [],
  activity: [],
  unreadCount: 0,
};

let notificationSnapshotReady = false;
let knownNotificationIds = new Set();
let lastNotificationSoundAt = 0;
const RECENT_NOTIFICATION_WINDOW_MS = 60_000;

export function useNotificationCenter({ enabled = true, onRequestLogin } = {}) {
  const [center, setCenter] = useState(EMPTY_CENTER);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState("");
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const result = await apiClient.get("/notificaciones", { limit: 40 });
      const nextCenter = { ...EMPTY_CENTER, ...result };
      const now = Date.now();
      const incomingNotification =
        (notificationSnapshotReady &&
          nextCenter.notifications.some(
            (item) => !knownNotificationIds.has(item.id) && !item.isRead,
          )) ||
        (!notificationSnapshotReady &&
          nextCenter.notifications.some(
            (item) => !item.isRead && isRecentNotification(item, now),
          ));
      knownNotificationIds = new Set(nextCenter.notifications.map((item) => item.id));
      notificationSnapshotReady = true;
      if (incomingNotification) {
        if (Date.now() - lastNotificationSoundAt > 1000) {
          lastNotificationSoundAt = Date.now();
          playNotificationTone();
        }
        window.dispatchEvent(new CustomEvent("notifications:incoming"));
      }
      if (mountedRef.current) setCenter(nextCenter);
      setError("");
    } catch (requestError) {
      setError(requestError.message ?? "No se pudieron cargar las notificaciones.");
      if (isAuthError(requestError)) onRequestLogin?.();
    } finally {
      setLoading(false);
    }
  }, [enabled, onRequestLogin]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return undefined;
    const initialLoadId = window.setTimeout(load, 0);
    const intervalId = window.setInterval(load, 10000);
    const handleRefresh = () => load();
    window.addEventListener("notifications:refresh", handleRefresh);
    return () => {
      mountedRef.current = false;
      window.clearInterval(intervalId);
      window.clearTimeout(initialLoadId);
      window.removeEventListener("notifications:refresh", handleRefresh);
    };
  }, [enabled, load]);

  const markRead = useCallback(async (notificationId) => {
    try {
      await apiClient.patch(`/notificaciones/${notificationId}/leer`);
      setCenter((current) => {
        const selected = current.notifications.find((item) => item.id === notificationId);
        if (!selected || selected.isRead) return current;
        return {
          ...current,
          unreadCount: Math.max(0, current.unreadCount - 1),
          notifications: current.notifications.map((item) =>
            item.id === notificationId ? { ...item, isRead: true } : item,
          ),
        };
      });
    } catch (requestError) {
      if (isAuthError(requestError)) onRequestLogin?.();
    }
  }, [onRequestLogin]);

  const markAllRead = useCallback(async () => {
    try {
      await apiClient.post("/notificaciones/marcar-todas-leidas", {});
      setCenter((current) => ({
        ...current,
        unreadCount: 0,
        notifications: current.notifications.map((item) => ({ ...item, isRead: true })),
      }));
    } catch (requestError) {
      if (isAuthError(requestError)) onRequestLogin?.();
    }
  }, [onRequestLogin]);

  const clearError = useCallback(() => setError(""), []);

  return {
    ...center,
    loading,
    error,
    clearError,
    reload: load,
    markRead,
    markAllRead,
  };
}

function playNotificationTone() {
  if (typeof window === "undefined") return;

  const play = () => {
    try {
      const audio = createNotificationAudio();
      if (!audio) return;
      const pendingPlay = audio.play();
      pendingPlay?.catch(() => {});
    } catch {
      // El navegador puede bloquear el audio hasta que exista interacción.
    }
  };

  try {
    const audio = createNotificationAudio();
    if (!audio) return;
    const pendingPlay = audio.play();
    pendingPlay?.catch(() => {
      const playOnInteraction = () => {
        play();
        window.removeEventListener("click", playOnInteraction);
        window.removeEventListener("keydown", playOnInteraction);
      };
      window.addEventListener("click", playOnInteraction, { once: true });
      window.addEventListener("keydown", playOnInteraction, { once: true });
    });
  } catch {
    // La notificación visual sigue disponible aunque el audio falle.
  }
}

function createNotificationAudio() {
  try {
    if (typeof Audio === "function") {
      const audio = new Audio("/sound.mp3");
      audio.preload = "auto";
      audio.volume = 1;
      return audio;
    }
    if (typeof document?.createElement === "function") {
      const audio = document.createElement("audio");
      audio.src = "/sound.mp3";
      audio.preload = "auto";
      audio.volume = 1;
      return audio;
    }
  } catch {
    // El navegador puede no exponer reproducción multimedia.
  }
  return null;
}

function isRecentNotification(item, now = Date.now()) {
  const createdAt = Date.parse(item?.createdAt ?? "");
  if (!Number.isFinite(createdAt)) return false;
  const age = now - createdAt;
  return age >= 0 && age <= RECENT_NOTIFICATION_WINDOW_MS;
}

function isAuthError(error) {
  return /sesión|inicia sesión|401|autentic/i.test(error?.message ?? "");
}
