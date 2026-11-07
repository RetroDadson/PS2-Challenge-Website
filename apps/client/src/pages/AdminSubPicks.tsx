import {
  subGrantEntryCount,
  subGrantTypes,
  subTiers,
  type EligibleGameDto,
  type SubEntryDto,
  type SubGrantDto,
  type SubGrantType,
  type SubPickSettingsDto,
  type SubTier,
  type TwitchUserLookupDto
} from "@ps2-challenge/shared";
import {
  AlertTriangle,
  Archive,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Dices,
  RefreshCw,
  Search,
  Settings,
  Ticket,
  Trash2,
  UserPlus
} from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../api.js";
import { GamePicker } from "../components/GamePicker.js";
import { Stat } from "../components/Stat.js";
import { TwitchTab } from "./AdminSubPicksTwitch.js";
import { Empty, ErrorMessage, Loading } from "../components/Status.js";
import { useAsync } from "../hooks.js";
import { entryStatusClass, entryStatusLabel, grantTypeLabels, tierLabels } from "../subPickLabels.js";

type Tab = "entries" | "twitch" | "settings" | "audit";
type StatusMessage = { kind: "success" | "error"; message: string };
type GrantChanges = { tier: SubTier; grantType: SubGrantType; giftCount: number; entryCount: number; notes: string | null };

type ViewerSummary = {
  key: string;
  name: string;
  grants: SubGrantDto[];
  entries: SubEntryDto[];
  active: number;
  nextDraw: number;
  hundreds: number;
  attention: number;
  lastAdded: string;
};

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "entries", label: "Entries" },
  { id: "twitch", label: "Twitch" },
  { id: "settings", label: "Settings" },
  { id: "audit", label: "Audit Log" }
];

