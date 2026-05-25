import fs from "node:fs/promises";
import { parseArgs } from "node:util";
import pg from "pg";

const { Pool } = pg;

export type ImportOptions = {
  file: string;
  connectionString: string;
};

export function readImportOptions(): ImportOptions {
  const { values } = parseArgs({
    options: {
      file: { type: "string", short: "f" },
      connection: { type: "string", short: "c" }
    }
  });

  const file = values.file;
  const connectionString = values.connection ?? process.env.DATABASE_CONNECTION_STRING;
  if (!file || !connectionString) {
    throw new Error("Usage: tsx <script> --file path.csv --connection <postgres-connection-string>");
  }
  return { file, connectionString };
}

export async function readCsv(file: string): Promise<Record<string, string>[]> {
  const content = await fs.readFile(file, "utf8");
  const [headerLine, ...lines] = content.split(/\r?\n/).filter(Boolean);
  if (!headerLine) {
    return [];
  }
  const headers = splitCsvLine(headerLine);
  return lines.map((line) => Object.fromEntries(splitCsvLine(line).map((value, index) => [headers[index]!, value])));
}

export function createPool(connectionString: string) {
  return new Pool({ connectionString });
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index]!;
    if (char === '"' && line[index + 1] === '"') {
      value += '"';
      index++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      result.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }
  result.push(value.trim());
  return result;
}
