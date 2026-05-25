import { createPool, readCsv, readImportOptions } from "./importUtils.js";

const options = readImportOptions();
const rows = await readCsv(options.file);
const pool = createPool(options.connectionString);

try {
  for (const row of rows) {
    const title = row.title ?? row.Title;
    const alternateTitle = row.alternate_title ?? row.alternateTitle ?? row.AlternateTitle;
    if (!title || !alternateTitle) continue;

    const game = await pool.query<{ game_id: number }>("SELECT game_id FROM games WHERE lower(title) = lower($1)", [title]);
    if (!game.rows[0]) {
      console.warn(`Skipping missing game: ${title}`);
      continue;
    }
    await pool.query(
      `
      INSERT INTO alternate_titles (game_id, title, notes)
      VALUES ($1, $2, $3)
      ON CONFLICT (title) DO UPDATE SET notes = EXCLUDED.notes
      `,
      [game.rows[0].game_id, alternateTitle, row.notes ?? row.Notes ?? null]
    );
  }
} finally {
  await pool.end();
}
