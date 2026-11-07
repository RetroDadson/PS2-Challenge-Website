import type { Kysely } from "kysely";
import type { Database } from "../db/kysely.js";

export function eligibleChallengeGamesQuery(db: Kysely<Database>) {
  return db
    .selectFrom("games as g")
    .innerJoin("game_owned as go", "go.game_id", "g.game_id")
    .leftJoin("excluded_games as eg", "eg.game_id", "g.game_id")
    .leftJoin("progress as p", "p.game_id", "g.game_id")
    .where("eg.game_id", "is", null)
    .where("p.game_id", "is", null);
}
