import { marked } from 'marked';
import type { FormatId } from '../formats';
import { readZipEntries } from './archive';

/**
 * Browser-side Document Converter:
 * Supports MD ⇄ HTML ⇄ TXT ⇄ RTF, reading DOCX -> MD/HTML/TXT/RTF/PDF,
 * and generating multi-page PDF documents from MD/HTML/TXT/RTF/DOCX in pure TypeScript.
 */

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function wrapHtml(body: string, title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; line-height: 1.6; max-width: 46rem; margin: 2rem auto; padding: 0 1rem; color: #111; }
  pre, code { font-family: ui-monospace, monospace; background: #f4f4f4; border-radius: 4px; }
  pre { padding: .75rem; overflow: auto; } code { padding: .1rem .3rem; }
  table { border-collapse: collapse; } td, th { border: 1px solid #ccc; padding: .3rem .6rem; }
  img { max-width: 100%; } blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 1rem; color: #555; }
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

const BLOCK = new Set([
  'P', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'NAV', 'UL', 'OL', 'TABLE', 'TR',
  'BLOCKQUOTE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'FIGURE', 'DL', 'DT', 'DD',
]);

function parseHtml(html: string): Document {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, noscript, template').forEach((n) => n.remove());
  return doc;
}

function collapse(s: string): string {
  return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function htmlToText(html: string): string {
  const doc = parseHtml(html);
  const out: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      out.push((n.textContent ?? '').replace(/\s+/g, ' '));
      return;
    }
    if (!(n instanceof Element)) return;
    const tag = n.tagName;
    if (tag === 'BR') return void out.push('\n');
    if (tag === 'LI') out.push('\n• ');
    if (tag === 'TD' || tag === 'TH') out.push('\t');
    if (BLOCK.has(tag)) out.push('\n\n');
    if (tag === 'PRE') {
      out.push(n.textContent ?? '');
    } else n.childNodes.forEach(walk);
    if (BLOCK.has(tag)) out.push('\n\n');
  };
  walk(doc.body);
  return collapse(out.join('').replace(/\n /g, '\n'));
}

function htmlToMarkdown(html: string): string {
  const doc = parseHtml(html);
  const inline = (n: Node): string => {
    if (n.nodeType === Node.TEXT_NODE) return (n.textContent ?? '').replace(/\s+/g, ' ');
    if (!(n instanceof Element)) return '';
    const kids = () => Array.from(n.childNodes).map(inline).join('');
    switch (n.tagName) {
      case 'STRONG':
      case 'B':
        return `**${kids().trim()}**`;
      case 'EM':
      case 'I':
        return `*${kids().trim()}*`;
      case 'CODE':
        return '`' + (n.textContent ?? '') + '`';
      case 'A':
        return `[${kids().trim()}](${n.getAttribute('href') ?? ''})`;
      case 'IMG':
        return `![${n.getAttribute('alt') ?? ''}](${n.getAttribute('src') ?? ''})`;
      case 'BR':
        return '  \n';
      default:
        return block(n);
    }
  };
  const block = (n: Element, depth = 0): string => {
    const kids = () => Array.from(n.childNodes).map(inline).join('');
    const tag = n.tagName;
    const h = /^H([1-6])$/.exec(tag);
    if (h) return `\n\n${'#'.repeat(Number(h[1]))} ${kids().trim()}\n\n`;
    switch (tag) {
      case 'P':
        return `\n\n${kids().trim()}\n\n`;
      case 'HR':
        return '\n\n---\n\n';
      case 'PRE':
        return `\n\n\`\`\`\n${(n.textContent ?? '').replace(/\n$/, '')}\n\`\`\`\n\n`;
      case 'BLOCKQUOTE':
        return '\n\n' + kids().trim().split('\n').map((l) => `> ${l}`).join('\n') + '\n\n';
      case 'UL':
      case 'OL': {
        const items = Array.from(n.children).filter((c) => c.tagName === 'LI');
        return (
          '\n\n' +
          items
            .map((li, i) => `${'  '.repeat(depth)}${tag === 'OL' ? `${i + 1}.` : '-'} ${Array.from(li.childNodes).map(inline).join('').trim()}`)
            .join('\n') +
          '\n\n'
        );
      }
      default:
        return kids();
    }
  };
  return collapse(block(doc.body));
}

function textToHtml(text: string, title: string): string {
  const body = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
  return wrapHtml(body, title);
}

// ---- RTF Reader & Writer --------------------------------------------------

function rtfToText(rtf: string): string {
  return collapse(
    rtf
      .replace(/\\par\b\s*/g, '\n\n')
      .replace(/\\line\b\s*/g, '\n')
      .replace(/\\tab\b\s*/g, '\t')
      .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\u(-?\d+)\??/g, (_, code: string) => String.fromCharCode(Number(code) & 0xffff))
      .replace(/\{\\(?:fonttbl|colortbl|stylesheet|info|pict|header|footer|\*\\[a-z]+)[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/gi, '')
      .replace(/\\[a-zA-Z]+-?\d*\s?/g, '')
      .replace(/[{}]/g, ''),
  );
}

function textToRtf(text: string): string {
  const esc = (s: string) =>
    s.replace(/[\\{}]/g, (m) => `\\${m}`).replace(/[^\x00-\x7f]/g, (c) => `\\u${c.charCodeAt(0)}?`);
  const paras = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => `${esc(line)}\\par`)
    .join('\n');
  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\f0\\fs24\n${paras}\n}\n`;
}

// ---- DOCX Reader (extracts word/document.xml from PKZIP) ------------------

async function docxToMarkdown(blob: Blob): Promise<string> {
  const entries = await readZipEntries(new Uint8Array(await blob.arrayBuffer()));
  const docEntry = entries.find((e) => e.name === 'word/document.xml');
  if (!docEntry) throw new Error('word/document.xml not found inside DOCX');
  const xml = new TextDecoder().decode(docEntry.data);
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const paras = Array.from(doc.getElementsByTagNameNS('*', 'p'));
  const lines: string[] = [];

  for (const p of paras) {
    const styleEl = p.getElementsByTagNameNS('*', 'pStyle')[0];
    const styleVal = styleEl?.getAttribute('w:val') || styleEl?.getAttribute('val') || '';
    const texts = Array.from(p.getElementsByTagNameNS('*', 't'))
      .map((t) => t.textContent ?? '')
      .join('');
    if (!texts.trim()) continue;
    const hMatch = /Heading([1-6])/i.exec(styleVal);
    if (hMatch) {
      lines.push(`${'#'.repeat(Number(hMatch[1]))} ${texts.trim()}`);
    } else if (/List/i.test(styleVal)) {
      lines.push(`- ${texts.trim()}`);
    } else {
      lines.push(texts);
    }
  }
  return lines.join('\n\n') + '\n';
}

// ---- Pure-TS Multi-Page PDF-1.4 Writer ------------------------------------

function textToPdf(text: string): Blob {
  const pageW = 612; // US Letter width (pt)
  const pageH = 792; // US Letter height (pt)
  const margin = 54;
  const lineHeight = 15;
  const maxCharsPerLine = 82;

  interface PdfLine {
    text: string;
    bold: boolean;
    size: number;
  }

  const wrapped: PdfLine[] = [];
  for (const rawLine of text.replace(/\r\n/g, '\n').split('\n')) {
    const h = /^(#{1,3})\s+(.*)$/.exec(rawLine);
    const clean = (h ? h[2] : rawLine)
      .replace(/[^\x20-\x7e]/g, ' ')
      .trimEnd();
    const bold = Boolean(h);
    const size = h ? (h[1].length === 1 ? 16 : 13) : 11;
    const limit = bold ? Math.floor(maxCharsPerLine * (11 / size)) : maxCharsPerLine;

    if (!clean) {
      wrapped.push({ text: '', bold: false, size: 11 });
      continue;
    }
    const words = clean.split(/\s+/);
    let current = '';
    for (const w of words) {
      if ((current + ' ' + w).trim().length > limit && current) {
        wrapped.push({ text: current, bold, size });
        current = w;
      } else {
        current = current ? `${current} ${w}` : w;
      }
    }
    if (current) wrapped.push({ text: current, bold, size });
  }

  const linesPerPage = Math.floor((pageH - margin * 2) / lineHeight);
  const pages: PdfLine[][] = [];
  for (let i = 0; i < Math.max(1, wrapped.length); i += linesPerPage) {
    pages.push(wrapped.slice(i, i + linesPerPage));
  }

  const escPdf = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const enc = new TextEncoder();
  const chunks: BlobPart[] = [];
  const offsets: number[] = [0];
  let pos = 0;
  const pushStr = (s: string) => {
    const b = enc.encode(s);
    chunks.push(b);
    pos += b.length;
  };
  const startObj = (id: number) => {
    offsets[id] = pos;
    pushStr(`${id} 0 obj\n`);
  };

  // Objects: 1 = Catalog, 2 = Pages, 3 = Font Regular, 4 = Font Bold, 5.. = Page + Content pairs
  pushStr('%PDF-1.4\n');
  startObj(1);
  pushStr('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  const pageObjIds = pages.map((_, i) => 5 + i * 2);
  startObj(2);
  pushStr(`<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj\n`);

  startObj(3);
  pushStr('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');
  startObj(4);
  pushStr('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n');

  pages.forEach((pLines, idx) => {
    const pageId = 5 + idx * 2;
    const contentId = pageId + 1;
    let y = pageH - margin;
    const ops = ['BT'];
    for (const ln of pLines) {
      if (ln.text) {
        ops.push(`/${ln.bold ? 'F2' : 'F1'} ${ln.size} Tf`);
        ops.push(`1 0 0 1 ${margin} ${y} Tm (${escPdf(ln.text)}) Tj`);
      }
      y -= lineHeight;
    }
    ops.push('ET\n');
    const stream = ops.join('\n');

    startObj(pageId);
    pushStr(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
    );
    startObj(contentId);
    pushStr(`<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`);
  });

  const totalObjs = 5 + pages.length * 2;
  const xrefOffset = pos;
  pushStr(`xref\n0 ${totalObjs}\n0000000000 65535 f \n`);
  for (let i = 1; i < totalObjs; i++) {
    pushStr(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  pushStr(`trailer\n<< /Size ${totalObjs} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}

export async function convertDocBlob(input: Blob, from: FormatId, to: FormatId, title = 'Document'): Promise<Blob> {
  // Normalize input into Markdown or HTML/Plain text
  let mdOrText: string;
  let actualFrom: FormatId = from;

  if (from === 'docx') {
    mdOrText = await docxToMarkdown(input);
    actualFrom = 'md';
  } else if (from === 'rtf') {
    mdOrText = rtfToText(await input.text());
    actualFrom = 'txt';
  } else {
    mdOrText = await input.text();
  }

  if (to === 'pdf') {
    const plainOrMd = actualFrom === 'html' ? htmlToMarkdown(mdOrText) : mdOrText;
    return textToPdf(plainOrMd);
  }
  if (to === 'rtf') {
    const plain = actualFrom === 'html' ? htmlToText(mdOrText) : actualFrom === 'md' ? htmlToText(marked.parse(mdOrText, { async: false, gfm: true }) as string) : mdOrText;
    return new Blob([textToRtf(plain)], { type: 'application/rtf;charset=utf-8' });
  }

  const outText = convertDocText(mdOrText, actualFrom, to, title);
  const mime = to === 'html' ? 'text/html' : to === 'md' ? 'text/markdown' : 'text/plain';
  return new Blob([outText], { type: `${mime};charset=utf-8` });
}

export function convertDocText(text: string, from: FormatId, to: FormatId, title = 'Document'): string {
  if (from === to) return text;
  const key = `${from}>${to}`;
  switch (key) {
    case 'md>html':
      return wrapHtml(marked.parse(text, { async: false, gfm: true }) as string, title);
    case 'md>txt':
      return htmlToText(marked.parse(text, { async: false, gfm: true }) as string);
    case 'html>txt':
      return htmlToText(text);
    case 'html>md':
      return htmlToMarkdown(text);
    case 'txt>html':
      return textToHtml(text, title);
    case 'txt>md':
      return text.replace(/\r\n/g, '\n');
    default:
      throw new Error(`${from.toUpperCase()} → ${to.toUpperCase()} requires the Pandoc engine`);
  }
}
