import type { AdminUserDto, RoleDto } from "@ps2-challenge/shared";
import { Clock, ExternalLink, Gamepad2, Image, Radio, RefreshCw, Shield, UserRound, Users } from "lucide-react";
import { type ReactNode, useState } from "react";
import { api, type CoverRefreshProgress, type HowLongToBeatRefreshProgress } from "../api.js";
import { ErrorMessage, Loading } from "../components/Status.js";
import { useAsync } from "../hooks.js";

type StatusMessage = { kind: "success" | "error"; message: string };

export function Admin() {
  const users = useAsync(() => api.adminUsers(), []);
  const roles = useAsync(() => api.roles(), []);
  const [coverUpdating, setCoverUpdating] = useState(false);
  const [coverStatus, setCoverStatus] = useState<StatusMessage | null>(null);
  const [coverProgress, setCoverProgress] = useState<CoverRefreshProgress | null>(null);
  const [howLongToBeatUpdating, setHowLongToBeatUpdating] = useState(false);
  const [howLongToBeatStatus, setHowLongToBeatStatus] = useState<StatusMessage | null>(null);
  const [howLongToBeatProgress, setHowLongToBeatProgress] = useState<HowLongToBeatRefreshProgress | null>(null);
  const [runnerLogosUpdating, setRunnerLogosUpdating] = useState(false);
  const [runnerLogosStatus, setRunnerLogosStatus] = useState<StatusMessage | null>(null);
  const [twitchStatsUpdating, setTwitchStatsUpdating] = useState(false);
  const [twitchStatsStatus, setTwitchStatsStatus] = useState<StatusMessage | null>(null);
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
        kind: statusKindForErrors(result.errors),
        message: `Update completed. Updated: ${result.updated}, Skipped: ${result.skipped}, Errors: ${result.errors}`
      });
    } catch (error) {
      setCoverStatus({ kind: "error", message: `Error updating covers: ${errorMessage(error)}` });
    } finally {
      setCoverUpdating(false);
    }
  };

  const refreshHowLongToBeat = async () => {
    setHowLongToBeatUpdating(true);
    setHowLongToBeatStatus(null);
    setHowLongToBeatProgress({ status: "starting", total: 0, processed: 0, updated: 0, unchanged: 0, notFound: 0, errors: 0 });
    try {
      const result = await api.refreshHowLongToBeatWithProgress(setHowLongToBeatProgress);
      setHowLongToBeatStatus({
        kind: statusKindForErrors(result.errors),
        message: `Update completed. Updated: ${result.updated}, Unchanged: ${result.unchanged}, Not found: ${result.notFound}, Errors: ${result.errors}`
      });
    } catch (error) {
      setHowLongToBeatStatus({
        kind: "error",
        message: `Error updating HowLongToBeat times: ${errorMessage(error)}`
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

  const refreshRunnerLogos = async () => {
    setRunnerLogosUpdating(true);
    setRunnerLogosStatus(null);
    try {
      const result = await api.refreshChallengeRunnerLogos();
      setRunnerLogosStatus({
        kind: statusKindForErrors(result.errors),
        message: `Update completed. Updated: ${result.updated}, Unchanged: ${result.unchanged}, Errors: ${result.errors}`
      });
    } catch (error) {
      setRunnerLogosStatus({
        kind: "error",
        message: `Error updating profile pictures: ${errorMessage(error)}`
      });
    } finally {
      setRunnerLogosUpdating(false);
    }
  };

  const refreshTwitchStats = async () => {
    setTwitchStatsUpdating(true);
    setTwitchStatsStatus(null);
    try {
      const result = await api.refreshTwitchStreamStats();
      setTwitchStatsStatus({
        kind: "success",
        message: `Update completed for ${result.channelLogin}. Checked: ${result.checked}, Upserted: ${result.upserted}, Skipped: ${result.skipped}`
      });
    } catch (error) {
      setTwitchStatsStatus({
        kind: "error",
        message: `Error updating Twitch statistics: ${errorMessage(error)}`
      });
    } finally {
      setTwitchStatsUpdating(false);
    }
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

      <MaintenancePanel
        icon={<Image />}
        title="Update Game Cover Images"
        description="Starts 1 minute after startup, then refreshes automatically every 24 hours."
        updating={coverUpdating}
        idleButtonLabel="Update Cover Images Now"
        onRefresh={refreshCovers}
        status={coverStatus}
        progress={{ value: coverProgress, ariaLabel: "Cover refresh progress", currentPrefix: "Checking" }}
      />

      <MaintenancePanel
        icon={<Clock />}
        title="Update HowLongToBeat Times"
        description="Starts 5 minutes after startup, then refreshes every 6 hours. Due backlogs continue in 5-minute batches."
        updating={howLongToBeatUpdating}
        idleButtonLabel="Update Times Now"
        onRefresh={refreshHowLongToBeat}
        status={howLongToBeatStatus}
        progress={{ value: howLongToBeatProgress, ariaLabel: "HowLongToBeat refresh progress", currentPrefix: "Searching" }}
      />

      <MaintenancePanel
        icon={<UserRound />}
        title="Update Challenge Runner Profile Pictures"
        description="Starts 3 minutes after startup, then refreshes automatically every 2 hours."
        updating={runnerLogosUpdating}
        idleButtonLabel="Update Profile Pictures Now"
        onRefresh={refreshRunnerLogos}
        status={runnerLogosStatus}
      />

      <MaintenancePanel
        icon={<Radio />}
        title="Update Twitch Stream Statistics"
        description="Starts 2 minutes after startup, then refreshes automatically every 6 hours."
        updating={twitchStatsUpdating}
        idleButtonLabel="Update Twitch Statistics Now"
        onRefresh={refreshTwitchStats}
        status={twitchStatsStatus}
      />

      <UserManagement
        users={users.data ?? []}
        roles={roles.data ?? []}
        roleStatus={roleStatus}
        onUpdateRole={updateRole}
      />
    </section>
  );
}

function MaintenancePanel({
  icon,
  title,
  description,
  updating,
  idleButtonLabel,
  onRefresh,
  status,
  progress
}: Readonly<{
  icon: ReactNode;
  title: string;
  description: string;
  updating: boolean;
  idleButtonLabel: string;
  onRefresh: () => Promise<void>;
  status: StatusMessage | null;
  progress?: {
    value: RefreshProgressShape | null;
    ariaLabel: string;
    currentPrefix: string;
  };
}>) {
  const showProgress = progress && (updating || progress.value);

  return (
    <section className="panel maintenance-panel">
      <header>
        <div>
          <h2>{icon}{title}</h2>
          <p className="muted">{description}</p>
        </div>
        <button onClick={onRefresh} disabled={updating}>
          <RefreshCw className={updating ? "spin" : undefined} />
          {updating ? "Updating..." : idleButtonLabel}
        </button>
      </header>
      {showProgress ? (
        <RefreshProgress progress={progress.value} ariaLabel={progress.ariaLabel} currentPrefix={progress.currentPrefix} />
      ) : null}
      {status ? <div className={`update-message ${status.kind}`}>{status.message}</div> : null}
    </section>
  );
}

function UserManagement({
  users,
  roles,
  roleStatus,
  onUpdateRole
}: Readonly<{
  users: AdminUserDto[];
  roles: RoleDto[];
  roleStatus: string | null;
  onUpdateRole: (userId: number, roleId: number) => Promise<void>;
}>) {
  return (
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
          {users.map((user) => (
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
                  onChange={(event) => void onUpdateRole(user.id, Number(event.target.value))}
                >
                  {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

type RefreshProgressShape = {
  total: number;
  processed: number;
  updated: number;
  skipped?: number;
  unchanged?: number;
  notFound?: number;
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
        {progress?.unchanged === undefined ? <span>Skipped {progress?.skipped ?? 0}</span> : <span>Unchanged {progress.unchanged}</span>}
        {progress?.notFound === undefined ? null : <span>Not found {progress.notFound}</span>}
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

function statusKindForErrors(errors: number): StatusMessage["kind"] {
  return errors > 0 ? "error" : "success";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}
