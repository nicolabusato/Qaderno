import * as pdfjsLib from 'pdfjs-dist';
import fontkit from '@pdf-lib/fontkit';
import * as opentype from 'opentype.js';
import {
  concatTransformationMatrix,
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFFont,
  PDFName,
  PDFRawStream,
  PDFRef,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setCharacterSpacing,
  StandardFonts,
  TextAlignment,
} from 'pdf-lib';
import {
  NoteDocument,
  NoteFontFamily,
  PdfFormField,
  PdfPageAnnotations,
  PdfTextSpan,
  Stroke,
  TextBlock,
} from '../types/qaderno';
import { detectDateInText, isDateLabelText } from './pdfDateHelper';
import { normalizeNotePages } from './storage';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

const pdfDocPromiseCache = new WeakMap<ArrayBuffer, Promise<pdfjsLib.PDFDocumentProxy>>();

function getCachedPdfDocument(buffer: ArrayBuffer): Promise<pdfjsLib.PDFDocumentProxy> {
  let cached = pdfDocPromiseCache.get(buffer);
  if (!cached) {
    const copy = buffer.slice(0);
    cached = pdfjsLib.getDocument({ data: copy }).promise;
    pdfDocPromiseCache.set(buffer, cached);
  }
  return cached;
}

export interface LoadedPdfPageMeta {
  pageIndex: number;
  width: number;
  height: number;
}

interface RawTextItem {
  str: string;
  x: number;
  y: number;
  baselineY: number;
  width: number;
  height: number;
  fontSize: number;
  pdfFontName: string;
  mappedFallbackFont: string;
  fontCategory: 'sans' | 'serif' | 'mono';
  fontFamily: string;
  fontWeight: '400' | '700';
  fontStyle: 'normal' | 'italic';
}

export function inferPdfFontCategory(fontFamilyCss?: string): 'sans' | 'serif' | 'mono' {
  const lower = (fontFamilyCss || '').toLowerCase();
  if (lower.includes('mono') || lower.includes('courier') || lower.includes('consolas') || lower.includes('cmtt')) {
    return 'mono';
  }
  const withoutSans = lower.replace(/sans-serif/g, '');
  if (
    withoutSans.includes('serif') ||
    withoutSans.includes('times') ||
    withoutSans.includes('georgia') ||
    withoutSans.includes('garamond') ||
    withoutSans.includes('cmr')
  ) {
    return 'serif';
  }
  return 'sans';
}

function classifyPdfFont(
  pdfFontName: string,
  realCommonFontName?: string,
  styleFamily?: string
): {
  mappedFallbackFont: string;
  fontCategory: 'sans' | 'serif' | 'mono';
  fontFamily: string;
  fontWeight: '400' | '700';
  fontStyle: 'normal' | 'italic';
} {
  const combinedSource = `${realCommonFontName || ''} ${styleFamily || ''}`;
  const lowerCombined = combinedSource.toLowerCase();
  const withoutSansSerif = lowerCombined.replace(/sans-serif/g, '');

  let mappedFallbackFont = 'sans-serif';
  let fontCategory: 'sans' | 'serif' | 'mono' = 'sans';

  if (/(?:cmtt|lmtt|courier|mono|consolas|typewriter)/i.test(combinedSource)) {
    mappedFallbackFont = "'Courier Prime', 'Courier New', monospace";
    fontCategory = 'mono';
  } else if (/(?:times|cmr|lmr|cmbx|cmti|cmsl|serif|georgia|garamond|palatino|cambria)/i.test(withoutSansSerif)) {
    mappedFallbackFont = "'Times New Roman', Georgia, serif";
    fontCategory = 'serif';
  }

  const weightAndStyleSource = `${realCommonFontName || ''} ${pdfFontName || ''} ${styleFamily || ''}`;
  const fontWeight: '400' | '700' = /(?:bold|\bbd\b|heavy|black|cmbx|lmbx|semibold|demi)/i.test(
    weightAndStyleSource
  )
    ? '700'
    : '400';

  const fontStyle: 'normal' | 'italic' =
    /(?:italic|oblique|\bit\b|cmsl|cmti|lmsl|lmti)/i.test(weightAndStyleSource) ||
    /(?:It|Sl)$/.test(realCommonFontName || '')
      ? 'italic'
      : 'normal';

  const fontFamily = pdfFontName ? `'${pdfFontName}', ${mappedFallbackFont}` : mappedFallbackFont;

  return {
    mappedFallbackFont,
    fontCategory,
    fontFamily,
    fontWeight,
    fontStyle,
  };
}

let measureCanvasEl: HTMLCanvasElement | null = null;

export function measureTextWidthPx(
  text: string,
  fontSize: number,
  fontFamily: string,
  fontWeight: string,
  fontStyle: string
): number {
  if (!text) return 0;
  if (!measureCanvasEl && typeof document !== 'undefined') {
    measureCanvasEl = document.createElement('canvas');
  }
  const ctx = measureCanvasEl?.getContext('2d');
  if (!ctx) return text.length * fontSize * 0.55;
  const weight = fontWeight === 'bold' || fontWeight === '700' ? '700' : '400';
  const style = fontStyle === 'italic' ? 'italic' : 'normal';
  ctx.font = `${style} ${weight} ${fontSize}px ${fontFamily}`;
  return ctx.measureText(text).width;
}

/**
 * Calibrates letterSpacing and horizontal scaleX using a hidden canvas (ctx.measureText)
 * so edited text aligns cleanly within the original PDF bounding width without overflowing or collapsing.
 */
export function calibratePdfSpanMetrics(
  text: string,
  targetWidth: number,
  fontSize: number,
  fontFamily: string,
  fontWeight: string,
  fontStyle: string
): { letterSpacing: number; scaleX: number } {
  if (!text || text.length === 0 || targetWidth <= 0) {
    return { letterSpacing: 0, scaleX: 1 };
  }

  const measuredWidth = measureTextWidthPx(text, fontSize, fontFamily, fontWeight, fontStyle);
  if (!measuredWidth || measuredWidth <= 0) {
    return { letterSpacing: 0, scaleX: 1 };
  }

  const diff = targetWidth - measuredWidth;

  // Overflow: tighten letter-spacing slightly, then apply subtle scaleX if still wider than original span
  if (diff < -1) {
    let letterSpacing = 0;
    if (text.length > 1) {
      const minSpacing = Math.max(-1.2, -fontSize * 0.045);
      letterSpacing = Math.max(minSpacing, diff / (text.length - 1));
    }
    const widthAfterSpacing = measuredWidth + letterSpacing * Math.max(0, text.length - 1);
    const scaleX =
      widthAfterSpacing > targetWidth + 1
        ? Math.max(0.55, Math.min(1, targetWidth / widthAfterSpacing))
        : 1;
    return {
      letterSpacing: Math.round(letterSpacing * 100) / 100,
      scaleX: Math.round(scaleX * 1000) / 1000,
    };
  }

  // Slightly narrower than original box: stretch tracking gracefully to match original right edge
  if (text.length > 1 && diff > 0.5 && measuredWidth >= targetWidth * 0.72) {
    const maxSpacing = Math.max(2.5, fontSize * 0.22);
    const letterSpacing = Math.min(maxSpacing, diff / (text.length - 1));
    return {
      letterSpacing: Math.round(letterSpacing * 100) / 100,
      scaleX: 1,
    };
  }

  return { letterSpacing: 0, scaleX: 1 };
}

function getSafeCommonObjFontName(page: pdfjsLib.PDFPageProxy, fontName: string): string {
  if (!fontName) return '';
  try {
    if (page.commonObjs && page.commonObjs.has(fontName)) {
      const fontObj = page.commonObjs.get(fontName) as { name?: string; fallbackName?: string } | undefined;
      return fontObj?.name || fontObj?.fallbackName || '';
    }
  } catch {
    return '';
  }
  return '';
}

/**
 * Extracts editable text spans (with embedded PDF.js fontName chain, commonObjs/styles fallback, bold/italic & exact matrix fontSize).
 */
