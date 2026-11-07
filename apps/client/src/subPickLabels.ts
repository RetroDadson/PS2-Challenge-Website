import type { SubEntryDto, SubGrantType, SubTier } from "@ps2-challenge/shared";

export const tierLabels: Record<SubTier, string> = {
  prime: "Prime",
  "1000": "Tier 1",
  "2000": "Tier 2",
  "3000": "Tier 3"
};

export const grantTypeLabels: Record<SubGrantType, string> = {
  new: "New sub",
  resub: "Resub",
  gift: "Gifted subs"
};

export function entryStatusLabel(entry: Pick<SubEntryDto, "pool" | "status" | "playedGameNumber">): string {
  if (entry.status === "won") return "Won";
  if (entry.status === "lost") return "Lost in a 100s draw";
  if (entry.status === "voided") return "Removed";
  if (entry.status === "removed_played" || (entry.status === "in_100s_pool" && entry.pool === "finished")) {
    return entry.playedGameNumber ? `Played at game ${entry.playedGameNumber}` : "Game already played";
  }
  if (entry.pool === "awaiting_pick") return "Needs a pick";
  if (entry.pool === "needs_new_pick") return "Needs a new pick";
  if (entry.pool === "100s_pool") return "In the 100s pool";
  return "In the next draw";
}

export function entryStatusClass(entry: Pick<SubEntryDto, "pool" | "status">): string {
  if (entry.status === "won") return "status-completed";
  if (entry.pool === "awaiting_pick" || entry.pool === "needs_new_pick") return "status-inprogress";
  if (entry.pool === "next_draw" || entry.pool === "100s_pool") return "included-badge";
  return "status-notstarted";
}

export function formatOdds(odds: number): string {
  return `${(odds * 100).toFixed(odds > 0 && odds < 0.1 ? 1 : 0)}%`;
}
