import YAML from 'yaml';
import type { FormatId } from '../formats';

/**
 * Pure-TypeScript conversions across:
 * JSON ⇄ CSV ⇄ TSV ⇄ YAML ⇄ XML ⇄ TOML ⇄ INI ⇄ ENV ⇄ SQL ⇄ TXT (and HTML tables).
 */

type Row = Record<string, unknown>;
interface Table {
  headers: string[];
  rows: Row[];
}

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
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(t)) {
    const n = Number(t);
    if (Number.isFinite(n) && (Number.isSafeInteger(n) || t.includes('.') || /e/i.test(t))) return n;
  }
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null') return null;
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

// ---- XML ------------------------------------------------------------------

function parseXmlNode(el: Element): unknown {
  const obj: Row = {};
  for (const attr of Array.from(el.attributes)) {
    obj[`@${attr.name}`] = inferScalar(attr.value);
  }
  const children = Array.from(el.children);
  if (!children.length) {
    const text = (el.textContent ?? '').trim();
    if (!Object.keys(obj).length) return inferScalar(text);
    if (text) obj['#text'] = inferScalar(text);
    return obj;
  }
  for (const child of children) {
    const k = child.tagName;
    const v = parseXmlNode(child);
    if (k in obj) {
      if (!Array.isArray(obj[k])) obj[k] = [obj[k]];
      (obj[k] as unknown[]).push(v);
    } else {
      obj[k] = v;
    }
  }
  return obj;
}

function parseXml(text: string): unknown {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const err = doc.querySelector('parsererror');
  if (err) throw new Error('Invalid XML document');
  const root = doc.documentElement;
  const parsed = parseXmlNode(root);
  if (isPlainObject(parsed)) {
    const keys = Object.keys(parsed);
    if (keys.length === 1 && Array.isArray(parsed[keys[0]])) return parsed[keys[0]];
  }
  return parsed;
}

const escXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const safeTag = (k: string) => k.replace(/[^a-zA-Z0-9_.-]/g, '_').replace(/^([^a-zA-Z_])/, '_$1') || 'item';

function toXmlNode(tag: string, val: unknown, indent = ''): string {
  const t = safeTag(tag);
  if (val === null || val === undefined) return `${indent}<${t}/>\n`;
  if (Array.isArray(val)) {
    return val.map((item) => toXmlNode(t === 'root' ? 'row' : t, item, indent)).join('');
  }
  if (isPlainObject(val)) {
    const children = Object.entries(val)
      .map(([k, v]) => toXmlNode(k, v, indent + '  '))
      .join('');
    return `${indent}<${t}>\n${children}${indent}</${t}>\n`;
  }
  return `${indent}<${t}>${escXml(String(val))}</${t}>\n`;
}

function writeXml(value: unknown): string {
  const body = Array.isArray(value)
    ? value.map((item) => toXmlNode('record', item, '  ')).join('')
    : isPlainObject(value)
      ? Object.entries(value)
          .map(([k, v]) => toXmlNode(k, v, '  '))
          .join('')
      : `  <value>${escXml(String(value))}</value>\n`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<root>\n${body}</root>\n`;
}

// ---- INI / ENV / TOML -----------------------------------------------------

function parseIniOrToml(text: string): Row {
  const root: Row = {};
  let current: Row = root;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*[#;].*$/, '').trim();
    if (!line) continue;

    // [[array_of_tables]]
    const arrSec = /^\[\[([^\]]+)\]\]$/.exec(line);
    if (arrSec) {
      const path = arrSec[1].trim().split('.');
      let ptr: Row = root;
      for (let i = 0; i < path.length - 1; i++) {
        ptr = (ptr[path[i]] = isPlainObject(ptr[path[i]]) ? (ptr[path[i]] as Row) : {}) as Row;
      }
      const last = path[path.length - 1];
      const list = Array.isArray(ptr[last]) ? (ptr[last] as Row[]) : (ptr[last] = []);
      const item: Row = {};
      list.push(item);
      current = item;
      continue;
    }

    // [section]
    const sec = /^\[([^\]]+)\]$/.exec(line);
    if (sec) {
      const path = sec[1].trim().split('.');
      let ptr: Row = root;
      for (const p of path) {
        ptr = (ptr[p] = isPlainObject(ptr[p]) ? (ptr[p] as Row) : {}) as Row;
      }
      current = ptr;
      continue;
    }

    const eq = line.indexOf('=');
    if (eq > 0) {
      const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
      const rawVal = line.slice(eq + 1).trim();
      if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
        try {
          current[key] = JSON.parse(rawVal);
          continue;
        } catch {
          // fall through
        }
      }
      current[key] = inferScalar(rawVal);
    }
  }
  return root;
}

function writeEnv(value: unknown): string {
  const flat: [string, string][] = [];
  const walk = (prefix: string, v: unknown) => {
    if (isPlainObject(v)) {
      for (const [k, child] of Object.entries(v)) {
        walk(prefix ? `${prefix}_${k}` : k, child);
      }
    } else if (Array.isArray(v)) {
      flat.push([prefix || 'ITEMS', JSON.stringify(v)]);
    } else {
      const s = v === null || v === undefined ? '' : String(v);
      flat.push([prefix || 'VALUE', /\s|[#"']/g.test(s) ? JSON.stringify(s) : s]);
    }
  };
  walk('', Array.isArray(value) ? { rows: value } : value);
  return flat.map(([k, v]) => `${k.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}=${v}`).join('\n') + '\n';
}

function writeIni(value: unknown): string {
  const obj: Row = Array.isArray(value)
    ? Object.fromEntries(value.map((r, i) => [`row_${i + 1}`, isPlainObject(r) ? r : { value: r }]))
    : isPlainObject(value)
      ? value
      : { value };

  const scalars: string[] = [];
  const sections: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (isPlainObject(v)) {
      const lines = [`[${k}]`];
      for (const [sk, sv] of Object.entries(v)) {
        lines.push(`${sk} = ${typeof sv === 'object' ? JSON.stringify(sv) : (sv ?? '')}`);
      }
      sections.push(lines.join('\n'));
    } else {
      scalars.push(`${k} = ${typeof v === 'object' ? JSON.stringify(v) : (v ?? '')}`);
    }
  }
  return [...scalars, ...sections].join('\n\n') + '\n';
}

function tomlVal(v: unknown): string {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.map(tomlVal).join(', ')}]`;
  return JSON.stringify(v === null || v === undefined ? '' : String(v));
}

