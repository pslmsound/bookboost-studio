// CSV parsing, serialization and import mapping. Pure functions, unit tested.
import { z } from 'zod';
import { CONSENT, CONTACT_STATUS, CONTACT_TYPES, METRIC_SOURCES, METRIC_TYPES, contactSchema, metricSchema } from './schema';

/** RFC 4180 parser. Handles quoted fields, escaped quotes, CRLF and a UTF-8 BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/**
 * Serializes rows to CSV. Cells that begin with a formula character are
 * prefixed with an apostrophe so spreadsheet apps do not execute them.
 */
export function toCsv(headers: string[], rows: (string | number | boolean)[][]): string {
  const cell = (value: string | number | boolean) => {
    let text = String(value ?? '');
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

const normalizeHeader = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

function toRecords(rows: string[][], aliases: Record<string, string[]>): { records: Record<string, string>[]; missing: string[] } {
  if (rows.length === 0) return { records: [], missing: [] };
  const header = rows[0].map(normalizeHeader);
  const index: Record<string, number> = {};
  for (const [field, names] of Object.entries(aliases)) {
    const at = header.findIndex((h) => names.includes(h));
    if (at >= 0) index[field] = at;
  }
  const records = rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    for (const [field, at] of Object.entries(index)) rec[field] = (r[at] ?? '').trim();
    return rec;
  });
  return { records, missing: Object.keys(aliases).filter((f) => !(f in index)) };
}

/** Accepts 2026-03-09, 3/9/2026 and 03/09/26. Returns '' when the value is not a date. */
export function normalizeDate(value: string): string {
  const v = value.trim();
  if (v === '') return '';
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  let y: number, mo: number, d: number;
  if (m) {
    [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(v))) {
    [mo, d, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (y < 100) y += 2000;
  } else {
    return '';
  }
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return '';
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const pick = <T extends readonly string[]>(options: T, value: string, fallback: T[number]): T[number] => {
  const key = normalizeHeader(value);
  return (options as readonly string[]).includes(key) ? (key as T[number]) : fallback;
};

export interface ImportResult<T> {
  valid: T[];
  errors: { row: number; message: string }[];
  missingRequired: string[];
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue ? `${issue.path.join('.') || 'row'}: ${issue.message}` : 'Invalid row';
}

// ---------- Contacts ----------
export const CONTACT_CSV_HEADERS = ['name', 'outlet', 'type', 'email', 'url', 'status', 'consent', 'last_contacted', 'next_follow_up', 'notes'];
const CONTACT_ALIASES: Record<string, string[]> = {
  name: ['name', 'full_name', 'contact', 'contact_name'],
  outlet: ['outlet', 'publication', 'show', 'podcast', 'company', 'organization'],
  type: ['type', 'category'],
  email: ['email', 'email_address'],
  url: ['url', 'website', 'link'],
  status: ['status', 'stage'],
  consent: ['consent'],
  lastContacted: ['last_contacted', 'last_contact'],
  nextFollowUp: ['next_follow_up', 'follow_up', 'followup', 'next_followup'],
  notes: ['notes', 'note'],
};

export function importContacts(text: string, bookId: string): ImportResult<z.infer<typeof contactSchema>> {
  const { records, missing } = toRecords(parseCsv(text), CONTACT_ALIASES);
  const result: ImportResult<z.infer<typeof contactSchema>> = { valid: [], errors: [], missingRequired: [] };
  if (missing.includes('name')) {
    result.missingRequired.push('name');
    return result;
  }
  records.forEach((rec, i) => {
    const parsed = contactSchema.safeParse({
      bookId,
      name: rec.name ?? '',
      outlet: rec.outlet ?? '',
      type: pick(CONTACT_TYPES, rec.type ?? '', 'other'),
      email: rec.email ?? '',
      url: rec.url ?? '',
      status: pick(CONTACT_STATUS, rec.status ?? '', 'prospect'),
      // Consent is never assumed. Anything unrecognized is recorded as unknown.
      consent: pick(CONSENT, rec.consent ?? '', 'unknown'),
      lastContacted: normalizeDate(rec.lastContacted ?? ''),
      nextFollowUp: normalizeDate(rec.nextFollowUp ?? ''),
      notes: rec.notes ?? '',
    });
    if (parsed.success) result.valid.push(parsed.data);
    else result.errors.push({ row: i + 2, message: firstIssue(parsed.error) });
  });
  return result;
}

// ---------- Metrics ----------
export const METRIC_CSV_HEADERS = ['date', 'metric', 'value', 'channel', 'source', 'note'];
const METRIC_ALIASES: Record<string, string[]> = {
  date: ['date', 'day'],
  metric: ['metric', 'type', 'measure'],
  value: ['value', 'amount', 'count', 'total'],
  channel: ['channel', 'platform', 'retailer'],
  source: ['source', 'provenance'],
  note: ['note', 'notes'],
};
const METRIC_NAME_ALIASES: Record<string, (typeof METRIC_TYPES)[number]> = {
  sales: 'units_sold', units: 'units_sold', copies_sold: 'units_sold', copies: 'units_sold',
  royalties: 'revenue', earnings: 'revenue', views: 'page_views', traffic: 'page_views', visits: 'page_views',
  clicks: 'link_clicks', engagement: 'engagements', likes: 'engagements', signups: 'subscribers',
  new_subscribers: 'subscribers', new_reviews: 'reviews',
};

export function importMetrics(text: string, bookId: string): ImportResult<z.infer<typeof metricSchema>> {
  const { records, missing } = toRecords(parseCsv(text), METRIC_ALIASES);
  const result: ImportResult<z.infer<typeof metricSchema>> = { valid: [], errors: [], missingRequired: [] };
  for (const required of ['date', 'metric', 'value']) if (missing.includes(required)) result.missingRequired.push(required);
  if (result.missingRequired.length > 0) return result;

  records.forEach((rec, i) => {
    const row = i + 2;
    const date = normalizeDate(rec.date ?? '');
    if (!date) return void result.errors.push({ row, message: `date: "${rec.date}" is not a recognized date` });
    const key = normalizeHeader(rec.metric ?? '');
    const metric = (METRIC_TYPES as readonly string[]).includes(key) ? key : METRIC_NAME_ALIASES[key];
    if (!metric) return void result.errors.push({ row, message: `metric: "${rec.metric}" is not supported` });
    const value = Number((rec.value ?? '').replace(/[$£€,\s]/g, ''));
    if ((rec.value ?? '') === '' || !Number.isFinite(value)) {
      return void result.errors.push({ row, message: `value: "${rec.value}" is not a number` });
    }
    const parsed = metricSchema.safeParse({
      bookId,
      date,
      metric,
      value,
      channel: rec.channel ?? '',
      // Imported numbers are treated as user entered unless the file marks them otherwise.
      source: pick(METRIC_SOURCES, rec.source ?? '', 'user_entered'),
      origin: 'csv',
      note: rec.note ?? '',
    });
    if (parsed.success) result.valid.push(parsed.data);
    else result.errors.push({ row, message: firstIssue(parsed.error) });
  });
  return result;
}
