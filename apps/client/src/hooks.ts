import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";

type ReloadOptions = {
  showLoading?: boolean;
};

export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const hasLoaded = useRef(false);
  const latestRequest = useRef(0);

  const reload = async (options: ReloadOptions = {}) => {
    const requestId = latestRequest.current + 1;
    latestRequest.current = requestId;
    const showLoading = options.showLoading ?? !hasLoaded.current;
    if (showLoading) {
      setLoading(true);
    }
    setError(null);
    try {
      const nextData = await loader();
      if (latestRequest.current === requestId) {
        setData(nextData);
        hasLoaded.current = true;
      }
    } catch (err) {
      if (latestRequest.current === requestId) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (latestRequest.current === requestId) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void reload({ showLoading: true });
  }, deps);

  return { data, error, loading, reload, setData };
}

export function useCurrentUser() {
  return useAsync(() => api.authUser(), []);
}

export function useRealtime(path: "/gamesHub" | "/votesHub", onMessage: () => void) {
  const onMessageRef = useRef(onMessage);
  const socketRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 1000; // 1 second

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const handleSocketOpen = (socket: WebSocket) => {
    socketRef.current = socket;
    reconnectAttemptsRef.current = 0;

    // Clear any pending reconnect timeout
    if (reconnectTimeoutRef.current !== null) {
      globalThis.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Clear polling fallback when connection succeeds
    if (pollIntervalRef.current !== null) {
      globalThis.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    // Start ping interval to keep connection alive
    pingIntervalRef.current = globalThis.setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send("ping");
      }
    }, 30000); // Ping every 30 seconds
  };

  const handleSocketMessage = () => {
    onMessageRef.current();
  };

  const handleSocketCloseOrError = () => {
    socketRef.current = null;

    // Clear ping interval
    if (pingIntervalRef.current !== null) {
      globalThis.clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    // Attempt to reconnect with exponential backoff
    if (reconnectAttemptsRef.current < maxReconnectAttempts) {
      const delay = baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current);
      reconnectAttemptsRef.current++;
      reconnectTimeoutRef.current = globalThis.setTimeout(connectWebSocket, delay);
    } else {
      // Max reconnect attempts reached, fall back to polling
      startPollingFallback();
    }
  };

  const startPollingFallback = () => {
    // Poll every 5 seconds as fallback
    pollIntervalRef.current = globalThis.setInterval(() => {
      onMessageRef.current();
    }, 5000);
  };

  const connectWebSocket = () => {
    try {
      const protocol = globalThis.location.protocol === "https:" ? "wss" : "ws";
      const socket = new WebSocket(`${protocol}://${globalThis.location.host}${path}`);

      socket.addEventListener("open", () => {
        handleSocketOpen(socket);
      });

      socket.addEventListener("message", handleSocketMessage);
      socket.addEventListener("close", handleSocketCloseOrError);
      socket.addEventListener("error", handleSocketCloseOrError);
    } catch {
      // Failed to create WebSocket, fall back to polling
      startPollingFallback();
    }
  };

  useEffect(() => {
    let isComponentMounted = true;

    if (isComponentMounted) {
      connectWebSocket();
    }

    return () => {
      isComponentMounted = false;

      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }

      if (pingIntervalRef.current !== null) {
        globalThis.clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }

      if (reconnectTimeoutRef.current !== null) {
        globalThis.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      if (pollIntervalRef.current !== null) {
        globalThis.clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [path]);
}
