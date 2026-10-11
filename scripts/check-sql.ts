/**
 * Syntax-checks every migration against the real PostgreSQL parser.
 *
 *   node --experimental-strip-types scripts/check-sql.ts
 *
 * The Supabase CLI needs Docker for `db reset`, which is not always available.
 * libpg-query embeds the actual PostgreSQL grammar, so this catches syntax
 * errors and unbalanced dollar-quotes without a running database. It cannot
 * check semantics (missing columns, wrong function signatures), which only a
 * real `supabase db reset` will surface.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "libpg-query";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const seedPath = join(process.cwd(), "supabase", "seed.sql");

const files = [
  ...readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => join(migrationsDir, name)),
  seedPath,
];

let failures = 0;

for (const file of files) {
  const sql = readFileSync(file, "utf8");
  try {
    await parse(sql);
    console.log(`  ok  ${file.replace(process.cwd() + "\\", "")}`);
  } catch (error) {
    failures += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL  ${file.replace(process.cwd() + "\\", "")}`);
    console.error(`      ${message.split("\n").slice(0, 6).join("\n      ")}`);
  }
}

console.log(
  failures === 0
    ? `\nAll ${files.length} SQL files parse cleanly.`
    : `\n${failures} of ${files.length} SQL files failed to parse.`,
);
process.exit(failures === 0 ? 0 : 1);
