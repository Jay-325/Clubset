import { readFileSync } from "node:fs";
import { parse } from "libpg-query";

const file = process.argv[2];
const sql = readFileSync(file, "utf8");

try {
  await parse(sql);
  console.log("ok");
} catch (error) {
  const err = error as { message?: string; cursorPosition?: number };
  const pos = err.cursorPosition;
  console.error(err.message);
  if (typeof pos === "number") {
    const before = sql.slice(0, pos);
    const line = before.split("\n").length;
    const col = pos - before.lastIndexOf("\n");
    console.error(`line ${line}, col ${col}`);
    console.error("context:");
    console.error(
      sql
        .split("\n")
        .slice(Math.max(0, line - 4), line + 2)
        .join("\n"),
    );
  }
  process.exit(1);
}
