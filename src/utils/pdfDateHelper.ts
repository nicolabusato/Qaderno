export type DateOrder = 'DMY' | 'YMD' | 'MDY';
export type DateMonthFormat = 'numeric' | 'short' | 'long';
export type DateCaseStyle = 'lower' | 'title' | 'upper';

export interface PdfDateFormatMeta {
  order: DateOrder;
  separator: ' ' | '/' | '-' | '.';
  padDayZero: boolean;
  padMonthZero: boolean;
  monthFormat: DateMonthFormat;
  monthCase: DateCaseStyle;
  yearDigits: 4 | 2;
}

export interface DetectedPdfDate {
  startIndex: number;
  endIndex: number;
  matchedText: string;
  year: number;
  month: number; // 1..12
  day: number; // 1..31
  format: PdfDateFormatMeta;
}

export const ITALIAN_MONTHS_LONG = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
] as const;

export const ITALIAN_MONTHS_SHORT = [
  'gen',
  'feb',
  'mar',
  'apr',
  'mag',
  'giu',
  'lug',
  'ago',
  'set',
  'ott',
  'nov',
  'dic',
] as const;

export const ITALIAN_WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'] as const;

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function isValidYMD(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2199) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  return true;
}

function detectCaseStyle(word: string): DateCaseStyle {
  if (word === word.toUpperCase() && word !== word.toLowerCase()) return 'upper';
  if (word[0] && word[0] === word[0].toUpperCase() && word.slice(1) === word.slice(1).toLowerCase()) {
    return 'title';
  }
  return 'lower';
}

function applyCaseStyle(word: string, style: DateCaseStyle): string {
  if (style === 'upper') return word.toUpperCase();
  if (style === 'title') return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  return word.toLowerCase();
}

function expandTwoDigitYear(yStr: string): { year: number; yearDigits: 4 | 2 } {
  if (yStr.length === 2) {
    const n = parseInt(yStr, 10);
    return { year: n < 70 ? 2000 + n : 1900 + n, yearDigits: 2 };
  }
  return { year: parseInt(yStr, 10), yearDigits: 4 };
}

const LONG_MONTH_PATTERN = ITALIAN_MONTHS_LONG.join('|');
const SHORT_MONTH_PATTERN = ITALIAN_MONTHS_SHORT.join('|');

/**
 * Rileva una data italiana o internazionale all'interno di uno span PDF
 * (isolata o inserita in una frase, es. "Verona, 11/09/2026"), preservandone i metadati di formato.
 */