async function extractPageTextSpans(
  page: pdfjsLib.PDFPageProxy,
  viewport: pdfjsLib.PageViewport,
  pageIndex: number
): Promise<PdfTextSpan[]> {
  try {
    await page.getOperatorList().catch(() => null);
    const { items, styles } = (await page.getTextContent()) as {
      items: Array<{ str?: string; transform?: number[]; width?: number; height?: number; fontName?: string }>;
      styles: Record<string, { fontFamily?: string }>;
    };

    const rawItems: RawTextItem[] = [];

    for (const item of items) {
      if (!item.str || !item.str.trim() || !item.transform) continue;
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const fontSize = Math.max(6, Math.hypot(item.transform[2], item.transform[3]) * viewport.scale);
      const x = tx[4];
      const baselineY = tx[5];
      const width = Math.max(6, (item.width || 0) * viewport.scale);
      const height = Math.max(fontSize * 1.18, (item.height || fontSize) * viewport.scale);

      const pdfFontName = String(item.fontName || '');
      const realCommonName = getSafeCommonObjFontName(page, pdfFontName);
      const styleInfo = styles?.[pdfFontName];
      const meta = classifyPdfFont(pdfFontName, realCommonName, styleInfo?.fontFamily);

      rawItems.push({
        str: item.str,
        x,
        y: baselineY - fontSize * 0.85,
        baselineY,
        width,
        height,
        fontSize,
        pdfFontName,
        ...meta,
      });
    }

    rawItems.sort(
      (a, b) => Math.round(a.baselineY / 3) - Math.round(b.baselineY / 3) || a.x - b.x
    );

    const spans: PdfTextSpan[] = [];
    for (const item of rawItems) {
      const last = spans[spans.length - 1];
      const lastBaseline = last ? last.y + last.fontSize * 0.85 : 0;
      const sameBaseline =
        last &&
        Math.abs(item.baselineY - lastBaseline) <=
          Math.max(3.5, Math.min(item.fontSize, last.fontSize) * 0.32);
      const horizontalGap = last ? item.x - (last.x + last.width) : Infinity;
      const sameStyle =
        last &&
        (last.pdfFontName === item.pdfFontName ||
          (last.fontCategory === item.fontCategory &&
            last.fontWeight === item.fontWeight &&
            last.fontStyle === item.fontStyle)) &&
        Math.abs(last.fontSize - item.fontSize) < 1.3;
      const sameCellOrLine =
        sameBaseline &&
        sameStyle &&
        horizontalGap >= -item.fontSize * 0.35 &&
        horizontalGap <= item.fontSize * 1.95;

      if (sameCellOrLine && last) {
        const needsSpace =
          horizontalGap > item.fontSize * 0.16 &&
          !last.originalText.endsWith(' ') &&
          !item.str.startsWith(' ');
        const spacer = needsSpace ? ' ' : '';
        last.originalText += spacer + item.str;
        last.editedText = last.originalText;
        last.width = Math.max(last.width, item.x + item.width - last.x);
        last.height = Math.max(last.height, item.height);
        last.y = Math.min(last.y, item.y);
      } else {
        spans.push({
          id: `span_${pageIndex}_${spans.length}`,
          x: Math.max(0, item.x),
          y: Math.max(0, item.y),
          width: item.width,
          height: item.height,
          fontSize: Math.round(item.fontSize * 100) / 100,
          pdfFontName: item.pdfFontName,
          mappedFallbackFont: item.mappedFallbackFont,
          fontCategory: item.fontCategory,
          fontFamily: item.fontFamily,
          fontWeight: item.fontWeight,
          fontStyle: item.fontStyle,
          letterSpacing: 0,
          scaleX: 1,
          backgroundColor: '#FFFFFF',
          originalText: item.str,
          editedText: item.str,
          color: '#1C1C1E',
          isEdited: false,
          pixelChecked: false,
        });
      }
    }

    return spans;
  } catch {
    return [];
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function isNearbyDateHeaderOrLabel(
  x: number,
  y: number,
  width: number,
  height: number,
  textSpans: PdfTextSpan[]
): boolean {
  const fieldCenterY = y + height / 2;
  for (const span of textSpans) {
    if (!isDateLabelText(span.originalText)) continue;

    // 1. Intestazione di colonna sopra il campo (sovrapposizione orizzontale con tolleranza 28px)
    const horizOverlap =
      span.x <= x + width + 28 && span.x + span.width >= x - 28;
    const verticalDistAbove = y - (span.y + span.height);
    if (horizOverlap && verticalDistAbove >= -10 && verticalDistAbove <= 240) {
      return true;
    }

    // 2. Etichetta sulla stessa riga immediatamente a sinistra del campo
    const spanCenterY = span.y + span.height / 2;
    const sameRow = Math.abs(spanCenterY - fieldCenterY) <= Math.max(height, span.height) * 0.9;
    const leftGap = x - (span.x + span.width);
    if (sameRow && leftGap >= -12 && leftGap <= 180) {
      return true;
    }
  }
  return false;
}

function parseDefaultAppearanceString(
  daString: string | undefined,
  daData: { fontName?: string; fontSize?: number; fontColor?: Uint8ClampedArray | number[] } | undefined,
  viewportScale: number,
  fieldHeight: number,
  multiLine: boolean
): {
  fontSize: number;
  fontCategory: 'sans' | 'serif' | 'mono';
  mappedFallbackFont: string;
  fontFamily: string;
  fontWeight: '400' | '700';
  fontStyle: 'normal' | 'italic';
  color: string;
} {
  const rawDa = typeof daString === 'string' ? daString : '';
  const tfMatch = rawDa.match(/\/([^\s]+)\s+([\d.]+)\s+Tf/);
  const daFontToken = tfMatch?.[1] || (typeof daData?.fontName === 'string' ? daData.fontName : '');
  const daRawSizePts = tfMatch ? parseFloat(tfMatch[2]) : NaN;

  let fontSize: number;
  if (Number.isFinite(daRawSizePts) && daRawSizePts > 0) {
    fontSize = daRawSizePts * viewportScale;
  } else if (typeof daData?.fontSize === 'number' && daData.fontSize > 0) {
    fontSize = daData.fontSize * viewportScale;
  } else {
    const autoBase = fieldHeight * (multiLine ? 0.28 : 0.56);
    fontSize = Math.max(8, Math.min(14, Math.round(autoBase * 10) / 10));
  }
  fontSize = Math.max(8, Math.min(20, Math.round(fontSize * 10) / 10));

  const tokenLower = daFontToken.toLowerCase();
  let fontCategory: 'sans' | 'serif' | 'mono' = 'sans';
  let mappedFallbackFont = 'Helvetica, Arial, sans-serif';
  if (/(?:cour|^co(?:bo|ob|it|bi)?$|mono|consolas|\btt\b)/i.test(tokenLower)) {
    fontCategory = 'mono';
    mappedFallbackFont = "'Courier Prime', 'Courier New', monospace";
  } else if (/(?:^ti(?:ro|bo|it|bi)?$|times|serif|garamond|georgia|palatino|cambria)/i.test(tokenLower)) {
    fontCategory = 'serif';
    mappedFallbackFont = "'Times New Roman', Georgia, serif";
  }

  const fontWeight: '400' | '700' = /(?:bo$|bold|heavy|black|semibold|demi)/i.test(tokenLower)
    ? '700'
    : '400';
  const fontStyle: 'normal' | 'italic' = /(?:ob$|it$|italic|oblique)/i.test(tokenLower)
    ? 'italic'
    : 'normal';

  let color = '#1C1C1E';
  if (daData?.fontColor && daData.fontColor.length >= 3) {
    color = rgbToHex(daData.fontColor[0], daData.fontColor[1], daData.fontColor[2]);
  } else {
    const rgMatch = rawDa.match(/([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg/);
    const gMatch = rawDa.match(/(?:^|\s)([\d.]+)\s+g(?:\s|$)/);
    if (rgMatch) {
      color = rgbToHex(
        parseFloat(rgMatch[1]) * 255,
        parseFloat(rgMatch[2]) * 255,
        parseFloat(rgMatch[3]) * 255
      );
    } else if (gMatch) {
      const lum = parseFloat(gMatch[1]) * 255;
      color = rgbToHex(lum, lum, lum);
    }
  }

  return {
    fontSize,
    fontCategory,
    mappedFallbackFont,
    fontFamily: mappedFallbackFont,
    fontWeight,
    fontStyle,
    color,
  };
}

function findMatchingSpanForField(
  field: Pick<PdfFormField, 'x' | 'y' | 'width' | 'height'>,
  textSpans: PdfTextSpan[]
): PdfTextSpan | null {
  if (!textSpans.length) return null;

  // 1. Cerca prima un PdfTextSpan sovrapposto dentro il rettangolo del campo modulo
  let bestOverlapArea = 0;
  let overlappingSpan: PdfTextSpan | null = null;
  for (const sp of textSpans) {
    const ox1 = Math.max(field.x - 2, sp.x);
    const oy1 = Math.max(field.y - 2, sp.y);
    const ox2 = Math.min(field.x + field.width + 2, sp.x + sp.width);
    const oy2 = Math.min(field.y + field.height + 2, sp.y + sp.height);
    if (ox2 > ox1 && oy2 > oy1) {
      const area = (ox2 - ox1) * (oy2 - oy1);
      if (area > bestOverlapArea) {
        bestOverlapArea = area;
        overlappingSpan = sp;
      }
    }
  }
  if (overlappingSpan) return overlappingSpan;

  // 2. Se la cella era vuota, cerca il PdfTextSpan più vicino sulla stessa riga orizzontale
  //    escludendo le intestazioni in grassetto sopra la cella
  let bestDist = Infinity;
  let nearestSameRow: PdfTextSpan | null = null;
  for (const sp of textSpans) {
    const isAboveCell = sp.y + sp.height <= field.y + 2;
    const isBoldHeaderAbove =
      (sp.fontWeight === '700' || sp.fontWeight === 'bold') && sp.y < field.y - 1;
    if (isAboveCell || isBoldHeaderAbove) continue;

    if (Math.abs(sp.y - field.y) >= field.height * 0.85) continue;

    let horizDist = 0;
    if (sp.x + sp.width < field.x) {
      horizDist = field.x - (sp.x + sp.width);
    } else if (sp.x > field.x + field.width) {
      horizDist = sp.x - (field.x + field.width);
    }
    const vertDist = Math.abs(sp.y - field.y);
    const score = horizDist + vertDist * 2;
    if (score < bestDist) {
      bestDist = score;
      nearestSameRow = sp;
    }
  }

  return nearestSameRow;
}

export function alignFormFieldsRowTypography(
  fields: PdfFormField[],
  textSpans: PdfTextSpan[]
): PdfFormField[] {
  const enriched = fields.map((field) => {
    if (field.fieldType !== 'text') return field;
    const matched = findMatchingSpanForField(field, textSpans);
    if (!matched) {
      return {
        ...field,
        fontCategory: field.fontCategory || 'sans',
        fontFamily: field.fontFamily || 'Helvetica, Arial, sans-serif',
        fontWeight: field.fontWeight || '400',
        fontStyle: field.fontStyle || 'normal',
      };
    }

    const inheritedSize =
      matched.fontSize > 0
        ? Math.max(8, Math.min(Math.max(12, field.height * 0.88), matched.fontSize))
        : field.fontSize;

    return {
      ...field,
      matchedSpanId: matched.id,
      fontFamily: matched.fontFamily || field.fontFamily || 'Helvetica, Arial, sans-serif',
      mappedFallbackFont: matched.mappedFallbackFont || field.mappedFallbackFont,
      pdfFontName: matched.pdfFontName || field.pdfFontName,
      fontCategory: matched.fontCategory || field.fontCategory || 'sans',
      fontSize: Math.round(inheritedSize * 10) / 10,
      fontWeight:
        matched.fontWeight === '700' || matched.fontWeight === 'bold' ? ('700' as const) : ('400' as const),
      fontStyle: matched.fontStyle || field.fontStyle || 'normal',
      color: matched.color || field.color || '#1C1C1E',
    };
  });

  // Raggruppa campi sulla stessa riga (|a.y - b.y| < 6) affinché condividano fontSize e fontFamily identici
  const textIndices = enriched
    .map((f, idx) => ({ f, idx }))
    .filter(({ f }) => f.fieldType === 'text');

  const visited = new Set<number>();
  for (const entry of textIndices) {
    if (visited.has(entry.idx)) continue;
    const rowIndices = textIndices
      .filter((other) => Math.abs(other.f.y - entry.f.y) < 6)
      .map((other) => other.idx);
    rowIndices.forEach((ri) => visited.add(ri));
    if (rowIndices.length < 2) continue;

    // Preferisci un campo della riga che ha ereditato direttamente da un PdfTextSpan reale
    const refIdx =
      rowIndices.find((ri) => Boolean(enriched[ri].matchedSpanId)) ?? rowIndices[0];
    const ref = enriched[refIdx];

    for (const ri of rowIndices) {
      const cur = enriched[ri];
      enriched[ri] = {
        ...cur,
        fontSize: ref.fontSize,
        fontFamily: ref.fontFamily,
        mappedFallbackFont: ref.mappedFallbackFont,
        pdfFontName: ref.pdfFontName,
        fontCategory: ref.fontCategory,
        fontStyle: ref.fontStyle,
        matchedSpanId: cur.matchedSpanId || ref.matchedSpanId,
      };
    }
  }

  return enriched;
}

/**
 * Estrae i campi modulo AcroForm (Widget Annotations: Tx e Btn/Checkbox) convertendoli in coordinate viewport,
 * rilevando font/dimensione/peso dal PdfTextSpan adiacente e dal /DA, e rilevando automaticamente i campi Data.
 */
async function extractPageFormFields(
  page: pdfjsLib.PDFPageProxy,
  viewport: pdfjsLib.PageViewport,
  pageIndex: number,
  textSpans: PdfTextSpan[]
): Promise<PdfFormField[]> {
  try {
    const annotations = (await page.getAnnotations().catch(() => [])) as Array<Record<string, unknown>>;
    const fields: PdfFormField[] = [];

    for (const annot of annotations) {
      const subtype = String(annot.subtype || '');
      const fieldTypeRaw = String(annot.fieldType || '');
      if (subtype !== 'Widget' && fieldTypeRaw !== 'Tx' && fieldTypeRaw !== 'Btn') continue;

      const isText = fieldTypeRaw === 'Tx';
      const isCheckbox =
        fieldTypeRaw === 'Btn' &&
        (Boolean(annot.checkBox) || (!annot.pushButton && !annot.radioButton));
      if (!isText && !isCheckbox) continue;

      const rawRect = annot.rect;
      if (!Array.isArray(rawRect) || rawRect.length < 4) continue;

      const [vx1, vy1] = viewport.convertToViewportPoint(Number(rawRect[0]), Number(rawRect[1]));
      const [vx2, vy2] = viewport.convertToViewportPoint(Number(rawRect[2]), Number(rawRect[3]));
      const x = Math.max(0, Math.min(vx1, vx2));
      const y = Math.max(0, Math.min(vy1, vy2));
      const width = Math.max(8, Math.abs(vx2 - vx1));
      const height = Math.max(8, Math.abs(vy2 - vy1));

      const fieldName = String(annot.fieldName || annot.id || `widget_${pageIndex}_${fields.length}`);
      const alternativeText =
        typeof annot.alternativeText === 'string' && annot.alternativeText.trim()
          ? annot.alternativeText.trim()
          : undefined;
      const readOnly = Boolean(annot.readOnly);
      const multiLine = Boolean(annot.multiLine);
      const maxLen =
        typeof annot.maxLen === 'number' && annot.maxLen > 0 ? annot.maxLen : undefined;

      const alignNum = typeof annot.textAlignment === 'number' ? annot.textAlignment : 0;
      const alignment: 'left' | 'center' | 'right' =
        alignNum === 1 ? 'center' : alignNum === 2 ? 'right' : 'left';

      const daData = annot.defaultAppearanceData as
        | { fontName?: string; fontSize?: number; fontColor?: Uint8ClampedArray | number[] }
        | undefined;
      const daParsed = parseDefaultAppearanceString(
        typeof annot.defaultAppearance === 'string' ? annot.defaultAppearance : undefined,
        daData,
        viewport.scale,
        height,
        multiLine
      );

      let rawValue = '';
      if (typeof annot.fieldValue === 'string') {
        rawValue = annot.fieldValue;
      } else if (Array.isArray(annot.fieldValue) && annot.fieldValue.length > 0) {
        rawValue = String(annot.fieldValue[0] ?? '');
      } else if (annot.fieldValue !== undefined && annot.fieldValue !== null) {
        rawValue = String(annot.fieldValue);
      }

      const checked = isCheckbox
        ? Boolean(rawValue && rawValue.toLowerCase() !== 'off')
        : false;
      const textVal = isCheckbox ? '' : rawValue;

      const isDateField =
        isText &&
        (Boolean(detectDateInText(textVal)) ||
          isDateLabelText(fieldName) ||
          isDateLabelText(alternativeText) ||
          isNearbyDateHeaderOrLabel(x, y, width, height, textSpans));

      fields.push({
        id: `ff_${pageIndex}_${fields.length}`,
        fieldName,
        fieldType: isCheckbox ? 'checkbox' : 'text',
        x,
        y,
        width,
        height,
        originalValue: textVal,
        value: textVal,
        checked,
        originalChecked: checked,
        isEdited: false,
        maxLen,
        alignment,
        fontSize: daParsed.fontSize,
        fontFamily: daParsed.fontFamily,
        mappedFallbackFont: daParsed.mappedFallbackFont,
        fontCategory: daParsed.fontCategory,
        fontWeight: daParsed.fontWeight,
        fontStyle: daParsed.fontStyle,
        color: daParsed.color,
        backgroundColor: '#FFFFFF',
        isDateField,
        alternativeText,
        multiLine,
        readOnly,
      });
    }

    return alignFormFieldsRowTypography(fields, textSpans);
  } catch {
    return [];
  }
}

/**
 * Samples the rendered PDF canvas to determine each span's exact background color,
 * glyph ink color, and pixel ink density (> 22% dark ink pixels -> force fontWeight '700').
 */
export function sampleSpanColorsFromCanvas(
  canvas: HTMLCanvasElement,
  pageWidth: number,
  pageHeight: number,
  spans: PdfTextSpan[]
): PdfTextSpan[] {
  if (!spans.length) return spans;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return spans;

  const scaleX = canvas.width / Math.max(pageWidth, 1);
  const scaleY = canvas.height / Math.max(pageHeight, 1);

  return spans.map((span) => {
    // Never overwrite user-edited spans whose colors/styles are already persisted
    if (span.isEdited && span.pixelChecked) return span;

    try {
      const sx = Math.max(0, Math.floor((span.x - 2) * scaleX));
      const sy = Math.max(0, Math.floor((span.y - 2) * scaleY));
      const sw = Math.min(canvas.width - sx, Math.max(4, Math.ceil((span.width + 4) * scaleX)));
      const sh = Math.min(canvas.height - sy, Math.max(4, Math.ceil((span.height + 4) * scaleY)));
      if (sw <= 1 || sh <= 1) return span;

      const img = ctx.getImageData(sx, sy, sw, sh).data;

      // 1. Sample border pixels to estimate clean background color
      const bgSamples: Array<[number, number, number]> = [];
      for (let x = 0; x < sw; x += Math.max(1, Math.floor(sw / 12))) {
        const topIdx = x * 4;
        const botIdx = ((sh - 1) * sw + x) * 4;
        bgSamples.push([img[topIdx], img[topIdx + 1], img[topIdx + 2]]);
        bgSamples.push([img[botIdx], img[botIdx + 1], img[botIdx + 2]]);
      }
      bgSamples.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
      const bg = bgSamples[Math.floor(bgSamples.length * 0.75)] || [255, 255, 255];
      const bgLum = bg[0] * 0.299 + bg[1] * 0.587 + bg[2] * 0.114;

      // 2. Measure dark ink pixel density inside the strict bounding box + find ink color
      const padLeft = Math.max(0, Math.floor(span.x * scaleX) - sx);
      const padTop = Math.max(0, Math.floor(span.y * scaleY) - sy);
      const boxW = Math.max(1, Math.min(sw - padLeft, Math.ceil(span.width * scaleX)));
      const boxH = Math.max(1, Math.min(sh - padTop, Math.ceil(span.height * scaleY)));

      let inkPixelCount = 0;
      let sampledBoxPixels = 0;
      const inkCandidates: Array<{ r: number; g: number; b: number; dist: number }> = [];

      for (let row = padTop; row < padTop + boxH; row++) {
        for (let col = padLeft; col < padLeft + boxW; col++) {
          const idx = (row * sw + col) * 4;
          const r = img[idx];
          const g = img[idx + 1];
          const b = img[idx + 2];
          const pixLum = r * 0.299 + g * 0.587 + b * 0.114;
          const dist = Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]);
          sampledBoxPixels++;
          if (bgLum - pixLum > 36 || dist > 65) {
            inkPixelCount++;
            inkCandidates.push({ r, g, b, dist });
          }
        }
      }

      const inkDensity = sampledBoxPixels > 0 ? inkPixelCount / sampledBoxPixels : 0;

      let inkHex = span.color || '#1C1C1E';
      if (inkCandidates.length > 0) {
        inkCandidates.sort((a, b) => b.dist - a.dist);
        const topCount = Math.max(1, Math.floor(inkCandidates.length * 0.35));
        let sr = 0,
          sg = 0,
          sb = 0;
        for (let k = 0; k < topCount; k++) {
          sr += inkCandidates[k].r;
          sg += inkCandidates[k].g;
          sb += inkCandidates[k].b;
        }
        inkHex = rgbToHex(sr / topCount, sg / topCount, sb / topCount);
      }

      const detectedBold =
        span.fontWeight === 'bold' || span.fontWeight === '700' || inkDensity > 0.22 ? '700' : '400';

      if (span.isEdited) {
        return {
          ...span,
          pixelChecked: true,
        };
      }

      return {
        ...span,
        backgroundColor: rgbToHex(bg[0], bg[1], bg[2]),
        color: inkHex,
        fontWeight: detectedBold,
        pixelChecked: true,
      };
    } catch {
      return span;
    }
  });
}

export interface LiveFontResolution {
  aliasesBySpanId: Record<string, string>;
  commonFontMetaBySpanId: Record<
    string,
    {
      mappedFallbackFont: string;
      fontCategory: 'sans' | 'serif' | 'mono';
      fontFamily: string;
      fontWeight: '400' | '700';
      fontStyle: 'normal' | 'italic';
      pdfFontName: string;
    }
  >;
}

/**
 * Resolves live CSS @font-face names registered in document.fonts for the current PDF.js document instance
 * (so saved spans keep working with real embedded fonts even after page reload or .qaderno reimport).
 */
export async function resolveLivePageFonts(
  buffer: ArrayBuffer,
  pageIndex: number,
  spans: PdfTextSpan[]
): Promise<LiveFontResolution> {
  const aliasesBySpanId: Record<string, string> = {};
  const commonFontMetaBySpanId: LiveFontResolution['commonFontMetaBySpanId'] = {};
  if (!spans.length) return { aliasesBySpanId, commonFontMetaBySpanId };

  try {
    const pdf = await getCachedPdfDocument(buffer);
    const page = await pdf.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1.5 });
    const { items, styles } = (await page.getTextContent()) as {
      items: Array<{ str?: string; transform?: number[]; fontName?: string }>;
      styles: Record<string, { fontFamily?: string }>;
    };

    const liveItems: Array<{ x: number; y: number; pdfFontName: string }> = [];
    for (const item of items) {
      if (!item.str || !item.str.trim() || !item.transform || !item.fontName) continue;
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const fontSize = Math.max(6, Math.hypot(item.transform[2], item.transform[3]) * viewport.scale);
      liveItems.push({
        x: tx[4],
        y: tx[5] - fontSize * 0.85,
        pdfFontName: String(item.fontName),
      });
    }

    for (const span of spans) {
      let bestDist = Infinity;
      let matchedLiveFont = '';
      for (const li of liveItems) {
        const d = Math.hypot(li.x - span.x, li.y - span.y);
        if (d < bestDist && d < 28) {
          bestDist = d;
          matchedLiveFont = li.pdfFontName;
        }
      }
      if (matchedLiveFont) {
        aliasesBySpanId[span.id] = matchedLiveFont;
        const realCommonName = getSafeCommonObjFontName(page, matchedLiveFont);
        const meta = classifyPdfFont(matchedLiveFont, realCommonName, styles?.[matchedLiveFont]?.fontFamily);
        commonFontMetaBySpanId[span.id] = {
          ...meta,
          pdfFontName: matchedLiveFont,
        };
      }
    }
  } catch {
    // non-fatal
  }
  return { aliasesBySpanId, commonFontMetaBySpanId };
}