export function AdminSubPicks() {
  const settings = useAsync(() => api.subPickSettings(), []);
  const review = useAsync(() => api.eventSubReview(), []);
  const reviewCount = review.data?.length ?? 0;
  const [params] = useState(() => new URLSearchParams(globalThis.location.search));
  const [tab, setTab] = useState<Tab>(() => initialTab(params.get("tab")));

  if (settings.loading) return <Loading />;
  if (settings.error === "Forbidden" || settings.error === "Unauthorized") {
    return (
      <section className="panel narrow auth-message">
        <h1>Access Denied</h1>
        <p>You need to be an administrator to access this page.</p>
        <a className="button-link" href="/">Go Home</a>
      </section>
    );
  }
  if (settings.error || !settings.data) return <ErrorMessage message={settings.error ?? "Unable to load settings"} />;

  return (
    <section className="page admin-sub-picks-page">
      <header className="page-header">
        <div>
          <p>Admin</p>
          <h1>Sub Picks</h1>
        </div>
        <a className="button-link secondary" href="/admin">Back to Admin</a>
      </header>

      <div className="admin-nav" role="tablist" aria-label="Sub pick sections">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`sub-picks-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`sub-picks-panel-${item.id}`}
            className={tab === item.id ? undefined : "secondary"}
            onClick={() => setTab(item.id)}
          >
            {item.id === "twitch" && reviewCount > 0 ? `${item.label} (${reviewCount} to review)` : item.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`sub-picks-panel-${tab}`} aria-labelledby={`sub-picks-tab-${tab}`}>
        {tab === "entries" ? <EntriesTab settings={settings.data} /> : null}
        {tab === "settings" ? <SettingsTab settings={settings.data} onSaved={(next) => settings.setData(next)} /> : null}
        {tab === "twitch" ? <TwitchTab
            authorisationResult={params.get("eventsub")}
            review={{ items: review.data ?? [], loading: review.loading, error: review.error, reload: () => review.reload() }}
          /> : null}
        {tab === "audit" ? <AuditTab /> : null}
      </div>
    </section>
  );
}

function EntriesTab({ settings }: Readonly<{ settings: SubPickSettingsDto }>) {
  const grants = useAsync(() => api.subGrants(), []);
  const games = useAsync(() => api.subPickEligibleGames(), []);
  const summary = useAsync(() => api.subPicksSummary(), []);
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const viewers = useMemo(() => summariseViewers(grants.data ?? []), [grants.data]);
  const visibleViewers = useMemo(() => {
    const needle = filter.trim().toLocaleLowerCase("en-GB");
    return needle ? viewers.filter((viewer) => viewer.name.toLocaleLowerCase("en-GB").includes(needle)) : viewers;
  }, [filter, viewers]);
  const attention = viewers.flatMap((viewer) => viewer.entries.filter(needsAttention).map((entry) => ({ viewer, entry })));
  const needsPick = attention.filter(({ entry }) => entry.pool === "awaiting_pick").length;

  const reload = async () => {
    await Promise.all([grants.reload(), games.reload(), summary.reload()]);
  };

  return (
    <>
      {summary.data ? (
        <div className="stats-grid">
          <Stat
            tone="progress"
            icon={CalendarClock}
            label={`Next ${summary.data.schedule.nextDrawKind} draw: Game ${summary.data.schedule.nextDrawGameNumber}`}
            value={summary.data.schedule.gamesUntilNextDraw === 0 ? "Next game" : `${summary.data.schedule.gamesUntilNextDraw} to go`}
          />
          <Stat tone="challenge" icon={Dices} label="Entries in Next Draw" value={summary.data.nextDrawPool.totalEntries} />
          <Stat tone="remaining-games" icon={Archive} label="100s Pool" value={summary.data.hundredsPool.totalEntries} />
          <Stat tone="deaths" icon={AlertTriangle} label="Need a Pick" value={needsPick} />
          <Stat tone="deaths-most" icon={RefreshCw} label="Need a New Pick" value={attention.length - needsPick} />
        </div>
      ) : null}

      <section className="panel" aria-labelledby="sub-attention-heading">
        <header className="section-header">
          <h2 id="sub-attention-heading"><AlertTriangle aria-hidden />Needs Attention</h2>
          <span className="muted">{attention.length} {attention.length === 1 ? "entry" : "entries"}</span>
        </header>
        {!grants.loading && attention.length === 0 ? <Empty>Every entry has a valid pick.</Empty> : null}
        <ul className="sub-entry-list">
          {attention.map(({ viewer, entry }) => (
            <EntryRow key={entry.id} entry={entry} viewerName={viewer.name} games={games.data ?? []} onChanged={reload} />
          ))}
        </ul>
      </section>

      <section className="panel" aria-labelledby="sub-viewers-heading">
        <header className="section-header">
          <h2 id="sub-viewers-heading"><Ticket aria-hidden />Viewers</h2>
          <div className="sub-viewer-toolbar">
            <label className="search">
              <Search aria-hidden />
              <span className="visually-hidden">Filter by viewer</span>
              <input type="search" placeholder="Filter by viewer" value={filter} onChange={(event) => setFilter(event.target.value)} />
            </label>
            <button type="button" aria-expanded={adding} onClick={() => setAdding((value) => !value)}><UserPlus aria-hidden />Add Entries</button>
          </div>
        </header>
        {adding ? <AddEntriesForm settings={settings} onAdded={reload} /> : null}
        {grants.loading ? <Loading /> : null}
        {grants.error ? <ErrorMessage message={grants.error} /> : null}
        {!grants.loading && !grants.error && visibleViewers.length === 0 ? <Empty>No entries yet.</Empty> : null}
        {visibleViewers.length > 0 ? (
          <div className="table-scroll">
            <table className="data-table sub-viewer-table">
              <thead>
                <tr><th>Viewer</th><th>Entries</th><th>Next Draw</th><th>100s Pool</th><th>Needs Attention</th><th>Last Added</th></tr>
              </thead>
              <tbody>
                {visibleViewers.map((viewer) => (
                  <ViewerRows key={viewer.key} viewer={viewer} games={games.data ?? []} onChanged={reload} />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  );
}

function ViewerRows({ viewer, games, onChanged }: Readonly<{ viewer: ViewerSummary; games: EligibleGameDto[]; onChanged: () => Promise<void> }>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className={viewer.attention > 0 ? "sub-viewer-needs-attention" : undefined}>
        <td data-label="Viewer">
          <button type="button" className="sub-viewer-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            {open ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
            {viewer.name}
          </button>
        </td>
        <td data-label="Entries">{viewer.active}</td>
        <td data-label="Next Draw">{viewer.nextDraw}</td>
        <td data-label="100s Pool">{viewer.hundreds}</td>
        <td data-label="Needs Attention">{viewer.attention > 0 ? <span className="badge status-inprogress">{viewer.attention}</span> : 0}</td>
        <td data-label="Last Added">{new Date(viewer.lastAdded).toLocaleString()}</td>
      </tr>
      {open ? (
        <tr className="sub-viewer-details">
          <td colSpan={6}>
            <ul className="sub-entry-list" aria-label={`Entries for ${viewer.name}`}>
              {viewer.entries.map((entry) => (
                <EntryRow key={entry.id} entry={entry} games={games} onChanged={onChanged} />
              ))}
            </ul>
            <h3>How They Earned Them</h3>
            <div className="sub-grant-list">
              {viewer.grants.map((grant) => (
                <GrantRow key={grant.id} grant={grant} name={viewer.name} onChanged={onChanged} />
              ))}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function EntryRow({
  entry,
  viewerName,
  games,
  onChanged
}: Readonly<{ entry: SubEntryDto; viewerName?: string; games: EligibleGameDto[]; onChanged: () => Promise<void> }>) {
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmMessage = viewerName ? `Remove entry ${entry.id} for ${viewerName}?` : `Remove entry ${entry.id}?`;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setPicking(false);
      await onChanged();
    } catch (error_) {
      setError(errorMessage(error_));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!globalThis.confirm(confirmMessage)) return;
    await run(() => api.deleteSubEntry(entry.id));
  };

  return (
    <li className="sub-entry">
      <div className="sub-entry-summary">
        {viewerName ? <strong>{viewerName}</strong> : null}
        <span className="muted">Entry {entry.id}</span>
        <span>{entry.gameTitle ?? "No game picked"}</span>
        <span className={`badge ${entryStatusClass(entry)}`}>{entryStatusLabel(entry)}</span>
        {entry.canChangePick && !picking ? (
          <button type="button" className="secondary" disabled={busy} onClick={() => setPicking(true)} aria-label={`Set pick for entry ${entry.id}`}>
            {entry.gameId ? "Change Pick" : "Pick a Game"}
          </button>
        ) : null}
        {entry.status === "undrawn" || entry.status === "in_100s_pool" ? (
          <button type="button" className="icon-button" disabled={busy} onClick={() => void remove()} aria-label={`Remove entry ${entry.id}`}><Trash2 aria-hidden /></button>
        ) : null}
      </div>
      {picking ? (
        <GamePicker
          games={games}
          currentGameId={entry.gameId}
          busy={busy}
          onSave={(gameId) => void run(() => api.setSubPickForViewer(entry.id, gameId))}
          onCancel={() => setPicking(false)}
        />
      ) : null}
      {error ? <div className="status error" role="alert">{error}</div> : null}
    </li>
  );
}

function GrantRow({ grant, name, onChanged }: Readonly<{ grant: SubGrantDto; name: string; onChanged: () => Promise<void> }>) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setEditing(false);
      await onChanged();
    } catch (error_) {
      setError(errorMessage(error_));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!globalThis.confirm(`Remove all of ${name}'s entries from this grant?`)) return;
    await run(() => api.deleteSubGrant(grant.id));
  };

  return (
    <article className="sub-grant" aria-label={`Grant ${grant.id} for ${name}`}>
      <header className="sub-grant-header">
        <div>
          <span>
            {tierLabels[grant.tier]} · {grantTypeLabels[grant.grantType]}{grant.grantType === "gift" ? ` ×${grant.giftCount}` : ""} · {grant.entryCount} {grant.entryCount === 1 ? "entry" : "entries"}
          </span>
          <small className="muted">
            {grant.source === "manual" ? `Added by ${grant.createdBy ?? "an admin"}` : "From Twitch"} on {new Date(grant.createdAt).toLocaleString()}
            {grant.notes ? ` · ${grant.notes}` : ""}
          </small>
        </div>
        <div className="actions">
          <button type="button" className="secondary" disabled={busy} onClick={() => setEditing((value) => !value)} aria-label={`Edit grant ${grant.id}`}>Edit</button>
          <button type="button" className="danger" disabled={busy} onClick={() => void remove()} aria-label={`Remove grant ${grant.id}`}>Remove</button>
        </div>
      </header>
      {editing ? <GrantEditor grant={grant} busy={busy} onSave={(changes) => run(() => api.updateSubGrant(grant.id, changes))} /> : null}
      {error ? <div className="status error" role="alert">{error}</div> : null}
    </article>
  );
}

