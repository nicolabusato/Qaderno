import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Calendar, Check, ChevronLeft, ChevronRight, RotateCcw, Trash2, Type, X } from 'lucide-react';
import { useHandPan, usePinchZoom } from '../hooks/usePinchZoom';
import {
  ContextMenuState,
  EraserMode,
  FloatingTextBox,
  NoteDocument,
  PdfFormField,
  PdfPageAnnotations,
  PdfTextEdit,
  PdfTextMode,
  PdfTextSpan,
  RecognizedShapeKind,
  RecognizedShapeMeta,
  Stroke,
  StrokePoint,
  ToolType,
} from '../types/qaderno';
import {
  applyPrecisionEraser,
  getStrokeBounds,
  isPointNearStroke,
  isStrokeSelectedByLasso,
  maybeStraightenHighlighter,
  renderStroke,
  translateStroke,
} from '../utils/inkRenderer';
import {
  alignFormFieldsRowTypography,
  calibratePdfSpanMetrics,
  PdfRenderTaskHandle,
  renderPdfPageToCanvas,
  resolveLivePageFonts,
  sampleSpanColorsFromCanvas,
} from '../utils/pdfEngine';
import {
  detectDateInText,
  formatDateWithMeta,
  formatFormFieldDate,
  ITALIAN_MONTHS_LONG,
  ITALIAN_WEEKDAYS_SHORT,
  PdfDateFormatMeta,
  replaceDateInSpanText,
} from '../utils/pdfDateHelper';
import {
  createShapeFromDrag,
  recognizeLocalShape,
  resizeSnappedShapeLive,
} from '../utils/shapeRecognizer';

export interface ActivePdfTextTarget {
  kind: 'textbox' | 'pdfspan' | 'pdfformfield';
  pageIndex: number;
  id: string;
  color?: string;
}

interface PdfAnnotatorProps {
  note: NoteDocument;
  pdfBuffer: ArrayBuffer | null;
  zoom: number;
  activeTool: ToolType;
  pdfTextMode?: PdfTextMode;
  selectedInsertShape: RecognizedShapeKind;
  eraserMode: EraserMode;
  eraserSize: number;
  activeColor: string;
  penWidth: number;
  highlighterWidth: number;
  holdToSnap: boolean;
  selectedStrokeIds: string[];
  onSelectStrokes: (ids: string[], pageIndex?: number) => void;
  onUpdatePages: (pages: PdfPageAnnotations[], recordHistory?: boolean) => void;
  onDeletePage: (pageIndex: number) => void;
  onOpenContextMenu: (menu: ContextMenuState) => void;
  onActivePdfTextTargetChange?: (target: ActivePdfTextTarget | null) => void;
  onChangeZoom: (nextZoom: number) => void;
  onZoomWheel: (deltaY: number) => void;
}

interface PdfPageCardProps {
  page: PdfPageAnnotations;
  displayPageNumber: number;
  totalPages: number;
  pdfBuffer: ArrayBuffer | null;
  zoom: number;
  activeTool: ToolType;
  pdfTextMode: PdfTextMode;
  selectedInsertShape: RecognizedShapeKind;
  eraserMode: EraserMode;
  eraserSize: number;
  activeColor: string;
  penWidth: number;
  highlighterWidth: number;
  holdToSnap: boolean;
  selectedStrokeIds: string[];
  onSelectStrokes: (ids: string[]) => void;
  onUpdatePage: (updated: PdfPageAnnotations, recordHistory?: boolean) => void;
  onDeletePage: (pageIndex: number) => void;
  onOpenContextMenu: (menu: ContextMenuState) => void;
  onActivePdfTextTargetChange?: (target: ActivePdfTextTarget | null) => void;
}

function buildSpanFontFamily(span: PdfTextSpan, liveAlias?: string): string {
  const saved = span.fontFamily || (span.pdfFontName ? `'${span.pdfFontName}', sans-serif` : 'sans-serif');
  if (liveAlias && liveAlias !== span.pdfFontName && !saved.includes(`'${liveAlias}'`)) {
    return `'${liveAlias}', ${saved}`;
  }
  return saved;
}

function buildFormFieldFontFamily(
  field: PdfFormField,
  spans: PdfTextSpan[],
  liveAliases: Record<string, string>
): string {
  const fallback =
    field.fontCategory === 'mono'
      ? "'Courier Prime', 'Courier New', monospace"
      : field.fontCategory === 'serif'
        ? "'Times New Roman', Georgia, serif"
        : 'Helvetica, Arial, sans-serif';
  const saved = field.fontFamily || (field.pdfFontName ? `'${field.pdfFontName}', ${fallback}` : fallback);

  let liveAlias = field.matchedSpanId ? liveAliases[field.matchedSpanId] : undefined;
  if (!liveAlias && field.pdfFontName) {
    const matchingSpan = spans.find((sp) => sp.pdfFontName === field.pdfFontName && liveAliases[sp.id]);
    if (matchingSpan) liveAlias = liveAliases[matchingSpan.id];
  }
  if (liveAlias && !saved.includes(`'${liveAlias}'`)) {
    return `'${liveAlias}', ${saved}`;
  }
  return saved;
}

function normalizeFontWeight(w?: PdfTextSpan['fontWeight']): '400' | '700' {
  return w === 'bold' || w === '700' ? '700' : '400';
}

function buildTextEditsArray(spans: PdfTextSpan[]): PdfTextEdit[] {
  return spans
    .filter((sp) => sp.isEdited)
    .map((sp) => ({
      spanId: sp.id,
      text: sp.editedText,
      x: sp.x,
      y: sp.y,
      width: sp.width,
      height: sp.height,
      fontFamily: sp.fontFamily,
      mappedFallbackFont: sp.mappedFallbackFont,
      fontCategory: sp.fontCategory,
      fontSize: sp.fontSize,
      fontWeight: normalizeFontWeight(sp.fontWeight),
      fontStyle: sp.fontStyle === 'italic' ? 'italic' : 'normal',
      letterSpacing: sp.letterSpacing ?? 0,
      scaleX: sp.scaleX ?? 1,
      color: sp.color || '#1C1C1E',
      backgroundColor: sp.backgroundColor || '#FFFFFF',
    }));
}

