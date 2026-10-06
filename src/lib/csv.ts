// Spreadsheet formula injection (#125): Excel / Sheets / LibreOffice will
// execute a cell that starts with `= + - @`, a tab, or CR. Per-user CSV
// export only, so the attacker is also the victim — still neutralize by
// prefixing `'` before any quoting so the value is treated as text.
const FORMULA_LEADERS = new Set(["=", "+", "-", "@", "\t", "\r"]);

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "string" ? value : String(value);
  if (s.length > 0 && FORMULA_LEADERS.has(s[0])) {
    s = `'${s}`;
  }
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(rows: readonly (readonly unknown[])[], header?: readonly string[]): string {
  const parts: string[] = [];
  if (header) parts.push(header.map(csvEscape).join(","));
  for (const row of rows) parts.push(row.map(csvEscape).join(","));
  return parts.join("\r\n") + "\r\n";
}