function AddEntriesForm({ settings, onAdded }: Readonly<{ settings: SubPickSettingsDto; onAdded: () => Promise<void> }>) {
  const [login, setLogin] = useState("");
  const [viewer, setViewer] = useState<TwitchUserLookupDto | null>(null);
  const [tier, setTier] = useState<SubTier>("1000");
  const [grantType, setGrantType] = useState<SubGrantType>("new");
  const [giftCount, setGiftCount] = useState(1);
  const [entryOverride, setEntryOverride] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const calculated = subGrantEntryCount({ tier, grantType, giftCount }, settings);
  const entryCount = entryOverride ?? calculated;

  const lookup = async () => {
    setBusy(true);
    setStatus(null);
    setViewer(null);
    try {
      setViewer(await api.lookupTwitchUser(login.trim()));
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!viewer) return;
    setBusy(true);
    setStatus(null);
    try {
      const grant = await api.createSubGrant({
        twitchUserId: viewer.twitchUserId,
        twitchLogin: viewer.login,
        twitchDisplayName: viewer.displayName,
        tier,
        grantType,
        ...(grantType === "gift" ? { giftCount } : {}),
        ...(entryOverride === null ? {} : { entryCount: entryOverride }),
        notes: notes.trim() || null
      });
      setStatus({ kind: "success", message: `Added ${grant.entryCount} ${grant.entryCount === 1 ? "entry" : "entries"} for ${grant.twitchDisplayName}` });
      setLogin("");
      setViewer(null);
      setEntryOverride(null);
      setNotes("");
      await onAdded();
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="sub-add-entries" aria-labelledby="add-entries-heading">
      <h3 id="add-entries-heading">Add Entries</h3>
      <p className="muted">Use this for silent resubs, anonymous gifts and corrections. Viewers are matched by Twitch user ID, so look them up first.</p>
      <form className="form-grid" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <label>
          <span>Twitch username</span>
          <input value={login} onChange={(event) => { setLogin(event.target.value); setViewer(null); }} autoComplete="off" />
        </label>
        <button type="button" className="secondary" disabled={busy || !login.trim()} onClick={() => void lookup()}>Look Up</button>
        <p className="wide muted" aria-live="polite">{viewer ? `Found ${viewer.displayName} (Twitch ID ${viewer.twitchUserId})` : ""}</p>
        <label>
          <span>Tier</span>
          <select value={tier} onChange={(event) => { setTier(event.target.value as SubTier); setEntryOverride(null); }}>
            {subTiers.map((value) => <option key={value} value={value}>{tierLabels[value]}</option>)}
          </select>
        </label>
        <label>
          <span>Type</span>
          <select value={grantType} onChange={(event) => { setGrantType(event.target.value as SubGrantType); setEntryOverride(null); }}>
            {subGrantTypes.map((value) => <option key={value} value={value}>{grantTypeLabels[value]}</option>)}
          </select>
        </label>
        {grantType === "gift" ? (
          <label>
            <span>Subs gifted</span>
            <input type="number" min={1} max={1000} value={giftCount} onChange={(event) => { setGiftCount(Math.max(1, Number(event.target.value) || 1)); setEntryOverride(null); }} />
          </label>
        ) : null}
        <label>
          <span>Number of entries</span>
          <input type="number" min={0} max={5000} value={entryCount} onChange={(event) => setEntryOverride(Math.max(0, Number(event.target.value) || 0))} />
        </label>
        <label className="wide">
          <span>Notes</span>
          <input value={notes} maxLength={500} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <div className="wide actions">
          <button type="submit" disabled={busy || !viewer}>Save Entries</button>
        </div>
      </form>
      {status ? <output className={`status${status.kind === "error" ? " error" : ""}`}>{status.message}</output> : null}
    </section>
  );
}

function GrantEditor({ grant, busy, onSave }: Readonly<{ grant: SubGrantDto; busy: boolean; onSave: (changes: GrantChanges) => Promise<unknown> }>) {
  const [tier, setTier] = useState(grant.tier);
  const [grantType, setGrantType] = useState(grant.grantType);
  const [giftCount, setGiftCount] = useState(grant.giftCount);
  const [entryCount, setEntryCount] = useState(grant.entryCount);
  const [notes, setNotes] = useState(grant.notes ?? "");

  return (
    <form
      className="form-grid sub-grant-editor"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({ tier, grantType, giftCount, entryCount, notes: notes.trim() || null });
      }}
    >
      <label>
        <span>Tier</span>
        <select value={tier} onChange={(event) => setTier(event.target.value as SubTier)}>
          {subTiers.map((value) => <option key={value} value={value}>{tierLabels[value]}</option>)}
        </select>
      </label>
      <label>
        <span>Type</span>
        <select value={grantType} onChange={(event) => setGrantType(event.target.value as SubGrantType)}>
          {subGrantTypes.map((value) => <option key={value} value={value}>{grantTypeLabels[value]}</option>)}
        </select>
      </label>
      <label>
        <span>Subs gifted</span>
        <input type="number" min={1} max={1000} value={giftCount} onChange={(event) => setGiftCount(Math.max(1, Number(event.target.value) || 1))} />
      </label>
      <label>
        <span>Number of entries</span>
        <input type="number" min={0} max={5000} value={entryCount} onChange={(event) => setEntryCount(Math.max(0, Number(event.target.value) || 0))} />
      </label>
      <label className="wide">
        <span>Notes</span>
        <input value={notes} maxLength={500} onChange={(event) => setNotes(event.target.value)} />
      </label>
      <div className="wide actions">
        <button type="submit" disabled={busy}>Save Grant</button>
      </div>
    </form>
  );
}

