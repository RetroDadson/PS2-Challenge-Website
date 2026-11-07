import type { SubDrawDto, SubPickSettingsDto, SubWheelDto } from "@ps2-challenge/shared";
import { Check, Dices, ExternalLink, Gamepad2, RotateCcw, Shuffle, Ticket, X } from "lucide-react";
import { useState } from "react";
import { api } from "../api.js";
import { Stat } from "../components/Stat.js";
import { ErrorMessage, Loading } from "../components/Status.js";
import { Wheel, wheelLabel, WheelReadout } from "../components/Wheel.js";
import { formatOdds } from "../subPickLabels.js";

type WheelAction = "shuffle" | "spin" | "respin" | "accept" | "cancel";
export type WheelData = { data: SubWheelDto | null; loading: boolean; error: string | null; reload: () => Promise<void>; clockOffsetMs: number };

export function WheelTab({
  wheel,
  settings,
  onSettingsSaved
}: Readonly<{ wheel: WheelData; settings: SubPickSettingsDto; onSettingsSaved: (settings: SubPickSettingsDto) => void }>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (wheel.loading && !wheel.data) return <Loading />;
  if (!wheel.data) return <ErrorMessage message={wheel.error ?? "Unable to load the wheel"} />;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await wheel.reload();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusy(false);
    }
  };

  const draw = wheel.data.draw;
  const open = draw && (draw.state === "ready" || draw.state === "spinning" || draw.state === "awaiting_decision") ? draw : null;

  return (
    <>
      <section className="panel" aria-labelledby="sub-wheel-heading">
        <header className="section-header">
          <h2 id="sub-wheel-heading"><Dices aria-hidden />{open ? `Game ${open.gameNumber} ${open.kind} Draw` : "Wheel"}</h2>
          <a className="button-link secondary" href="/wheel-overlay" target="_blank" rel="noreferrer">Wheel Overlay <ExternalLink aria-hidden /></a>
        </header>
        {error ? <div className="status error" role="alert">{error}</div> : null}
        {open ? (
          <OpenDraw draw={open} clockOffsetMs={wheel.clockOffsetMs} busy={busy} onAction={(action) => void run(() => api.subDrawAction(open.id, action))} />
        ) : (
          <NoOpenDraw wheel={wheel.data} busy={busy} onOpen={() => void run(() => api.openSubDraw())} />
        )}
      </section>
      <SpinLength settings={settings} onSaved={onSettingsSaved} />
    </>
  );
}

function NoOpenDraw({ wheel, busy, onOpen }: Readonly<{ wheel: SubWheelDto; busy: boolean; onOpen: () => void }>) {
  const last = wheel.draw?.state === "accepted" ? wheel.draw : null;
  return (
    <div className="sub-wheel-idle">
      {wheel.due ? (
        <>
          <p>
            Game {wheel.due.gameNumber} is a {wheel.due.kind} draw. {wheel.due.entryCount} {wheel.due.entryCount === 1 ? "entry is" : "entries are"} waiting.
          </p>
          <div className="actions">
            <button type="button" disabled={busy} onClick={onOpen}><Dices aria-hidden />Open Draw</button>
          </div>
        </>
      ) : (
        <p className="muted">No draw is due right now. A draw opens up when the next game is a 10th or 100th game and someone has a valid pick.</p>
      )}
      {last?.winner ? (
        <p className="sub-wheel-last">
          Last result: game {last.gameNumber} went to <strong>{last.winner.gameTitle}</strong>
          {last.winner.twitchDisplayName ? `, picked by ${last.winner.twitchDisplayName}` : ""}.
        </p>
      ) : null}
    </div>
  );
}

