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
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(false);
  const connectionSequenceRef = useRef(0);
  const reconnectAttemptsRef = useRef(0);
  const hasConnectedRef = useRef(false);
  const heartbeatIntervalMs = 25_000;
  const connectionTimeoutMs = 10_000;
  const pollingFallbackIntervalMs = 5_000;
  const baseReconnectDelayMs = 1_000;
  const maxReconnectDelayMs = 30_000;

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const clearReconnectTimer = () => {
    if (reconnectTimeoutRef.current !== null) {
      globalThis.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  };

  const clearPollingFallback = () => {
    if (pollIntervalRef.current !== null) {
      globalThis.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const clearHeartbeat = () => {
    if (pingIntervalRef.current !== null) {
      globalThis.clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  };

  const clearConnectionTimeout = () => {
    if (connectionTimeoutRef.current !== null) {
      globalThis.clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
  };

  const startPollingFallback = () => {
    if (!mountedRef.current || pollIntervalRef.current !== null) {
      return;
    }

    pollIntervalRef.current = globalThis.setInterval(() => {
      onMessageRef.current();
    }, pollingFallbackIntervalMs);
  };

  const scheduleReconnect = () => {
    if (!mountedRef.current || reconnectTimeoutRef.current !== null) {
      return;
    }

    const delay = Math.min(maxReconnectDelayMs, baseReconnectDelayMs * 2 ** reconnectAttemptsRef.current);
    reconnectAttemptsRef.current++;
    reconnectTimeoutRef.current = globalThis.setTimeout(() => {
      reconnectTimeoutRef.current = null;
      connectWebSocket();
    }, delay);
  };

  const startHeartbeat = (socket: WebSocket) => {
    clearHeartbeat();
    pingIntervalRef.current = globalThis.setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send("Ping");
      }
    }, heartbeatIntervalMs);
  };

  const isRealtimeUpdate = (event: MessageEvent) => {
    const payload = typeof event.data === "string" ? event.data : "";
    if (!payload) {
      return true;
    }

    try {
      const parsed = JSON.parse(payload) as { type?: unknown };
      return parsed.type !== "Pong";
    } catch {
      return payload !== "Pong";
    }
  };

  const handleSocketOpen = (socket: WebSocket, connectionId: number) => {
    if (!mountedRef.current || connectionSequenceRef.current !== connectionId) {
      socket.close();
      return;
    }

    socketRef.current = socket;
    clearConnectionTimeout();
    reconnectAttemptsRef.current = 0;
    clearReconnectTimer();
    clearPollingFallback();
    startHeartbeat(socket);

    const shouldRefreshAfterReconnect = hasConnectedRef.current;
    hasConnectedRef.current = true;

    if (shouldRefreshAfterReconnect) {
      onMessageRef.current();
    }
  };

  const handleSocketMessage = (event: MessageEvent, connectionId: number) => {
    if (!mountedRef.current || connectionSequenceRef.current !== connectionId || !isRealtimeUpdate(event)) {
      return;
    }
    onMessageRef.current();
  };

  const connectWebSocket = () => {
    if (!mountedRef.current) {
      return;
    }

    const connectionId = ++connectionSequenceRef.current;
    let hasHandledConnectionLoss = false;

    const handleSocketCloseOrError = () => {
      if (hasHandledConnectionLoss || !mountedRef.current || connectionSequenceRef.current !== connectionId) {
        return;
      }

      hasHandledConnectionLoss = true;
      if (socketRef.current !== null) {
        socketRef.current = null;
      }
      clearConnectionTimeout();
      clearHeartbeat();
      startPollingFallback();
      scheduleReconnect();
    };

    try {
      const protocol = globalThis.location.protocol === "https:" ? "wss" : "ws";
      const socket = new WebSocket(`${protocol}://${globalThis.location.host}${path}`);
      socketRef.current = socket;
      clearConnectionTimeout();
      connectionTimeoutRef.current = globalThis.setTimeout(() => {
        if (socket.readyState === WebSocket.CONNECTING) {
          handleSocketCloseOrError();
          socket.close();
        }
      }, connectionTimeoutMs);

      socket.addEventListener("open", () => {
        handleSocketOpen(socket, connectionId);
      });

      socket.addEventListener("message", (event) => handleSocketMessage(event, connectionId));
      socket.addEventListener("close", handleSocketCloseOrError);
      socket.addEventListener("error", () => {
        handleSocketCloseOrError();
        if (socket.readyState !== WebSocket.CLOSED) {
          socket.close();
        }
      });
    } catch {
      startPollingFallback();
      scheduleReconnect();
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    reconnectAttemptsRef.current = 0;
    hasConnectedRef.current = false;
    connectWebSocket();

    return () => {
      mountedRef.current = false;
      connectionSequenceRef.current++;

      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }

      clearHeartbeat();
      clearConnectionTimeout();
      clearReconnectTimer();
      clearPollingFallback();
    };
  }, [path]);
}
