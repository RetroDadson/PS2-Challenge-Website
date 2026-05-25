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

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    const protocol = globalThis.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${globalThis.location.host}${path}`);
    socket.addEventListener("message", () => onMessageRef.current());
    return () => socket.close();
  }, [path]);
}
