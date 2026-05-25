import { Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { GameDto } from "@ps2-challenge/shared";
import { api, type SerialNumberDto } from "../api.js";
import { toDateInputValue } from "../dateUtils.js";
import { ModalDialog } from "./ModalDialog.js";

type AlternateTitleDto = {
  alternateTitleId: number;
  gameId: number;
  title: string;
  notes?: string | null;
};

type PendingSerial = Omit<SerialNumberDto, "serialId" | "gameId"> & { serialId: number; gameId: number };

export function GameModal({
  game,
  onClose,
  onSaved,
  onSave,
  onDelete
}: Readonly<{
  game: GameDto | null;
  onClose: () => void;
  onSaved?: () => Promise<void>;
  onSave: (game: Partial<GameDto>) => Promise<GameDto | void>;
  onDelete?: (id: number) => Promise<void>;
}>) {
  const [draft, setDraft] = useState<Partial<GameDto>>(() => draftFor(game));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownershipTypes, setOwnershipTypes] = useState<Array<{ typeOwned: string }>>([]);
  const [ownPhysicalCopy, setOwnPhysicalCopy] = useState(() => !!game?.isOwned);
  const [typeOwned, setTypeOwned] = useState(() => defaultTypeOwnedFor(game));
  const [isExcluded, setIsExcluded] = useState(() => !!game?.isExcluded);
  const [exclusionReason, setExclusionReason] = useState(() => defaultExclusionReasonFor(game));
  const [serialNumbers, setSerialNumbers] = useState<PendingSerial[]>([]);
  const [alternateTitles, setAlternateTitles] = useState<AlternateTitleDto[]>([]);
  const [newSerialNumber, setNewSerialNumber] = useState("");
  const [newSerialRegion, setNewSerialRegion] = useState("");
  const [newSerialNotes, setNewSerialNotes] = useState("");
  const [newAlternateTitle, setNewAlternateTitle] = useState("");
  const [newAlternateNotes, setNewAlternateNotes] = useState("");
  const ownPhysicalCopyRef = useRef(!!game?.isOwned);
  const typeOwnedRef = useRef(defaultTypeOwnedFor(game));
  const isExcludedRef = useRef(!!game?.isExcluded);
  const exclusionReasonRef = useRef(defaultExclusionReasonFor(game));

  useEffect(() => {
    void api.ownershipTypes().then(setOwnershipTypes).catch(() => setOwnershipTypes([]));
  }, []);

  useEffect(() => {
    setDraft(draftFor(game));
    const nextOwnPhysicalCopy = !!game?.isOwned;
    const nextTypeOwned = defaultTypeOwnedFor(game);
    const nextIsExcluded = !!game?.isExcluded;
    const nextExclusionReason = defaultExclusionReasonFor(game);
    ownPhysicalCopyRef.current = nextOwnPhysicalCopy;
    typeOwnedRef.current = nextTypeOwned;
    isExcludedRef.current = nextIsExcluded;
    exclusionReasonRef.current = nextExclusionReason;
    setOwnPhysicalCopy(nextOwnPhysicalCopy);
    setTypeOwned(nextTypeOwned);
    setIsExcluded(nextIsExcluded);
    setExclusionReason(nextExclusionReason);
    setError(null);
    setNewSerialNumber("");
    setNewSerialRegion("");
    setNewSerialNotes("");
    setNewAlternateTitle("");
    setNewAlternateNotes("");

    if (game?.id) {
      void Promise.all([api.serialNumbers(game.id), api.alternateTitles(game.id), api.ownedTypes()])
        .then(([serials, titles, ownedTypesByGame]) => {
          setSerialNumbers(serials);
          setAlternateTitles(titles);
          const loadedTypeOwned = game.isOwned ? ownedTypesByGame[String(game.id)] ?? "Base" : "";
          typeOwnedRef.current = loadedTypeOwned;
          setTypeOwned(loadedTypeOwned);
        })
        .catch((loadError) => setError(loadError instanceof Error ? loadError.message : String(loadError)));
    } else {
      setSerialNumbers([]);
      setAlternateTitles([]);
    }
  }, [game]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await onSave(draft);
      const gameId = game?.id ?? saved?.id;
      const title = (draft.title ?? saved?.title ?? game?.title ?? "").trim();
      const currentOwnPhysicalCopy = ownPhysicalCopyRef.current;
      const currentTypeOwned = currentOwnPhysicalCopy ? typeOwnedRef.current : "";
      const currentIsExcluded = isExcludedRef.current;
      const currentExclusionReason = exclusionReasonRef.current;
      if (gameId) {
        await api.updateOwnership(gameId, currentOwnPhysicalCopy, currentTypeOwned);
        await api.updateExclusion(gameId, currentIsExcluded, currentIsExcluded ? currentExclusionReason || "No reason provided" : undefined);
        for (const serial of serialNumbers.filter((entry) => entry.serialId <= 0)) {
          await api.addSerialNumber({ title, serialNumber: serial.serialNumber, region: serial.region ?? null, notes: serial.notes ?? null });
        }
        for (const alternateTitle of alternateTitles.filter((entry) => entry.alternateTitleId <= 0)) {
          await api.addAlternateTitle(gameId, { title: alternateTitle.title, notes: alternateTitle.notes ?? null });
        }
      }
      await onSaved?.();
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusy(false);
    }
  };

  const addSerialNumber = async () => {
    const serialNumber = newSerialNumber.trim();
    if (!serialNumber) return;
    if (serialNumbers.some((serial) => serial.serialNumber.toLocaleLowerCase("en-GB") === serialNumber.toLocaleLowerCase("en-GB"))) {
      setError(`Serial number '${serialNumber}' is already in the list.`);
      return;
    }

    const entry = {
      serialId: -Date.now(),
      gameId: game?.id ?? 0,
      serialNumber,
      region: newSerialRegion.trim() || null,
      notes: newSerialNotes.trim() || null
    };

    if (game?.id) {
      try {
        const created = await api.addSerialNumber({
          title: draft.title ?? game.title,
          serialNumber: entry.serialNumber,
          region: entry.region,
          notes: entry.notes
        });
        setSerialNumbers([...serialNumbers, created]);
      } catch (addError) {
        setError(addError instanceof Error ? addError.message : String(addError));
        return;
      }
    } else {
      setSerialNumbers([...serialNumbers, entry]);
    }
    setNewSerialNumber("");
    setNewSerialRegion("");
    setNewSerialNotes("");
    setError(null);
  };

  const removeSerialNumber = async (serial: PendingSerial) => {
    if (game?.id && serial.serialId > 0) {
      await api.deleteSerialNumber(game.id, serial.serialId);
    }
    setSerialNumbers(serialNumbers.filter((entry) => entry.serialId !== serial.serialId));
  };

  const removeAlternateTitle = async (alternateTitle: AlternateTitleDto) => {
    try {
      if (game?.id && alternateTitle.alternateTitleId > 0) {
        await api.deleteAlternateTitle(game.id, alternateTitle.alternateTitleId);
      }
      setAlternateTitles(alternateTitles.filter((entry) => entry.alternateTitleId !== alternateTitle.alternateTitleId));
      setError(null);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : String(removeError));
    }
  };

  const addAlternateTitle = async () => {
    const title = newAlternateTitle.trim();
    if (!title) return;
    if (alternateTitles.some((entry) => entry.title.toLocaleLowerCase("en-GB") === title.toLocaleLowerCase("en-GB"))) {
      setError(`Alternate title '${title}' is already in the list.`);
      return;
    }

    const entry = {
      alternateTitleId: -Date.now(),
      gameId: game?.id ?? 0,
      title,
      notes: newAlternateNotes.trim() || null
    };

    if (game?.id) {
      try {
        const created = await api.addAlternateTitle(game.id, { title: entry.title, notes: entry.notes });
        setAlternateTitles([...alternateTitles, created]);
      } catch (addError) {
        setError(addError instanceof Error ? addError.message : String(addError));
        return;
      }
    } else {
      setAlternateTitles([...alternateTitles, entry]);
    }
    setNewAlternateTitle("");
    setNewAlternateNotes("");
    setError(null);
  };

  return (
    <ModalDialog title={game ? `Edit ${game.title}` : "Add New Game"} onClose={onClose}>
        {error ? <div className="status error">{error}</div> : null}
        <label><span>Title</span><input value={draft.title ?? ""} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label><span>Developer</span><input value={draft.developer ?? ""} onChange={(event) => setDraft({ ...draft, developer: event.target.value })} /></label>
        <label><span>Publisher</span><input value={draft.publisher ?? ""} onChange={(event) => setDraft({ ...draft, publisher: event.target.value })} /></label>
        <label><span>First Released</span><input type="date" value={draft.firstReleased ?? ""} onChange={(event) => setDraft({ ...draft, firstReleased: event.target.value || null })} /></label>
        <label><span>Region First Released</span><input value={draft.regionFirstReleasedIn ?? ""} onChange={(event) => setDraft({ ...draft, regionFirstReleasedIn: event.target.value })} /></label>
        <label className="checkbox">
          <input type="checkbox" checked={!!draft.releasedInEuPalOrNa} onChange={(event) => setDraft({ ...draft, releasedInEuPalOrNa: event.target.checked })} />
          <span>Released in EU/PAL or NA</span>
        </label>

        <div className="modal-section">
          <h3>Serial Numbers</h3>
          {serialNumbers.length ? (
            <div className="pill-list">
              {serialNumbers.map((serial) => (
                <span className="pill-item" key={serial.serialId}>
                  <strong>{serial.serialNumber}</strong>
                  {serial.region ? <em>{serial.region}</em> : null}
                  {serial.notes ? <small>{serial.notes}</small> : null}
                  <button className="icon-button" onClick={() => void removeSerialNumber(serial)} aria-label={`Remove ${serial.serialNumber}`}><X /></button>
                </span>
              ))}
            </div>
          ) : <p className="muted">No serial numbers added yet.</p>}
          <div className="form-grid">
            <label><span>Serial Number</span><input maxLength={50} value={newSerialNumber} onChange={(event) => setNewSerialNumber(event.target.value)} /></label>
            <label><span>Region</span><input maxLength={50} value={newSerialRegion} onChange={(event) => setNewSerialRegion(event.target.value)} /></label>
            <label className="wide"><span>Notes</span><input maxLength={500} value={newSerialNotes} onChange={(event) => setNewSerialNotes(event.target.value)} /></label>
            <button type="button" onClick={() => void addSerialNumber()} disabled={!newSerialNumber.trim()}><Plus />Add Serial Number</button>
          </div>
        </div>

        <div className="modal-section">
          <h3>Alternate Titles</h3>
          {alternateTitles.length ? (
            <div className="pill-list">
              {alternateTitles.map((alternateTitle) => (
                <span className="pill-item" key={alternateTitle.alternateTitleId}>
                  <strong>{alternateTitle.title}</strong>
                  {alternateTitle.notes ? <small>{alternateTitle.notes}</small> : null}
                  <button className="icon-button" onClick={() => void removeAlternateTitle(alternateTitle)} aria-label={`Remove ${alternateTitle.title}`}><X /></button>
                </span>
              ))}
            </div>
          ) : <p className="muted">No alternate titles added yet.</p>}
          <div className="form-grid">
            <label><span>Alternate Title</span><input maxLength={150} value={newAlternateTitle} onChange={(event) => setNewAlternateTitle(event.target.value)} /></label>
            <label><span>Notes</span><input maxLength={500} value={newAlternateNotes} onChange={(event) => setNewAlternateNotes(event.target.value)} /></label>
            <button type="button" onClick={() => void addAlternateTitle()} disabled={!newAlternateTitle.trim()}><Plus />Add Alternate Title</button>
          </div>
        </div>

        <div className="modal-section">
          <h3>Ownership Status</h3>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={ownPhysicalCopy}
              onChange={(event) => {
                const checked = event.target.checked;
                ownPhysicalCopyRef.current = checked;
                setOwnPhysicalCopy(checked);
                if (!checked) {
                  typeOwnedRef.current = "";
                  setTypeOwned("");
                }
              }}
            />
            <span>Own Physical Copy</span>
          </label>
          <label><span>Type Owned</span>
            <select
              value={typeOwned}
              disabled={!ownPhysicalCopy}
              onChange={(event) => {
                typeOwnedRef.current = event.target.value;
                setTypeOwned(event.target.value);
              }}
            >
              <option value="">Select Type</option>
              {ownershipTypes.map((type) => <option key={type.typeOwned} value={type.typeOwned}>{type.typeOwned}</option>)}
            </select>
          </label>
        </div>

        <div className="modal-section">
          <h3>Exclusion Status</h3>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={isExcluded}
              onChange={(event) => {
                isExcludedRef.current = event.target.checked;
                setIsExcluded(event.target.checked);
              }}
            />
            <span>Exclude from Challenge</span>
          </label>
          {isExcluded ? (
            <label><span>Exclusion Reason</span>
              <textarea
                value={exclusionReason}
                onChange={(event) => {
                  exclusionReasonRef.current = event.target.value;
                  setExclusionReason(event.target.value);
                }}
              />
            </label>
          ) : null}
        </div>

        <footer>
          {game && onDelete ? <button className="danger" onClick={() => onDelete(game.id)} disabled={busy}><Trash2 />Delete</button> : <span />}
          <button onClick={save} disabled={busy || !draft.title || !draft.developer || !draft.publisher || !draft.regionFirstReleasedIn}><Save />Save</button>
        </footer>
    </ModalDialog>
  );
}

function draftFor(game: GameDto | null): Partial<GameDto> {
  return game ? { ...game, firstReleased: toDateInputValue(game.firstReleased) || null } : { title: "", releasedInEuPalOrNa: false };
}

function defaultTypeOwnedFor(game: GameDto | null) {
  return game?.isOwned ? "Base" : "";
}

function defaultExclusionReasonFor(game: GameDto | null) {
  return game?.isExcluded ? "No reason provided" : "";
}