export function detectDateInText(text: string): DetectedPdfDate | null {
  if (!text || text.trim().length < 5) return null;

  // 1. Mese italiano per esteso: "11 Settembre 2026", "5 gennaio 2026", "05 SETTEMBRE 26"
  const longMonthRegex = new RegExp(
    `\\b(\\d{1,2})\\s+(${LONG_MONTH_PATTERN})\\s+(\\d{2,4})\\b`,
    'i'
  );
  const longMatch = longMonthRegex.exec(text);
  if (longMatch) {
    const dayStr = longMatch[1];
    const monthStr = longMatch[2];
    const yearStr = longMatch[3];
    const day = parseInt(dayStr, 10);
    const monthIdx = ITALIAN_MONTHS_LONG.indexOf(monthStr.toLowerCase() as (typeof ITALIAN_MONTHS_LONG)[number]);
    const month = monthIdx + 1;
    const { year, yearDigits } = expandTwoDigitYear(yearStr);

    if (monthIdx !== -1 && isValidYMD(year, month, day)) {
      return {
        startIndex: longMatch.index,
        endIndex: longMatch.index + longMatch[0].length,
        matchedText: longMatch[0],
        year,
        month,
        day,
        format: {
          order: 'DMY',
          separator: ' ',
          padDayZero: dayStr.length === 2,
          padMonthZero: false,
          monthFormat: 'long',
          monthCase: detectCaseStyle(monthStr),
          yearDigits,
        },
      };
    }
  }

  // 2. Mese italiano abbreviato a 3 lettere: "11 set 2026", "11 Set 2026", "11 SET 2026"
  const shortMonthRegex = new RegExp(
    `\\b(\\d{1,2})\\s+(${SHORT_MONTH_PATTERN})\\s+(\\d{2,4})\\b`,
    'i'
  );
  const shortMatch = shortMonthRegex.exec(text);
  if (shortMatch) {
    const dayStr = shortMatch[1];
    const monthStr = shortMatch[2];
    const yearStr = shortMatch[3];
    const day = parseInt(dayStr, 10);
    const monthIdx = ITALIAN_MONTHS_SHORT.indexOf(monthStr.toLowerCase() as (typeof ITALIAN_MONTHS_SHORT)[number]);
    const month = monthIdx + 1;
    const { year, yearDigits } = expandTwoDigitYear(yearStr);

    if (monthIdx !== -1 && isValidYMD(year, month, day)) {
      return {
        startIndex: shortMatch.index,
        endIndex: shortMatch.index + shortMatch[0].length,
        matchedText: shortMatch[0],
        year,
        month,
        day,
        format: {
          order: 'DMY',
          separator: ' ',
          padDayZero: dayStr.length === 2,
          padMonthZero: false,
          monthFormat: 'short',
          monthCase: detectCaseStyle(monthStr),
          yearDigits,
        },
      };
    }
  }

  // 3. Formato ISO YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD: "2026-09-11"
  const ymdRegex = /\b(\d{4})([\/\-.])(\d{1,2})\2(\d{1,2})\b/;
  const ymdMatch = ymdRegex.exec(text);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const sep = ymdMatch[2] as '/' | '-' | '.';
    const monthStr = ymdMatch[3];
    const dayStr = ymdMatch[4];
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);

    if (isValidYMD(year, month, day)) {
      return {
        startIndex: ymdMatch.index,
        endIndex: ymdMatch.index + ymdMatch[0].length,
        matchedText: ymdMatch[0],
        year,
        month,
        day,
        format: {
          order: 'YMD',
          separator: sep,
          padDayZero: dayStr.length === 2,
          padMonthZero: monthStr.length === 2,
          monthFormat: 'numeric',
          monthCase: 'lower',
          yearDigits: 4,
        },
      };
    }
  }

  // 4. Formato numerico DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, D/M/YYYY, DD/MM/YY (o MDY se il secondo numero > 12)
  const dmyRegex = /\b(\d{1,2})([\/\-.])(\d{1,2})\2(\d{2,4})\b/;
  const dmyMatch = dmyRegex.exec(text);
  if (dmyMatch) {
    const p1Str = dmyMatch[1];
    const sep = dmyMatch[2] as '/' | '-' | '.';
    const p2Str = dmyMatch[3];
    const yearStr = dmyMatch[4];
    const p1 = parseInt(p1Str, 10);
    const p2 = parseInt(p2Str, 10);
    const { year, yearDigits } = expandTwoDigitYear(yearStr);

    if (isValidYMD(year, p2, p1)) {
      return {
        startIndex: dmyMatch.index,
        endIndex: dmyMatch.index + dmyMatch[0].length,
        matchedText: dmyMatch[0],
        year,
        month: p2,
        day: p1,
        format: {
          order: 'DMY',
          separator: sep,
          padDayZero: p1Str.length === 2,
          padMonthZero: p2Str.length === 2,
          monthFormat: 'numeric',
          monthCase: 'lower',
          yearDigits,
        },
      };
    }

    if (p2 > 12 && isValidYMD(year, p1, p2)) {
      return {
        startIndex: dmyMatch.index,
        endIndex: dmyMatch.index + dmyMatch[0].length,
        matchedText: dmyMatch[0],
        year,
        month: p1,
        day: p2,
        format: {
          order: 'MDY',
          separator: sep,
          padDayZero: p2Str.length === 2,
          padMonthZero: p1Str.length === 2,
          monthFormat: 'numeric',
          monthCase: 'lower',
          yearDigits,
        },
      };
    }
  }

  return null;
}

export function formatDateWithMeta(
  year: number,
  month: number,
  day: number,
  format: PdfDateFormatMeta
): string {
  const safeMonth = Math.max(1, Math.min(12, month));
  const safeDay = Math.max(1, Math.min(daysInMonth(year, safeMonth), day));
  const dayToken = format.padDayZero ? String(safeDay).padStart(2, '0') : String(safeDay);
  const yearToken = format.yearDigits === 2 ? String(year).slice(-2).padStart(2, '0') : String(year);

  let monthToken: string;
  if (format.monthFormat === 'long') {
    monthToken = applyCaseStyle(ITALIAN_MONTHS_LONG[safeMonth - 1], format.monthCase);
  } else if (format.monthFormat === 'short') {
    monthToken = applyCaseStyle(ITALIAN_MONTHS_SHORT[safeMonth - 1], format.monthCase);
  } else {
    monthToken = format.padMonthZero ? String(safeMonth).padStart(2, '0') : String(safeMonth);
  }

  if (format.order === 'YMD') {
    return `${yearToken}${format.separator}${monthToken}${format.separator}${dayToken}`;
  }
  if (format.order === 'MDY') {
    return `${monthToken}${format.separator}${dayToken}${format.separator}${yearToken}`;
  }
  return `${dayToken}${format.separator}${monthToken}${format.separator}${yearToken}`;
}

export function replaceDateInSpanText(
  fullText: string,
  detected: DetectedPdfDate,
  nextDate: { year: number; month: number; day: number },
  overrideFormat?: PdfDateFormatMeta
): string {
  const fmt = overrideFormat || detected.format;
  const formatted = formatDateWithMeta(nextDate.year, nextDate.month, nextDate.day, fmt);
  return fullText.slice(0, detected.startIndex) + formatted + fullText.slice(detected.endIndex);
}
