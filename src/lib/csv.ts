export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : String(value);
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
