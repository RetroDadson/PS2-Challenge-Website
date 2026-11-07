import type { SubDrawDueDto } from "@ps2-challenge/shared";
import { Dices } from "lucide-react";

export function SubDrawDueNotice({
  draw,
  message,
  busy,
  overrideLabel,
  onOverride
}: Readonly<{ draw: SubDrawDueDto; message: string; busy: boolean; overrideLabel: string; onOverride: () => void }>) {
  return (
    <div className="status error sub-draw-due" role="alert">
      <p>{message}</p>
      <div className="sub-draw-due-actions">
        <a className="button-link" href="/admin/sub-picks"><Dices aria-hidden />Go to Sub Picks</a>
        <button type="button" className="secondary" disabled={busy} onClick={onOverride}>{overrideLabel}</button>
      </div>
      <small>Starting game {draw.gameNumber} anyway skips this {draw.kind} draw and is recorded in the sub picks audit log.</small>
    </div>
  );
}
