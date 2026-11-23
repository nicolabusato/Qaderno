import * as pdfjsLib from 'pdfjs-dist';
import { NoteDocument, PdfPageAnnotations } from '../types/qaderno';
import { getCachedPdfDocument } from './pdfEngine';
import { normalizeNotePages } from './storage';

export interface HybridSearchMatch {
  id: string;
  kind: 'title' | 'block';
  pageId: string;
  blockId?: string;
  start: number;
  end: number;
}

export interface PdfSearchRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfSearchMatch {
  id: string;
  pageIndex: number;
  rects: PdfSearchRect[];
  anchorY: number;
}

interface RawPdfSearchRun {
  str: string;
  x: number;
  y: number;
  baselineY: number;
  width: number;
  height: number;
  fontSize: number;
}

interface PdfSearchLine {
  text: string;
  segments: Array<{
    start: number;
    end: number;
    x: number;
    y: number;
    width: number;
    height: number;
    len: number;
  }>;
}

const pdfSearchLineCache = new WeakMap<ArrayBuffer, Map<number, PdfSearchLine[]>>();

export function findHybridSearchMatches(note: NoteDocument, rawQuery: string): HybridSearchMatch[] {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return [];

  const normalized = normalizeNotePages(note);
  const pages = normalized.pages || [];
  const matches: HybridSearchMatch[] = [];

  if (pages.length > 0 && note.title) {
    const lowerTitle = note.title.toLocaleLowerCase();
    let idx = 0;
    let count = 0;
    while ((idx = lowerTitle.indexOf(query, idx)) !== -1) {
      matches.push({
        id: `title_${count++}`,
        kind: 'title',
        pageId: pages[0].id,
        start: idx,
        end: idx + query.length,
      });
      idx += Math.max(1, query.length);
    }
  }

  for (const page of pages) {
    for (const block of page.blocks) {
      if (!block.content) continue;
      const lower = block.content.toLocaleLowerCase();
      let idx = 0;
      let count = 0;
      while ((idx = lower.indexOf(query, idx)) !== -1) {
        matches.push({
          id: `${page.id}_${block.id}_${count++}`,
          kind: 'block',
          pageId: page.id,
          blockId: block.id,
          start: idx,
          end: idx + query.length,
        });
        idx += Math.max(1, query.length);
      }
    }
  }

  return matches;
}

async function getPdfPageSearchLines(
  pdfBuffer: ArrayBuffer,
  pageMeta: PdfPageAnnotations
): Promise<PdfSearchLine[]> {
  let docMap = pdfSearchLineCache.get(pdfBuffer);
  if (!docMap) {
    docMap = new Map();
    pdfSearchLineCache.set(pdfBuffer, docMap);
  }
  const existing = docMap.get(pageMeta.pageIndex);
  if (existing) return existing;

  try {
    const doc = await getCachedPdfDocument(pdfBuffer);
    const pdfPage = await doc.getPage(pageMeta.pageIndex + 1);
    const baseViewport = pdfPage.getViewport({ scale: 1 });
    const scale = pageMeta.width / Math.max(baseViewport.width, 1);
    const viewport = pdfPage.getViewport({ scale });

    const { items } = (await pdfPage.getTextContent()) as {
      items: Array<{ str?: string; transform?: number[]; width?: number; height?: number }>;
    };

    const rawRuns: RawPdfSearchRun[] = [];
    for (const item of items) {
      if (!item.str || !item.transform) continue;
      if (item.str.length === 0) continue;
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const fontSize = Math.max(6, Math.hypot(item.transform[2], item.transform[3]) * viewport.scale);
      const x = tx[4];
      const baselineY = tx[5];
      const width = Math.max(2, (item.width || 0) * viewport.scale);
      const height = Math.max(fontSize * 1.15, (item.height || fontSize) * viewport.scale);

      rawRuns.push({
        str: item.str,
        x,
        y: baselineY - fontSize * 0.88,
        baselineY,
        width,
        height,
        fontSize,
      });
    }

    rawRuns.sort(
      (a, b) => Math.round(a.baselineY / 4) - Math.round(b.baselineY / 4) || a.x - b.x
    );

    const lines: PdfSearchLine[] = [];
    let currentLine: PdfSearchLine | null = null;
    let lastBaselineY = 0;
    let lastRightX = 0;
    let lastFontSize = 12;

    for (const run of rawRuns) {
      const sameLine =
        currentLine !== null &&
        Math.abs(run.baselineY - lastBaselineY) <= Math.max(4, Math.min(run.fontSize, lastFontSize) * 0.45) &&
        run.x - lastRightX < Math.max(run.fontSize * 6, 48);

      if (!sameLine) {
        currentLine = { text: '', segments: [] };
        lines.push(currentLine);
      }

      if (currentLine) {
        const gap = currentLine.segments.length > 0 ? run.x - lastRightX : 0;
        const needsSpace =
          currentLine.segments.length > 0 &&
          gap > run.fontSize * 0.16 &&
          !currentLine.text.endsWith(' ') &&
          !run.str.startsWith(' ');

        if (needsSpace) {
          currentLine.text += ' ';
        }

        const start = currentLine.text.length;
        currentLine.text += run.str;
        const end = currentLine.text.length;

        currentLine.segments.push({
          start,
          end,
          x: run.x,
          y: run.y,
          width: run.width,
          height: run.height,
          len: Math.max(1, run.str.length),
        });
      }

      lastBaselineY = run.baselineY;
      lastRightX = run.x + run.width;
      lastFontSize = run.fontSize;
    }

    docMap.set(pageMeta.pageIndex, lines);
    return lines;
  } catch {
    return [];
  }
}

