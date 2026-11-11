import YAML from 'yaml';
import type { FormatId } from '../formats';

/** JSON ⇄ CSV ⇄ TSV ⇄ YAML ⇄ TXT conversions (pure TypeScript). */

type Row = Record<string, unknown>;
interface Table {
  headers: string[];
  rows: Row[];
}

/** RFC 4180-style parser (quotes, escaped quotes, embedded newlines). */
export function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === '') inQuotes = true;
    else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

function inferScalar(s: string): unknown {
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n) && (Number.isSafeInteger(n) || s.includes('.') || /e/i.test(s))) return n;
  }
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null') return null;
  return s;
}

function gridToObjects(grid: string[][]): Row[] {
  if (!grid.length) return [];
  const headers = grid[0].map((h, i) => h.trim() || `column_${i + 1}`);
  return grid.slice(1).map((cells) => {
    const o: Row = {};
    headers.forEach((h, i) => (o[h] = inferScalar(cells[i] ?? '')));
    return o;
  });
}

function parse(text: string, from: FormatId): unknown {
  const clean = text.replace(/^\uFEFF/, '');
  switch (from) {
    case 'json':
      try {
        return JSON.parse(clean);
      } catch (e) {
        throw new Error(`Invalid JSON: ${(e as Error).message}`);
      }
    case 'yaml':
      return YAML.parse(clean);
    case 'csv':
      return gridToObjects(parseDelimited(clean, ','));
    case 'tsv':
      return gridToObjects(parseDelimited(clean, '\t'));
    case 'txt': {
      const lines = clean.split(/\r?\n/);
      if (lines.length && lines[lines.length - 1] === '') lines.pop();
      return lines;
    }
    default:
      throw new Error(`Unsupported data input: ${from}`);
  }
}

const isPlainObject = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);

function toTable(value: unknown): Table {
  let rows: Row[];
  if (Array.isArray(value)) {
    if (value.length && value.every(isPlainObject)) rows = value as Row[];
    else if (value.length && value.every(Array.isArray)) {
      const width = Math.max(...(value as unknown[][]).map((r) => r.length));
      const headers = Array.from({ length: width }, (_, i) => `column_${i + 1}`);
      return {
        headers,
        rows: (value as unknown[][]).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]]))),
      };
    } else rows = value.map((v) => ({ value: v }));
  } else if (isPlainObject(value)) {
    // `{ "items": [ {...}, ... ] }` → use the single array-of-objects property if present.
    const arrays = Object.values(value).filter((v) => Array.isArray(v) && v.length && v.every(isPlainObject));
    rows = arrays.length === 1 ? (arrays[0] as Row[]) : [value];
  } else rows = [{ value }];

  const headers: string[] = [];
  const seen = new Set<string>();
  for (const r of rows)
    for (const k of Object.keys(r))
      if (!seen.has(k)) {
        seen.add(k);
        headers.push(k);
      }
  return { headers, rows };
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function writeDelimited(t: Table, delim: string): string {
  const esc = (s: string) => (s.includes(delim) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [t.headers.map(esc).join(delim)];
  for (const r of t.rows) lines.push(t.headers.map((h) => esc(cell(r[h]))).join(delim));
  return lines.join('\n') + '\n';
}

function writeText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.every((v) => v === null || typeof v !== 'object')) {
    return value.map(cell).join('\n') + '\n';
  }
  // Aligned plain-text table
  const t = toTable(value);
  const grid = [t.headers, ...t.rows.map((r) => t.headers.map((h) => cell(r[h]).replace(/\s+/g, ' ')))];
  const widths = t.headers.map((_, i) => Math.min(60, Math.max(...grid.map((row) => row[i].length))));
  const fmt = (row: string[]) => row.map((c, i) => c.slice(0, 60).padEnd(widths[i])).join('  ').trimEnd();
  return [fmt(grid[0]), widths.map((w) => '-'.repeat(w)).join('  '), ...grid.slice(1).map(fmt)].join('\n') + '\n';
}

export function convertDataText(text: string, from: FormatId, to: FormatId): string {
  const value = parse(text, from);
  switch (to) {
    case 'json':
      return JSON.stringify(value, null, 2) + '\n';
    case 'yaml':
      return YAML.stringify(value);
    case 'csv':
      return writeDelimited(toTable(value), ',');
    case 'tsv':
      return writeDelimited(toTable(value), '\t');
    case 'txt':
      return writeText(value);
    default:
      throw new Error(`Unsupported data output: ${to}`);
  }
}
