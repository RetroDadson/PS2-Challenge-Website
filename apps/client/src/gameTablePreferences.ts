import {
  gameTableColumnIds,
  type GameTableColumnId as SharedGameTableColumnId,
  type GameTablePreferencesDto
} from "@ps2-challenge/shared";

type GameTableColumnDefinition = {
  label: string;
  className: string;
  required?: boolean;
  sortColumn?: string;
};

const gameTableColumnsById = {
  cover: { id: "cover", label: "Cover", className: "col-games-cover", required: true },
  title: { id: "title", label: "Title", className: "col-games-title", required: true, sortColumn: "Title" },
  howLongToBeat: { id: "howLongToBeat", label: "How Long To Beat Time", className: "col-games-hltb", sortColumn: "HowLongToBeat" },
  developer: { id: "developer", label: "Developer", className: "col-games-developer", sortColumn: "Developer" },
  publisher: { id: "publisher", label: "Publisher", className: "col-games-publisher", sortColumn: "Publisher" },
  releaseDate: { id: "releaseDate", label: "Release Date", className: "col-games-release", sortColumn: "FirstReleased" },
  region: { id: "region", label: "Region First Released In", className: "col-games-region", sortColumn: "RegionFirstReleasedIn" },
  excluded: { id: "excluded", label: "Excluded", className: "col-games-excluded", sortColumn: "IsExcluded" },
  owned: { id: "owned", label: "Owned", className: "col-games-owned", sortColumn: "IsOwned" },
  status: { id: "status", label: "Status", className: "col-games-status", sortColumn: "CompletionStatus" }
} as const satisfies {
  [Id in SharedGameTableColumnId]: GameTableColumnDefinition & { id: Id };
};

export const GAME_TABLE_COLUMNS = gameTableColumnIds.map((id) => gameTableColumnsById[id]);

export type GameTableColumn = (typeof GAME_TABLE_COLUMNS)[number];
export type GameTableColumnId = SharedGameTableColumnId;
export type GameTablePreferences = Readonly<GameTablePreferencesDto>;

const STORAGE_KEY = "gameTableColumns";
const columnIds = GAME_TABLE_COLUMNS.map((column) => column.id);
const requiredColumnIds = new Set<GameTableColumnId>(
  GAME_TABLE_COLUMNS.filter((column) => "required" in column && column.required).map((column) => column.id)
);

export function defaultGameTablePreferences(): GameTablePreferences {
  return { order: [...columnIds], hidden: [] };
}

export function readLocalGameTablePreferences(): GameTablePreferences {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) {
      return defaultGameTablePreferences();
    }
    return normaliseGameTablePreferences(JSON.parse(value));
  } catch {
    return defaultGameTablePreferences();
  }
}

export function writeLocalGameTablePreferences(preferences: GameTablePreferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

export function visibleGameTableColumns(preferences: GameTablePreferences) {
  const hidden = new Set(preferences.hidden);
  return preferences.order.map(getGameTableColumn).filter((column) => !hidden.has(column.id));
}

export function setGameTableColumnVisibility(
  preferences: GameTablePreferences,
  id: GameTableColumnId,
  visible: boolean
): GameTablePreferences {
  if (requiredColumnIds.has(id)) {
    return preferences;
  }
  const hidden = new Set(preferences.hidden);
  if (visible) {
    hidden.delete(id);
  } else {
    hidden.add(id);
  }
  return { ...preferences, hidden: preferences.order.filter((columnId) => hidden.has(columnId)) };
}

export function reorderGameTableColumn(
  preferences: GameTablePreferences,
  id: GameTableColumnId,
  targetId: GameTableColumnId
): GameTablePreferences {
  if (id === targetId || requiredColumnIds.has(id) || requiredColumnIds.has(targetId)) {
    return preferences;
  }
  const sourceIndex = preferences.order.indexOf(id);
  const targetIndex = preferences.order.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0) {
    return preferences;
  }
  const order = [...preferences.order];
  order.splice(sourceIndex, 1);
  order.splice(targetIndex, 0, id);
  return { ...preferences, order };
}

export function normaliseGameTablePreferences(value: unknown): GameTablePreferences {
  const saved = value && typeof value === "object" ? value as { order?: unknown; hidden?: unknown } : {};
  const savedOrder = uniqueKnownColumnIds(saved.order).filter((id) => !requiredColumnIds.has(id));
  const savedHidden = new Set(uniqueKnownColumnIds(saved.hidden).filter((id) => !requiredColumnIds.has(id)));
  const optionalColumns = columnIds.filter((id) => !requiredColumnIds.has(id));
  const missingColumns = optionalColumns.filter((id) => !savedOrder.includes(id));
  return {
    order: ["cover", "title", ...savedOrder, ...missingColumns],
    hidden: columnIds.filter((id) => savedHidden.has(id))
  };
}

function uniqueKnownColumnIds(value: unknown): GameTableColumnId[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const knownIds = new Set<string>(columnIds);
  return [...new Set(value.filter((id): id is GameTableColumnId => typeof id === "string" && knownIds.has(id)))];
}

export function getGameTableColumn(id: GameTableColumnId): GameTableColumn {
  const column = GAME_TABLE_COLUMNS.find((candidate) => candidate.id === id);
  if (!column) {
    throw new Error(`Unknown game table column: ${id}`);
  }
  return column;
}
