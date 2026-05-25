import type { UserProfileDto } from "@ps2-challenge/shared";
import { Copy, Eye, EyeOff, RefreshCw, UserRound } from "lucide-react";
import { useState } from "react";
import { api } from "../api.js";
import { ErrorMessage, Loading } from "../components/Status.js";
import { useAsync } from "../hooks.js";

export function UserPage() {
  const user = useAsync(loadUserProfile, []);
  const [showApiKey, setShowApiKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  if (user.loading) return <Loading />;
  if (user.error) return <ErrorMessage message={user.error} />;
  if (!user.data?.isAuthenticated) {
    return (
      <section className="panel narrow auth-message">
        <h1>Not Logged In</h1>
        <p>You need to be logged in to view this page.</p>
        <a className="button-link twitch" href="/api/auth/login">Login with Twitch</a>
      </section>
    );
  }

  const regenerate = async () => {
    if (!globalThis.confirm("Are you sure you want to regenerate your API key? This will invalidate the current key.")) {
      return;
    }
    setRegenerating(true);
    setApiKeyError(null);
    try {
      const next = await api.regenerateApiKey();
      user.setData({ ...user.data!, apiKey: next.apiKey });
      setShowApiKey(true);
    } catch (error) {
      setApiKeyError(error instanceof Error ? error.message : String(error));
    } finally {
      setRegenerating(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(user.data?.apiKey ?? "");
      setCopied(true);
      setApiKeyError(null);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setApiKeyError("Failed to copy API key to clipboard");
    }
  };

  return (
    <section className="page user-profile-page">
      <section className="profile-card">
        <header className="profile-header">
          <div className="profile-avatar">
            {user.data.profileImageUrl ? <img src={user.data.profileImageUrl} alt={user.data.username ?? "Profile"} /> : <span><UserRound /></span>}
          </div>
          <div>
            <h1>{user.data.username}</h1>
            <span className={`role-badge ${roleClass(user.data.role)}`}>{user.data.role}</span>
          </div>
        </header>

        <dl className="profile-details">
          <div><dt>Twitch ID</dt><dd>{user.data.twitchId}</dd></div>
          <div><dt>Member Since</dt><dd>{formatDate(user.data.createdAt)}</dd></div>
          <div><dt>Last Login</dt><dd>{formatDateTime(user.data.lastLoginAt)}</dd></div>
        </dl>

        <div className="api-key-section">
          <h2>API Key</h2>
          <div className="api-key-row">
            <input readOnly type={showApiKey ? "text" : "password"} value={user.data.apiKey ?? ""} aria-label="API key" />
            <button className="icon-button" onClick={() => setShowApiKey(!showApiKey)} aria-label={showApiKey ? "Hide API key" : "Show API key"}>{showApiKey ? <EyeOff /> : <Eye />}</button>
            <button onClick={copy}><Copy />{copied ? "Copied" : "Copy"}</button>
            <button onClick={regenerate} disabled={regenerating}><RefreshCw className={regenerating ? "spin" : undefined} />{regenerating ? "Regenerating..." : "Regenerate"}</button>
          </div>
          {apiKeyError ? <div className="status error">{apiKeyError}</div> : null}
        </div>

        <div className="profile-actions">
          <a className="button-link secondary" href="/">Back to Home</a>
          <a className="button-link danger" href="/api/auth/logout">Logout</a>
        </div>
      </section>
    </section>
  );
}

async function loadUserProfile(): Promise<UserProfileDto> {
  const response = await fetch("/api/user", {
    credentials: "include",
    headers: { "content-type": "application/json" }
  });
  if (response.status === 401) {
    return { isAuthenticated: false };
  }
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { message?: string; error?: string };
      detail = body.message ?? body.error ?? detail;
    } catch {
      // Keep status text.
    }
    throw new Error(detail);
  }
  return (await response.json()) as UserProfileDto;
}

function roleClass(role: string | null | undefined) {
  if (role === "Admin") {
    return "role-admin";
  }
  if (role === "User") {
    return "role-user";
  }
  return "role-default";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: "long", day: "2-digit", year: "numeric" });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { month: "long", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
