import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import type { GameProgressDto } from "@ps2-challenge/shared";
import { toDateInputValue } from "../dateUtils.js";
import { ModalDialog } from "./ModalDialog.js";

type ProgressDraft = {
  title: string;
  dateStarted: string;
  dateFinished: string;
  platform: string;
  beatenCriteria: string;
  review: string;
  completionHours: string;
  completionMinutes: string;
  completionSeconds: string;
};

export function ProgressModal({
  progress,
  titles,
  onClose,
  onSave
}: Readonly<{
  progress?: GameProgressDto | null;
  titles: string[];
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}>) {
  const [draft, setDraft] = useState<ProgressDraft>(() => createDraft(progress));
  const isEditMode = !!progress;

  useEffect(() => {
    setDraft(createDraft(progress));
  }, [progress]);

  const save = () => {
    const completionTime = buildCompletionTime(draft.completionHours, draft.completionMinutes, draft.completionSeconds);
    return onSave({
      title: draft.title.trim(),
      dateStarted: draft.dateStarted,
      dateFinished: draft.dateFinished || null,
      completionTime,
      beatenCriteria: draft.beatenCriteria.trim() || null,
      review: draft.review.trim() || null,
      platform: draft.platform.trim() || "Physical"
    });
  };

  return (
    <ModalDialog title={isEditMode ? "Edit Game Progress" : "Add New Game Progress"} onClose={onClose}>
        <label>
          <span>Game Title</span>
          <input
            list="progress-game-titles"
            placeholder="Game title"
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
          <datalist id="progress-game-titles">
            {titles.map((title) => <option key={title} value={title} />)}
          </datalist>
        </label>
        <div className="form-grid">
          <label>
            <span>Started</span>
            <input type="date" value={draft.dateStarted} onChange={(event) => setDraft({ ...draft, dateStarted: event.target.value })} />
          </label>
          <label>
            <span>Finished (optional)</span>
            <input type="date" value={draft.dateFinished} onChange={(event) => setDraft({ ...draft, dateFinished: event.target.value })} />
          </label>
        </div>
        <label>
          <span>Platform</span>
          <select value={draft.platform} onChange={(event) => setDraft({ ...draft, platform: event.target.value })}>
            <option>Physical</option>
            <option>Emulated</option>
          </select>
        </label>
        <label>
          <span>Beaten Criteria</span>
          <input value={draft.beatenCriteria} onChange={(event) => setDraft({ ...draft, beatenCriteria: event.target.value })} />
        </label>
        <label>
          <span>Review</span>
          <textarea rows={4} value={draft.review} onChange={(event) => setDraft({ ...draft, review: event.target.value })} />
        </label>
        <fieldset className="time-input-group">
          <legend>Completion Time</legend>
          <label>
            <span>hours</span>
            <input
              type="number"
              min="0"
              value={draft.completionHours}
              onChange={(event) => setDraft({ ...draft, completionHours: event.target.value })}
            />
          </label>
          <label>
            <span>minutes</span>
            <input
              type="number"
              min="0"
              max="59"
              value={draft.completionMinutes}
              onChange={(event) => setDraft({ ...draft, completionMinutes: event.target.value })}
            />
          </label>
          <label>
            <span>seconds</span>
            <input
              type="number"
              min="0"
              max="59"
              value={draft.completionSeconds}
              onChange={(event) => setDraft({ ...draft, completionSeconds: event.target.value })}
            />
          </label>
        </fieldset>
        <footer>
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button onClick={() => void save()} disabled={!draft.title.trim() || !draft.dateStarted}>
            <Save />{isEditMode ? "Update" : "Add"}
          </button>
        </footer>
    </ModalDialog>
  );
}

function createDraft(progress?: GameProgressDto | null): ProgressDraft {
  const [hours, minutes, seconds] = splitCompletionTime(progress?.completionTime);
  return {
    title: progress?.gameTitle ?? "",
    dateStarted: toDateInputValue(progress?.dateStarted) || new Date().toISOString().slice(0, 10),
    dateFinished: toDateInputValue(progress?.dateFinished),
    platform: progress?.platform ?? "Physical",
    beatenCriteria: progress?.beatenCriteria ?? "",
    review: progress?.review ?? "",
    completionHours: hours,
    completionMinutes: minutes,
    completionSeconds: seconds
  };
}

function splitCompletionTime(value?: string | null): [string, string, string] {
  if (!value) {
    return ["0", "0", "0"];
  }
  const parts = value.split(".");
  const time = parts.at(-1) ?? value;
  const [hours = "0", minutes = "0", seconds = "0"] = time.split(":");
  const dayHours = parts.length === 2 ? Number.parseInt(parts[0]!, 10) * 24 : 0;
  return [String(dayHours + Number.parseInt(hours, 10)), String(Number.parseInt(minutes, 10)), String(Number.parseInt(seconds, 10))];
}

function buildCompletionTime(hoursValue: string, minutesValue: string, secondsValue: string): string | null {
  const hours = Math.max(0, Number.parseInt(hoursValue, 10) || 0);
  const minutes = clamp(Number.parseInt(minutesValue, 10) || 0, 0, 59);
  const seconds = clamp(Number.parseInt(secondsValue, 10) || 0, 0, 59);
  if (hours === 0 && minutes === 0 && seconds === 0) {
    return null;
  }
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