function writeToml(value: unknown): string {
  if (Array.isArray(value)) {
    return (
      value
        .map((r) => {
          const row = isPlainObject(r) ? r : { value: r };
          return `[[records]]\n` + Object.entries(row).map(([k, v]) => `${k} = ${tomlVal(v)}`).join('\n');
        })
        .join('\n\n') + '\n'
    );
  }
  if (!isPlainObject(value)) return `value = ${tomlVal(value)}\n`;
  const top: string[] = [];
  const tables: string[] = [];
  for (const [k, v] of Object.entries(value)) {
    if (isPlainObject(v)) {
      tables.push(`[${k}]\n` + Object.entries(v).map(([sk, sv]) => `${sk} = ${tomlVal(sv)}`).join('\n'));
    } else if (Array.isArray(v) && v.length && v.every(isPlainObject)) {
      for (const item of v as Row[]) {
        tables.push(`[[${k}]]\n` + Object.entries(item).map(([sk, sv]) => `${sk} = ${tomlVal(sv)}`).join('\n'));
      }
    } else {
      top.push(`${k} = ${tomlVal(v)}`);
    }
  }
  return [...top, ...tables].join('\n\n') + '\n';
}

// ---- SQL ------------------------------------------------------------------

function parseSql(text: string): Row[] {
  const rows: Row[] = [];
  const re = /INSERT\s+INTO\s+\S+\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const cols = m[1].split(',').map((c) => c.trim().replace(/^[`"[]|[`"\]]$/g, ''));
    const vals = parseDelimited(m[2], ',')[0] ?? [];
    const r: Row = {};
    cols.forEach((c, i) => {
      const raw = (vals[i] ?? '').trim().replace(/^'|'$/g, '');
      r[c] = raw.toUpperCase() === 'NULL' ? null : inferScalar(raw);
    });
    rows.push(r);
  }
  return rows.length ? rows : [{ sql: text.trim() }];
}

function writeSql(t: Table): string {
  const cols = t.headers.length ? t.headers : ['value'];
  const qId = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const qVal = (v: unknown): string => {
    if (v === null || v === undefined || v === '') return 'NULL';
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return `'${s.replace(/'/g, "''")}'`;
  };
  const create = `CREATE TABLE IF NOT EXISTS "records" (\n  ${cols.map((c) => `${qId(c)} TEXT`).join(',\n  ')}\n);\n`;
  const inserts = t.rows.map(
    (r) => `INSERT INTO "records" (${cols.map(qId).join(', ')}) VALUES (${cols.map((c) => qVal(r[c])).join(', ')});`,
  );
  return [create, ...inserts].join('\n') + '\n';
}

function writeHtmlTable(t: Table): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const ths = t.headers.map((h) => `      <th>${esc(h)}</th>`).join('\n');
  const trs = t.rows
    .map((r) => `    <tr>\n${t.headers.map((h) => `      <td>${esc(cell(r[h]))}</td>`).join('\n')}\n    </tr>`)
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Table</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; color: #111; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: 0.45rem 0.7rem; text-align: left; }
  th { background: #f4f4f4; }
</style>
</head>
<body>
<table>
  <thead>
    <tr>
${ths}
    </tr>
  </thead>
  <tbody>
${trs}
  </tbody>
</table>
</body>
</html>
`;
}

// ---- Core Dispatcher ------------------------------------------------------

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
    case 'xml':
      return parseXml(clean);
    case 'toml':
    case 'ini':
    case 'env':
      return parseIniOrToml(clean);
    case 'sql':
      return parseSql(clean);
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
    case 'xml':
      return writeXml(value);
    case 'toml':
      return writeToml(value);
    case 'ini':
      return writeIni(value);
    case 'env':
      return writeEnv(value);
    case 'sql':
      return writeSql(toTable(value));
    case 'html':
      return writeHtmlTable(toTable(value));
    case 'txt':
      return writeText(value);
    default:
      throw new Error(`Unsupported data output: ${to}`);
  }
}