export async function loadPdfMetadata(buffer: ArrayBuffer): Promise<{
  pageCount: number;
  pages: PdfPageAnnotations[];
}> {
  const pdf = await getCachedPdfDocument(buffer);
  const pages: PdfPageAnnotations[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });
    const textSpans = await extractPageTextSpans(page, viewport, i - 1);
    const formFields = await extractPageFormFields(page, viewport, i - 1, textSpans);
    pages.push({
      pageIndex: i - 1,
      width: Math.round(viewport.width),
      height: Math.round(viewport.height),
      strokes: [],
      textBoxes: [],
      textSpans,
      textEdits: [],
      formFields,
    });
  }

  return { pageCount: pdf.numPages, pages };
}

export async function extractSpansForExistingPdf(
  buffer: ArrayBuffer,
  pages: PdfPageAnnotations[]
): Promise<PdfPageAnnotations[]> {
  const pdf = await getCachedPdfDocument(buffer);
  const updated: PdfPageAnnotations[] = [];

  for (const p of pages) {
    const hasSpans = Boolean(p.textSpans && p.textSpans.length > 0);
    const hasFormFields = p.formFields !== undefined;
    if (hasSpans && hasFormFields) {
      updated.push(p);
      continue;
    }
    const page = await pdf.getPage(p.pageIndex + 1);
    const viewport = page.getViewport({ scale: 1.5 });
    const textSpans = hasSpans
      ? p.textSpans!
      : await extractPageTextSpans(page, viewport, p.pageIndex);
    const formFields = hasFormFields
      ? p.formFields!
      : await extractPageFormFields(page, viewport, p.pageIndex, textSpans);
    updated.push({ ...p, textSpans, formFields });
  }
  return updated;
}