function OpenDraw({
  draw,
  clockOffsetMs,
  busy,
  onAction
}: Readonly<{ draw: SubDrawDto; clockOffsetMs: number; busy: boolean; onAction: (action: WheelAction) => void }>) {
  const result = draw.state === "awaiting_decision" ? draw.spin?.result ?? null : null;
  const [pointer, setPointer] = useState(-1);
  const cancel = () => {
    if (globalThis.confirm(`Cancel the draw for game ${draw.gameNumber}? Nobody wins and the entries go back to waiting.`)) onAction("cancel");
  };

  return (
    <div className="sub-wheel-layout">
      <div className="sub-wheel-stage">
        <Wheel draw={draw} clockOffsetMs={clockOffsetMs} label={wheelLabel(draw)} onPointerChange={setPointer} />
        <WheelReadout draw={draw} sliceIndex={pointer} />
      </div>
      <div className="sub-wheel-side">
        <div className="stats-grid sub-wheel-stats">
          <Stat tone="challenge" icon={Ticket} label="Entries" value={draw.slices.length} />
          <Stat tone="remaining-games" icon={Gamepad2} label="Games" value={draw.odds.length} />
          <Stat tone="deaths-most" icon={RotateCcw} label="Spins" value={draw.spinCount} />
        </div>
        <output className="sub-wheel-status" aria-live="polite">
          {draw.state === "ready" ? readyMessage(draw) : null}
          {draw.state === "spinning" ? "Spinning..." : null}
          {result ? (
            <>
              <strong>Accept or respin</strong>
              <span>
                Accepting starts {result.gameTitle} as game {draw.gameNumber}. It had {result.entries} of {draw.slices.length}{" "}
                {draw.slices.length === 1 ? "entry" : "entries"} ({formatOdds(result.odds)} chance).
              </span>
            </>
          ) : null}
        </output>
        <div className="actions sub-wheel-actions">
          {draw.state === "ready" ? (
            <>
              <button type="button" disabled={busy} onClick={() => onAction("spin")}><Dices aria-hidden />Spin</button>
              <button type="button" className="secondary" disabled={busy} onClick={() => onAction("shuffle")}><Shuffle aria-hidden />Shuffle</button>
            </>
          ) : null}
          {result ? (
            <>
              <button type="button" disabled={busy} onClick={() => onAction("accept")}><Check aria-hidden />Accept {result.gameTitle}</button>
              <button type="button" className="secondary" disabled={busy} onClick={() => onAction("respin")}><RotateCcw aria-hidden />Respin</button>
            </>
          ) : null}
          {draw.state === "spinning" ? null : (
            <button type="button" className="secondary" disabled={busy} onClick={cancel}><X aria-hidden />Cancel Draw</button>
          )}
        </div>
        <div className="table-scroll">
          <table className="data-table sub-wheel-odds">
            <thead><tr><th>Game</th><th>Entries</th><th>Chance</th></tr></thead>
            <tbody>
              {draw.odds.map((game) => (
                <tr key={game.gameId ?? game.gameTitle}>
                  <td data-label="Game">{game.gameTitle}</td>
                  <td data-label="Entries">{game.entries}</td>
                  <td data-label="Chance">{formatOdds(game.odds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function readyMessage(draw: SubDrawDto): string {
  if (draw.locked) return "Ready to spin again. The entries on the wheel stay fixed until the draw finishes.";
  return "Ready to spin. Until the first spin, the wheel picks up new and changed picks as they happen.";
}

function SpinLength({ settings, onSaved }: Readonly<{ settings: SubPickSettingsDto; onSaved: (settings: SubPickSettingsDto) => void }>) {
  const [seconds, setSeconds] = useState(String(settings.spinDurationSeconds));
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const saved = await api.updateSubPickSettings({ ...settings, spinDurationSeconds: Number(seconds) });
      onSaved(saved);
      setMessage({ kind: "success", text: `Spins now last ${saved.spinDurationSeconds} seconds.` });
    } catch (saveError) {
      setMessage({ kind: "error", text: saveError instanceof Error ? saveError.message : String(saveError) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel" aria-labelledby="sub-spin-length-heading">
      <h2 id="sub-spin-length-heading">Spin Length</h2>
      <form className="sub-spin-length" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <label>
          <span>Seconds per spin</span>
          <input type="number" min={1} max={120} value={seconds} onChange={(event) => setSeconds(event.target.value)} />
        </label>
        <button type="submit" disabled={busy}>Save Spin Length</button>
      </form>
      {message ? <output className={`status${message.kind === "error" ? " error" : ""}`}>{message.text}</output> : null}
    </section>
  );
}
