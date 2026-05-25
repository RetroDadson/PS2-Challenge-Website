import { createPool, readCsv, readImportOptions } from "./importUtils.js";

const options = readImportOptions();
const rows = await readCsv(options.file);
const pool = createPool(options.connectionString);

try {
  for (const row of rows) {
    const title = row.title ?? row.Title;
    const serialNumber = row.serial_number ?? row.serialNumber ?? row.SerialNumber;
    if (!title || !serialNumber) continue;

    const game = await pool.query<{ game_id: number }>("SELECT game_id FROM games WHERE lower(title) = lower($1)", [title]);
    if (!game.rows[0]) {
      console.warn(`Skipping missing game: ${title}`);
      continue;
    }
    await pool.query(
      `
      INSERT INTO game_serial_numbers (game_id, serial_number, region, notes)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (serial_number) DO UPDATE SET region = EXCLUDED.region, notes = EXCLUDED.notes
      `,
      [game.rows[0].game_id, serialNumber, row.region ?? row.Region ?? null, row.notes ?? row.Notes ?? null]
    );
  }
} finally {
  await pool.end();
}
