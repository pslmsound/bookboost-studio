import { describe, expect, it } from 'vitest';
import { ASSISTANT_TEMPLATES, CONTENT_GUIDES, SYSTEM_PROMPT, assistantPrompt, bookContext, contentPrompt, revisePrompt } from '../src/shared/prompts';
import { inlineTokens, parseMarkdown, toEmailHtml } from '../src/shared/markdown';
import { bookSchema, contactSchema, settingsSchema, type Book } from '../src/shared/schema';

const author = settingsSchema.parse({}).author;
const book: Book = {
  ...bookSchema.parse({ title: 'The Salt Road', authorName: 'A. Writer', genre: 'Historical', summary: 'A ledger of debts.', tone: 'Warm', channels: ['Instagram'], purchaseLinks: [{ label: 'Shop', url: 'https://example.com/buy' }] }),
  id: 'b1', createdAt: '', updatedAt: '',
};

describe('prompts', () => {
  it('includes book details and omits empty fields', () => {
    const context = bookContext(book, author);
    expect(context).toContain('Title: The Salt Road');
    expect(context).toContain('Where to buy: Shop https://example.com/buy');
    expect(context).not.toContain('Subtitle:');
    expect(context).not.toContain('About the author:');
  });
  it('builds a content prompt with the task and brief', () => {
    const prompt = contentPrompt({ book, author, kind: 'social_caption', brief: 'Cover reveal on Instagram' });
    expect(prompt).toContain(CONTENT_GUIDES.social_caption!.instruction);
    expect(prompt).toContain('BRIEF FROM THE AUTHOR\nCover reveal on Instagram');
    expect(prompt).not.toContain('RECIPIENT');
  });
  it('adds recipient details only for pitches', () => {
    const prompt = contentPrompt({ book, author, kind: 'outreach_pitch', brief: '', contact: { name: 'Jane', outlet: 'Book Blog', type: 'reviewer', notes: 'Loves sea stories' } });
    expect(prompt).toContain('RECIPIENT\nName: Jane\nOutlet: Book Blog');
    expect(prompt).toContain('Loves sea stories');
  });
  it('builds assistant and revise prompts', () => {
    expect(assistantPrompt({ book, author, template: 'question', question: 'How do I reach book clubs?' })).toContain('QUESTION\nHow do I reach book clubs?');
    expect(assistantPrompt({ book, author, template: 'marketing_plan', question: '' })).toContain(ASSISTANT_TEMPLATES.marketing_plan.instruction);
    const revise = revisePrompt({ book, author, body: 'Old text', instruction: ' Shorter ' });
    expect(revise).toContain('INSTRUCTION\nShorter');
    expect(revise.endsWith('CURRENT DRAFT\nOld text')).toBe(true);
  });
  it('tells the model never to fabricate proof', () => {
    expect(SYSTEM_PROMPT).toMatch(/Never invent reviews, endorsements, awards/);
  });
});

describe('markdown', () => {
  it('parses headings, lists, rules and paragraphs', () => {
    const blocks = parseMarkdown('# Plan\n\nIntro line\nsecond line\n\n- one\n- two\n\n1. first\n2. second\n\n---\n\n### Small');
    expect(blocks).toEqual([
      { type: 'heading', level: 1, text: 'Plan' },
      { type: 'paragraph', text: 'Intro line\nsecond line' },
      { type: 'list', ordered: false, items: ['one', 'two'] },
      { type: 'list', ordered: true, items: ['first', 'second'] },
      { type: 'rule' },
      { type: 'heading', level: 3, text: 'Small' },
    ]);
  });
  it('tokenizes bold and italic', () => {
    expect(inlineTokens('a **b** and *c*')).toEqual([
      { text: 'a ', bold: false, italic: false },
      { text: 'b', bold: true, italic: false },
      { text: ' and ', bold: false, italic: false },
      { text: 'c', bold: false, italic: true },
    ]);
  });
  it('escapes HTML in exported email so content cannot inject markup', () => {
    const html = toEmailHtml({ subject: 'Hi <b>', preheader: '"quoted"', body: '<script>alert(1)</script>\n\n**Bold** & more' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('<strong>Bold</strong> &amp; more');
    expect(html).toContain('<title>Hi &lt;b&gt;</title>');
  });
});

describe('validation schemas', () => {
  it('requires a title and author and applies defaults', () => {
    expect(bookSchema.safeParse({ title: ' ', authorName: 'A' }).success).toBe(false);
    const parsed = bookSchema.parse({ title: ' My Book ', authorName: 'A' });
    expect(parsed).toMatchObject({ title: 'My Book', status: 'active', channels: [], isDemo: false, coverFile: '' });
  });
  it('rejects links that are not web addresses and unsafe cover names', () => {
    expect(bookSchema.safeParse({ title: 'T', authorName: 'A', purchaseLinks: [{ label: 'x', url: 'javascript:alert(1)' }] }).success).toBe(false);
    expect(bookSchema.safeParse({ title: 'T', authorName: 'A', coverFile: '../../evil.png' }).success).toBe(false);
  });
  it('validates contact email addresses', () => {
    expect(contactSchema.safeParse({ bookId: 'b', name: 'N', email: 'nope' }).success).toBe(false);
    expect(contactSchema.parse({ bookId: 'b', name: 'N' }).consent).toBe('unknown');
  });
});
