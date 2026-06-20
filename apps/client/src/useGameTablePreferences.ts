import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import {
  normaliseGameTablePreferences,
  readLocalGameTablePreferences,
  writeLocalGameTablePreferences,
  type GameTablePreferences
} from "./gameTablePreferences.js";

type PreferenceSource = "database" | "local";

export type GameTablePreferenceError = Readonly<{
  kind: "load" | "save";
  message: string;
}>;

export function useGameTablePreferences(authenticated: boolean | null) {
  const [preferences, setPreferences] = useState(readLocalGameTablePreferences);
  const [source, setSource] = useState<PreferenceSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<GameTablePreferenceError | null>(null);
  const [loadRetry, setLoadRetry] = useState(0);
  const [saveRetry, setSaveRetry] = useState(0);
  const lastPersisted = useRef<string | null>(null);
  const persistenceSession = useRef(0);
  const latestSave = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const session = persistenceSession.current + 1;
    persistenceSession.current = session;
    latestSave.current++;
    setSaving(false);
    setError(null);

    if (authenticated === null) {
      setSource(null);
      setLoading(true);
      return;
    }

    const localPreferences = readLocalGameTablePreferences();
    if (!authenticated) {
      lastPersisted.current = serialise(localPreferences);
      setPreferences(localPreferences);
      setSource("local");
      setLoading(false);
      return;
    }

    setLoading(true);
    setSource(null);
    api.gameTablePreferences()
      .then((response) => {
        if (persistenceSession.current !== session) return;
        const nextPreferences = normaliseGameTablePreferences(response.preferences ?? localPreferences);
        lastPersisted.current = response.preferences ? serialise(response.preferences) : null;
        setPreferences(nextPreferences);
        setSource("database");
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (persistenceSession.current !== session) return;
        lastPersisted.current = serialise(localPreferences);
        setPreferences(localPreferences);
        setSource(null);
        setError({ kind: "load", message: preferenceErrorMessage("load", cause) });
        setLoading(false);
      });
  }, [authenticated, loadRetry]);

  useEffect(() => {
    if (!source || loading) return;
    const serialised = serialise(preferences);
    if (lastPersisted.current === serialised) return;

    if (source === "local") {
      try {
        writeLocalGameTablePreferences(preferences);
        lastPersisted.current = serialised;
        setError(null);
      } catch (cause: unknown) {
        setError({ kind: "save", message: preferenceErrorMessage("save", cause) });
      }
      return;
    }

    const session = persistenceSession.current;
    const saveId = latestSave.current + 1;
    latestSave.current = saveId;
    setSaving(true);
    setError(null);

    const request = saveQueue.current.then(async () => {
      if (persistenceSession.current !== session) return;
      await api.updateGameTablePreferences(preferences);
    });
    saveQueue.current = request.catch(() => undefined);

    request
      .then(() => {
        if (persistenceSession.current !== session) return;
        lastPersisted.current = serialised;
        if (latestSave.current === saveId) {
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (persistenceSession.current === session && latestSave.current === saveId) {
          setError({ kind: "save", message: preferenceErrorMessage("save", cause) });
        }
      })
      .finally(() => {
        if (persistenceSession.current === session && latestSave.current === saveId) {
          setSaving(false);
        }
      });
  }, [loading, preferences, saveRetry, source]);

  const retry = () => {
    if (error?.kind === "load") {
      setLoadRetry((attempt) => attempt + 1);
    } else if (error?.kind === "save") {
      setSaveRetry((attempt) => attempt + 1);
    }
  };

  return { preferences, setPreferences, loading, saving, error, retry };
}

function serialise(preferences: GameTablePreferences) {
  return JSON.stringify(preferences);
}

function preferenceErrorMessage(action: "load" | "save", cause: unknown) {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return `Could not ${action} your column preferences. ${detail}`;
}
