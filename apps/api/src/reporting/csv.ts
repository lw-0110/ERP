function cell(value: unknown) {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function csv(headers: readonly (string | { key: string; label: string })[], rows: Record<string, unknown>[]) {
  return `\uFEFF${[headers.map((header) => cell(typeof header === 'string' ? header : header.label)).join(','), ...rows.map((row) => headers.map((header) => cell(row[typeof header === 'string' ? header : header.key])).join(','))].join('\r\n')}\r\n`;
}
