import { describe, expect, it } from 'vitest';
import { importContacts, importMetrics, normalizeDate, parseCsv, toCsv } from '../src/shared/csv';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, embedded commas and newlines', () => {
    const rows = parseCsv('name,notes\r\n"Doe, Jane","She said ""yes""\nand more"\r\nSam,plain\r\n');
    expect(rows).toEqual([
      ['name', 'notes'],
      ['Doe, Jane', 'She said "yes"\nand more'],
      ['Sam', 'plain'],
    ]);
  });
  it('strips a byte order mark and skips blank lines', () => {
    expect(parseCsv('﻿a,b\n\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('toCsv', () => {
  it('round trips through the parser', () => {
    const rows = [['Doe, Jane', 'He said "hi"', 'line\nbreak']];
    expect(parseCsv(toCsv(['a', 'b', 'c'], rows)).slice(1)).toEqual(rows);
  });
  it('neutralizes spreadsheet formulas in text cells but leaves numbers alone', () => {
    const csv = toCsv(['note', 'value'], [['=HYPERLINK("http://x")', -5], ['@cmd', 3]]);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")",-5`);
    expect(csv).toContain("'@cmd,3");
  });
});

describe('normalizeDate', () => {
  it('accepts ISO and US formats and rejects impossible dates', () => {
    expect(normalizeDate('2026-3-9')).toBe('2026-03-09');
    expect(normalizeDate('3/9/2026')).toBe('2026-03-09');
    expect(normalizeDate('03/09/26')).toBe('2026-03-09');
    expect(normalizeDate('2026-02-30')).toBe('');
    expect(normalizeDate('soon')).toBe('');
  });
});

describe('importContacts', () => {
  it('maps flexible headers and applies safe defaults', () => {
    const csv = 'Full Name,Publication,Email Address,Category,Follow Up\nJane Roe,Book Blog,jane@example.com,Podcast,3/9/2026\n';
    const result = importContacts(csv, 'book1');
    expect(result.errors).toEqual([]);
    expect(result.valid[0]).toMatchObject({
      bookId: 'book1', name: 'Jane Roe', outlet: 'Book Blog', email: 'jane@example.com', type: 'podcast',
      status: 'prospect', consent: 'unknown', nextFollowUp: '2026-03-09',
    });
  });
  it('never assumes consent from unrecognized values', () => {
    const result = importContacts('name,consent\nA,yes please\nB,opted_in\nC,Do Not Contact\n', 'b');
    expect(result.valid.map((c) => c.consent)).toEqual(['unknown', 'opted_in', 'do_not_contact']);
  });
  it('reports invalid rows with their line number and keeps the valid ones', () => {
    const result = importContacts('name,email\nGood,good@example.com\nBad,not-an-email\n,missing@example.com\n', 'b');
    expect(result.valid).toHaveLength(1);
    expect(result.errors.map((e) => e.row)).toEqual([3, 4]);
  });
  it('requires a name column', () => {
    expect(importContacts('email\na@example.com\n', 'b').missingRequired).toEqual(['name']);
  });
});

describe('importMetrics', () => {
  it('imports rows, understands aliases and currency symbols', () => {
    const csv = 'Date,Metric,Value,Platform,Source\n2026-01-15,Sales,12,Amazon,verified\n1/16/2026,revenue,"$1,204.50",Amazon,\n';
    const result = importMetrics(csv, 'b');
    expect(result.errors).toEqual([]);
    expect(result.valid[0]).toMatchObject({ date: '2026-01-15', metric: 'units_sold', value: 12, channel: 'Amazon', source: 'verified', origin: 'csv' });
    expect(result.valid[1]).toMatchObject({ date: '2026-01-16', metric: 'revenue', value: 1204.5, source: 'user_entered' });
  });
  it('rejects bad dates, unknown metrics, text values and negatives', () => {
    const csv = 'date,metric,value\nnope,units_sold,1\n2026-01-01,happiness,1\n2026-01-01,units_sold,many\n2026-01-01,units_sold,-4\n';
    const result = importMetrics(csv, 'b');
    expect(result.valid).toHaveLength(0);
    expect(result.errors.map((e) => e.row)).toEqual([2, 3, 4, 5]);
  });
  it('lists every missing required column', () => {
    expect(importMetrics('when,what\n1,2\n', 'b').missingRequired).toEqual(['date', 'metric', 'value']);
  });
});
