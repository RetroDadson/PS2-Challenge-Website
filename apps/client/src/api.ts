import type {
  AdminUserDto,
  CurrentVoteDto,
  GameDto,
  GamesPageDataDto,
  GameProgressDto,
  RoleDto,
  UserProfileDto,
  VoteRoundDto
} from "@ps2-challenge/shared";

export type SerialNumberDto = {
  serialId: number;
  gameId: number;
  serialNumber: string;
  region?: string | null;
  notes?: string | null;
};

export type CoverRefreshResult = {
  message?: string;
  total: number;
  updated: number;
  skipped: number;
  errors: number;
};

export type CoverRefreshProgress = CoverRefreshResult & {
  status: "starting" | "checking" | "updated" | "skipped" | "error" | "completed";
  processed: number;
  currentGameId?: number;
  currentGameTitle?: string;
  error?: string;
};

export type TwitchStreamStatsDto = {
  channelLogin: string;
  rangeStart: string;
  rangeEnd: string;
  rangeWeeks: number;
  totalStreamSeconds: number;
  averageWeeklyStreamSeconds: number;
  vodCount: number;
};

type CoverRefreshStreamEvent =
  | ({ type: "progress" } & CoverRefreshProgress)
  | ({ type: "complete" } & CoverRefreshResult)
  | { type: "error"; message: string };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers
  });

  if (!response.ok) {
    let detail = response.statusText || statusMessage(response.status);
    try {
      const body = (await response.json()) as { message?: string; error?: string };
      detail = body.message ?? body.error ?? detail;
    } catch {
      // Keep status text.
    }
    throw new Error(detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function statusMessage(status: number) {
  if (status === 401) return "Unauthorized";
  if (status === 403) return "Forbidden";
  return `HTTP ${status}`;
}

export const api = {
  authUser: () => request<UserProfileDto>("/api/auth/user"),
  user: () => request<UserProfileDto>("/api/user"),
  regenerateApiKey: () => request<{ apiKey: string }>("/api/user/api-key", { method: "POST", body: "{}" }),
  games: (title?: string) => request<GameDto[]>(gamesUrl(title)),
  gamesPageData: () => request<GamesPageDataDto>("/api/games/page-data"),
  game: (id: number) => request<GameDto>(`/api/games/${id}`),
  createGame: (game: Partial<GameDto>) => request<GameDto>("/api/games", { method: "POST", body: JSON.stringify(game) }),
  updateGame: (id: number, game: Partial<GameDto>) => request<GameDto>(`/api/games/${id}`, { method: "PUT", body: JSON.stringify(game) }),
  deleteGame: (id: number) => request<{ message: string }>(`/api/games/${id}`, { method: "DELETE" }),
  ownershipTypes: () => request<Array<{ typeOwned: string }>>("/api/games/ownership-types"),
  updateExclusion: (id: number, exclude: boolean, reason?: string) =>
    request<{ message: string }>(`/api/games/${id}/exclusion`, { method: "PUT", body: JSON.stringify({ isExcluded: exclude, reason }) }),
  updateOwnership: (id: number, ownPhysicalCopy: boolean, typeOwned: string) =>
    request<{ message: string }>(`/api/games/${id}/ownership`, { method: "PUT", body: JSON.stringify({ ownPhysicalCopy, typeOwned }) }),
  progress: () => request<GameProgressDto[]>("/api/games/progress"),
  twitchStreamStats: () => request<TwitchStreamStatsDto>("/api/twitch/stream-stats"),
  updateProgress: (payload: Record<string, unknown>) => request("/api/games/progress", { method: "POST", body: JSON.stringify(payload) }),
  ownedTypes: () => request<Record<string, string>>("/api/games/owned-types"),
  serialNumbers: (id: number) => request<SerialNumberDto[]>(`/api/games/${id}/serial-numbers`),
  addSerialNumber: (payload: { title: string; serialNumber: string; region?: string | null; notes?: string | null }) =>
    request<SerialNumberDto & { gameTitle: string; message: string }>("/api/games/serial-numbers", { method: "POST", body: JSON.stringify(payload) }),
  deleteSerialNumber: (gameId: number, serialId: number) =>
    request<{ message: string }>(`/api/games/${gameId}/serial-numbers/${serialId}`, { method: "DELETE" }),
  alternateTitles: (id: number) => request<Array<{ alternateTitleId: number; gameId: number; title: string; notes?: string | null }>>(`/api/games/${id}/alternate-titles`),
  addAlternateTitle: (id: number, payload: { title: string; notes?: string | null }) =>
    request<{ alternateTitleId: number; gameId: number; title: string; notes?: string | null; message: string }>(`/api/games/${id}/alternate-titles`, { method: "POST", body: JSON.stringify(payload) }),
  deleteAlternateTitle: (gameId: number, alternateTitleId: number) =>
    request<{ message: string }>(`/api/games/${gameId}/alternate-titles/${alternateTitleId}`, { method: "DELETE" }),
  votesHistory: () => request<VoteRoundDto[]>("/api/votes/history"),
  currentVotes: () => request<CurrentVoteDto[]>("/api/votes/current"),
  setCurrentVotes: (votes: CurrentVoteDto[]) => request<{ inserted: number; updated: number }>("/api/votes/current", { method: "POST", body: JSON.stringify(votes) }),
  removeCurrentVote: (title: string) => request<{ message: string }>(`/api/votes/current/${encodeURIComponent(title)}`, { method: "DELETE" }),
  archiveVotes: (notes?: string | null, manualPositions?: Record<number, number>) =>
    request<{ message: string; round: number; archivedCount: number }>("/api/votes/archive", { method: "POST", body: JSON.stringify({ notes, manualPositions }) }),
  fillRandomVotes: (count: number) => request<{ message: string; addedGames: CurrentVoteDto[] }>("/api/votes/current/fill-random", { method: "POST", body: JSON.stringify({ count }) }),
  updateVoteByNumber: (gameNumber: number, voteCount: number) =>
    request("/api/votes/current/by-game-number", { method: "PUT", body: JSON.stringify({ gameNumber, voteCount }) }),
  adminUsers: () => request<AdminUserDto[]>("/api/admin/users"),
  roles: () => request<RoleDto[]>("/api/admin/roles"),
  updateRole: (userId: number, roleId: number) => request(`/api/admin/users/${userId}/role`, { method: "PUT", body: JSON.stringify({ roleId }) }),
  refreshCovers: () => request<CoverRefreshResult>("/api/admin/update-cover-images", { method: "POST", body: "{}" }),
  refreshCoversWithProgress: (onProgress: (progress: CoverRefreshProgress) => void) => refreshCoversWithProgress(onProgress)
};

function gamesUrl(title?: string) {
  if (!title) {
    return "/api/games";
  }
  return `/api/games?title=${encodeURIComponent(title)}`;
}

async function refreshCoversWithProgress(onProgress: (progress: CoverRefreshProgress) => void): Promise<CoverRefreshResult> {
  const response = await fetch("/api/admin/update-cover-images/stream", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: "{}"
  });

  if (!response.ok) {
    throw new Error(await errorDetail(response));
  }

  if (!response.body) {
    const result = await api.refreshCovers();
    onProgress({ ...result, processed: result.total, status: "completed" });
    return result;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let complete: CoverRefreshResult | null = null;

  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      complete = handleCoverRefreshEvent(line, onProgress) ?? complete;
    }

    if (done) {
      break;
    }
  }

  if (!complete) {
    throw new Error("Cover image update did not complete");
  }
  return complete;
}

function handleCoverRefreshEvent(
  line: string,
  onProgress: (progress: CoverRefreshProgress) => void
): CoverRefreshResult | null {
  if (!line.trim()) {
    return null;
  }

  const event = JSON.parse(line) as CoverRefreshStreamEvent;
  if (event.type === "progress") {
    onProgress(event);
    return null;
  }
  if (event.type === "complete") {
    return event;
  }
  throw new Error(event.message);
}

async function errorDetail(response: Response): Promise<string> {
  let detail = response.statusText || statusMessage(response.status);
  try {
    const body = (await response.json()) as { message?: string; error?: string };
    detail = body.message ?? body.error ?? detail;
  } catch {
    // Keep status text.
  }
  return detail;
}