export interface PdfRenderTaskHandle {
  cancel: () => void;
}

export async function renderPdfPageToCanvas(
  buffer: ArrayBuffer,
  pageIndex: number,
  canvas: HTMLCanvasElement,
  displayWidth: number,
  zoom = 1,
  onTaskCreated?: (handle: PdfRenderTaskHandle) => void
): Promise<boolean> {
  const pdf = await getCachedPdfDocument(buffer);
  const page = await pdf.getPage(pageIndex + 1);
  const baseViewport = page.getViewport({ scale: 1 });
  const logicalScale = displayWidth / Math.max(baseViewport.width, 1);
  const viewport = page.getViewport({ scale: logicalScale });

  const logicalWidth = Math.max(1, Math.round(viewport.width));
  const logicalHeight = Math.max(1, Math.round(viewport.height));

  const dpr = Math.max(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
  const desiredMultiplier = dpr * Math.max(0.5, zoom);
  const maxLogicalSide = Math.max(logicalWidth, logicalHeight);
  const renderMultiplier =
    maxLogicalSide > 0 ? Math.min(desiredMultiplier, 4096 / maxLogicalSide) : desiredMultiplier;

  canvas.width = Math.max(1, Math.floor(logicalWidth * renderMultiplier));
  canvas.height = Math.max(1, Math.floor(logicalHeight * renderMultiplier));
  canvas.style.width = `${logicalWidth}px`;
  canvas.style.height = `${logicalHeight}px`;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;

  const renderTask = page.render({
    canvasContext: ctx,
    viewport,
    transform: [renderMultiplier, 0, 0, renderMultiplier, 0, 0],
    canvas,
  });

  onTaskCreated?.({
    cancel: () => {
      try {
        renderTask.cancel();
      } catch {
        // already finished or cancelled
      }
    },
  });

  try {
    await renderTask.promise;
    return true;
  } catch (err) {
    if ((err as { name?: string })?.name === 'RenderingCancelledException') {
      return false;
    }
    throw err;
  }
}

function hexToPdfRgb(hex: string) {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return rgb(0.11, 0.11, 0.12);
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return rgb(Number.isFinite(r) ? r : 0.11, Number.isFinite(g) ? g : 0.11, Number.isFinite(b) ? b : 0.12);
}

function drawPdfStroke(
  page: ReturnType<PDFDocument['getPages']>[number],
  stroke: Stroke,
  scaleX: number,
  scaleY: number,
  pageHeightPts: number
) {
  const color = hexToPdfRgb(stroke.color);
  const opacity = stroke.tool === 'highlighter' ? 0.28 : 1;
  const thickness = Math.max(0.6, stroke.width * ((scaleX + scaleY) / 2));

  if (stroke.shapeMeta) {
    const meta = stroke.shapeMeta;
    if (meta.kind === 'line') {
      page.drawLine({
        start: { x: (meta.x1 ?? 0) * scaleX, y: pageHeightPts - (meta.y1 ?? 0) * scaleY },
        end: { x: (meta.x2 ?? 0) * scaleX, y: pageHeightPts - (meta.y2 ?? 0) * scaleY },
        thickness,
        color,
        opacity,
      });
      return;
    }

    if (meta.kind === 'arrow' || meta.kind === 'doubleArrow') {
      const x1 = (meta.x1 ?? 0) * scaleX;
      const y1 = pageHeightPts - (meta.y1 ?? 0) * scaleY;
      const x2 = (meta.x2 ?? 0) * scaleX;
      const y2 = pageHeightPts - (meta.y2 ?? 0) * scaleY;
      page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color, opacity });

      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const headLen = Math.min(18, Math.max(8, len * 0.2));
      const headAngle = Math.PI / 6;
      page.drawLine({
        start: { x: x2 - headLen * Math.cos(angle - headAngle), y: y2 - headLen * Math.sin(angle - headAngle) },
        end: { x: x2, y: y2 },
        thickness,
        color,
        opacity,
      });
      page.drawLine({
        start: { x: x2 - headLen * Math.cos(angle + headAngle), y: y2 - headLen * Math.sin(angle + headAngle) },
        end: { x: x2, y: y2 },
        thickness,
        color,
        opacity,
      });
      if (meta.kind === 'doubleArrow') {
        page.drawLine({
          start: { x: x1 + headLen * Math.cos(angle - headAngle), y: y1 + headLen * Math.sin(angle - headAngle) },
          end: { x: x1, y: y1 },
          thickness,
          color,
          opacity,
        });
        page.drawLine({
          start: { x: x1 + headLen * Math.cos(angle + headAngle), y: y1 + headLen * Math.sin(angle + headAngle) },
          end: { x: x1, y: y1 },
          thickness,
          color,
          opacity,
        });
      }
      return;
    }

    if (meta.kind === 'circle' || meta.kind === 'ellipse') {
      page.drawEllipse({
        x: (meta.cx ?? 0) * scaleX,
        y: pageHeightPts - (meta.cy ?? 0) * scaleY,
        xScale: Math.max(2, (meta.rx ?? 20) * scaleX),
        yScale: Math.max(2, (meta.ry ?? 20) * scaleY),
        borderColor: color,
        borderWidth: thickness,
        borderOpacity: opacity,
      });
      return;
    }

    if (meta.kind === 'rectangle' || meta.kind === 'square') {
      const rx = (meta.rx ?? 30) * scaleX;
      const ry = (meta.ry ?? 30) * scaleY;
      const cx = (meta.cx ?? 0) * scaleX;
      const cy = pageHeightPts - (meta.cy ?? 0) * scaleY;
      page.drawRectangle({
        x: cx - rx,
        y: cy - ry,
        width: rx * 2,
        height: ry * 2,
        borderColor: color,
        borderWidth: thickness,
        borderOpacity: opacity,
      });
      return;
    }
  }

  const pts = stroke.points;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    page.drawLine({
      start: { x: a.x * scaleX, y: pageHeightPts - a.y * scaleY },
      end: { x: b.x * scaleX, y: pageHeightPts - b.y * scaleY },
      thickness,
      color,
      opacity,
    });
  }
}

type Matrix6 = [number, number, number, number, number, number];

function multiplyMatrix6(a: Matrix6, b: Matrix6): Matrix6 {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

function bytesToLatin1(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let out = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    out += String.fromCharCode(...slice);
  }
  return out;
}

function latin1ToBytes(str: string): Uint8Array {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    out[i] = str.charCodeAt(i) & 0xff;
  }
  return out;
}

interface StreamToken {
  kind: 'num' | 'name' | 'str' | 'hex' | 'array' | 'dict' | 'word' | 'inlineImage';
  raw: string;
  start: number;
  end: number;
  numVal?: number;
}

function isPdfWhitespace(ch: number): boolean {
  return ch === 0x20 || ch === 0x09 || ch === 0x0a || ch === 0x0d || ch === 0x0c || ch === 0x00;
}

function isPdfDelimiter(ch: number): boolean {
  return (
    ch === 0x28 || // (
    ch === 0x29 || // )
    ch === 0x3c || // <
    ch === 0x3e || // >
    ch === 0x5b || // [
    ch === 0x5d || // ]
    ch === 0x7b || // {
    ch === 0x7d || // }
    ch === 0x2f || // /
    ch === 0x25 // %
  );
}