function SettingsTab({ settings, onSaved }: Readonly<{ settings: SubPickSettingsDto; onSaved: (settings: SubPickSettingsDto) => void }>) {
  const [draft, setDraft] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const numberField = (key: "tier1Entries" | "tier2Entries" | "tier3Entries" | "spinDurationSeconds") => ({
    value: draft[key],
    onChange: (event: { target: { value: string } }) => setDraft({ ...draft, [key]: Number(event.target.value) })
  });

  const submit = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const saved = await api.updateSubPickSettings(draft);
      onSaved(saved);
      setDraft(saved);
      setStatus({ kind: "success", message: "Settings saved. New tier values apply to entries added from now on." });
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel" aria-labelledby="sub-settings-heading">
      <h2 id="sub-settings-heading"><Settings aria-hidden />Settings</h2>
      <form className="form-grid" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <label>Tier 1 and Prime entries<input type="number" min={0} max={100} {...numberField("tier1Entries")} /></label>
        <label>Tier 2 entries<input type="number" min={0} max={100} {...numberField("tier2Entries")} /></label>
        <label>Tier 3 entries<input type="number" min={0} max={100} {...numberField("tier3Entries")} /></label>
        <label>Wheel spin seconds<input type="number" min={1} max={120} {...numberField("spinDurationSeconds")} /></label>
        <label className="wide">
          <span>Overlay message</span>
          <textarea rows={2} maxLength={300} value={draft.overlayMessage} onChange={(event) => setDraft({ ...draft, overlayMessage: event.target.value })} />
        </label>
        <p className="wide muted">
          The overlay link and its timing options are on the <a href="/admin">Admin page</a> under Stream Overlays.
        </p>
        <div className="wide actions">
          <button type="submit" disabled={busy}>Save Settings</button>
        </div>
      </form>
      {status ? <output className={`status${status.kind === "error" ? " error" : ""}`}>{status.message}</output> : null}
    </section>
  );
}

