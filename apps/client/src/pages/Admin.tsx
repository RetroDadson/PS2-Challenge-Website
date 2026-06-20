import { Clock, ExternalLink, Gamepad2, Image, RefreshCw, Shield, UserRound, Users } from "lucide-react";
import { useState } from "react";
import { api, type CoverRefreshProgress, type HowLongToBeatRefreshProgress } from "../api.js";
import { ErrorMessage, Loading } from "../components/Status.js";
import { useAsync } from "../hooks.js";

export function Admin() {
  const users = useAsync(() => api.adminUsers(), []);
  const roles = useAsync(() => api.roles(), []);
  const [coverUpdating, setCoverUpdating] = useState(false);
  const [coverStatus, setCoverStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [coverProgress, setCoverProgress] = useState<CoverRefreshProgress | null>(null);
  const [howLongToBeatUpdating, setHowLongToBeatUpdating] = useState(false);
  const [howLongToBeatStatus, setHowLongToBeatStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [howLongToBeatProgress, setHowLongToBeatProgress] = useState<HowLongToBeatRefreshProgress | null>(null);
  const [roleStatus, setRoleStatus] = useState<string | null>(null);

  if (users.loading || roles.loading) return <Loading />;
  if (users.error === "Forbidden" || roles.error === "Forbidden") {
    return (
      <section className="panel narrow auth-message">
        <h1>Access Denied</h1>
        <p>You need to be an administrator to access this page.</p>
        <a className="button-link" href="/">Go Home</a>
      </section>
    );
  }
  if (users.error || roles.error) return <ErrorMessage message={users.error ?? roles.error ?? ""} />;

  const refreshCovers = async () => {
    setCoverUpdating(true);
    setCoverStatus(null);
    setCoverProgress({ status: "starting", total: 0, processed: 0, updated: 0, skipped: 0, errors: 0 });
    try {
      const result = await api.refreshCoversWithProgress(setCoverProgress);
      setCoverStatus({
        kind: result.errors > 0 ? "error" : "success",
        message: `Update completed. Updated: ${result.updated}, Skipped: ${result.skipped}, Errors: ${result.errors}`
      });
    } catch (error) {
      setCoverStatus({ kind: "error", message: `Error updating covers: ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setCoverUpdating(false);
    }
  };

  const refreshHowLongToBeat = async () => {
    setHowLongToBeatUpdating(true);
    setHowLongToBeatStatus(null);
    setHowLongToBeatProgress({ status: "starting", total: 0, processed: 0, updated: 0, skipped: 0, errors: 0 });
    try {
      const result = await api.refreshHowLongToBeatWithProgress(setHowLongToBeatProgress);
      setHowLongToBeatStatus({
        kind: result.errors > 0 ? "error" : "success",
        message: `Update completed. Updated: ${result.updated}, Skipped: ${result.skipped}, Errors: ${result.errors}`
      });
    } catch (error) {
      setHowLongToBeatStatus({
        kind: "error",
        message: `Error updating HowLongToBeat times: ${error instanceof Error ? error.message : String(error)}`
      });
    } finally {
      setHowLongToBeatUpdating(false);
    }
  };

  const updateRole = async (userId: number, roleId: number) => {
    setRoleStatus(null);
    await api.updateRole(userId, roleId);
    setRoleStatus("Role updated");
    await users.reload();
  };

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p>Maintenance</p>
          <h1>Admin Panel</h1>
        </div>
      </header>

      <nav className="admin-nav" aria-label="Admin sections">
        <a href="/games"><Gamepad2 />Games Management</a>
        <a href="/admin" aria-current="page"><Users />User Management</a>
      </nav>

      <section className="panel">
        <h2>Stream Overlays</h2>
        <div className="overlay-links">
          <a href="/votes-overlay" target="_blank" rel="noreferrer">Votes Overlay <ExternalLink /></a>
          <a href="/vote-covers-overlay" target="_blank" rel="noreferrer">Vote Covers Overlay <ExternalLink /></a>
          <a href="/progress-overlay" target="_blank" rel="noreferrer">Progress Overlay <ExternalLink /></a>
          <a href="/blank-overlay" target="_blank" rel="noreferrer">Blank Overlay <ExternalLink /></a>
        </div>
      </section>

      <section className="panel maintenance-panel">
        <header>
          <div>
            <h2><Image />Update Game Cover Images</h2>
          </div>
          <button onClick={refreshCovers} disabled={coverUpdating}>
            <RefreshCw className={coverUpdating ? "spin" : undefined} />{coverUpdating ? "Updating..." : "Update Cover Images Now"}
          </button>
        </header>
        {coverUpdating || coverProgress ? (
          <RefreshProgress progress={coverProgress} ariaLabel="Cover refresh progress" currentPrefix="Checking" />
        ) : null}
        {coverStatus ? <div className={`update-message ${coverStatus.kind}`}>{coverStatus.message}</div> : null}
      </section>

      <section className="panel maintenance-panel">
        <header>
          <div>
            <h2><Clock />Update HowLongToBeat Times</h2>
          </div>
          <button onClick={refreshHowLongToBeat} disabled={howLongToBeatUpdating}>
            <RefreshCw className={howLongToBeatUpdating ? "spin" : undefined} />{howLongToBeatUpdating ? "Updating..." : "Update Times Now"}
          </button>
        </header>
        {howLongToBeatUpdating || howLongToBeatProgress ? (
          <RefreshProgress progress={howLongToBeatProgress} ariaLabel="HowLongToBeat refresh progress" currentPrefix="Searching" />
        ) : null}
        {howLongToBeatStatus ? <div className={`update-message ${howLongToBeatStatus.kind}`}>{howLongToBeatStatus.message}</div> : null}
      </section>

      <section className="panel">
        <header className="section-header">
          <h2><Shield />User Management</h2>
          {roleStatus ? <span className="inline-status">{roleStatus}</span> : null}
        </header>
        <table className="users-table">
          <thead>
            <tr>
              <th>Profile</th>
              <th>Username</th>
              <th>Role</th>
              <th>Created</th>
              <th>Last Login</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(users.data ?? []).map((user) => (
              <tr key={user.id}>
                <td>{user.profileImageUrl ? <img className="avatar" src={user.profileImageUrl} alt={user.username} /> : <span className="avatar-placeholder"><UserRound /></span>}</td>
                <td>{user.username}</td>
                <td><span className={`role-badge ${roleClass(user.role)}`}>{user.role}</span></td>
                <td>{formatDate(user.createdAt)}</td>
                <td>{formatDate(user.lastLoginAt)}</td>
                <td>
                  <select
                    className="role-select"
                    value={user.roleId}
                    aria-label={`Role for ${user.username}`}
                    onChange={(event) => void updateRole(user.id, Number(event.target.value))}
                  >
                    {(roles.data ?? []).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  );
}

type RefreshProgressShape = {
  total: number;
  processed: number;
  updated: number;
  skipped: number;
  errors: number;
  status: string;
  currentGameTitle?: string;
};

function RefreshProgress({
  progress,
  ariaLabel,
  currentPrefix
}: Readonly<{
  progress: RefreshProgressShape | null;
  ariaLabel: string;
  currentPrefix: string;
}>) {
  const total = progress?.total ?? 0;
  const processed = progress?.processed ?? 0;
  const current = refreshProgressMessage(progress, currentPrefix);

  return (
    <div className="cover-refresh-progress" aria-live="polite">
      <div className="progress-line">
        <span>{current}</span>
        <strong>{total > 0 ? `${processed} / ${total}` : "Starting"}</strong>
      </div>
      <progress className="cover-progress-track" max={total || 1} value={processed} aria-label={ariaLabel} />
      <div className="cover-progress-counts">
        <span>Updated {progress?.updated ?? 0}</span>
        <span>Skipped {progress?.skipped ?? 0}</span>
        <span>Errors {progress?.errors ?? 0}</span>
      </div>
    </div>
  );
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

function refreshProgressMessage(progress: RefreshProgressShape | null, currentPrefix: string) {
  if (progress?.currentGameTitle) {
    return `${currentPrefix} ${progress.currentGameTitle}`;
  }
  if (progress?.status === "completed") {
    return "Complete";
  }
  return "Preparing";
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}