function tokenizePdfContentStream(src: string): StreamToken[] {
  const tokens: StreamToken[] = [];
  const len = src.length;
  let i = 0;

  while (i < len) {
    const ch = src.charCodeAt(i);

    if (isPdfWhitespace(ch)) {
      i++;
      continue;
    }

    // Comment %...\n
    if (ch === 0x25) {
      while (i < len && src.charCodeAt(i) !== 0x0a && src.charCodeAt(i) !== 0x0d) i++;
      continue;
    }

    // Literal string (...)
    if (ch === 0x28) {
      const start = i;
      i++;
      let depth = 1;
      while (i < len && depth > 0) {
        const c = src.charCodeAt(i);
        if (c === 0x5c) {
          i += 2;
          continue;
        }
        if (c === 0x28) depth++;
        else if (c === 0x29) depth--;
        i++;
      }
      tokens.push({ kind: 'str', raw: src.slice(start, i), start, end: i });
      continue;
    }

    // Dictionary << ... >> or Hex string < ... >
    if (ch === 0x3c) {
      const start = i;
      if (i + 1 < len && src.charCodeAt(i + 1) === 0x3c) {
        i += 2;
        let depth = 1;
        while (i < len && depth > 0) {
          if (src.charCodeAt(i) === 0x3c && src.charCodeAt(i + 1) === 0x3c) {
            depth++;
            i += 2;
          } else if (src.charCodeAt(i) === 0x3e && src.charCodeAt(i + 1) === 0x3e) {
            depth--;
            i += 2;
          } else if (src.charCodeAt(i) === 0x28) {
            i++;
            let sDepth = 1;
            while (i < len && sDepth > 0) {
              if (src.charCodeAt(i) === 0x5c) i += 2;
              else {
                if (src.charCodeAt(i) === 0x28) sDepth++;
                else if (src.charCodeAt(i) === 0x29) sDepth--;
                i++;
              }
            }
          } else {
            i++;
          }
        }
        tokens.push({ kind: 'dict', raw: src.slice(start, i), start, end: i });
        continue;
      }
      i++;
      while (i < len && src.charCodeAt(i) !== 0x3e) i++;
      if (i < len) i++;
      tokens.push({ kind: 'hex', raw: src.slice(start, i), start, end: i });
      continue;
    }

    // Array [ ... ]
    if (ch === 0x5b) {
      const start = i;
      i++;
      let depth = 1;
      while (i < len && depth > 0) {
        const c = src.charCodeAt(i);
        if (c === 0x28) {
          i++;
          let sDepth = 1;
          while (i < len && sDepth > 0) {
            if (src.charCodeAt(i) === 0x5c) i += 2;
            else {
              if (src.charCodeAt(i) === 0x28) sDepth++;
              else if (src.charCodeAt(i) === 0x29) sDepth--;
              i++;
            }
          }
        } else if (c === 0x5b) {
          depth++;
          i++;
        } else if (c === 0x5d) {
          depth--;
          i++;
        } else {
          i++;
        }
      }
      tokens.push({ kind: 'array', raw: src.slice(start, i), start, end: i });
      continue;
    }

    // Name /...
    if (ch === 0x2f) {
      const start = i;
      i++;
      while (i < len && !isPdfWhitespace(src.charCodeAt(i)) && !isPdfDelimiter(src.charCodeAt(i))) {
        i++;
      }
      tokens.push({ kind: 'name', raw: src.slice(start, i), start, end: i });
      continue;
    }

    // Word / Number / Operator
    const start = i;
    while (i < len && !isPdfWhitespace(src.charCodeAt(i)) && !isPdfDelimiter(src.charCodeAt(i))) {
      i++;
    }
    if (i === start) {
      i++;
      continue;
    }
    const word = src.slice(start, i);

    // Inline image BI ... ID <binary> EI
    if (word === 'BI') {
      const idIdx = src.indexOf('ID', i);
      if (idIdx !== -1) {
        let scan = idIdx + 2;
        if (scan < len && isPdfWhitespace(src.charCodeAt(scan))) scan++;
        let eiFound = -1;
        while (scan < len - 2) {
          if (
            isPdfWhitespace(src.charCodeAt(scan)) &&
            src.charCodeAt(scan + 1) === 0x45 &&
            src.charCodeAt(scan + 2) === 0x49 &&
            (scan + 3 >= len || isPdfWhitespace(src.charCodeAt(scan + 3)))
          ) {
            eiFound = scan + 3;
            break;
          }
          scan++;
        }
        if (eiFound !== -1) {
          tokens.push({ kind: 'inlineImage', raw: src.slice(start, eiFound), start, end: eiFound });
          i = eiFound;
          continue;
        }
      }
    }

    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(word)) {
      tokens.push({ kind: 'num', raw: word, start, end: i, numVal: parseFloat(word) });
    } else {
      tokens.push({ kind: 'word', raw: word, start, end: i });
    }
  }

  return tokens;
}

function estimateTokenTextUnits(tok: StreamToken): { chars: number; tjShift: number } {
  if (tok.kind === 'str') {
    const innerLen = Math.max(0, tok.raw.length - 2);
    return { chars: innerLen, tjShift: 0 };
  }
  if (tok.kind === 'hex') {
    const hexLen = tok.raw.replace(/[^0-9a-fA-F]/g, '').length;
    return { chars: Math.max(1, Math.floor(hexLen / 2)), tjShift: 0 };
  }
  if (tok.kind === 'array') {
    let chars = 0;
    let tjShift = 0;
    const inner = tok.raw.slice(1, -1);
    const subTokens = tokenizePdfContentStream(inner);
    for (const st of subTokens) {
      if (st.kind === 'str') chars += Math.max(0, st.raw.length - 2);
      else if (st.kind === 'hex') {
        const hl = st.raw.replace(/[^0-9a-fA-F]/g, '').length;
        chars += Math.max(1, Math.floor(hl / 2));
      } else if (st.kind === 'num' && st.numVal !== undefined) {
        tjShift += st.numVal;
      }
    }
    return { chars, tjShift };
  }
  return { chars: 0, tjShift: 0 };
}

interface EditedSpanPdfBox {
  spanId: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function stripEditedSpansFromStreamText(
  streamText: string,
  boxes: EditedSpanPdfBox[],
  removedCounts: Record<string, number>,
  matchedFontKeyBySpanId: Record<string, string>
): { rewritten: string; modified: boolean } {
  const tokens = tokenizePdfContentStream(streamText);
  if (tokens.length === 0) return { rewritten: streamText, modified: false };

  const edits: Array<{ start: number; end: number; replacement: string }> = [];
  const stack: Matrix6[] = [];
  let ctm: Matrix6 = [1, 0, 0, 1, 0, 0];
  let tm: Matrix6 = [1, 0, 0, 1, 0, 0];
  let tlm: Matrix6 = [1, 0, 0, 1, 0, 0];
  let tl = 0;
  let tfs = 12;
  let th = 1;
  let currentFontKey = '';
  const operands: StreamToken[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.kind !== 'word') {
      if (tok.kind !== 'inlineImage') operands.push(tok);
      continue;
    }

    const op = tok.raw;
    switch (op) {
      case 'q':
        stack.push([...ctm]);
        break;
      case 'Q':
        if (stack.length > 0) ctm = stack.pop()!;
        break;
      case 'cm':
        if (operands.length >= 6) {
          const vals = operands.slice(-6).map((o) => o.numVal ?? 0) as Matrix6;
          ctm = multiplyMatrix6(vals, ctm);
        }
        break;
      case 'BT':
        tm = [1, 0, 0, 1, 0, 0];
        tlm = [1, 0, 0, 1, 0, 0];
        break;
      case 'ET':
        break;
      case 'Tf':
        if (operands.length >= 2) {
          const fTok = operands[operands.length - 2];
          const sTok = operands[operands.length - 1];
          if (fTok.kind === 'name') currentFontKey = fTok.raw.slice(1);
          if (sTok.numVal !== undefined) tfs = sTok.numVal;
        }
        break;
      case 'TL':
        if (operands.length >= 1 && operands[operands.length - 1].numVal !== undefined) {
          tl = operands[operands.length - 1].numVal!;
        }
        break;
      case 'Tz':
        if (operands.length >= 1 && operands[operands.length - 1].numVal !== undefined) {
          th = operands[operands.length - 1].numVal! / 100;
        }
        break;
      case 'Tm':
        if (operands.length >= 6) {
          const vals = operands.slice(-6).map((o) => o.numVal ?? 0) as Matrix6;
          tm = [...vals];
          tlm = [...vals];
        }
        break;
      case 'Td':
        if (operands.length >= 2) {
          const tx = operands[operands.length - 2].numVal ?? 0;
          const ty = operands[operands.length - 1].numVal ?? 0;
          tlm = multiplyMatrix6([1, 0, 0, 1, tx, ty], tlm);
          tm = [...tlm];
        }
        break;
      case 'TD':
        if (operands.length >= 2) {
          const tx = operands[operands.length - 2].numVal ?? 0;
          const ty = operands[operands.length - 1].numVal ?? 0;
          tl = -ty;
          tlm = multiplyMatrix6([1, 0, 0, 1, tx, ty], tlm);
          tm = [...tlm];
        }
        break;
      case 'T*':
        tlm = multiplyMatrix6([1, 0, 0, 1, 0, -tl], tlm);
        tm = [...tlm];
        break;
      case 'Tj':
      case 'TJ':
      case "'":
      case '"': {
        if (op === "'" || op === '"') {
          tlm = multiplyMatrix6([1, 0, 0, 1, 0, -tl], tlm);
          tm = [...tlm];
        }
        const opCountNeeded = op === '"' ? 3 : 1;
        const textTok = operands[operands.length - 1];
        if (textTok && operands.length >= opCountNeeded) {
          const finalM = multiplyMatrix6(tm, ctm);
          const px = finalM[4];
          const py = finalM[5];

          const { chars, tjShift } = estimateTokenTextUnits(textTok);
          const scaleXLocal = Math.hypot(finalM[0], finalM[1]) || 1;
          const approxWidthPts = Math.max(
            0,
            (chars * 0.45 * Math.abs(tfs) - (tjShift / 1000) * Math.abs(tfs)) * Math.abs(th) * scaleXLocal
          );

          const hitBox = boxes.find((b) => {
            const yOk = py >= b.minY && py <= b.maxY;
            if (!yOk) return false;
            const startInside = px >= b.minX && px <= b.maxX;
            const spanOverlaps = px <= b.maxX && px + approxWidthPts >= b.minX;
            return startInside || (approxWidthPts > 1 && spanOverlaps && px >= b.minX - 18);
          });

          if (hitBox) {
            removedCounts[hitBox.spanId] = (removedCounts[hitBox.spanId] || 0) + 1;
            if (currentFontKey && !matchedFontKeyBySpanId[hitBox.spanId]) {
              matchedFontKeyBySpanId[hitBox.spanId] = currentFontKey;
            }
            const firstOperand = operands[operands.length - opCountNeeded];
            edits.push({
              start: firstOperand.start,
              end: tok.end,
              replacement: op === "'" || op === '"' ? ' T* ' : ' ',
            });
          }

          // Advance text matrix along local baseline X for consecutive Tj/TJ operators
          const localAdv =
            (chars * 0.5 * Math.abs(tfs) - (tjShift / 1000) * Math.abs(tfs)) * Math.abs(th);
          if (localAdv !== 0) {
            tm = multiplyMatrix6([1, 0, 0, 1, localAdv, 0], tm);
          }
        }
        break;
      }
      default:
        break;
    }

    operands.length = 0;
  }

  if (edits.length === 0) return { rewritten: streamText, modified: false };