function AuditTab() {
  const audit = useAsync(() => api.subPickAudit(), []);
  return (
    <section className="panel" aria-labelledby="sub-audit-heading">
      <h2 id="sub-audit-heading"><ClipboardList aria-hidden />Audit Log</h2>
      {audit.loading ? <Loading /> : null}
      {audit.error ? <ErrorMessage message={audit.error} /> : null}
      {audit.data?.length === 0 ? <Empty>No changes recorded yet.</Empty> : null}
      {audit.data?.length ? (
        <div className="table-scroll">
          <table className="data-table sub-audit-table">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
            <tbody>
              {audit.data.map((row) => (
                <tr key={row.id}>
                  <td data-label="When">{new Date(row.createdAt).toLocaleString()}</td>
                  <td data-label="Who">{row.actor ?? "Unknown"}</td>
                  <td data-label="Action">{row.action}</td>
                  <td data-label="Target">{row.targetType}{row.targetId === null ? "" : ` ${row.targetId}`}</td>
                  <td data-label="Details"><code>{JSON.stringify(row.details)}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function initialTab(value: string | null): Tab {
  return tabs.some((item) => item.id === value) ? (value as Tab) : "entries";
}

function needsAttention(entry: SubEntryDto): boolean {
  return entry.pool === "awaiting_pick" || entry.pool === "needs_new_pick";
}

function summariseViewers(grants: SubGrantDto[]): ViewerSummary[] {
  const viewers = new Map<string, ViewerSummary>();
  for (const grant of grants) {
    const key = grant.twitchUserId ?? `grant-${grant.id}`;
    const viewer = viewers.get(key) ?? {
      key,
      name: grant.twitchDisplayName ?? grant.twitchLogin ?? "Unknown viewer",
      grants: [],
      entries: [],
      active: 0,
      nextDraw: 0,
      hundreds: 0,
      attention: 0,
      lastAdded: grant.createdAt
    };
    viewer.grants.push(grant);
    viewer.entries.push(...grant.entries);
    if (grant.createdAt > viewer.lastAdded) viewer.lastAdded = grant.createdAt;
    viewers.set(key, viewer);
  }
  return [...viewers.values()]
    .map((viewer) => {
      const entries = [...viewer.entries].sort((left, right) => left.id - right.id);
      return {
        ...viewer,
        entries,
        active: entries.filter((entry) => entry.status !== "voided").length,
        nextDraw: entries.filter((entry) => entry.pool === "next_draw").length,
        hundreds: entries.filter((entry) => entry.pool === "100s_pool").length,
        attention: entries.filter(needsAttention).length
      };
    })
    .sort((left, right) => right.attention - left.attention || left.name.localeCompare(right.name, "en-GB"));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
