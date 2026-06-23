import type { ChallengeRunnerDto, ChallengeRunnerInput } from "@ps2-challenge/shared";
import { Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { ModalDialog } from "./ModalDialog.js";

export function ChallengeRunnerModal({
  runner,
  onClose,
  onSaved,
  onSave,
  onDelete
}: Readonly<{
  runner: ChallengeRunnerDto | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onSave: (input: ChallengeRunnerInput) => Promise<ChallengeRunnerDto>;
  onDelete: (id: number) => Promise<void>;
}>) {
  const [draft, setDraft] = useState(() => ({
    name: runner?.name ?? "",
    description: runner?.description ?? "",
    twitchUrl: runner?.twitchUrl ?? "",
    youtubeUrl: runner?.youtubeUrl ?? ""
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    const input: ChallengeRunnerInput = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      twitchUrl: draft.twitchUrl.trim() || null,
      youtubeUrl: draft.youtubeUrl.trim() || null
    };
    if (!input.twitchUrl && !input.youtubeUrl) {
      setError("Add at least one Twitch or YouTube URL.");
      setBusy(false);
      return;
    }
    try {
      await onSave(input);
      await onSaved();
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!runner || !globalThis.confirm(`Delete ${runner.name} from the challenge runners page?`)) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete(runner.id);
      onClose();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
      setBusy(false);
    }
  };

  return (
    <ModalDialog title={runner ? `Edit ${runner.name}` : "Add Challenge Runner"} onClose={onClose}>
      <form className="form-grid" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <label className="wide">Name<input required maxLength={100} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label className="wide">Description<textarea required maxLength={1000} rows={5} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
        <label>Twitch URL<input type="url" maxLength={500} placeholder="https://www.twitch.tv/..." value={draft.twitchUrl} onChange={(event) => setDraft({ ...draft, twitchUrl: event.target.value })} /></label>
        <label>YouTube URL<input type="url" maxLength={500} placeholder="https://www.youtube.com/@..." value={draft.youtubeUrl} onChange={(event) => setDraft({ ...draft, youtubeUrl: event.target.value })} /></label>
        {error ? <div className="status error wide" role="alert">{error}</div> : null}
        <footer className="wide runner-modal-actions">
          {runner ? <button type="button" className="danger" onClick={() => void remove()} disabled={busy}><Trash2 />Delete</button> : <span />}
          <div className="runner-modal-save-actions">
            <button type="button" className="secondary" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" disabled={busy}><Save />{busy ? "Saving..." : "Save Runner"}</button>
          </div>
        </footer>
      </form>
    </ModalDialog>
  );
}