  let out = '';
  let cursor = 0;
  for (const ed of edits) {
    out += streamText.slice(cursor, ed.start) + ed.replacement;
    cursor = ed.end;
  }
  out += streamText.slice(cursor);
  return { rewritten: out, modified: true };
}

interface ExtractedEmbeddedFont {
  keyName: string;
  baseFont: string;
  bytes: Uint8Array;
  otFont: opentype.Font | null;
}

function extractPageEmbeddedFonts(
  pdfDoc: PDFDocument,
  pdfPage: ReturnType<PDFDocument['getPages']>[number]
): Map<string, ExtractedEmbeddedFont> {
  const map = new Map<string, ExtractedEmbeddedFont>();
  try {
    const resources = pdfPage.node.Resources();
    if (!resources) return map;
    const fontDict = resources.lookupMaybe(PDFName.of('Font'), PDFDict);
    if (!fontDict) return map;

    for (const [keyPdfName, val] of fontDict.entries()) {
      const keyName = keyPdfName.decodeText();
      const fontObj = pdfDoc.context.lookupMaybe(val, PDFDict);
      if (!fontObj) continue;

      const subtype = fontObj.get(PDFName.of('Subtype'))?.toString() || '';
      if (subtype === '/Type3') continue;

      const baseFontObj = fontObj.get(PDFName.of('BaseFont'));
      const baseFont = baseFontObj ? baseFontObj.toString().replace(/^\//, '') : '';

      let descriptor = fontObj.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
      if (!descriptor) {
        const descendants = fontObj.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray);
        if (descendants && descendants.size() > 0) {
          const cidFont = pdfDoc.context.lookupMaybe(descendants.get(0), PDFDict);
          descriptor = cidFont?.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
        }
      }
      if (!descriptor) continue;

      const fontCandidate =
        descriptor.lookup(PDFName.of('FontFile2')) ??
        descriptor.lookup(PDFName.of('FontFile3')) ??
        descriptor.lookup(PDFName.of('FontFile'));
      const rawFontStream = fontCandidate instanceof PDFRawStream ? fontCandidate : null;
      if (!rawFontStream) continue;

      try {
        const decodedBytes = decodePDFRawStream(rawFontStream).decode();
        let otFont: opentype.Font | null = null;
        try {
          const ab = decodedBytes.buffer.slice(
            decodedBytes.byteOffset,
            decodedBytes.byteOffset + decodedBytes.byteLength
          ) as ArrayBuffer;
          otFont = opentype.parse(ab);
        } catch {
          otFont = null;
        }
        map.set(keyName, {
          keyName,
          baseFont,
          bytes: decodedBytes,
          otFont,
        });
      } catch {
        // skip unreadable font stream
      }
    }
  } catch {
    // non-fatal
  }
  return map;
}

function hasAllGlyphsInOpentype(otFont: opentype.Font | null, text: string): boolean {
  if (!otFont) return false;
  try {
    for (const ch of text) {
      if (ch === '\n' || ch === '\r' || ch === '\t') continue;
      if (ch === ' ') {
        const spaceGlyph = otFont.charToGlyphIndex(' ');
        if (spaceGlyph > 0) continue;
      }
      const gid = otFont.charToGlyphIndex(ch);
      if (!gid || gid === 0) return false;
    }
    return true;
  } catch {
    return false;
  }
}

const unicodeTtfByteCache = new Map<string, Promise<Uint8Array | null>>();

async function loadUnicodeTtfBytes(
  category: 'sans' | 'serif' | 'mono',
  isBold: boolean,
  isItalic: boolean
): Promise<Uint8Array | null> {
  const familyPrefix =
    category === 'serif' ? 'LiberationSerif' : category === 'mono' ? 'LiberationMono' : 'LiberationSans';
  const variant =
    isBold && isItalic ? 'BoldItalic' : isBold ? 'Bold' : isItalic ? 'Italic' : 'Regular';
  const url = `/fonts/${familyPrefix}-${variant}.ttf`;

  let pending = unicodeTtfByteCache.get(url);
  if (!pending) {
    pending = (async () => {
      try {
        if (typeof fetch !== 'function') return null;
        const res = await fetch(url);
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        return new Uint8Array(buf);
      } catch {
        return null;
      }
    })();
    unicodeTtfByteCache.set(url, pending);
  }
  return pending;
}

/**
 * Exports an imported PDF with Adobe Acrobat-level Content Stream editing:
 * 1) Physically strips replaced text operators (Tj/TJ/'/") from page Content Streams so table borders/lines/backgrounds remain intact.
 * 2) Reuses the PDF's own embedded binary fonts via @pdf-lib/fontkit + opentype.js glyph checks when all characters exist.
 * 3) Falls back to full Unicode Liberation TrueType fonts (Regular/Bold/Italic/BoldItalic) with calibrated scaleX & letterSpacing when glyphs are missing.
 */
