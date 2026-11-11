import { marked } from 'marked';
import type { FormatId } from '../formats';

/** Lightweight Markdown / HTML / TXT conversions that work without Pandoc. */

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

export function convertDocText(text: string, from: FormatId, to: FormatId, title = 'Document'): string {
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
