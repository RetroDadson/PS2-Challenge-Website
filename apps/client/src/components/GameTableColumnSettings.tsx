import { Columns3, GripVertical, RotateCcw } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import {
  defaultGameTablePreferences,
  getGameTableColumn,
  reorderGameTableColumn,
  setGameTableColumnVisibility,
  type GameTableColumnId,
  type GameTablePreferences
} from "../gameTablePreferences.js";
import { ModalDialog } from "./ModalDialog.js";

export function GameTableColumnSettings({
  preferences,
  onChange,
  disabled = false
}: Readonly<{
  preferences: GameTablePreferences;
  onChange: (preferences: GameTablePreferences) => void;
  disabled?: boolean;
}>) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(preferences);
  const [dropTarget, setDropTarget] = useState<GameTableColumnId | null>(null);
  const draggedColumn = useRef<GameTableColumnId | null>(null);
  const lastDragTarget = useRef<GameTableColumnId | null>(null);

  const changeVisibility = (id: GameTableColumnId, visible: boolean) => {
    setDraft((current) => setGameTableColumnVisibility(current, id, visible));
  };

  const startDragging = (event: DragEvent<HTMLButtonElement>, id: GameTableColumnId) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    draggedColumn.current = id;
    lastDragTarget.current = id;
  };

  const finishDragging = () => {
    draggedColumn.current = null;
    lastDragTarget.current = null;
    setDropTarget(null);
  };

  const openSettings = () => {
    setDraft(preferences);
    setOpen(true);
  };

  const closeSettings = () => {
    finishDragging();
    setOpen(false);
  };

  const applySettings = () => {
    onChange(draft);
    closeSettings();
  };

  const dropColumn = (event: DragEvent<HTMLLIElement>) => {
    event.preventDefault();
    finishDragging();
  };

  const previewColumnPosition = (targetId: GameTableColumnId) => {
    const sourceId = draggedColumn.current;
    if (!sourceId || sourceId === targetId || lastDragTarget.current === targetId) {
      return;
    }
    lastDragTarget.current = targetId;
    setDropTarget(targetId);
    setDraft((current) => reorderGameTableColumn(current, sourceId, targetId));
  };

  return (
    <>
      <button className="secondary" type="button" disabled={disabled} onClick={openSettings}>
        <Columns3 />Customise Columns
      </button>
      {open ? (
        <ModalDialog title="Customise Game Columns" onClose={closeSettings}>
          <p className="muted column-settings-help">
            Choose which game information is shown. Drag the optional column names to arrange them.
          </p>
          <ol className="column-settings-list">
            {draft.order.map((id) => {
              const column = getGameTableColumn(id);
              const required = "required" in column && column.required;
              return (
                <li
                  key={id}
                  className={dropTarget === id ? "column-drop-target" : undefined}
                  onDragEnter={() => {
                    if (!required) {
                      previewColumnPosition(id);
                    }
                  }}
                  onDragOver={(event) => {
                    if (!required && draggedColumn.current) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }
                  }}
                  onDrop={dropColumn}
                >
                  <input
                    type="checkbox"
                    aria-label={required ? `${column.label} (always shown)` : column.label}
                    checked={required || !draft.hidden.includes(id)}
                    disabled={required}
                    onChange={(event) => changeVisibility(id, event.target.checked)}
                  />
                  {required ? (
                    <span
                      className="column-name column-name-pinned"
                      draggable={false}
                      aria-label={`${column.label} column pinned`}
                    >
                      {column.label} (always shown)
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="column-name column-drag-handle"
                      draggable
                      aria-label={`Drag ${column.label} column`}
                      onDragStart={(event) => startDragging(event, id)}
                      onDragEnd={finishDragging}
                    >
                      <GripVertical />
                      {column.label}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          <footer>
            <button className="secondary" type="button" onClick={() => setDraft(defaultGameTablePreferences())}>
              <RotateCcw />Reset to Default
            </button>
            <button type="button" onClick={applySettings}>Done</button>
          </footer>
        </ModalDialog>
      ) : null}
    </>
  );
}