export async function searchPdfDocumentMatches(
  pdfBuffer: ArrayBuffer | null,
  pdfPages: PdfPageAnnotations[],
  rawQuery: string
): Promise<PdfSearchMatch[]> {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query || pdfPages.length === 0) return [];

  const allMatches: PdfSearchMatch[] = [];

  for (const page of pdfPages) {
    const editedSpanIds = new Set<string>();

    // 1. Search user-edited text spans on the PDF first
    for (const span of page.textSpans || []) {
      if (!span.isEdited) continue;
      editedSpanIds.add(span.id);
      const text = span.editedText || '';
      const lower = text.toLocaleLowerCase();
      let idx = 0;
      let count = 0;
      while ((idx = lower.indexOf(query, idx)) !== -1) {
        const len = Math.max(1, text.length);
        const rx = span.x + (idx / len) * span.width;
        const rw = Math.max(10, (query.length / len) * span.width);
        allMatches.push({
          id: `p${page.pageIndex}_span_${span.id}_${count++}`,
          pageIndex: page.pageIndex,
          rects: [{ x: rx, y: span.y, width: rw, height: span.height }],
          anchorY: span.y,
        });
        idx += Math.max(1, query.length);
      }
    }

    // 2. Search native PDF text layer via pdfjs-dist getTextContent()
    if (pdfBuffer) {
      const lines = await getPdfPageSearchLines(pdfBuffer, page);
      let lineMatchCount = 0;
      for (const line of lines) {
        const lower = line.text.toLocaleLowerCase();
        let idx = 0;
        while ((idx = lower.indexOf(query, idx)) !== -1) {
          const matchStart = idx;
          const matchEnd = idx + query.length;
          const rects: PdfSearchRect[] = [];

          for (const seg of line.segments) {
            const ovStart = Math.max(matchStart, seg.start);
            const ovEnd = Math.min(matchEnd, seg.end);
            if (ovEnd <= ovStart) continue;

            const ratioStart = (ovStart - seg.start) / seg.len;
            const ratioEnd = (ovEnd - seg.start) / seg.len;
            const x = seg.x + ratioStart * seg.width;
            const width = Math.max(6, (ratioEnd - ratioStart) * seg.width);
            rects.push({ x, y: seg.y, width, height: seg.height });
          }

          if (rects.length > 0) {
            // Merge horizontally adjacent rects on the same line for clean pill highlights
            const merged: PdfSearchRect[] = [];
            for (const r of rects) {
              const prev = merged[merged.length - 1];
              if (
                prev &&
                Math.abs(prev.y - r.y) <= Math.max(prev.height, r.height) * 0.5 &&
                r.x - (prev.x + prev.width) <= 12
              ) {
                const right = Math.max(prev.x + prev.width, r.x + r.width);
                const bottom = Math.max(prev.y + prev.height, r.y + r.height);
                prev.y = Math.min(prev.y, r.y);
                prev.width = right - prev.x;
                prev.height = bottom - prev.y;
              } else {
                merged.push({ ...r });
              }
            }

            // Avoid duplicating a match that lies squarely over an edited span
            const centerX = merged[0].x + merged[0].width / 2;
            const centerY = merged[0].y + merged[0].height / 2;
            const coveredByEditedSpan =
              editedSpanIds.size > 0 &&
              (page.textSpans || []).some(
                (sp) =>
                  sp.isEdited &&
                  centerX >= sp.x - 2 &&
                  centerX <= sp.x + sp.width + 2 &&
                  centerY >= sp.y - 2 &&
                  centerY <= sp.y + sp.height + 2
              );

            if (!coveredByEditedSpan) {
              allMatches.push({
                id: `p${page.pageIndex}_pdf_${lineMatchCount++}`,
                pageIndex: page.pageIndex,
                rects: merged,
                anchorY: merged[0].y,
              });
            }
          }

          idx += Math.max(1, query.length);
        }
      }
    }

    // 3. Search AcroForm fields (filled values)
    for (const field of page.formFields || []) {
      const val = field.isEdited ? field.value : field.originalValue;
      if (!val) continue;
      const lower = val.toLocaleLowerCase();
      let idx = 0;
      let count = 0;
      while ((idx = lower.indexOf(query, idx)) !== -1) {
        allMatches.push({
          id: `p${page.pageIndex}_ff_${field.id}_${count++}`,
          pageIndex: page.pageIndex,
          rects: [{ x: field.x, y: field.y, width: field.width, height: field.height }],
          anchorY: field.y,
        });
        idx += Math.max(1, query.length);
      }
    }

    // 4. Search floating note text boxes
    for (const box of page.textBoxes || []) {
      if (!box.content) continue;
      const lower = box.content.toLocaleLowerCase();
      let idx = 0;
      let count = 0;
      while ((idx = lower.indexOf(query, idx)) !== -1) {
        allMatches.push({
          id: `p${page.pageIndex}_tb_${box.id}_${count++}`,
          pageIndex: page.pageIndex,
          rects: [{ x: box.x, y: box.y, width: box.width, height: Math.max(36, box.fontSize * 2.4) }],
          anchorY: box.y,
        });
        idx += Math.max(1, query.length);
      }
    }
  }

  return allMatches;
}