const PdfPageCard: React.FC<PdfPageCardProps> = ({
  page,
  displayPageNumber,
  totalPages,
  pdfBuffer,
  zoom,
  activeTool,
  pdfTextMode,
  selectedInsertShape,
  eraserMode,
  eraserSize,
  activeColor,
  penWidth,
  highlighterWidth,
  holdToSnap,
  selectedStrokeIds,
  onSelectStrokes,
  onUpdatePage,
  onDeletePage,
  onOpenContextMenu,
  onActivePdfTextTargetChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const hlCanvasRef = useRef<HTMLCanvasElement>(null);
  const penCanvasRef = useRef<HTMLCanvasElement>(null);
  const sampledPageRef = useRef<number | null>(null);
  const renderTaskRef = useRef<PdfRenderTaskHandle | null>(null);
  const initialRenderedRef = useRef(false);
  const latestPageRef = useRef<PdfPageAnnotations>(page);
  latestPageRef.current = page;

  const [snapPulse, setSnapPulse] = useState<{ x: number; y: number; id: number } | null>(null);
  const [rendered, setRendered] = useState(false);
  const [editingSpanId, setEditingSpanId] = useState<string | null>(null);
  const [editingFormFieldId, setEditingFormFieldId] = useState<string | null>(null);
  const [liveFontAliases, setLiveFontAliases] = useState<Record<string, string>>({});
  const [activeDatePopover, setActiveDatePopover] = useState<{
    targetKind: 'span' | 'formfield';
    targetId: string;
    anchorRect: { left: number; top: number; bottom: number; width: number };
    viewYear: number;
    viewMonth: number;
    selectedYear: number;
    selectedMonth: number;
    selectedDay: number;
  } | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState<boolean>(() =>
    typeof window !== 'undefined' &&
    (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window)
  );

  const activeTouchesRef = useRef<Set<number>>(new Set());

  const drawingRef = useRef<{
    active: boolean;
    pointerId: number;
    pointerType: string;
    tool: 'pen' | 'highlighter';
    points: StrokePoint[];
    snappedMeta: RecognizedShapeMeta | null;
    quietAnchor: { x: number; y: number };
    snapTimer: number | null;
  } | null>(null);

  const shapeDragRef = useRef<{
    active: boolean;
    pointerId: number;
    kind: RecognizedShapeKind;
    startPt: { x: number; y: number };
    shapeMeta: RecognizedShapeMeta;
    points: StrokePoint[];
  } | null>(null);

  const lassoRef = useRef<{
    mode: 'draw' | 'drag';
    pointerId: number;
    polygon: Array<{ x: number; y: number }>;
    dragStart: { x: number; y: number };
    dragDelta: { dx: number; dy: number };
  } | null>(null);

  const eraserRef = useRef<{ active: boolean; pointerId: number; workingStrokes: Stroke[] | null }>({
    active: false,
    pointerId: -1,
    workingStrokes: null,
  });

  const longPressRef = useRef<{
    timer: number | null;
    startX: number;
    startY: number;
    pointerId: number;
  }>({ timer: null, startX: 0, startY: 0, pointerId: -1 });

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const update = () => setIsTouchDevice(mq.matches || 'ontouchstart' in window);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (activeTool !== 'text' || pdfTextMode !== 'edit') {
      if (editingSpanId) setEditingSpanId(null);
      if (editingFormFieldId) setEditingFormFieldId(null);
      if (activeDatePopover) setActiveDatePopover(null);
    }
  }, [activeTool, pdfTextMode, editingSpanId, editingFormFieldId, activeDatePopover]);

  useEffect(() => {
    if (!editingSpanId && !editingFormFieldId && activeDatePopover) {
      setActiveDatePopover(null);
    }
  }, [editingSpanId, editingFormFieldId, activeDatePopover]);

  useEffect(() => {
    if (!activeDatePopover) return;
    const handleOutsidePointerDown = (ev: PointerEvent) => {
      const target = ev.target as HTMLElement | null;
      if (
        target?.closest('[data-pdf-date-popover]') ||
        target?.closest('[data-pdfspan]') ||
        target?.closest('[data-formfield]')
      ) {
        return;
      }
      setActiveDatePopover(null);
      setEditingSpanId(null);
      setEditingFormFieldId(null);
    };
    const handleScrollOrEsc = (ev: Event) => {
      if (ev.type === 'keydown' && (ev as KeyboardEvent).key !== 'Escape') return;
      if (ev.type === 'scroll' && (ev.target as HTMLElement | null)?.closest?.('[data-pdf-date-popover]')) {
        return;
      }
      setActiveDatePopover(null);
    };
    window.addEventListener('pointerdown', handleOutsidePointerDown, true);
    window.addEventListener('scroll', handleScrollOrEsc, true);
    window.addEventListener('keydown', handleScrollOrEsc);
    return () => {
      window.removeEventListener('pointerdown', handleOutsidePointerDown, true);
      window.removeEventListener('scroll', handleScrollOrEsc, true);
      window.removeEventListener('keydown', handleScrollOrEsc);
    };
  }, [activeDatePopover]);

  useEffect(() => {
    initialRenderedRef.current = false;
  }, [pdfBuffer, page.pageIndex, page.width]);

  useEffect(() => {
    let cancelled = false;
    if (!pdfBuffer || !bgCanvasRef.current) return;

    const executeRender = () => {
      if (cancelled || !bgCanvasRef.current) return;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;

      renderPdfPageToCanvas(
        pdfBuffer,
        page.pageIndex,
        bgCanvasRef.current,
        page.width,
        zoom,
        (handle) => {
          renderTaskRef.current = handle;
        }
      )
        .then(async (completed) => {
          if (cancelled || !completed) return;
          initialRenderedRef.current = true;
          setRendered(true);

          const currentPage = latestPageRef.current;
          const currentSpans = currentPage.textSpans || [];
          const currentFields = currentPage.formFields || [];
          if (!currentSpans.length && !currentFields.length) return;

          // 1. Resolve live CSS FontFaces & commonObjs font metadata after PDF.js render registers @font-face
          const liveRes = currentSpans.length
            ? await resolveLivePageFonts(pdfBuffer, currentPage.pageIndex, currentSpans)
            : { aliasesBySpanId: {}, commonFontMetaBySpanId: {} };
          if (cancelled) return;
          setLiveFontAliases(liveRes.aliasesBySpanId);

          // 2. Sample background, glyph ink color, and >22% ink pixel density on unedited spans
          const needsPixelCheck = currentSpans.some((s) => !s.pixelChecked);
          let nextSpans = currentSpans;
          let changed = false;

          if (Object.keys(liveRes.commonFontMetaBySpanId).length > 0) {
            nextSpans = nextSpans.map((sp) => {
              if (sp.isEdited) return sp;
              const resolved = liveRes.commonFontMetaBySpanId[sp.id];
              if (!resolved) return sp;
              if (
                sp.mappedFallbackFont !== resolved.mappedFallbackFont ||
                sp.fontFamily !== resolved.fontFamily ||
                sp.fontStyle !== resolved.fontStyle
              ) {
                changed = true;
                return {
                  ...sp,
                  pdfFontName: resolved.pdfFontName,
                  mappedFallbackFont: resolved.mappedFallbackFont,
                  fontCategory: resolved.fontCategory,
                  fontFamily: resolved.fontFamily,
                  fontStyle: resolved.fontStyle,
                  fontWeight:
                    sp.fontWeight === '700' || sp.fontWeight === 'bold'
                      ? '700'
                      : resolved.fontWeight,
                };
              }
              return sp;
            });
          }

          if (bgCanvasRef.current && needsPixelCheck && sampledPageRef.current !== currentPage.pageIndex) {
            sampledPageRef.current = currentPage.pageIndex;
            nextSpans = sampleSpanColorsFromCanvas(
              bgCanvasRef.current,
              currentPage.width,
              currentPage.height,
              nextSpans
            );
            changed = true;
          }

          // 3. Assicura che i formFields abbiano la tipografia sincronizzata con i PdfTextSpan aggiornati
          let nextFields = currentFields;
          if (
            currentFields.length > 0 &&
            (changed || currentFields.some((f) => f.fieldType === 'text' && !f.fontFamily))
          ) {
            nextFields = alignFormFieldsRowTypography(currentFields, nextSpans);
            if (JSON.stringify(nextFields) !== JSON.stringify(currentFields)) {
              changed = true;
            }
          }

          if (changed && !cancelled) {
            onUpdatePage(
              {
                ...latestPageRef.current,
                textSpans: nextSpans,
                textEdits: buildTextEditsArray(nextSpans),
                formFields: nextFields,
              },
              false
            );
          }
        })
        .catch(() => {});
    };

    let debounceTimer: number | null = null;
    if (!initialRenderedRef.current) {
      executeRender();
    } else {
      debounceTimer = window.setTimeout(executeRender, 180);
    }

    return () => {
      cancelled = true;
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [pdfBuffer, page.pageIndex, page.width, zoom]);

  const redrawOverlay = useCallback(
    (overrideStrokes?: Stroke[]) => {
      const rawDpr = Math.max(window.devicePixelRatio || 1, 2);
      const maxLogicalSide = Math.max(page.width, page.height, 1);
      const dpr = Math.min(rawDpr * Math.max(0.5, zoom), 4096 / maxLogicalSide);
      const strokes = overrideStrokes ?? page.strokes;
      const dragDelta = lassoRef.current?.mode === 'drag' ? lassoRef.current.dragDelta : null;

      const drawLayer = (canvas: HTMLCanvasElement | null, toolFilter: 'pen' | 'highlighter') => {
        if (!canvas) return;
        const w = Math.floor(page.width * dpr);
        const h = Math.floor(page.height * dpr);
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, page.width, page.height);

        for (const s of strokes) {
          if (s.tool !== toolFilter) continue;
          const isSel = selectedStrokeIds.includes(s.id);
          if (isSel && dragDelta) {
            renderStroke(ctx, translateStroke(s, dragDelta.dx, dragDelta.dy), { selected: true });
          } else {
            renderStroke(ctx, s, { selected: isSel });
          }
        }

        const activeDraw = drawingRef.current;
        if (activeDraw?.active && activeDraw.tool === toolFilter) {
          renderStroke(ctx, {
            id: 'live',
            tool: activeDraw.tool,
            color: activeColor,
            width: activeDraw.tool === 'highlighter' ? highlighterWidth : penWidth,
            points: activeDraw.points,
            shapeMeta: activeDraw.snappedMeta ?? undefined,
          });
        }

        if (toolFilter === 'pen' && shapeDragRef.current?.active) {
          renderStroke(ctx, {
            id: 'shape_live',
            tool: 'pen',
            color: activeColor,
            width: penWidth,
            points: shapeDragRef.current.points,
            shapeMeta: shapeDragRef.current.shapeMeta,
          });
        }

        if (toolFilter === 'pen' && lassoRef.current?.mode === 'draw' && lassoRef.current.polygon.length > 1) {
          ctx.save();
          ctx.strokeStyle = '#1C1C1E';
          ctx.lineWidth = 1.4;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          const poly = lassoRef.current.polygon;
          ctx.moveTo(poly[0].x, poly[0].y);
          for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
          ctx.closePath();
          ctx.fillStyle = 'rgba(28, 28, 30, 0.05)';
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      };

      drawLayer(hlCanvasRef.current, 'highlighter');
      drawLayer(penCanvasRef.current, 'pen');
    },
    [page, zoom, selectedStrokeIds, activeColor, penWidth, highlighterWidth]
  );

  useEffect(() => {
    redrawOverlay();
  }, [redrawOverlay]);

  /**
   * Zoom-normalized projection from viewport coordinates into logical PDF page coordinates.
   */
  const toLocalPoint = (e: React.PointerEvent | MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const scaleX = page.width / Math.max(rect.width, 1);
    const scaleY = page.height / Math.max(rect.height, 1);
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const clearLongPress = () => {
    if (longPressRef.current.timer) {
      window.clearTimeout(longPressRef.current.timer);
      longPressRef.current.timer = null;
    }
  };

  const triggerContextMenu = (
    clientX: number,
    clientY: number,
    localX: number,
    localY: number,
    targetEl?: EventTarget | null
  ) => {
    const domEl = targetEl instanceof HTMLElement ? targetEl : null;
    const tbTextarea = domEl?.closest('textarea[data-textbox-id]') as HTMLTextAreaElement | null;
    if (tbTextarea) {
      const tbId = tbTextarea.getAttribute('data-textbox-id')!;
      const start = tbTextarea.selectionStart ?? 0;
      const end = tbTextarea.selectionEnd ?? 0;
      onOpenContextMenu({
        visible: true,
        scope: 'canvas',
        x: clientX,
        y: clientY,
        canvasX: localX,
        canvasY: localY,
        pageIndex: page.pageIndex,
        totalPages,
        targetStrokeIds: [],
        textTarget: {
          kind: 'textbox',
          targetId: tbId,
          selectedText: tbTextarea.value.slice(start, end),
          selectionStart: start,
          selectionEnd: end,
        },
      });
      return;
    }

    const spanInput = domEl?.closest('input[data-pdfspan-id]') as HTMLInputElement | null;
    if (spanInput) {
      const spanId = spanInput.getAttribute('data-pdfspan-id')!;
      const start = spanInput.selectionStart ?? 0;
      const end = spanInput.selectionEnd ?? 0;
      onOpenContextMenu({
        visible: true,
        scope: 'canvas',
        x: clientX,
        y: clientY,
        canvasX: localX,
        canvasY: localY,
        pageIndex: page.pageIndex,
        totalPages,
        targetStrokeIds: [],
        textTarget: {
          kind: 'pdfspan',
          targetId: spanId,
          selectedText: spanInput.value.slice(start, end),
          selectionStart: start,
          selectionEnd: end,
        },
      });
      return;
    }

    const ffInput = domEl?.closest(
      'input[data-formfield-id], textarea[data-formfield-id]'
    ) as HTMLInputElement | HTMLTextAreaElement | null;
    if (ffInput) {
      const fieldId = ffInput.getAttribute('data-formfield-id')!;
      const start = ffInput.selectionStart ?? 0;
      const end = ffInput.selectionEnd ?? 0;
      onOpenContextMenu({
        visible: true,
        scope: 'canvas',
        x: clientX,
        y: clientY,
        canvasX: localX,
        canvasY: localY,
        pageIndex: page.pageIndex,
        totalPages,
        targetStrokeIds: [],
        textTarget: {
          kind: 'pdfformfield',
          targetId: fieldId,
          selectedText: ffInput.value.slice(start, end),
          selectionStart: start,
          selectionEnd: end,
        },
      });
      return;
    }

    let targets = selectedStrokeIds;
    const hit = [...page.strokes].reverse().find((s) => isPointNearStroke(localX, localY, s, 12));
    if (hit && !selectedStrokeIds.includes(hit.id)) {
      targets = [hit.id];
      onSelectStrokes(targets);
    }
    onOpenContextMenu({
      visible: true,
      scope: 'canvas',
      x: clientX,
      y: clientY,
      canvasX: localX,
      canvasY: localY,
      pageIndex: page.pageIndex,
      totalPages,
      targetStrokeIds: targets,
    });
  };

  const scheduleSnap = () => {
    const s = drawingRef.current;
    if (!s || !holdToSnap || s.snappedMeta) return;
    if (s.snapTimer) window.clearTimeout(s.snapTimer);
    s.snapTimer = window.setTimeout(() => {
      const cur = drawingRef.current;
      if (!cur || !cur.active || cur.snappedMeta) return;
      const res = recognizeLocalShape(cur.points);
      if (res) {
        cur.snappedMeta = res.shapeMeta;
        cur.points = res.snappedPoints;
        const last = res.snappedPoints[res.snappedPoints.length - 1];
        setSnapPulse({ x: last?.x ?? cur.quietAnchor.x, y: last?.y ?? cur.quietAnchor.y, id: Date.now() });
        redrawOverlay();
      }
    }, 450);
  };

  const shouldDraw = (pointerType: string) => {
    if (activeTool === 'pan') return false;
    if (pointerType === 'pen') return true;
    return activeTool !== 'text';
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 2) return;

    if (e.pointerType === 'touch') {
      activeTouchesRef.current.add(e.pointerId);
      if (activeTouchesRef.current.size >= 2) {
        clearLongPress();
        if (drawingRef.current?.active && drawingRef.current.pointerType === 'touch') {
          if (drawingRef.current.snapTimer) window.clearTimeout(drawingRef.current.snapTimer);
          drawingRef.current = null;
          redrawOverlay();
        }
        return;
      }
    }

    const pt = toLocalPoint(e);

    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      clearLongPress();
      const cx = e.clientX;
      const cy = e.clientY;
      const tgt = e.target;
      longPressRef.current = {
        startX: cx,
        startY: cy,
        pointerId: e.pointerId,
        timer: window.setTimeout(() => {
          const cur = drawingRef.current;
          const moved = cur
            ? Math.hypot(
                (cur.points[cur.points.length - 1]?.x ?? pt.x) - cur.points[0]?.x,
                (cur.points[cur.points.length - 1]?.y ?? pt.y) - cur.points[0]?.y
              )
            : 0;
          if (!cur || moved < 8) {
            if (cur) {
              if (cur.snapTimer) window.clearTimeout(cur.snapTimer);
              drawingRef.current = null;
              redrawOverlay();
            }
            triggerContextMenu(cx, cy, pt.x, pt.y, tgt);
          }
        }, 450),
      };
    }

    // Cursor/Text mode on PDF: strictly separated between 'edit' (inline PDF text/form/date) and 'note' (floating note rectangle)
    if (activeTool === 'text' && e.pointerType !== 'pen') {
      const target = e.target as HTMLElement;
      if (
        target.closest('[data-textbox]') ||
        target.closest('[data-pdfspan]') ||
        target.closest('[data-formfield]')
      ) {
        return;
      }
      setEditingSpanId(null);
      setEditingFormFieldId(null);
      setActiveDatePopover(null);
      if (pdfTextMode === 'note') {
        const newBox: FloatingTextBox = {
          id: `tb_${Date.now()}`,
          x: Math.max(16, Math.min(page.width - 210, pt.x)),
          y: Math.max(16, Math.min(page.height - 60, pt.y)),
          width: 210,
          content: '',
          color: activeColor,
          fontSize: 14,
        };
        onUpdatePage({ ...page, textBoxes: [...page.textBoxes, newBox] });
      }
      return;
    }

    if (!shouldDraw(e.pointerType)) return;
    const tool: ToolType = e.pointerType === 'pen' && activeTool === 'text' ? 'pen' : activeTool;

    if (tool === 'shape') {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      if (selectedStrokeIds.length > 0) onSelectStrokes([]);
      const init = createShapeFromDrag(selectedInsertShape, pt, { x: pt.x + 2, y: pt.y + 2 });
      shapeDragRef.current = {
        active: true,
        pointerId: e.pointerId,
        kind: selectedInsertShape,
        startPt: pt,
        shapeMeta: init.shapeMeta,
        points: init.points,
      };
      redrawOverlay();
      return;
    }

    if (tool === 'pen' || tool === 'highlighter') {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      if (selectedStrokeIds.length > 0) onSelectStrokes([]);
      drawingRef.current = {
        active: true,
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        tool,
        points: [{ x: pt.x, y: pt.y, pressure: e.pressure > 0 ? e.pressure : 0.5, timestamp: Date.now() }],
        snappedMeta: null,
        quietAnchor: pt,
        snapTimer: null,
      };
      scheduleSnap();
      redrawOverlay();
      return;
    }

    if (tool === 'eraser') {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      eraserRef.current = { active: true, pointerId: e.pointerId, workingStrokes: [...page.strokes] };
      eraseAt(pt.x, pt.y);
      return;
    }

    if (tool === 'lasso') {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const selBounds = getSelBounds();
      if (
        selBounds &&
        pt.x >= selBounds.minX - 8 &&
        pt.x <= selBounds.maxX + 8 &&
        pt.y >= selBounds.minY - 8 &&
        pt.y <= selBounds.maxY + 8
      ) {
        lassoRef.current = {
          mode: 'drag',
          pointerId: e.pointerId,
          polygon: [],
          dragStart: pt,
          dragDelta: { dx: 0, dy: 0 },
        };
      } else {
        onSelectStrokes([]);
        lassoRef.current = {
          mode: 'draw',
          pointerId: e.pointerId,
          polygon: [pt],
          dragStart: pt,
          dragDelta: { dx: 0, dy: 0 },
        };
      }
      redrawOverlay();
    }
  };

  const getSelBounds = () => {
    if (selectedStrokeIds.length === 0) return null;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const s of page.strokes) {
      if (!selectedStrokeIds.includes(s.id)) continue;
      const b = getStrokeBounds(s);
      minX = Math.min(minX, b.minX);
      minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX);
      maxY = Math.max(maxY, b.maxY);
    }
    return isFinite(minX) ? { minX, minY, maxX, maxY } : null;
  };

  const eraseAt = (x: number, y: number) => {
    const working = eraserRef.current.workingStrokes;
    if (!working) return;
    if (eraserMode === 'stroke') {
      const next = working.filter((s) => !isPointNearStroke(x, y, s, eraserSize));
      if (next.length !== working.length) {
        eraserRef.current.workingStrokes = next;
        redrawOverlay(next);
      }
    } else {
      const { updated, changed } = applyPrecisionEraser(working, x, y, eraserSize, () => 0);
      if (changed) {
        eraserRef.current.workingStrokes = updated;
        redrawOverlay(updated);
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' && activeTouchesRef.current.size >= 2) {
      return;
    }

    if (longPressRef.current.timer && e.pointerId === longPressRef.current.pointerId) {
      if (Math.hypot(e.clientX - longPressRef.current.startX, e.clientY - longPressRef.current.startY) > 6) {
        clearLongPress();
      }
    }
    const pt = toLocalPoint(e);

    if (shapeDragRef.current?.active && shapeDragRef.current.pointerId === e.pointerId) {
      const sDrag = shapeDragRef.current;
      const res = createShapeFromDrag(sDrag.kind, sDrag.startPt, pt);
      sDrag.shapeMeta = res.shapeMeta;
      sDrag.points = res.points;
      redrawOverlay();
      return;
    }

    if (drawingRef.current?.active && drawingRef.current.pointerId === e.pointerId) {
      const session = drawingRef.current;
      if (session.snappedMeta) {
        const res = resizeSnappedShapeLive(session.snappedMeta, pt);
        session.snappedMeta = res.shapeMeta;
        session.points = res.points;
        redrawOverlay();
        return;
      }
      const last = session.points[session.points.length - 1];
      if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) >= 1.5) {
        session.points.push({ x: pt.x, y: pt.y, pressure: e.pressure > 0 ? e.pressure : 0.5, timestamp: Date.now() });
      }
      if (Math.hypot(pt.x - session.quietAnchor.x, pt.y - session.quietAnchor.y) >= 6) {
        session.quietAnchor = pt;
        scheduleSnap();
      }
      redrawOverlay();
      return;
    }

    if (eraserRef.current.active && eraserRef.current.pointerId === e.pointerId) {
      eraseAt(pt.x, pt.y);
      return;
    }

    if (lassoRef.current && lassoRef.current.pointerId === e.pointerId) {
      if (lassoRef.current.mode === 'drag') {
        lassoRef.current.dragDelta = {
          dx: pt.x - lassoRef.current.dragStart.x,
          dy: pt.y - lassoRef.current.dragStart.y,
        };
      } else {
        lassoRef.current.polygon.push(pt);
      }
      redrawOverlay();
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') {
      const hadMulti = activeTouchesRef.current.size >= 2;
      activeTouchesRef.current.delete(e.pointerId);
      if (hadMulti) {
        return;
      }
    }

    clearLongPress();
    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }

    if (shapeDragRef.current?.active && shapeDragRef.current.pointerId === e.pointerId) {
      const sDrag = shapeDragRef.current;
      const pt = toLocalPoint(e);
      shapeDragRef.current = null;
      const moved = Math.hypot(pt.x - sDrag.startPt.x, pt.y - sDrag.startPt.y);
      const finalShape =
        moved < 10
          ? createShapeFromDrag(
              sDrag.kind,
              { x: sDrag.startPt.x - 42, y: sDrag.startPt.y - 42 },
              { x: sDrag.startPt.x + 42, y: sDrag.startPt.y + 42 }
            )
          : { shapeMeta: sDrag.shapeMeta, points: sDrag.points };
      const newStroke: Stroke = {
        id: `pdfst_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        tool: 'pen',
        color: activeColor,
        width: penWidth,
        points: finalShape.points,
        pageIndex: page.pageIndex,
        shapeMeta: finalShape.shapeMeta,
      };
      onUpdatePage({ ...page, strokes: [...page.strokes, newStroke] });
      return;
    }

    if (drawingRef.current?.active && drawingRef.current.pointerId === e.pointerId) {
      const session = drawingRef.current;
      if (session.snapTimer) window.clearTimeout(session.snapTimer);
      drawingRef.current = null;

      let pts = session.points;
      if (session.tool === 'highlighter' && !session.snappedMeta) {
        pts = maybeStraightenHighlighter(pts);
      }

      const newStroke: Stroke = {
        id: `pdfst_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        tool: session.tool,
        color: activeColor,
        width: session.tool === 'highlighter' ? highlighterWidth : penWidth,
        points: pts,
        pageIndex: page.pageIndex,
        shapeMeta: session.snappedMeta ?? undefined,
      };
      onUpdatePage({ ...page, strokes: [...page.strokes, newStroke] });
      return;
    }

    if (eraserRef.current.active && eraserRef.current.pointerId === e.pointerId) {
      const working = eraserRef.current.workingStrokes;
      eraserRef.current = { active: false, pointerId: -1, workingStrokes: null };
      if (working && JSON.stringify(working) !== JSON.stringify(page.strokes)) {
        onUpdatePage({ ...page, strokes: working });
      }
      return;
    }

    if (lassoRef.current && lassoRef.current.pointerId === e.pointerId) {
      const lasso = lassoRef.current;
      lassoRef.current = null;
      if (lasso.mode === 'drag') {
        const { dx, dy } = lasso.dragDelta;
        if (Math.hypot(dx, dy) > 1) {
          onUpdatePage({
            ...page,
            strokes: page.strokes.map((s) => (selectedStrokeIds.includes(s.id) ? translateStroke(s, dx, dy) : s)),
          });
        } else {
          redrawOverlay();
        }
      } else {
        const picked = page.strokes.filter((s) => isStrokeSelectedByLasso(s, lasso.polygon)).map((s) => s.id);
        onSelectStrokes(picked);
        redrawOverlay();
      }
    }
  };

  const updateSpan = (spanId: string, updater: (span: PdfTextSpan) => PdfTextSpan) => {
    const nextSpans = (page.textSpans || []).map((sp) => (sp.id === spanId ? updater(sp) : sp));
    onUpdatePage({
      ...page,
      textSpans: nextSpans,
      textEdits: buildTextEditsArray(nextSpans),
    });
  };

  const updateFormField = (fieldId: string, updater: (field: PdfFormField) => PdfFormField) => {
    const curPage = latestPageRef.current;
    const nextFields = (curPage.formFields || []).map((ff) => (ff.id === fieldId ? updater(ff) : ff));
    onUpdatePage({
      ...curPage,
      formFields: nextFields,
    });
  };

  const openDatePopoverForSpan = useCallback((span: PdfTextSpan, spanEl: HTMLElement | null) => {
    const textToInspect = span.isEdited ? span.editedText : span.originalText;
    const detected = detectDateInText(textToInspect);
    if (!detected || !spanEl) {
      setActiveDatePopover(null);
      return;
    }
    const rect = spanEl.getBoundingClientRect();
    setActiveDatePopover({
      targetKind: 'span',
      targetId: span.id,
      anchorRect: {
        left: rect.left,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
      },
      viewYear: detected.year,
      viewMonth: detected.month,
      selectedYear: detected.year,
      selectedMonth: detected.month,
      selectedDay: detected.day,
    });
  }, []);

  const openDatePopoverForFormField = useCallback((field: PdfFormField, fieldEl: HTMLElement | null) => {
    if (!field.isDateField || !fieldEl) {
      setActiveDatePopover(null);
      return;
    }
    const detected = detectDateInText(field.value);
    const now = new Date();
    const y = detected ? detected.year : now.getFullYear();
    const m = detected ? detected.month : now.getMonth() + 1;
    const d = detected ? detected.day : now.getDate();
    const rect = fieldEl.getBoundingClientRect();
    setActiveDatePopover({
      targetKind: 'formfield',
      targetId: field.id,
      anchorRect: {
        left: rect.left,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
      },
      viewYear: y,
      viewMonth: m,
      selectedYear: y,
      selectedMonth: m,
      selectedDay: d,
    });
  }, []);

  const applyCalendarDate = (
    nextYear: number,
    nextMonth: number,
    nextDay: number,
    overrideFormat?: PdfDateFormatMeta
  ) => {
    if (!activeDatePopover) return;
    const currentPage = latestPageRef.current;

    if (activeDatePopover.targetKind === 'formfield') {
      const rawField = (currentPage.formFields || []).find((f) => f.id === activeDatePopover.targetId);
      if (!rawField) return;
      const nextVal = formatFormFieldDate(
        rawField.value,
        { year: nextYear, month: nextMonth, day: nextDay },
        overrideFormat
      );
      updateFormField(rawField.id, (ff) => ({
        ...ff,
        value: nextVal,
        isEdited: nextVal !== ff.originalValue,
      }));
      setActiveDatePopover((prev) =>
        prev
          ? {
              ...prev,
              viewYear: nextYear,
              viewMonth: nextMonth,
              selectedYear: nextYear,
              selectedMonth: nextMonth,
              selectedDay: nextDay,
            }
          : null
      );
      return;
    }

    const rawSpan = (currentPage.textSpans || []).find((s) => s.id === activeDatePopover.targetId);
    if (!rawSpan) return;
    const savedEdit = currentPage.textEdits?.find((ed) => ed.spanId === rawSpan.id);
    const span: PdfTextSpan =
      savedEdit && rawSpan.isEdited
        ? {
            ...rawSpan,
            editedText: savedEdit.text,
            text: savedEdit.text,
            fontFamily: savedEdit.fontFamily,
            mappedFallbackFont: savedEdit.mappedFallbackFont || rawSpan.mappedFallbackFont,
            fontCategory: savedEdit.fontCategory || rawSpan.fontCategory,
            fontSize: savedEdit.fontSize,
            fontWeight: savedEdit.fontWeight,
            fontStyle: savedEdit.fontStyle,
            letterSpacing: savedEdit.letterSpacing,
            scaleX: savedEdit.scaleX,
            color: savedEdit.color,
            backgroundColor: savedEdit.backgroundColor,
          }
        : rawSpan;

    const currentText = span.isEdited ? span.editedText : span.originalText;
    const detected = detectDateInText(currentText);
    if (!detected) return;

    const nextVal = replaceDateInSpanText(
      currentText,
      detected,
      { year: nextYear, month: nextMonth, day: nextDay },
      overrideFormat
    );

    const liveAlias = liveFontAliases[span.id];
    const effectiveFontFamily = buildSpanFontFamily(span, liveAlias);
    const effectiveFontWeight = normalizeFontWeight(span.fontWeight);
    const effectiveFontStyle = span.fontStyle === 'italic' ? 'italic' : 'normal';
    const calibrated = calibratePdfSpanMetrics(
      nextVal,
      span.width,
      span.fontSize,
      effectiveFontFamily,
      effectiveFontWeight,
      effectiveFontStyle
    );

    updateSpan(span.id, (sp) => ({
      ...sp,
      editedText: nextVal,
      text: nextVal,
      fontFamily: sp.fontFamily || effectiveFontFamily,
      fontWeight: normalizeFontWeight(sp.fontWeight),
      fontStyle: effectiveFontStyle,
      letterSpacing: calibrated.letterSpacing,
      scaleX: calibrated.scaleX,
      color: sp.color || '#1C1C1E',
      backgroundColor: sp.backgroundColor || '#FFFFFF',
      isEdited: nextVal !== sp.originalText,
    }));

    setActiveDatePopover((prev) =>
      prev
        ? {
            ...prev,
            viewYear: nextYear,
            viewMonth: nextMonth,
            selectedYear: nextYear,
            selectedMonth: nextMonth,
            selectedDay: nextDay,
          }
        : null
    );
  };

  const isTextInteractive = activeTool === 'text' && pdfTextMode === 'edit';
  const isDrawingActive = activeTool !== 'text' && activeTool !== 'pan';
  const touchRule = activeTool === 'text' ? 'pan-y' : 'none';
  const editedCount = (page.textSpans || []).filter((s) => s.isEdited).length;
  const editedFormCount = (page.formFields || []).filter((f) => f.isEdited).length;

  return (
    <div className="space-y-1.5">
      <div
        style={{ width: page.width * zoom }}
        className="mx-auto flex items-center justify-between px-1 text-[11px] text-[#8E8E93] tabular-nums no-print"
      >
        <span>
          Pagina {displayPageNumber}
          {totalPages > 1 ? ` di ${totalPages}` : ''}
        </span>
        <div className="flex items-center gap-2">
          <span className="truncate">
            {page.strokes.length} {page.strokes.length === 1 ? 'tratto' : 'tratti'}
            {editedCount > 0 ? ` · ${editedCount} testi` : ''}
            {editedFormCount > 0 ? ` · ${editedFormCount} campi` : ''}
            {page.textBoxes.length > 0 ? ` · ${page.textBoxes.length} caselle` : ''}
          </span>
          {totalPages > 1 && (
            <button
              type="button"
              onClick={() => onDeletePage(page.pageIndex)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full ios-control-bg text-[11px] font-medium text-[#9A463D] dark:text-[#E07A6E] hover:bg-[#9A463D]/15"
              title={`Elimina Pagina ${displayPageNumber}`}
              aria-label={`Elimina Pagina ${displayPageNumber}`}
            >
              <Trash2 className="w-3 h-3" />
              <span className="hidden sm:inline">Elimina pagina</span>
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          width: page.width * zoom,
          height: page.height * zoom,
        }}
        className="mx-auto relative print-container"
      >
        <div
          ref={containerRef}
          style={{
            width: page.width,
            height: page.height,
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            touchAction: touchRule,
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const pt = toLocalPoint(e.nativeEvent);
            triggerContextMenu(e.clientX, e.clientY, pt.x, pt.y, e.target);
          }}
          className="relative bg-white rounded-2xl border border-[#3C3C43]/12 dark:border-white/10 shadow-xs overflow-hidden print-container"
        >
          <canvas ref={bgCanvasRef} className="absolute inset-0 w-full h-full z-0 pointer-events-none" />
          {!rendered && (
            <div className="absolute inset-0 z-0 flex items-center justify-center bg-[#FBFBFD] text-xs text-[#8E8E93]">
              Caricamento pagina {page.pageIndex + 1}…
            </div>
          )}

          {/* Highlighter Overlay */}
          <canvas
            ref={hlCanvasRef}
            style={{ mixBlendMode: 'multiply' }}
            className="absolute inset-0 w-full h-full pointer-events-none z-10"
          />

          {/* Direct In-Place PDF Text & Table Span Editor with Embedded PDF.js Font, Bold/Italic & Width Calibration */}
          <div className="absolute inset-0 z-20 pointer-events-none">
            {(page.textSpans || []).map((rawSpan) => {
              const savedEdit = page.textEdits?.find((ed) => ed.spanId === rawSpan.id);
              const span: PdfTextSpan =
                savedEdit && rawSpan.isEdited
                  ? {
                      ...rawSpan,
                      editedText: savedEdit.text,
                      text: savedEdit.text,
                      fontFamily: savedEdit.fontFamily,
                      mappedFallbackFont: savedEdit.mappedFallbackFont || rawSpan.mappedFallbackFont,
                      fontCategory: savedEdit.fontCategory || rawSpan.fontCategory,
                      fontSize: savedEdit.fontSize,
                      fontWeight: savedEdit.fontWeight,
                      fontStyle: savedEdit.fontStyle,
                      letterSpacing: savedEdit.letterSpacing,
                      scaleX: savedEdit.scaleX,
                      color: savedEdit.color,
                      backgroundColor: savedEdit.backgroundColor,
                    }
                  : rawSpan;

              const isEditing = editingSpanId === span.id;
              if (!span.isEdited && !isTextInteractive) return null;

              const liveAlias = liveFontAliases[span.id];
              const effectiveFontFamily = buildSpanFontFamily(span, liveAlias);
              const effectiveFontWeight = normalizeFontWeight(span.fontWeight);
              const effectiveFontStyle = span.fontStyle === 'italic' ? 'italic' : 'normal';
              const effectiveLetterSpacing = span.letterSpacing ?? 0;
              const effectiveScaleX = span.scaleX ?? 1;
              const spanBg = span.backgroundColor || '#FFFFFF';

              return (
                <div
                  key={span.id}
                  data-pdfspan
                  style={{
                    left: span.x,
                    top: span.y,
                    width: span.width,
                    height: span.height,
                  }}
                  className={`absolute ${
                    isTextInteractive ? 'pointer-events-auto' : 'pointer-events-none'
                  } ${isEditing ? 'z-40' : ''}`}
                >
                  {isEditing ? (
                    <div
                      style={{
                        backgroundColor: spanBg,
                        minWidth: span.width + 4,
                        height: span.height + 2,
                      }}
                      className="relative flex items-center rounded-sm ring-2 ring-[#1C1C1E] shadow-sm px-0.5 -mx-0.5 -my-0.5 z-40"
                    >
                      <input
                        autoFocus
                        data-pdfspan-id={span.id}
                        value={span.editedText}
                        onFocus={() =>
                          onActivePdfTextTargetChange?.({
                            kind: 'pdfspan',
                            pageIndex: page.pageIndex,
                            id: span.id,
                            color: span.color,
                          })
                        }
                        onChange={(e) => {
                          const nextVal = e.target.value;
                          const calibrated = calibratePdfSpanMetrics(
                            nextVal,
                            span.width,
                            span.fontSize,
                            effectiveFontFamily,
                            effectiveFontWeight,
                            effectiveFontStyle
                          );
                          updateSpan(span.id, (sp) => ({
                            ...sp,
                            editedText: nextVal,
                            text: nextVal,
                            fontFamily: sp.fontFamily || effectiveFontFamily,
                            fontWeight: normalizeFontWeight(sp.fontWeight),
                            fontStyle: effectiveFontStyle,
                            letterSpacing: calibrated.letterSpacing,
                            scaleX: calibrated.scaleX,
                            color: sp.color || '#1C1C1E',
                            backgroundColor: sp.backgroundColor || spanBg,
                            isEdited: nextVal !== sp.originalText,
                          }));
                          const detectedAfterType = detectDateInText(nextVal);
                          if (detectedAfterType) {
                            const spanWrapper = e.currentTarget.closest('[data-pdfspan]') as HTMLElement | null;
                            const rect = spanWrapper?.getBoundingClientRect();
                            setActiveDatePopover((prev) =>
                              prev && prev.targetKind === 'span' && prev.targetId === span.id
                                ? {
                                    ...prev,
                                    viewYear: detectedAfterType.year,
                                    viewMonth: detectedAfterType.month,
                                    selectedYear: detectedAfterType.year,
                                    selectedMonth: detectedAfterType.month,
                                    selectedDay: detectedAfterType.day,
                                  }
                                : rect
                                  ? {
                                      targetKind: 'span',
                                      targetId: span.id,
                                      anchorRect: {
                                        left: rect.left,
                                        top: rect.top,
                                        bottom: rect.bottom,
                                        width: rect.width,
                                      },
                                      viewYear: detectedAfterType.year,
                                      viewMonth: detectedAfterType.month,
                                      selectedYear: detectedAfterType.year,
                                      selectedMonth: detectedAfterType.month,
                                      selectedDay: detectedAfterType.day,
                                    }
                                  : null
                            );
                          } else {
                            setActiveDatePopover((prev) =>
                              prev?.targetKind === 'span' && prev?.targetId === span.id ? null : prev
                            );
                          }
                        }}
                        onBlur={(e) => {
                          const nextTarget = e.relatedTarget as HTMLElement | null;
                          if (
                            nextTarget?.closest('[data-pdfspan]') === e.currentTarget.closest('[data-pdfspan]') ||
                            nextTarget?.closest('[data-pdf-date-popover]')
                          ) {
                            return;
                          }
                          setEditingSpanId(null);
                          setActiveDatePopover(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'Escape') {
                            setEditingSpanId(null);
                            setActiveDatePopover(null);
                          }
                        }}
                        style={{
                          fontFamily: effectiveFontFamily,
                          fontWeight: effectiveFontWeight,
                          fontStyle: effectiveFontStyle,
                          fontSize: `${span.fontSize}px`,
                          letterSpacing: `${effectiveLetterSpacing}px`,
                          color: span.color || '#1C1C1E',
                          width: `${Math.max(span.width, 40)}px`,
                          transform: effectiveScaleX !== 1 ? `scaleX(${effectiveScaleX})` : undefined,
                          transformOrigin: 'left center',
                        }}
                        className="bg-transparent focus:outline-none leading-none p-0 m-0"
                      />
                      <div className="flex items-center shrink-0 ml-1 bg-[#F2F2F7]/90 dark:bg-[#2C2C30]/90 rounded-full px-0.5">
                        {span.isEdited && (
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={(e) => {
                              e.stopPropagation();
                              updateSpan(span.id, (sp) => ({
                                ...sp,
                                editedText: sp.originalText,
                                text: sp.originalText,
                                letterSpacing: 0,
                                scaleX: 1,
                                isEdited: false,
                              }));
                              setEditingSpanId(null);
                              setActiveDatePopover(null);
                            }}
                            title="Ripristina testo originale"
                            className="p-0.5 text-[#8E8E93] hover:text-[#1C1C1E]"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingSpanId(null);
                            setActiveDatePopover(null);
                          }}
                          title="Conferma"
                          className="p-0.5 text-[#1C1C1E]"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={(e) => {
                        if (!isTextInteractive) return;
                        e.stopPropagation();
                        setEditingFormFieldId(null);
                        setEditingSpanId(span.id);
                        openDatePopoverForSpan(
                          span,
                          e.currentTarget.closest('[data-pdfspan]') as HTMLElement | null
                        );
                        onActivePdfTextTargetChange?.({
                          kind: 'pdfspan',
                          pageIndex: page.pageIndex,
                          id: span.id,
                          color: span.color,
                        });
                      }}
                      title={
                        isTextInteractive
                          ? detectDateInText(span.isEdited ? span.editedText : span.originalText)
                            ? 'Clicca per modificare la data con il calendario o digitare'
                            : 'Clicca per modificare questo testo nello stile originale'
                          : undefined
                      }
                      style={
                        span.isEdited
                          ? {
                              backgroundColor: spanBg,
                              left: -1,
                              top: -1,
                              width: span.width + 2,
                              height: span.height + 2,
                            }
                          : undefined
                      }
                      className={`w-full h-full flex items-center relative transition-colors ${
                        span.isEdited
                          ? 'overflow-visible'
                          : isTextInteractive
                            ? 'cursor-text rounded-xs hover:bg-[#1C1C1E]/8 hover:ring-1 hover:ring-[#1C1C1E]/30'
                            : ''
                      }`}
                    >
                      {span.isEdited && (
                        <span
                          style={{
                            fontFamily: effectiveFontFamily,
                            fontWeight: effectiveFontWeight,
                            fontStyle: effectiveFontStyle,
                            fontSize: `${span.fontSize}px`,
                            letterSpacing: `${effectiveLetterSpacing}px`,
                            color: span.color || '#1C1C1E',
                            transform: effectiveScaleX !== 1 ? `scaleX(${effectiveScaleX})` : undefined,
                            transformOrigin: 'left center',
                          }}
                          className="leading-none whitespace-nowrap block select-text"
                        >
                          {span.editedText || '\u00A0'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Interactive AcroForm Layer (Widget Text Cells & Checkboxes) */}
          <div className="absolute inset-0 z-[25] pointer-events-none">
            {(page.formFields || []).map((field) => {
              if (!field.isEdited && !isTextInteractive) return null;

              if (field.fieldType === 'checkbox') {
                const iconSize = Math.max(10, Math.min(field.width, field.height) * 0.72);
                return (
                  <button
                    key={field.id}
                    type="button"
                    data-formfield
                    data-formfield-id={field.id}
                    disabled={!isTextInteractive || field.readOnly}
                    onClick={(e) => {
                      if (!isTextInteractive || field.readOnly) return;
                      e.stopPropagation();
                      setEditingSpanId(null);
                      setEditingFormFieldId(null);
                      setActiveDatePopover(null);
                      const nextChecked = !field.checked;
                      updateFormField(field.id, (ff) => ({
                        ...ff,
                        checked: nextChecked,
                        isEdited: nextChecked !== ff.originalChecked,
                      }));
                    }}
                    style={{
                      left: field.x,
                      top: field.y,
                      width: field.width,
                      height: field.height,
                    }}
                    title={
                      isTextInteractive
                        ? field.alternativeText || 'Tocca per selezionare o deselezionare'
                        : undefined
                    }
                    className={`absolute flex items-center justify-center rounded-[2px] transition-colors ${
                      isTextInteractive ? 'pointer-events-auto' : 'pointer-events-none'
                    } ${
                      isTextInteractive && !field.readOnly
                        ? 'cursor-pointer hover:bg-[#1C1C1E]/8 hover:ring-1 hover:ring-[#1C1C1E]/40'
                        : ''
                    }`}
                  >
                    {field.isEdited && (
                      <span
                        style={{ backgroundColor: field.backgroundColor || '#FFFFFF' }}
                        className="absolute inset-[1.5px] rounded-[1px] flex items-center justify-center"
                      >
                        {field.checked && (
                          <Check
                            style={{ width: iconSize, height: iconSize, color: field.color || '#1C1C1E' }}
                            strokeWidth={2.7}
                          />
                        )}
                      </span>
                    )}
                  </button>
                );
              }

              const isEditing = editingFormFieldId === field.id;
              const effectiveFieldFontFamily = buildFormFieldFontFamily(
                field,
                page.textSpans || [],
                liveFontAliases
              );
              const effectiveFieldFontWeight = normalizeFontWeight(field.fontWeight);
              const effectiveFieldFontStyle = field.fontStyle === 'italic' ? 'italic' : 'normal';
              const alignClass =
                field.alignment === 'center'
                  ? 'justify-center text-center'
                  : field.alignment === 'right'
                    ? 'justify-end text-right'
                    : 'justify-start text-left';

              return (
                <div
                  key={field.id}
                  data-formfield
                  style={{
                    left: field.x,
                    top: field.y,
                    width: field.width,
                    height: field.height,
                  }}
                  className={`absolute ${
                    isTextInteractive ? 'pointer-events-auto' : 'pointer-events-none'
                  } ${isEditing ? 'z-40' : ''}`}
                >
                  {isEditing ? (
                    <div className="relative w-full h-full z-40">
                      <div
                        style={{ backgroundColor: field.backgroundColor || '#FFFFFF' }}
                        className="absolute inset-[1.5px] rounded-[3px] ring-2 ring-[#1C1C1E] shadow-xs flex items-center"
                      >
                        {field.multiLine ? (
                          <textarea
                            autoFocus
                            data-formfield-id={field.id}
                            value={field.value}
                            maxLength={field.maxLen}
                            readOnly={field.readOnly}
                            onFocus={() =>
                              onActivePdfTextTargetChange?.({
                                kind: 'pdfformfield',
                                pageIndex: page.pageIndex,
                                id: field.id,
                                color: field.color,
                              })
                            }
                            onChange={(e) => {
                              const nextVal = e.target.value;
                              updateFormField(field.id, (ff) => ({
                                ...ff,
                                value: nextVal,
                                isEdited: nextVal !== ff.originalValue,
                              }));
                            }}
                            onBlur={(e) => {
                              const nextTarget = e.relatedTarget as HTMLElement | null;
                              if (
                                nextTarget?.closest('[data-formfield]') ===
                                  e.currentTarget.closest('[data-formfield]') ||
                                nextTarget?.closest('[data-pdf-date-popover]')
                              ) {
                                return;
                              }
                              setEditingFormFieldId(null);
                              setActiveDatePopover(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                setEditingFormFieldId(null);
                                setActiveDatePopover(null);
                              }
                            }}
                            style={{
                              fontFamily: effectiveFieldFontFamily,
                              fontSize: `${field.fontSize}px`,
                              fontWeight: effectiveFieldFontWeight,
                              fontStyle: effectiveFieldFontStyle,
                              textAlign: field.alignment || 'left',
                              color: field.color || '#1C1C1E',
                              lineHeight: 1.25,
                              paddingLeft: '4px',
                              paddingRight: '4px',
                            }}
                            className="w-full h-full bg-transparent resize-none focus:outline-none py-0.5 m-0"
                          />
                        ) : (
                          <input
                            autoFocus
                            data-formfield-id={field.id}
                            value={field.value}
                            maxLength={field.maxLen}
                            readOnly={field.readOnly}
                            onFocus={() =>
                              onActivePdfTextTargetChange?.({
                                kind: 'pdfformfield',
                                pageIndex: page.pageIndex,
                                id: field.id,
                                color: field.color,
                              })
                            }
                            onChange={(e) => {
                              const nextVal = e.target.value;
                              updateFormField(field.id, (ff) => ({
                                ...ff,
                                value: nextVal,
                                isEdited: nextVal !== ff.originalValue,
                              }));
                              if (field.isDateField) {
                                const detectedAfterType = detectDateInText(nextVal);
                                if (detectedAfterType) {
                                  setActiveDatePopover((prev) =>
                                    prev && prev.targetKind === 'formfield' && prev.targetId === field.id
                                      ? {
                                          ...prev,
                                          viewYear: detectedAfterType.year,
                                          viewMonth: detectedAfterType.month,
                                          selectedYear: detectedAfterType.year,
                                          selectedMonth: detectedAfterType.month,
                                          selectedDay: detectedAfterType.day,
                                        }
                                      : prev
                                  );
                                }
                              }
                            }}
                            onBlur={(e) => {
                              const nextTarget = e.relatedTarget as HTMLElement | null;
                              if (
                                nextTarget?.closest('[data-formfield]') ===
                                  e.currentTarget.closest('[data-formfield]') ||
                                nextTarget?.closest('[data-pdf-date-popover]')
                              ) {
                                return;
                              }
                              setEditingFormFieldId(null);
                              setActiveDatePopover(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === 'Escape') {
                                setEditingFormFieldId(null);
                                setActiveDatePopover(null);
                              }
                            }}
                            style={{
                              fontFamily: effectiveFieldFontFamily,
                              fontSize: `${field.fontSize}px`,
                              fontWeight: effectiveFieldFontWeight,
                              fontStyle: effectiveFieldFontStyle,
                              textAlign: field.alignment || 'left',
                              color: field.color || '#1C1C1E',
                              lineHeight: 1,
                              paddingLeft: '4px',
                              paddingRight: '4px',
                            }}
                            className="w-full h-full bg-transparent focus:outline-none m-0"
                          />
                        )}
                      </div>

                      {/* Mini controlli fluttuanti sopra la cella per non comprimere celle strette */}
                      <div className="absolute -top-6 right-0 flex items-center gap-0.5 ios-glass rounded-full px-1 py-0.5 shadow-sm z-50">
                        {field.isEdited && (
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={(e) => {
                              e.stopPropagation();
                              updateFormField(field.id, (ff) => ({
                                ...ff,
                                value: ff.originalValue,
                                isEdited: false,
                              }));
                              setEditingFormFieldId(null);
                              setActiveDatePopover(null);
                            }}
                            title="Ripristina campo originale"
                            className="p-0.5 text-[#8E8E93] hover:text-[#1C1C1E]"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingFormFieldId(null);
                            setActiveDatePopover(null);
                          }}
                          title="Conferma"
                          className="p-0.5 text-[#1C1C1E]"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={(e) => {
                        if (!isTextInteractive || field.readOnly) return;
                        e.stopPropagation();
                        setEditingSpanId(null);
                        setEditingFormFieldId(field.id);
                        if (field.isDateField) {
                          openDatePopoverForFormField(
                            field,
                            e.currentTarget.closest('[data-formfield]') as HTMLElement | null
                          );
                        } else {
                          setActiveDatePopover(null);
                        }
                        onActivePdfTextTargetChange?.({
                          kind: 'pdfformfield',
                          pageIndex: page.pageIndex,
                          id: field.id,
                          color: field.color,
                        });
                      }}
                      title={
                        isTextInteractive
                          ? field.isDateField
                            ? 'Clicca per scegliere la data dal calendario o digitare'
                            : field.alternativeText || 'Clicca per compilare questo campo'
                          : undefined
                      }
                      className={`group/ff w-full h-full flex ${
                        field.multiLine ? 'items-start py-0.5' : 'items-center'
                      } ${alignClass} relative transition-colors overflow-hidden ${
                        isTextInteractive && !field.readOnly
                          ? 'cursor-text rounded-[3px] hover:bg-[#1C1C1E]/6 hover:ring-1 hover:ring-[#1C1C1E]/35'
                          : ''
                      }`}
                    >
                      {field.isEdited && field.originalValue.trim() && (
                        <span
                          aria-hidden="true"
                          style={{ backgroundColor: field.backgroundColor || '#FFFFFF' }}
                          className="absolute inset-[1.5px] rounded-[3px] pointer-events-none"
                        />
                      )}
                      {field.isEdited && (
                        <span
                          style={{
                            fontFamily: effectiveFieldFontFamily,
                            fontSize: `${field.fontSize}px`,
                            fontWeight: effectiveFieldFontWeight,
                            fontStyle: effectiveFieldFontStyle,
                            color: field.color || '#1C1C1E',
                            textAlign: field.alignment || 'left',
                            lineHeight: field.multiLine ? 1.25 : 1,
                            paddingLeft: '4px',
                            paddingRight: '4px',
                          }}
                          className={`relative z-10 w-full select-text ${
                            field.multiLine
                              ? 'whitespace-pre-wrap break-words'
                              : 'whitespace-nowrap truncate'
                          }`}
                        >
                          {field.value}
                        </span>
                      )}
                      {isTextInteractive && !field.readOnly && field.isDateField && field.width >= 42 && (
                        <Calendar className="relative z-10 w-3 h-3 text-[#8E8E93] opacity-0 group-hover/ff:opacity-90 shrink-0 mr-1 pointer-events-none transition-opacity" />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Floating Text Boxes */}
          <div className="absolute inset-0 z-30 pointer-events-none">
            {page.textBoxes.map((box) => (
              <div
                key={box.id}
                data-textbox
                style={{
                  left: box.x,
                  top: box.y,
                  width: box.width,
                }}
                className={`absolute group bg-[#FBFBFD]/94 backdrop-blur-xs border border-[#3C3C43]/20 rounded-xl p-1.5 shadow-xs ${
                  activeTool === 'text' ? 'pointer-events-auto' : 'pointer-events-none select-none'
                }`}
              >
                <div
                  className={`flex items-center justify-between mb-0.5 transition-opacity no-print ${
                    isTouchDevice
                      ? 'opacity-100'
                      : 'opacity-100 [@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:group-hover:opacity-100 [@media(pointer:fine)]:group-focus-within:opacity-100'
                  }`}
                >
                  <span className="text-[10px] text-[#8E8E93] flex items-center gap-1">
                    <Type className="w-2.5 h-2.5" /> Casella di testo
                  </span>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdatePage({
                        ...page,
                        textBoxes: page.textBoxes.filter((tb) => tb.id !== box.id),
                      });
                    }}
                    className="min-w-[28px] min-h-[28px] flex items-center justify-center rounded-full text-[#8E8E93] hover:text-[#9A463D] active:bg-[#9A463D]/15 transition-colors"
                    title="Elimina casella di testo"
                    aria-label="Elimina casella di testo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <textarea
                  autoFocus={box.content === ''}
                  data-textbox-id={box.id}
                  rows={2}
                  value={box.content}
                  placeholder="Scrivi annotazione…"
                  onFocus={() =>
                    onActivePdfTextTargetChange?.({
                      kind: 'textbox',
                      pageIndex: page.pageIndex,
                      id: box.id,
                      color: box.color,
                    })
                  }
                  onChange={(e) =>
                    onUpdatePage({
                      ...page,
                      textBoxes: page.textBoxes.map((tb) =>
                        tb.id === box.id ? { ...tb, content: e.target.value } : tb
                      ),
                    })
                  }
                  style={{ color: box.color, fontSize: `${box.fontSize}px` }}
                  className="w-full bg-transparent resize-none focus:outline-none leading-snug"
                />
              </div>
            ))}
          </div>

          {/* Pen Ink + Shapes Overlay */}
          <canvas
            ref={penCanvasRef}
            className={`absolute inset-0 w-full h-full z-[35] ${
              isDrawingActive ? 'cursor-crosshair' : 'pointer-events-none'
            }`}
          />

          {/* Snap Confirmation Pulse */}
          {snapPulse && (
            <div
              key={snapPulse.id}
              style={{
                left: snapPulse.x,
                top: snapPulse.y,
                transform: 'translate(-50%, -50%)',
              }}
              className="absolute z-40 w-8 h-8 rounded-full border-2 border-[#1C1C1E]/45 pointer-events-none animate-snap-confirm"
            />
          )}
        </div>
      </div>

      {/* Floating Acrobat / iOS Calendar Popover for Date Spans */}
      <AnimatePresence>
        {activeDatePopover && (() => {
          const winW = typeof window !== 'undefined' ? window.innerWidth : 1024;
          const winH = typeof window !== 'undefined' ? window.innerHeight : 768;
          const popoverWidth = Math.min(286, winW - 20);
          const popoverApproxHeight = 338;
          const left = Math.max(10, Math.min(winW - popoverWidth - 10, activeDatePopover.anchorRect.left));
          const fitsBelow = activeDatePopover.anchorRect.bottom + popoverApproxHeight + 12 <= winH;
          const rawTop = fitsBelow
            ? activeDatePopover.anchorRect.bottom + 8
            : activeDatePopover.anchorRect.top - popoverApproxHeight - 8;
          const top = Math.max(10, Math.min(winH - Math.min(popoverApproxHeight, winH - 20) - 10, rawTop));

          const { viewYear, viewMonth, selectedYear, selectedMonth, selectedDay } = activeDatePopover;
          const daysInCurrentMonth = new Date(viewYear, viewMonth, 0).getDate();
          const leadingEmptyCells = (new Date(viewYear, viewMonth - 1, 1).getDay() + 6) % 7;
          const now = new Date();
          const todayY = now.getFullYear();
          const todayM = now.getMonth() + 1;
          const todayD = now.getDate();

          const currentMonthTitle =
            ITALIAN_MONTHS_LONG[viewMonth - 1].charAt(0).toUpperCase() +
            ITALIAN_MONTHS_LONG[viewMonth - 1].slice(1);

          const minYear = Math.min(1950, selectedYear - 20);
          const maxYear = Math.max(2050, selectedYear + 20);
          const yearOptions: number[] = [];
          for (let y = minYear; y <= maxYear; y++) yearOptions.push(y);

          const quickFormats: Array<{ label: string; fmt: PdfDateFormatMeta }> = [
            {
              label: formatDateWithMeta(selectedYear, selectedMonth, selectedDay, {
                order: 'DMY',
                separator: ' ',
                padDayZero: false,
                padMonthZero: false,
                monthFormat: 'long',
                monthCase: 'title',
                yearDigits: 4,
              }),
              fmt: {
                order: 'DMY',
                separator: ' ',
                padDayZero: false,
                padMonthZero: false,
                monthFormat: 'long',
                monthCase: 'title',
                yearDigits: 4,
              },
            },
            {
              label: formatDateWithMeta(selectedYear, selectedMonth, selectedDay, {
                order: 'DMY',
                separator: '/',
                padDayZero: true,
                padMonthZero: true,
                monthFormat: 'numeric',
                monthCase: 'lower',
                yearDigits: 4,
              }),
              fmt: {
                order: 'DMY',
                separator: '/',
                padDayZero: true,
                padMonthZero: true,
                monthFormat: 'numeric',
                monthCase: 'lower',
                yearDigits: 4,
              },
            },
            {
              label: formatDateWithMeta(selectedYear, selectedMonth, selectedDay, {
                order: 'DMY',
                separator: '-',
                padDayZero: true,
                padMonthZero: true,
                monthFormat: 'numeric',
                monthCase: 'lower',
                yearDigits: 4,
              }),
              fmt: {
                order: 'DMY',
                separator: '-',
                padDayZero: true,
                padMonthZero: true,
                monthFormat: 'numeric',
                monthCase: 'lower',
                yearDigits: 4,
              },
            },
          ];

          const goPrevMonth = () => {
            setActiveDatePopover((prev) => {
              if (!prev) return null;
              if (prev.viewMonth === 1) {
                return { ...prev, viewYear: prev.viewYear - 1, viewMonth: 12 };
              }
              return { ...prev, viewMonth: prev.viewMonth - 1 };
            });
          };

          const goNextMonth = () => {
            setActiveDatePopover((prev) => {
              if (!prev) return null;
              if (prev.viewMonth === 12) {
                return { ...prev, viewYear: prev.viewYear + 1, viewMonth: 1 };
              }
              return { ...prev, viewMonth: prev.viewMonth + 1 };
            });
          };

          return (
            <motion.div
              key="pdf-date-popover"
              data-pdf-date-popover="true"
              initial={{ opacity: 0, scale: 0.96, y: fitsBelow ? -4 : 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: fitsBelow ? -4 : 4 }}
              transition={{ type: 'spring', stiffness: 460, damping: 32 }}
              style={{ left, top, width: popoverWidth, maxHeight: 'calc(100dvh - 20px)', overflowY: 'auto' }}
              onMouseDown={(e) => {
                // Keep focus on the active input when clicking non-select controls
                if ((e.target as HTMLElement).tagName !== 'SELECT') {
                  e.preventDefault();
                }
              }}
              className="fixed z-50 ios-glass rounded-2xl p-3 shadow-lg select-none no-print text-[#1C1C1E] dark:text-[#F5F5F7]"
            >
              {/* Header: Mese, Anno, Frecce e Oggi */}
              <div className="flex items-center justify-between gap-1.5 mb-2.5">
                <div className="flex items-center gap-1 min-w-0">
                  <Calendar className="w-3.5 h-3.5 text-[#8E8E93] shrink-0" />
                  <span className="text-[13px] font-semibold tracking-tight truncate">
                    {currentMonthTitle}
                  </span>
                  <select
                    aria-label="Seleziona anno"
                    value={viewYear}
                    onChange={(e) => {
                      const yr = parseInt(e.target.value, 10);
                      setActiveDatePopover((prev) => (prev ? { ...prev, viewYear: yr } : null));
                    }}
                    className="bg-[#787880]/12 dark:bg-white/10 rounded-lg px-1.5 py-0.5 text-xs font-semibold tabular-nums focus:outline-none cursor-pointer"
                  >
                    {yearOptions.map((yr) => (
                      <option key={yr} value={yr} className="bg-white dark:bg-[#242428] text-[#1C1C1E] dark:text-[#F5F5F7]">
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => applyCalendarDate(todayY, todayM, todayD)}
                    className="px-2 py-1 rounded-full ios-control-bg text-[11px] font-medium hover:bg-[#787880]/20 whitespace-nowrap shrink-0 transition-colors"
                  >
                    Oggi
                  </button>
                  <button
                    type="button"
                    onClick={goPrevMonth}
                    aria-label="Mese precedente"
                    className="w-7 h-7 rounded-full ios-control-bg flex items-center justify-center hover:bg-[#787880]/20 shrink-0 transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={goNextMonth}
                    aria-label="Mese successivo"
                    className="w-7 h-7 rounded-full ios-control-bg flex items-center justify-center hover:bg-[#787880]/20 shrink-0 transition-colors"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Intestazione giorni della settimana (Lun - Dom) */}
              <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
                {ITALIAN_WEEKDAYS_SHORT.map((wd) => (
                  <div
                    key={wd}
                    className="text-[10px] font-medium text-[#8E8E93] py-0.5"
                  >
                    {wd}
                  </div>
                ))}
              </div>

              {/* Griglia giorni */}
              <div className="grid grid-cols-7 gap-0.5 text-center">
                {Array.from({ length: leadingEmptyCells }).map((_, idx) => (
                  <div key={`empty-${idx}`} className="w-8 h-8" />
                ))}
                {Array.from({ length: daysInCurrentMonth }).map((_, idx) => {
                  const dayNum = idx + 1;
                  const isSelected =
                    viewYear === selectedYear && viewMonth === selectedMonth && dayNum === selectedDay;
                  const isToday =
                    viewYear === todayY && viewMonth === todayM && dayNum === todayD;

                  return (
                    <button
                      key={dayNum}
                      type="button"
                      onClick={() => applyCalendarDate(viewYear, viewMonth, dayNum)}
                      className={`w-8 h-8 mx-auto rounded-full text-xs tabular-nums flex items-center justify-center transition-all ${
                        isSelected
                          ? 'bg-[#1C1C1E] text-[#FBFBFD] dark:bg-[#F5F5F7] dark:text-[#1C1C1E] font-semibold shadow-xs'
                          : isToday
                            ? 'ring-1 ring-[#1C1C1E]/45 dark:ring-white/45 font-semibold hover:bg-[#787880]/15'
                            : 'hover:bg-[#787880]/15 text-[#1C1C1E] dark:text-[#E5E5EA]'
                      }`}
                    >
                      {dayNum}
                    </button>
                  );
                })}
              </div>

              {/* Barra inferiore cambio rapido formato */}
              <div className="mt-2.5 pt-2 border-t border-[#3C3C43]/12 dark:border-white/10">
                <div className="text-[10px] font-medium text-[#8E8E93] mb-1.5">
                  Formato data nel documento
                </div>
                <div className="flex flex-wrap gap-1">
                  {quickFormats.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() =>
                        applyCalendarDate(selectedYear, selectedMonth, selectedDay, item.fmt)
                      }
                      className="px-2 py-1 rounded-lg ios-control-bg text-[11px] font-medium tabular-nums hover:bg-[#787880]/20 whitespace-nowrap transition-colors"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
};

export const PdfAnnotator: React.FC<PdfAnnotatorProps> = ({
  note,
  pdfBuffer,
  zoom,
  activeTool,
  pdfTextMode = 'edit',
  selectedInsertShape,
  eraserMode,
  eraserSize,
  activeColor,
  penWidth,
  highlighterWidth,
  holdToSnap,
  selectedStrokeIds,
  onSelectStrokes,
  onUpdatePages,
  onDeletePage,
  onOpenContextMenu,
  onActivePdfTextTargetChange,
  onChangeZoom,
  onZoomWheel,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [tipDismissed, setTipDismissed] = useState(false);
  const pages = note.pdfPages || [];

  usePinchZoom(scrollContainerRef, zoom, onChangeZoom, onZoomWheel);
  const isHandPanning = useHandPan(scrollContainerRef, activeTool === 'pan');

  const handleUpdatePage = (updatedPage: PdfPageAnnotations, recordHistory = true) => {
    onUpdatePages(
      pages.map((p) => (p.pageIndex === updatedPage.pageIndex ? updatedPage : p)),
      recordHistory
    );
  };

  return (
    <div
      ref={scrollContainerRef}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpenContextMenu({
          visible: true,
          scope: 'canvas',
          x: e.clientX,
          y: e.clientY,
          canvasX: 60,
          canvasY: 60,
          pageIndex: pages[0]?.pageIndex,
          totalPages: pages.length,
          targetStrokeIds: selectedStrokeIds,
        });
      }}
      className={`flex-1 overflow-auto px-1.5 sm:px-6 lg:px-10 py-2.5 sm:py-6 pb-24 space-y-4 sm:space-y-6 ${
        activeTool === 'pan'
          ? isHandPanning
            ? 'touch-none select-none cursor-grabbing'
            : 'touch-none select-none cursor-grab'
          : ''
      }`}
    >
      {!tipDismissed && (
        <div className="mb-2 sm:mb-4 max-w-[920px] mx-auto px-3 py-1.5 sm:py-2 rounded-2xl bg-[#FBFBFD]/80 dark:bg-[#242428]/80 border border-[#3C3C43]/10 dark:border-white/10 text-[11px] sm:text-xs text-[#48484A] dark:text-[#C7C7CC] flex items-center justify-between gap-2 no-print">
          <span className="leading-snug">
            {pdfTextMode === 'note' ? (
              <>
                Con <strong className="text-[#1C1C1E] dark:text-[#F5F5F7]">Casella nota</strong> tocca
                un punto qualsiasi del PDF per inserire una nota in riquadro separato.
              </>
            ) : (
              <>
                Con <strong className="text-[#1C1C1E] dark:text-[#F5F5F7]">Scrivi su PDF</strong> tocca
                righe, date o campi del modulo per modificarli; usa il sottomenù di{' '}
                <strong className="text-[#1C1C1E] dark:text-[#F5F5F7]">T</strong> per aggiungere
                riquadri nota separati.
              </>
            )}
          </span>
          <button
            type="button"
            onClick={() => setTipDismissed(true)}
            aria-label="Nascondi suggerimento"
            className="p-1 rounded-full hover:bg-[#787880]/15 text-[#8E8E93] shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="space-y-5 sm:space-y-6">
        {pages.map((page, idx) => (
          <PdfPageCard
            key={page.pageIndex}
            page={page}
            displayPageNumber={idx + 1}
            totalPages={pages.length}
            pdfBuffer={pdfBuffer}
            zoom={zoom}
            activeTool={activeTool}
            pdfTextMode={pdfTextMode}
            selectedInsertShape={selectedInsertShape}
            eraserMode={eraserMode}
            eraserSize={eraserSize}
            activeColor={activeColor}
            penWidth={penWidth}
            highlighterWidth={highlighterWidth}
            holdToSnap={holdToSnap}
            selectedStrokeIds={selectedStrokeIds}
            onSelectStrokes={(ids) => onSelectStrokes(ids, page.pageIndex)}
            onUpdatePage={handleUpdatePage}
            onDeletePage={onDeletePage}
            onOpenContextMenu={onOpenContextMenu}
            onActivePdfTextTargetChange={onActivePdfTextTargetChange}
          />
        ))}
      </div>
    </div>
  );
};