export async function exportAnnotatedPdf(
  originalBuffer: ArrayBuffer,
  note: NoteDocument
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalBuffer);
  pdfDoc.registerFontkit(fontkit);

  const stdFontMap = {
    sans: {
      normal_normal: await pdfDoc.embedFont(StandardFonts.Helvetica),
      bold_normal: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
      normal_italic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
      bold_italic: await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique),
    },
    serif: {
      normal_normal: await pdfDoc.embedFont(StandardFonts.TimesRoman),
      bold_normal: await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
      normal_italic: await pdfDoc.embedFont(StandardFonts.TimesRomanItalic),
      bold_italic: await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic),
    },
    mono: {
      normal_normal: await pdfDoc.embedFont(StandardFonts.Courier),
      bold_normal: await pdfDoc.embedFont(StandardFonts.CourierBold),
      normal_italic: await pdfDoc.embedFont(StandardFonts.CourierOblique),
      bold_italic: await pdfDoc.embedFont(StandardFonts.CourierBoldOblique),
    },
  };

  const embeddedFontCache = new Map<string, PDFFont>();
  const unicodeTtfEmbedCache = new Map<string, PDFFont>();

  const getUnicodeFallbackFont = async (
    category: 'sans' | 'serif' | 'mono',
    isBold: boolean,
    isItalic: boolean
  ): Promise<PDFFont> => {
    const cacheKey = `${category}_${isBold ? 'bold' : 'normal'}_${isItalic ? 'italic' : 'normal'}`;
    const existing = unicodeTtfEmbedCache.get(cacheKey);
    if (existing) return existing;

    const ttfBytes = await loadUnicodeTtfBytes(category, isBold, isItalic);
    if (ttfBytes) {
      try {
        const embedded = await pdfDoc.embedFont(ttfBytes);
        unicodeTtfEmbedCache.set(cacheKey, embedded);
        return embedded;
      } catch {
        // fall through to StandardFonts
      }
    }

    const fam = stdFontMap[category];
    const variantKey = `${isBold ? 'bold' : 'normal'}_${isItalic ? 'italic' : 'normal'}` as keyof typeof fam;
    return fam[variantKey] || fam.normal_normal;
  };

  const pages = pdfDoc.getPages();
  const hasEditedFormFields = (note.pdfPages || []).some((p) =>
    (p.formFields || []).some((f) => f.isEdited)
  );
  let form: ReturnType<PDFDocument['getForm']> | null = null;
  let acroFallbackFont: PDFFont | null = null;
  if (hasEditedFormFields) {
    try {
      form = pdfDoc.getForm();
    } catch {
      form = null;
    }
    acroFallbackFont = await getUnicodeFallbackFont('sans', false, false);
  }

  for (const pageAnnot of note.pdfPages || []) {
    const pdfPage = pages[pageAnnot.pageIndex];
    if (!pdfPage) continue;
    const { width: pdfW, height: pdfH } = pdfPage.getSize();
    const cropOrMedia = pdfPage.getCropBox() || pdfPage.getMediaBox();
    const originX = cropOrMedia?.x || 0;
    const originY = cropOrMedia?.y || 0;
    const scaleX = pdfW / Math.max(pageAnnot.width, 1);
    const scaleY = pdfH / Math.max(pageAnnot.height, 1);

    const editedSpans = (pageAnnot.textSpans || []).filter((s) => s.isEdited);
    const removedCounts: Record<string, number> = {};
    const matchedFontKeyBySpanId: Record<string, string> = {};
    const pageEmbeddedFonts =
      editedSpans.length > 0 ? extractPageEmbeddedFonts(pdfDoc, pdfPage) : new Map<string, ExtractedEmbeddedFont>();

    // 1. Physically remove edited text operators from Content Streams
    if (editedSpans.length > 0) {
      const boxes: EditedSpanPdfBox[] = editedSpans.map((sp) => ({
        spanId: sp.id,
        minX: originX + sp.x * scaleX - 3,
        maxX: originX + (sp.x + sp.width) * scaleX + 3,
        minY: originY + pdfH - (sp.y + sp.height) * scaleY - 4,
        maxY: originY + pdfH - sp.y * scaleY + 4,
      }));

      const rawContentsEntry = pdfPage.node.get(PDFName.of('Contents'));
      const processStreamRefOrObj = (refOrObj: unknown) => {
        const resolved = pdfDoc.context.lookup(refOrObj as PDFRef);
        if (!(resolved instanceof PDFRawStream)) return;
        try {
          const decodedBytes = decodePDFRawStream(resolved).decode();
          const streamText = bytesToLatin1(decodedBytes);
          const { rewritten, modified } = stripEditedSpansFromStreamText(
            streamText,
            boxes,
            removedCounts,
            matchedFontKeyBySpanId
          );
          if (modified) {
            const newStream = pdfDoc.context.flateStream(latin1ToBytes(rewritten));
            if (refOrObj instanceof PDFRef) {
              pdfDoc.context.assign(refOrObj, newStream);
            } else {
              pdfPage.node.set(PDFName.of('Contents'), pdfDoc.context.register(newStream));
            }
          }
        } catch {
          // Non-fatal: fallback cover rectangle will handle this span
        }
      };

      const lookedUpContents = rawContentsEntry ? pdfDoc.context.lookup(rawContentsEntry) : null;
      if (lookedUpContents instanceof PDFArray) {
        for (let i = 0; i < lookedUpContents.size(); i++) {
          processStreamRefOrObj(lookedUpContents.get(i));
        }
      } else if (rawContentsEntry) {
        processStreamRefOrObj(rawContentsEntry);
      }
    }

    // 2. Draw replacement vector text using original embedded font (when glyphs exist) or full Unicode TTF
    for (const span of editedSpans) {
      const wasPhysicallyRemoved = (removedCounts[span.id] || 0) > 0;
      if (!wasPhysicallyRemoved) {
        const pad = 2;
        const rx = Math.max(0, (span.x - pad) * scaleX);
        const ry = pdfH - (span.y + span.height + pad) * scaleY;
        const rw = (span.width + pad * 2) * scaleX;
        const rh = (span.height + pad * 2) * scaleY;

        pdfPage.drawRectangle({
          x: rx,
          y: ry,
          width: rw,
          height: rh,
          color: hexToPdfRgb(span.backgroundColor || '#FFFFFF'),
        });
      }

      if (span.editedText.trim()) {
        const category = span.fontCategory || inferPdfFontCategory(span.fontFamily);
        const isBold = span.fontWeight === 'bold' || span.fontWeight === '700';
        const isItalic = span.fontStyle === 'italic';

        let chosenFont: PDFFont | null = null;
        const matchedKey = matchedFontKeyBySpanId[span.id];
        const candidateEmbedded =
          (matchedKey ? pageEmbeddedFonts.get(matchedKey) : undefined) ||
          Array.from(pageEmbeddedFonts.values()).find(
            (ef) => span.pdfFontName && ef.baseFont.toLowerCase().includes(span.pdfFontName.toLowerCase())
          );

        if (candidateEmbedded && hasAllGlyphsInOpentype(candidateEmbedded.otFont, span.editedText)) {
          const cacheKey = `${pageAnnot.pageIndex}_${candidateEmbedded.keyName}_${candidateEmbedded.baseFont}`;
          chosenFont = embeddedFontCache.get(cacheKey) || null;
          if (!chosenFont) {
            try {
              chosenFont = await pdfDoc.embedFont(candidateEmbedded.bytes);
              embeddedFontCache.set(cacheKey, chosenFont);
            } catch {
              chosenFont = null;
            }
          }
        }

        if (!chosenFont) {
          chosenFont = await getUnicodeFallbackFont(category, isBold, isItalic);
        }

        const fontSizePts = Math.max(6, span.fontSize * scaleY);
        const drawX = span.x * scaleX;
        const drawY = pdfH - (span.y + span.fontSize * 0.85) * scaleY;
        const sx = span.scaleX && span.scaleX > 0.4 && span.scaleX !== 1 ? span.scaleX : 1;
        const lsPts = (span.letterSpacing ?? 0) * scaleX;
        const color = hexToPdfRgb(span.color || '#1C1C1E');

        try {
          if (sx !== 1 || Math.abs(lsPts) > 0.01) {
            pdfPage.pushOperators(
              pushGraphicsState(),
              concatTransformationMatrix(sx, 0, 0, 1, drawX, drawY),
              ...(Math.abs(lsPts) > 0.01 ? [setCharacterSpacing(lsPts)] : [])
            );
            pdfPage.drawText(span.editedText, {
              x: 0,
              y: 0,
              size: fontSizePts,
              font: chosenFont,
              color,
            });
            pdfPage.pushOperators(popGraphicsState());
          } else {
            pdfPage.drawText(span.editedText, {
              x: drawX,
              y: drawY,
              size: fontSizePts,
              font: chosenFont,
              color,
            });
          }
        } catch {
          // If embedded subset font rejected encoding at draw time, retry with full Unicode TTF
          const safeFont = await getUnicodeFallbackFont(category, isBold, isItalic);
          pdfPage.drawText(span.editedText, {
            x: drawX,
            y: drawY,
            size: fontSizePts,
            font: safeFont,
            color,
          });
        }
      }
    }

    // 3. Highlighters first, then pen/shape strokes
    const highlighters = pageAnnot.strokes.filter((s) => s.tool === 'highlighter');
    const pens = pageAnnot.strokes.filter((s) => s.tool === 'pen');
    for (const s of [...highlighters, ...pens]) {
      drawPdfStroke(pdfPage, s, scaleX, scaleY, pdfH);
    }

    // 4. Floating text boxes
    const boxFont = await getUnicodeFallbackFont('sans', false, false);
    for (const box of pageAnnot.textBoxes) {
      if (!box.content.trim()) continue;
      const fontSizePts = Math.max(8, box.fontSize * scaleY);
      const lines = wrapText(box.content, boxFont, fontSizePts, box.width * scaleX);
      let curY = pdfH - box.y * scaleY - fontSizePts;
      for (const line of lines) {
        pdfPage.drawText(line, {
          x: box.x * scaleX,
          y: curY,
          size: fontSizePts,
          font: boxFont,
          color: hexToPdfRgb(box.color),
        });
        curY -= fontSizePts * 1.35;
      }
    }

    // 5. Campi modulo AcroForm (Widget Text & Checkbox) con aggiornamento nativo e fallback vettoriale
    if (hasEditedFormFields) {
      const formFont = acroFallbackFont || (await getUnicodeFallbackFont('sans', false, false));
      for (const field of pageAnnot.formFields || []) {
        if (!field.isEdited) continue;

        const fx = originX + field.x * scaleX;
        const fy = originY + pdfH - (field.y + field.height) * scaleY;
        const fw = Math.max(4, field.width * scaleX);
        const fh = Math.max(4, field.height * scaleY);

        if (field.fieldType === 'text') {
          const category = field.fontCategory || inferPdfFontCategory(field.fontFamily);
          const isBold = field.fontWeight === 'bold' || field.fontWeight === '700';
          const isItalic = field.fontStyle === 'italic';
          const variantKey = `${isBold ? 'bold' : 'normal'}_${isItalic ? 'italic' : 'normal'}` as keyof (typeof stdFontMap)['sans'];
          const matchedStdFont = stdFontMap[category][variantKey] || stdFontMap[category].normal_normal;
          const fieldFontSizePts = Math.max(
            6,
            Math.min(fh * 0.85, Math.round(field.fontSize * scaleY * 10) / 10)
          );

          let updatedNatively = false;
          if (form && field.fieldName) {
            try {
              const tf = form.getTextField(field.fieldName);
              tf.setText(field.value);
              try {
                tf.setFontSize(fieldFontSizePts);
              } catch {
                // Il campo non possiede stringa /DA con Tf
              }
              if (field.alignment === 'center') tf.setAlignment(TextAlignment.Center);
              else if (field.alignment === 'right') tf.setAlignment(TextAlignment.Right);
              else tf.setAlignment(TextAlignment.Left);
              try {
                tf.updateAppearances(matchedStdFont);
              } catch {
                const unicodeFont = await getUnicodeFallbackFont(category, isBold, isItalic);
                tf.updateAppearances(unicodeFont);
              }
              updatedNatively = true;
            } catch {
              updatedNatively = false;
            }
          }

          if (!updatedNatively) {
            const vectorFormFont = await getUnicodeFallbackFont(category, isBold, isItalic);
            if (field.originalValue.trim()) {
              pdfPage.drawRectangle({
                x: fx,
                y: fy,
                width: fw,
                height: fh,
                color: hexToPdfRgb(field.backgroundColor || '#FFFFFF'),
              });
            }
            if (field.value.trim()) {
              const color = hexToPdfRgb(field.color || '#1C1C1E');
              const lines = field.multiLine
                ? wrapText(field.value, vectorFormFont, fieldFontSizePts, Math.max(12, fw - 6))
                : [field.value];

              if (field.multiLine) {
                let curY = fy + fh - fieldFontSizePts - 3;
                for (const line of lines) {
                  if (curY < fy + 2) break;
                  let lineW = 0;
                  try {
                    lineW = vectorFormFont.widthOfTextAtSize(line, fieldFontSizePts);
                  } catch {
                    lineW = line.length * fieldFontSizePts * 0.55;
                  }
                  let drawX = fx + 3;
                  if (field.alignment === 'center') drawX = fx + Math.max(2, (fw - lineW) / 2);
                  else if (field.alignment === 'right') drawX = fx + Math.max(2, fw - lineW - 3);
                  pdfPage.drawText(line, {
                    x: drawX,
                    y: curY,
                    size: fieldFontSizePts,
                    font: vectorFormFont,
                    color,
                  });
                  curY -= fieldFontSizePts * 1.25;
                }
              } else {
                const singleLine = lines[0] || '';
                let textW = 0;
                try {
                  textW = vectorFormFont.widthOfTextAtSize(singleLine, fieldFontSizePts);
                } catch {
                  textW = singleLine.length * fieldFontSizePts * 0.55;
                }
                let drawX = fx + 3;
                if (field.alignment === 'center') drawX = fx + Math.max(2, (fw - textW) / 2);
                else if (field.alignment === 'right') drawX = fx + Math.max(2, fw - textW - 3);
                const drawY = fy + Math.max(2, (fh - fieldFontSizePts * 0.75) / 2);
                pdfPage.drawText(singleLine, {
                  x: drawX,
                  y: drawY,
                  size: fieldFontSizePts,
                  font: vectorFormFont,
                  color,
                });
              }
            }
          }
        } else if (field.fieldType === 'checkbox') {
          let updatedNatively = false;
          if (form && field.fieldName) {
            try {
              const cb = form.getCheckBox(field.fieldName);
              if (field.checked) cb.check();
              else cb.uncheck();
              cb.updateAppearances();
              updatedNatively = true;
            } catch {
              updatedNatively = false;
            }
          }

          if (!updatedNatively) {
            if (!field.checked && field.originalChecked) {
              pdfPage.drawRectangle({
                x: fx + 1,
                y: fy + 1,
                width: Math.max(2, fw - 2),
                height: Math.max(2, fh - 2),
                color: hexToPdfRgb(field.backgroundColor || '#FFFFFF'),
              });
            }
            if (field.checked) {
              const padX = fw * 0.22;
              const padY = fh * 0.24;
              const thickness = Math.max(1.2, Math.min(fw, fh) * 0.13);
              const color = hexToPdfRgb(field.color || '#1C1C1E');
              const p1 = { x: fx + padX, y: fy + fh * 0.48 };
              const p2 = { x: fx + fw * 0.43, y: fy + padY };
              const p3 = { x: fx + fw - padX, y: fy + fh - padY };
              pdfPage.drawLine({ start: p1, end: p2, thickness, color });
              pdfPage.drawLine({ start: p2, end: p3, thickness, color });
            }
          }
        }
      }
    }
  }

  // Remove any PDF pages that the user deleted inside Qaderno
  const keptIndices = new Set((note.pdfPages || []).map((p) => p.pageIndex));
  if (keptIndices.size > 0 && keptIndices.size < pages.length) {
    for (let i = pages.length - 1; i >= 0; i--) {
      if (!keptIndices.has(i)) {
        pdfDoc.removePage(i);
      }
    }
  }

  return pdfDoc.save(form ? { updateFieldAppearances: false } : undefined);
}

