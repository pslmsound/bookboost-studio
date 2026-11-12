// A small, safe Markdown subset used to preview drafts and export emails.
// It never passes raw HTML through: all text is escaped.
export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'rule' };

export interface InlineToken {
  text: string;
  bold: boolean;
  italic: boolean;
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
    if (list) blocks.push({ type: 'list', ...list });
    paragraph = [];
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (line.trim() === '') {
      flush();
    } else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flush();
      blocks.push({ type: 'rule' });
    } else if (heading) {
      flush();
      blocks.push({ type: 'heading', level: heading[1].length as 1 | 2 | 3, text: heading[2].replace(/\s+#+$/, '') });
    } else if (bullet || numbered) {
      const ordered = !bullet;
      if (paragraph.length || (list && list.ordered !== ordered)) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
    } else {
      if (list) flush();
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
}

export function inlineTokens(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const pattern = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) tokens.push({ text: text.slice(last, match.index), bold: false, italic: false });
    const bold = match[2] ?? match[3];
    if (bold !== undefined) tokens.push({ text: bold, bold: true, italic: false });
    else tokens.push({ text: match[4] ?? match[5], bold: false, italic: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) tokens.push({ text: text.slice(last), bold: false, italic: false });
  return tokens;
}

export const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function inlineHtml(text: string): string {
  return inlineTokens(text)
    .map((t) => {
      const safe = escapeHtml(t.text).replace(/\n/g, '<br>');
      return t.bold ? `<strong>${safe}</strong>` : t.italic ? `<em>${safe}</em>` : safe;
    })
    .join('');
}

/** Converts a draft to a simple, self contained HTML document suitable for pasting into an email tool. */
export function toEmailHtml(input: { subject: string; preheader: string; body: string }): string {
  const content = parseMarkdown(input.body)
    .map((block) => {
      if (block.type === 'heading') {
        const size = block.level === 1 ? 26 : block.level === 2 ? 21 : 17;
        return `<h${block.level} style="font-family:Georgia,serif;font-size:${size}px;line-height:1.3;margin:28px 0 12px;color:#1c1c1a;">${inlineHtml(block.text)}</h${block.level}>`;
      }
      if (block.type === 'list') {
        const tag = block.ordered ? 'ol' : 'ul';
        return `<${tag} style="margin:0 0 18px;padding-left:22px;">${block.items.map((i) => `<li style="margin:0 0 6px;">${inlineHtml(i)}</li>`).join('')}</${tag}>`;
      }
      if (block.type === 'rule') return '<hr style="border:none;border-top:1px solid #dcd8cf;margin:28px 0;">';
      return `<p style="margin:0 0 18px;">${inlineHtml(block.text)}</p>`;
    })
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f6f3ec;">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(input.preheader)}</div>
<div style="max-width:600px;margin:0 auto;padding:40px 28px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2b2b28;">
${content}
</div>
</body>
</html>
`;
}
