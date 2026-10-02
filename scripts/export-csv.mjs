/** Convert the JSON returned by `wrangler d1 execute --json` to a private CSV.
 * Usage: node scripts/export-csv.mjs subscribers.json subscribers.csv
 * Do not put either file under public/. No dependencies.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error(
    "Usage: node scripts/export-csv.mjs <wrangler-output.json> <private-output.csv>",
  );
  process.exit(1);
}
if (path.resolve(output).split(path.sep).includes("public")) {
  console.error("Refusing to export private data into a public directory.");
  process.exit(1);
}
try {
  const parsed = JSON.parse(await readFile(input, "utf8"));
  const envelopes = Array.isArray(parsed) ? parsed : [parsed];
  const rows = envelopes.flatMap((entry) =>
    Array.isArray(entry.results) ? entry.results : [],
  );
  if (!rows.length) throw new Error("No rows found in Wrangler JSON results.");
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  function cell(value) {
    let text = value == null ? "" : String(value);
    // Mitigate formula injection when opening untrusted feedback in a spreadsheet.
    if (/^[\s]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text))
      text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  }
  const csv = [
    columns.map(cell).join(","),
    ...rows.map((row) => columns.map((key) => cell(row[key])).join(",")),
  ].join("\r\n");
  await writeFile(output, "\ufeff" + csv + "\r\n", { flag: "wx", mode: 0o600 });
  console.log(`Exported ${rows.length} rows. Keep this file private.`);
} catch (cause) {
  console.error(cause.message);
  process.exit(1);
}