export async function exportHybridNoteToPdf(
  rawNote: NoteDocument,
  blockOffsetsByPage: Record<string, Record<string, { top: number; height: number }>>,
  canvasWidth: number
): Promise<Uint8Array> {
  const note = normalizeNotePages(rawNote);
  const pdfDoc = await PDFDocument.create();

  const fonts: Record<
    NoteFontFamily,
    {
      regular: Awaited<ReturnType<PDFDocument['embedFont']>>;
      bold: Awaited<ReturnType<PDFDocument['embedFont']>>;
      italic: Awaited<ReturnType<PDFDocument['embedFont']>>;
      boldItalic: Awaited<ReturnType<PDFDocument['embedFont']>>;
    }
  > = {
    sans: {
      regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
      bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
      italic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
      boldItalic: await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique),
    },
    serif: {
      regular: await pdfDoc.embedFont(StandardFonts.TimesRoman),
      bold: await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
      italic: await pdfDoc.embedFont(StandardFonts.TimesRomanItalic),
      boldItalic: await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic),
    },
    mono: {
      regular: await pdfDoc.embedFont(StandardFonts.Courier),
      bold: await pdfDoc.embedFont(StandardFonts.CourierBold),
      italic: await pdfDoc.embedFont(StandardFonts.CourierOblique),
      boldItalic: await pdfDoc.embedFont(StandardFonts.CourierBoldOblique),
    },
    hand: {
      regular: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
      bold: await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique),
      italic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
      boldItalic: await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique),
    },
  };

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const marginX = 48;
  const marginTop = 52;
  const contentWidthPts = pageWidth - marginX * 2;
  const scale = contentWidthPts / Math.max(canvasWidth - 96, 520);

  const drawPaperBackground = (page: ReturnType<PDFDocument['addPage']>) => {
    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
      color: rgb(251 / 255, 251 / 255, 253 / 255),
    });

    const patternColor = rgb(229 / 255, 229 / 255, 234 / 255);
    if (note.paperStyle === 'grid') {
      const step = 18;
      for (let x = step; x < pageWidth; x += step) {
        page.drawLine({ start: { x, y: 0 }, end: { x, y: pageHeight }, thickness: 0.45, color: patternColor });
      }
      for (let y = step; y < pageHeight; y += step) {
        page.drawLine({ start: { x: 0, y }, end: { x: pageWidth, y }, thickness: 0.45, color: patternColor });
      }
    } else if (note.paperStyle === 'lined') {
      const step = 22;
      for (let y = pageHeight - 60; y > 36; y -= step) {
        page.drawLine({ start: { x: 36, y }, end: { x: pageWidth - 36, y }, thickness: 0.5, color: patternColor });
      }
    } else if (note.paperStyle === 'dotted') {
      const step = 18;
      for (let x = step; x < pageWidth; x += step) {
        for (let y = step; y < pageHeight; y += step) {
          page.drawCircle({ x, y, size: 0.65, color: patternColor });
        }
      }
    }
  };

  const hybridPages = note.pages || [];

  for (let hIdx = 0; hIdx < hybridPages.length; hIdx++) {
    const hPage = hybridPages[hIdx];
    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    drawPaperBackground(page);

    let cursorY = pageHeight - marginTop;
    if (hIdx === 0) {
      const titleFont = fonts[note.fontFamily || 'sans'].bold;
      const titleLines = wrapText(note.title || 'Senza titolo', titleFont, 20, contentWidthPts);
      for (const line of titleLines) {
        page.drawText(line, {
          x: marginX,
          y: cursorY - 20,
          size: 20,
          font: titleFont,
          color: rgb(0.11, 0.11, 0.12),
        });
        cursorY -= 26;
      }
      cursorY -= 12;
    }

    const blockPdfY: Record<string, { pageIdx: number; topPtsFromTop: number }> = {};

    const resolveBlockFont = (block: TextBlock) => {
      const fam = block.fontFamily || (block.type === 'code' ? 'mono' : note.fontFamily || 'sans');
      return block.type === 'h1' || block.type === 'h2' ? fonts[fam].bold : fonts[fam].regular;
    };

    for (const block of hPage.blocks) {
      const fam = block.fontFamily || (block.type === 'code' ? 'mono' : note.fontFamily || 'sans');
      const font = resolveBlockFont(block);
      const fontSize = block.type === 'h1' ? 16 : block.type === 'h2' ? 13.5 : block.type === 'code' ? 9.5 : 11;
      const lineHeight = fontSize * 1.45;

      let prefix = '';
      if (block.type === 'bullet') prefix = '•  ';
      if (block.type === 'todo') prefix = block.checked ? '[x]  ' : '[ ]  ';

      const text = `${prefix}${block.content || ' '}`;
      const lines = wrapText(text, font, fontSize, contentWidthPts);
      const needed = Math.max(lineHeight, lines.length * lineHeight) + 6;

      if (cursorY - needed < 48) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        drawPaperBackground(page);
        cursorY = pageHeight - marginTop;
      }

      const pageIdx = pdfDoc.getPageCount() - 1;
      blockPdfY[block.id] = {
        pageIdx,
        topPtsFromTop: pageHeight - cursorY,
      };

      const baseBlockRgb =
        block.type === 'todo' && block.checked
          ? rgb(0.55, 0.55, 0.58)
          : block.color
            ? hexToPdfRgb(block.color)
            : rgb(0.11, 0.11, 0.12);

      const contentStr = block.content || ' ';
      const prefixLen = prefix.length;
      const totalChars = prefixLen + contentStr.length;
      const charColors: Array<ReturnType<typeof rgb>> = new Array(totalChars).fill(baseBlockRgb);
      if (block.colorSpans && block.colorSpans.length > 0 && !(block.type === 'todo' && block.checked)) {
        for (const cp of block.colorSpans) {
          const cRgb = hexToPdfRgb(cp.color);
          const s = Math.max(0, cp.start) + prefixLen;
          const e = Math.min(contentStr.length, cp.end) + prefixLen;
          for (let ci = s; ci < e; ci++) charColors[ci] = cRgb;
        }
      }

      const charFonts: Array<Awaited<ReturnType<PDFDocument['embedFont']>>> = new Array(totalChars).fill(font);
      if (block.styleSpans && block.styleSpans.length > 0) {
        const blockIsHeading = block.type === 'h1' || block.type === 'h2';
        for (const st of block.styleSpans) {
          const s = Math.max(0, st.start) + prefixLen;
          const e = Math.min(contentStr.length, st.end) + prefixLen;
          const spanFam = st.code ? 'mono' : fam;
          const isBold = Boolean(st.bold || blockIsHeading);
          const isItalic = Boolean(st.italic);
          const resolvedFont =
            isBold && isItalic
              ? fonts[spanFam].boldItalic
              : isBold
                ? fonts[spanFam].bold
                : isItalic
                  ? fonts[spanFam].italic
                  : fonts[spanFam].regular;
          for (let ci = s; ci < e; ci++) {
            charFonts[ci] = resolvedFont;
          }
        }
      }

      let charOffset = 0;
      const fullText = `${prefix}${contentStr}`;
      for (const line of lines) {
        if (!line) {
          cursorY -= lineHeight;
          continue;
        }
        const matchIdx = fullText.indexOf(line, charOffset);
        const startIdx = matchIdx !== -1 ? matchIdx : charOffset;
        let runX = marginX;
        let segStart = 0;
        for (let i = 1; i <= line.length; i++) {
          const prevColor = charColors[startIdx + segStart] || baseBlockRgb;
          const curColor = i < line.length ? charColors[startIdx + i] || baseBlockRgb : null;
          const prevFont = charFonts[startIdx + segStart] || font;
          const curFont = i < line.length ? charFonts[startIdx + i] || font : null;
          if (i === line.length || curColor !== prevColor || curFont !== prevFont) {
            const slice = line.slice(segStart, i);
            page.drawText(slice, {
              x: runX,
              y: cursorY - fontSize,
              size: fontSize,
              font: prevFont,
              color: prevColor,
            });
            try {
              runX += prevFont.widthOfTextAtSize(slice, fontSize);
            } catch {
              runX += slice.length * fontSize * 0.55;
            }
            segStart = i;
          }
        }
        charOffset = startIdx + line.length;
        while (charOffset < fullText.length && (fullText[charOffset] === ' ' || fullText[charOffset] === '\n')) {
          charOffset++;
        }
        cursorY -= lineHeight;
      }
      cursorY -= 6;
    }

    const pdfPages = pdfDoc.getPages();
    const blockOffsets = blockOffsetsByPage[hPage.id] || {};
    const orderedStrokes = [
      ...hPage.strokes.filter((s) => s.tool === 'highlighter'),
      ...hPage.strokes.filter((s) => s.tool === 'pen'),
    ];

    for (const s of orderedStrokes) {
      const anchorInfo = s.anchorBlockId ? blockPdfY[s.anchorBlockId] : undefined;
      const targetPage = anchorInfo ? pdfPages[anchorInfo.pageIdx] : page;
      if (!targetPage) continue;

      if (anchorInfo && s.anchorBlockId && blockOffsets[s.anchorBlockId]) {
        const shiftedStroke: Stroke = {
          ...s,
          points: s.points.map((p) => ({
            ...p,
            x: marginX / scale + (p.x - 48),
            y: anchorInfo.topPtsFromTop / scale + p.y,
          })),
          shapeMeta: s.shapeMeta
            ? {
                ...s.shapeMeta,
                x1: s.shapeMeta.x1 !== undefined ? marginX / scale + (s.shapeMeta.x1 - 48) : undefined,
                y1: s.shapeMeta.y1 !== undefined ? anchorInfo.topPtsFromTop / scale + s.shapeMeta.y1 : undefined,
                x2: s.shapeMeta.x2 !== undefined ? marginX / scale + (s.shapeMeta.x2 - 48) : undefined,
                y2: s.shapeMeta.y2 !== undefined ? anchorInfo.topPtsFromTop / scale + s.shapeMeta.y2 : undefined,
                cx: s.shapeMeta.cx !== undefined ? marginX / scale + (s.shapeMeta.cx - 48) : undefined,
                cy: s.shapeMeta.cy !== undefined ? anchorInfo.topPtsFromTop / scale + s.shapeMeta.cy : undefined,
                vertices: s.shapeMeta.vertices?.map((v) => ({
                  x: marginX / scale + (v.x - 48),
                  y: anchorInfo.topPtsFromTop / scale + v.y,
                })),
              }
            : undefined,
        };
        drawPdfStroke(targetPage, shiftedStroke, scale, scale, pageHeight);
      } else {
        drawPdfStroke(targetPage, s, scale, scale, pageHeight);
      }
    }
  }

  return pdfDoc.save();
}

function wrapText(
  text: string,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  fontSize: number,
  maxWidth: number
): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push('');
      continue;
    }
    const words = para.split(' ');
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      let width = 0;
      try {
        width = font.widthOfTextAtSize(candidate, fontSize);
      } catch {
        width = candidate.length * fontSize * 0.55;
      }
      if (width <= maxWidth || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}
