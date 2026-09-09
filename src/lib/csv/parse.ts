/**
 * Minimal RFC 4180 CSV parser.
 *
 * Written by hand rather than pulled from a dependency because the import path
 * needs exact control over quoted fields, embedded newlines and BOM handling -
 * all of which appear in real YouTube Studio and TikTok exports.
 */

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  /** Rows whose column count did not match the header row. */
  malformedRowNumbers: number[];
  delimiter: string;
}

const DELIMITER_CANDIDATES = [',', ';', '\t'];

/** Picks the delimiter that yields the most columns on the header line. */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  let best = ',';
  let bestCount = 0;
  for (const candidate of DELIMITER_CANDIDATES) {
    const count = splitLine(firstLine, candidate).length;
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }
  return best;
}

function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      out.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}

export function parseCsv(input: string, delimiter?: string): ParsedCsv {
  // Strip UTF-8 BOM, which Excel adds and which corrupts the first header.
  const text = input.replace(/^﻿/, '');
  const sep = delimiter ?? detectDelimiter(text);

  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === sep) {
      record.push(field);
      field = '';
    } else if (char === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const nonEmpty = records.filter((r) => r.some((cell) => cell.trim().length > 0));
  if (nonEmpty.length === 0) {
    return { headers: [], rows: [], malformedRowNumbers: [], delimiter: sep };
  }

  const headers = nonEmpty[0].map((h) => h.trim());
  const rows: string[][] = [];
  const malformedRowNumbers: number[] = [];

  nonEmpty.slice(1).forEach((row, index) => {
    if (row.length !== headers.length) {
      malformedRowNumbers.push(index + 2); // +2: 1-indexed, and skip header row
      // Still keep the row, padded/truncated, so the user can see it in preview.
      const normalised = headers.map((_, i) => row[i] ?? '');
      rows.push(normalised);
    } else {
      rows.push(row);
    }
  });

  return { headers, rows, malformedRowNumbers, delimiter: sep };
}

/** Serialises rows to CSV, quoting only what needs it. */
export function toCsv(headers: string[], rows: Array<Array<string | number | null>>): string {
  const escape = (value: string | number | null): string => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    return /[",\r\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
  };
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) lines.push(row.map(escape).join(','));
  return lines.join('\r\n');
}
