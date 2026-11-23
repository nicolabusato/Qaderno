import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Plus, Trash2, Undo2, X } from 'lucide-react';
import {
  isPalmRejectionActive,
  notifyStylusPointerEvent,
  useHandPan,
  usePinchZoom,
} from '../hooks/usePinchZoom';
import {
  getSmartphoneSheetMinHeight,
  SMARTPHONE_SHEET_WIDTH,
} from '../hooks/useDeviceProfile';
import { isDynamicCursorTool } from './DynamicToolCursor';
import { HybridSearchMatch } from '../utils/documentSearch';
import {
  ActiveTextSelection,
  ContextMenuState,
  EraserMode,
  HybridPage,
  NoteDocument,
  NoteFontFamily,
  PaperStyle,
  RecognizedShapeKind,
  RecognizedShapeMeta,
  Stroke,
  StrokePoint,
  TextBlock,
  TextColorSpan,
  TextFontSpan,
  TextStyleSpan,
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
  createShapeFromDrag,
  recognizeLocalShape,
  resizeSnappedShapeLive,
} from '../utils/shapeRecognizer';
import { normalizeNotePages } from '../utils/storage';
import {
  collectSelectedBlockRangesFromDOM,
  getSelectionOffsetsInElement,
  normalizeStyleSpans,
  resolveActiveColorAt,
  resolveActiveFontAt,
  RichTextBlock,
  setSelectionOffsetsInElement,
} from './RichTextBlock';

interface HybridEditorProps {
  note: NoteDocument;
  zoom: number;
  activeTool: ToolType;
  selectedInsertShape: RecognizedShapeKind;
  eraserMode: EraserMode;
  eraserSize: number;
  activeColor: string;
  penWidth: number;
  highlighterWidth: number;
  holdToSnap: boolean;
  fingerPanOnly?: boolean;
  ivoryPaper?: boolean;
  isSmartphone?: boolean;
  viewportHeight?: number;
  keyboardInsetPx?: number;
  searchMatches?: HybridSearchMatch[];
  activeSearchMatchId?: string | null;
  textSizeScale: 'small' | 'normal' | 'large';
  selectedStrokeIds: string[];
  selectedPageId?: string;
  onSelectStrokes: (ids: string[], pageId?: string) => void;
  onChangeTitle: (title: string) => void;
  onUpdatePage: (pageId: string, updater: (page: HybridPage) => HybridPage, recordHistory?: boolean) => void;
  onAddPage: () => void;
  onDeletePage: (pageId: string) => void;
  onActiveTextSelectionChange: (sel: ActiveTextSelection | null) => void;
  onOpenContextMenu: (menu: ContextMenuState) => void;
  onChangeZoom: (nextZoom: number) => void;
  onZoomWheel: (deltaY: number) => void;
  onStylusDetected?: () => void;
  onEraserScrubMove?: (clientX: number, clientY: number) => void;
  onEraserScrubEnd?: () => void;
  onSheetCursorMove?: (clientX: number, clientY: number, pointerType: string) => void;
  onSheetCursorLeave?: () => void;
  onReportLayoutMetrics: (
    blockOffsetsByPage: Record<string, Record<string, { top: number; height: number }>>,
    canvasWidth: number
  ) => void;
}

interface HybridPageSheetProps {
  page: HybridPage;
  pageIndex: number;
  totalPages: number;
  noteTitle: string;
  paperStyle: PaperStyle;
  defaultFont: NoteFontFamily;
  zoom: number;
  activeTool: ToolType;
  selectedInsertShape: RecognizedShapeKind;
  eraserMode: EraserMode;
  eraserSize: number;
  activeColor: string;
  penWidth: number;
  highlighterWidth: number;
  holdToSnap: boolean;
  fingerPanOnly?: boolean;
  ivoryPaper?: boolean;
  isSmartphone?: boolean;
  viewportHeight?: number;
  pageSearchMatches?: HybridSearchMatch[];
  activeSearchMatchId?: string | null;
  textSizeScale: 'small' | 'normal' | 'large';
  selectedStrokeIds: string[];
  onSelectStrokes: (ids: string[]) => void;
  onChangeTitle: (title: string) => void;
  onChangeBlocks: (blocks: TextBlock[]) => void;
  onCommitStrokes: (strokes: Stroke[]) => void;
  onDeletePage: (pageId: string) => void;
  onActiveTextSelectionChange: (sel: ActiveTextSelection | null) => void;
  onOpenContextMenu: (menu: ContextMenuState) => void;
  onStylusDetected?: () => void;
  onEraserScrubMove?: (clientX: number, clientY: number) => void;
  onEraserScrubEnd?: () => void;
  onSheetCursorMove?: (clientX: number, clientY: number, pointerType: string) => void;
  onSheetCursorLeave?: () => void;
  onReportPageMetrics: (pageId: string, metrics: Record<string, { top: number; height: number }>, width: number) => void;
}

const LOGICAL_WIDTH = 820;
const MIN_LOGICAL_HEIGHT = 1060;

let titleMeasureCanvas: HTMLCanvasElement | null = null;

function computeTextRangeRectsInSheet(
  rootEl: HTMLElement,
  startOffset: number,
  endOffset: number,
  sheetRect: DOMRect,
  scaleX: number,
  scaleY: number
): Array<{ x: number; y: number; width: number; height: number }> {
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
  let consumed = 0;
  let startNode: Text | null = null;
  let startLocal = 0;
  let endNode: Text | null = null;
  let endLocal = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const len = (node.data || '').length;
    if (!startNode && consumed + len >= startOffset) {
      startNode = node;
      startLocal = Math.max(0, startOffset - consumed);
    }
    if (!endNode && consumed + len >= endOffset) {
      endNode = node;
      endLocal = Math.max(0, endOffset - consumed);
      break;
    }
    consumed += len;
  }

  if (!startNode || !endNode) return [];
  try {
    const range = document.createRange();
    range.setStart(startNode, Math.min(startLocal, startNode.data.length));
    range.setEnd(endNode, Math.min(endLocal, endNode.data.length));
    return Array.from(range.getClientRects())
      .filter((r) => r.width > 0.5 && r.height > 0.5)
      .map((r) => ({
        x: (r.left - sheetRect.left) * scaleX,
        y: (r.top - sheetRect.top) * scaleY,
        width: r.width * scaleX,
        height: r.height * scaleY,
      }));
  } catch {
    return [];
  }
}

const HybridPageSheet: React.FC<HybridPageSheetProps> = ({
  page,
  pageIndex,
  totalPages,
  noteTitle,
  paperStyle,
  defaultFont,
  zoom,
  activeTool,
  selectedInsertShape,
  eraserMode,
  eraserSize,
  activeColor,
  penWidth,
  highlighterWidth,
  holdToSnap,
  fingerPanOnly = false,
  ivoryPaper = false,
  isSmartphone = false,
  viewportHeight = 800,
  pageSearchMatches = [],
  activeSearchMatchId = null,
  textSizeScale,
  selectedStrokeIds,
  onSelectStrokes,
  onChangeTitle,
  onChangeBlocks,
  onCommitStrokes,
  onDeletePage,
  onActiveTextSelectionChange,
  onOpenContextMenu,
  onStylusDetected,
  onEraserScrubMove,
  onEraserScrubEnd,
  onSheetCursorMove,
  onSheetCursorLeave,
  onReportPageMetrics,
}) => {
  const sheetLogicalWidth = isSmartphone ? SMARTPHONE_SHEET_WIDTH : LOGICAL_WIDTH;
  const sheetMinLogicalHeight = isSmartphone
    ? getSmartphoneSheetMinHeight(viewportHeight)
    : MIN_LOGICAL_HEIGHT;

  const sheetRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const highlighterCanvasRef = useRef<HTMLCanvasElement>(null);
  const penCanvasRef = useRef<HTMLCanvasElement>(null);
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const editableRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const activeSearchHighlightRef = useRef<HTMLDivElement | null>(null);

  const [blockTops, setBlockTops] = useState<Record<string, number>>({});
  const [sheetSize, setSheetSize] = useState<{ width: number; height: number }>({
    width: sheetLogicalWidth,
    height: sheetMinLogicalHeight,
  });
  const [searchHighlightRects, setSearchHighlightRects] = useState<
    Array<{
      matchId: string;
      isActive: boolean;
      x: number;
      y: number;
      width: number;
      height: number;
    }>
  >([]);
  const [snapPulse, setSnapPulse] = useState<{ x: number; y: number; id: number } | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ blockId: string; offset: number } | null>(null);
  const [formatUndoBubble, setFormatUndoBubble] = useState<{
    x: number;
    y: number;
    blockId: string;
    kind: 'block' | 'span';
    label: string;
    canStripSymbols: boolean;
    spanRange?: { start: number; end: number };
    alsoBlockLabel?: string;
  } | null>(null);
  const formatBubbleRef = useRef<HTMLDivElement>(null);

  const activeTouchesRef = useRef<Set<number>>(new Set());

  const drawingRef = useRef<{
    active: boolean;
    pointerId: number;
    pointerType: string;
    tool: 'pen' | 'highlighter';
    nibStyle?: 'standard' | 'fountain';
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

  const eraserDirtyRef = useRef<{ active: boolean; pointerId: number; workingStrokes: Stroke[] | null }>({
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

  const formatLongPressRef = useRef<{
    timer: number | null;
    startX: number;
    startY: number;
    pointerId: number;
  }>({ timer: null, startX: 0, startY: 0, pointerId: -1 });
  const lastFormatBubbleShownAtRef = useRef<number>(0);

  const measureLayout = useCallback(() => {
    const sheetEl = sheetRef.current;
    if (!sheetEl) return;
    const sheetRect = sheetEl.getBoundingClientRect();
    const scaleY = sheetEl.offsetHeight / Math.max(sheetRect.height, 1);

    const nextTops: Record<string, number> = {};
    const metrics: Record<string, { top: number; height: number }> = {};

    for (const block of page.blocks) {
      const el = blockRefs.current[block.id];
      if (el) {
        const r = el.getBoundingClientRect();
        const relTop = (r.top - sheetRect.top) * scaleY;
        const relHeight = r.height * scaleY;
        nextTops[block.id] = relTop;
        metrics[block.id] = { top: relTop, height: relHeight };
      }
    }

    setBlockTops(nextTops);
    const width = Math.max(320, Math.round(sheetEl.clientWidth));
    const height = Math.max(sheetMinLogicalHeight, Math.round(sheetEl.scrollHeight));
    setSheetSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    onReportPageMetrics(page.id, metrics, width);
  }, [page.blocks, page.id, onReportPageMetrics, sheetMinLogicalHeight]);

  useLayoutEffect(() => {
    measureLayout();
  }, [measureLayout, noteTitle, page.blocks, textSizeScale, zoom, sheetLogicalWidth, sheetMinLogicalHeight]);

  // Compute exact non-intrusive search highlight overlays for title & RichTextBlock matches
  useLayoutEffect(() => {
    if (!pageSearchMatches || pageSearchMatches.length === 0) {
      setSearchHighlightRects((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    const sheetEl = sheetRef.current;
    if (!sheetEl) return;
    const sheetRect = sheetEl.getBoundingClientRect();
    if (sheetRect.width <= 0 || sheetRect.height <= 0) return;

    const scaleX = sheetEl.offsetWidth / sheetRect.width;
    const scaleY = sheetEl.offsetHeight / sheetRect.height;

    const nextRects: Array<{
      matchId: string;
      isActive: boolean;
      x: number;
      y: number;
      width: number;
      height: number;
    }> = [];

    for (const match of pageSearchMatches) {
      const isActive = match.id === activeSearchMatchId;
      if (match.kind === 'title') {
        const titleEl = titleInputRef.current;
        if (!titleEl) continue;
        const r = titleEl.getBoundingClientRect();
        const style = window.getComputedStyle(titleEl);
        if (!titleMeasureCanvas && typeof document !== 'undefined') {
          titleMeasureCanvas = document.createElement('canvas');
        }
        const ctx = titleMeasureCanvas?.getContext('2d');
        let startPx = 0;
        let matchW = 48;
        if (ctx) {
          ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          startPx = ctx.measureText(noteTitle.slice(0, match.start)).width;
          matchW = Math.max(12, ctx.measureText(noteTitle.slice(match.start, match.end)).width);
        }
        const padLeft = parseFloat(style.paddingLeft || '0') || 0;
        const relX = (r.left - sheetRect.left) * scaleX + padLeft + startPx - titleEl.scrollLeft;
        const relY = (r.top - sheetRect.top) * scaleY;
        const relH = Math.max(20, r.height * scaleY - 8);
        nextRects.push({
          matchId: match.id,
          isActive,
          x: Math.max(0, relX - 2),
          y: Math.max(0, relY + 2),
          width: Math.min(sheetLogicalWidth - Math.max(0, relX - 2) - 16, matchW + 4),
          height: relH,
        });
      } else if (match.blockId) {
        const editableEl = editableRefs.current[match.blockId];
        if (!editableEl) continue;
        const rects = computeTextRangeRectsInSheet(
          editableEl,
          match.start,
          match.end,
          sheetRect,
          scaleX,
          scaleY
        );
        for (const rect of rects) {
          nextRects.push({
            matchId: match.id,
            isActive,
            x: rect.x - 1.5,
            y: rect.y - 1,
            width: rect.width + 3,
            height: rect.height + 2,
          });
        }
      }
    }

    setSearchHighlightRects(nextRects);
  }, [pageSearchMatches, activeSearchMatchId, noteTitle, page.blocks, zoom, sheetLogicalWidth, textSizeScale]);

  // Smoothly scroll active search highlight into view when navigating matches
  useEffect(() => {
    if (!activeSearchMatchId) return;
    if (!pageSearchMatches.some((m) => m.id === activeSearchMatchId)) return;
    const id = window.requestAnimationFrame(() => {
      activeSearchHighlightRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [activeSearchMatchId, pageSearchMatches, searchHighlightRects.length]);

  useEffect(() => {
    const sheetEl = sheetRef.current;
    if (!sheetEl) return;
    const ro = new ResizeObserver(() => measureLayout());
    ro.observe(sheetEl);
    Object.values(blockRefs.current).forEach((el) => {
      if (el) ro.observe(el);
    });
    return () => ro.disconnect();
  }, [measureLayout, page.blocks]);

  useLayoutEffect(() => {
    if (focusRequest) {
      const el = editableRefs.current[focusRequest.blockId];
      if (el) {
        el.focus();
        const len = (el.textContent || '').replace(/\u00A0/g, ' ').replace(/\u200B/g, '').length;
        const pos = Math.min(len, Math.max(0, focusRequest.offset));
        setSelectionOffsetsInElement(el, pos, pos);
      }
      setFocusRequest(null);
    }
  }, [focusRequest, page.blocks]);

  const getStrokeYOffset = useCallback(
    (stroke: Stroke): number => {
      if (stroke.anchorBlockId && blockTops[stroke.anchorBlockId] !== undefined) {
        return blockTops[stroke.anchorBlockId];
      }
      return 0;
    },
    [blockTops]
  );

  const findNearestBlock = useCallback(
    (canvasY: number): { blockId: string | undefined; blockTop: number } => {
      let bestId: string | undefined;
      let bestTop = 0;
      let bestDist = Infinity;

      for (const b of page.blocks) {
        const top = blockTops[b.id];
        if (top === undefined) continue;
        const d = Math.abs(canvasY - top);
        if (d < bestDist) {
          bestDist = d;
          bestId = b.id;
          bestTop = top;
        }
      }
      return { blockId: bestId, blockTop: bestTop };
    },
    [page.blocks, blockTops]
  );

  const isDarkTheme =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  const getDisplayColor = useCallback(
    (hex: string) => {
      if (isDarkTheme && !ivoryPaper && hex.toLowerCase() === '#1c1c1e') {
        return '#ECECEF';
      }
      return hex;
    },
    [isDarkTheme, ivoryPaper]
  );

  const redrawAllCanvases = useCallback(
    (overrideStrokes?: Stroke[]) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const { width, height } = sheetSize;
      const strokesToDraw = overrideStrokes ?? page.strokes;
      const dragDelta = lassoRef.current?.mode === 'drag' ? lassoRef.current.dragDelta : null;

      const drawLayer = (canvas: HTMLCanvasElement | null, toolFilter: 'pen' | 'highlighter') => {
        if (!canvas) return;
        const targetW = Math.floor(width * dpr);
        const targetH = Math.floor(height * dpr);
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        for (const s of strokesToDraw) {
          if (s.tool !== toolFilter) continue;
          const isSelected = selectedStrokeIds.includes(s.id);
          const yOff = getStrokeYOffset(s);
          const themedStroke = { ...s, color: getDisplayColor(s.color) };
          if (isSelected && dragDelta) {
            renderStroke(ctx, translateStroke(themedStroke, dragDelta.dx, dragDelta.dy), {
              yOffset: yOff,
              selected: true,
            });
          } else {
            renderStroke(ctx, themedStroke, { yOffset: yOff, selected: isSelected });
          }
        }

        const activeDraw = drawingRef.current;
        if (activeDraw && activeDraw.active && activeDraw.tool === toolFilter) {
          renderStroke(
            ctx,
            {
              id: 'live',
              tool: activeDraw.tool,
              nibStyle: activeDraw.nibStyle,
              color: getDisplayColor(activeColor),
              width: activeDraw.tool === 'highlighter' ? highlighterWidth : penWidth,
              points: activeDraw.points,
              shapeMeta: activeDraw.snappedMeta ?? undefined,
            },
            { yOffset: 0, selected: false }
          );
        }

        if (toolFilter === 'pen' && shapeDragRef.current?.active) {
          renderStroke(
            ctx,
            {
              id: 'shape_live',
              tool: 'pen',
              color: getDisplayColor(activeColor),
              width: penWidth,
              points: shapeDragRef.current.points,
              shapeMeta: shapeDragRef.current.shapeMeta,
            },
            { yOffset: 0, selected: false }
          );
        }

        if (toolFilter === 'pen' && lassoRef.current?.mode === 'draw' && lassoRef.current.polygon.length > 1) {
          ctx.save();
          ctx.strokeStyle = isDarkTheme ? '#F5F5F7' : '#1C1C1E';
          ctx.lineWidth = 1.4;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          const poly = lassoRef.current.polygon;
          ctx.moveTo(poly[0].x, poly[0].y);
          for (let i = 1; i < poly.length; i++) {
            ctx.lineTo(poly[i].x, poly[i].y);
          }
          ctx.closePath();
          ctx.fillStyle = isDarkTheme ? 'rgba(255,255,255,0.06)' : 'rgba(28, 28, 30, 0.05)';
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      };

      drawLayer(highlighterCanvasRef.current, 'highlighter');
      drawLayer(penCanvasRef.current, 'pen');
    },
    [
      sheetSize,
      page.strokes,
      selectedStrokeIds,
      getStrokeYOffset,
      getDisplayColor,
      activeColor,
      penWidth,
      highlighterWidth,
      isDarkTheme,
    ]
  );

  useEffect(() => {
    redrawAllCanvases();
  }, [redrawAllCanvases]);

  /**
   * Zoom-normalized coordinate projection:
   * Maps viewport clientX/clientY into exact logical sheet coordinates regardless of zoom (50%-300%).
   */
  const toCanvasPoint = (e: React.PointerEvent | MouseEvent): { x: number; y: number } => {
    const sheetEl = sheetRef.current;
    if (!sheetEl) return { x: 0, y: 0 };
    const rect = sheetEl.getBoundingClientRect();
    const scaleX = sheetEl.offsetWidth / Math.max(rect.width, 1);
    const scaleY = sheetEl.offsetHeight / Math.max(rect.height, 1);
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const getSelectionBoundingBox = useCallback(() => {
    if (selectedStrokeIds.length === 0) return null;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const s of page.strokes) {
      if (!selectedStrokeIds.includes(s.id)) continue;
      const b = getStrokeBounds(s, getStrokeYOffset(s));
      minX = Math.min(minX, b.minX);
      minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX);
      maxY = Math.max(maxY, b.maxY);
    }
    if (!isFinite(minX)) return null;
    return { minX, minY, maxX, maxY };
  }, [page.strokes, selectedStrokeIds, getStrokeYOffset]);

  const clearLongPress = () => {
    if (longPressRef.current.timer) {
      window.clearTimeout(longPressRef.current.timer);
      longPressRef.current.timer = null;
    }
    if (formatLongPressRef.current.timer) {
      window.clearTimeout(formatLongPressRef.current.timer);
      formatLongPressRef.current.timer = null;
    }
  };

  useEffect(() => {
    if (!formatUndoBubble) return;
    const handleOutside = (e: PointerEvent) => {
      if (formatBubbleRef.current && !formatBubbleRef.current.contains(e.target as Node)) {
        setFormatUndoBubble(null);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFormatUndoBubble(null);
    };
    const handleScroll = () => setFormatUndoBubble(null);
    window.addEventListener('pointerdown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('pointerdown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [formatUndoBubble]);

  const triggerContextMenuAt = (
    clientX: number,
    clientY: number,
    canvasX: number,
    canvasY: number,
    targetEl?: EventTarget | null
  ) => {
    const domEl = targetEl instanceof HTMLElement ? targetEl : null;

    const titleInput = domEl?.closest('input[data-note-title]') as HTMLInputElement | null;
    if (titleInput) {
      const start = titleInput.selectionStart ?? 0;
      const end = titleInput.selectionEnd ?? 0;
      onOpenContextMenu({
        visible: true,
        scope: 'canvas',
        x: clientX,
        y: clientY,
        canvasX,
        canvasY,
        pageId: page.id,
        totalPages,
        targetStrokeIds: [],
        textTarget: {
          kind: 'title',
          pageId: page.id,
          targetId: 'note-title',
          selectedText: titleInput.value.slice(start, end),
          selectionStart: start,
          selectionEnd: end,
        },
      });
      return;
    }

    const blockEl = domEl?.closest('[data-block-id]') as HTMLDivElement | null;
    if (blockEl) {
      const blockId = blockEl.getAttribute('data-block-id')!;
      const matchedBlock = page.blocks.find((b) => b.id === blockId);
      const hasFormatting = Boolean(
        matchedBlock &&
          (matchedBlock.type !== 'paragraph' ||
            (matchedBlock.styleSpans && matchedBlock.styleSpans.length > 0))
      );
      const offsets = getSelectionOffsetsInElement(blockEl);
      const text = blockEl.textContent || '';
      const start = offsets?.start ?? 0;
      const end = offsets?.end ?? 0;
      onOpenContextMenu({
        visible: true,
        scope: 'canvas',
        x: clientX,
        y: clientY,
        canvasX,
        canvasY,
        pageId: page.id,
        totalPages,
        targetStrokeIds: [],
        textTarget: {
          kind: 'block',
          pageId: page.id,
          targetId: blockId,
          selectedText: text.slice(start, end),
          selectionStart: start,
          selectionEnd: end,
          hasFormatting,
        },
      });
      return;
    }

    let targets = selectedStrokeIds;
    const hitStroke = [...page.strokes]
      .reverse()
      .find((s) => isPointNearStroke(canvasX, canvasY, s, 12, getStrokeYOffset(s)));

    if (hitStroke && !selectedStrokeIds.includes(hitStroke.id)) {
      targets = [hitStroke.id];
      onSelectStrokes(targets);
    }

    onOpenContextMenu({
      visible: true,
      scope: 'canvas',
      x: clientX,
      y: clientY,
      canvasX,
      canvasY,
      pageId: page.id,
      totalPages,
      targetStrokeIds: targets,
    });
  };

  const scheduleSnapCheck = () => {
    const session = drawingRef.current;
    if (!session || !holdToSnap || session.snappedMeta) return;
    if (session.snapTimer) window.clearTimeout(session.snapTimer);

    session.snapTimer = window.setTimeout(() => {
      const current = drawingRef.current;
      if (!current || !current.active || current.snappedMeta) return;
      const recognized = recognizeLocalShape(current.points);
      if (recognized) {
        current.snappedMeta = recognized.shapeMeta;
        current.points = recognized.snappedPoints;
        const last = recognized.snappedPoints[recognized.snappedPoints.length - 1];
        setSnapPulse({ x: last?.x ?? current.quietAnchor.x, y: last?.y ?? current.quietAnchor.y, id: Date.now() });
        redrawAllCanvases();
      }
    }, 450);
  };

  const shouldPointerDraw = (pointerType: string): boolean => {
    if (activeTool === 'pan' || activeTool === 'text') return false;
    if (pointerType === 'touch' && (fingerPanOnly || isPalmRejectionActive())) return false;
    return true;
  };

  const handleSheetPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 2) return;

    if (e.pointerType === 'pen') {
      notifyStylusPointerEvent(e.nativeEvent);
      onStylusDetected?.();
    }

    if (e.pointerType === 'touch' && isPalmRejectionActive()) {
      return;
    }

    // Cancel single-finger drawing/long-press when 2+ fingers touch down (pinch-to-zoom & 2-finger pan)
    if (e.pointerType === 'touch') {
      activeTouchesRef.current.add(e.pointerId);
      if (activeTouchesRef.current.size >= 2) {
        clearLongPress();
        if (drawingRef.current?.active && drawingRef.current.pointerType === 'touch') {
          if (drawingRef.current.snapTimer) window.clearTimeout(drawingRef.current.snapTimer);
          drawingRef.current = null;
          redrawAllCanvases();
        }
        return;
      }
    }

    const pt = toCanvasPoint(e);

    // Long-press ("tenendo premuto") on formatted text/block -> show floating "Annulla formattazione" pill
    let startedFormatLongPress = false;
    if (activeTool === 'text' && e.button === 0) {
      const domEl = e.target instanceof HTMLElement ? e.target : null;
      const blockRow = domEl?.closest('[data-hybrid-block-row]') as HTMLElement | null;
      const styleSpanEl = domEl?.closest('[data-style-span="true"]') as HTMLElement | null;
      const blockId = blockRow?.getAttribute('data-hybrid-block-row');
      const pressedBlock = blockId ? page.blocks.find((b) => b.id === blockId) : undefined;

      if (blockId && pressedBlock && (styleSpanEl || pressedBlock.type !== 'paragraph')) {
        clearLongPress();
        startedFormatLongPress = true;
        const cx = e.clientX;
        const cy = e.clientY;
        const blockTypeLabelMap: Record<TextBlock['type'], string> = {
          h1: 'Annulla titolo',
          h2: 'Annulla sottotitolo',
          bullet: 'Annulla elenco',
          todo: 'Annulla checklist',
          code: 'Annulla codice',
          paragraph: 'Annulla formattazione',
        };
        const getSpanLabel = (el: HTMLElement): string => {
          if (el.getAttribute('data-bold') === 'true') return 'Annulla grassetto';
          if (el.getAttribute('data-italic') === 'true') return 'Annulla corsivo';
          if (el.getAttribute('data-inline-code') === 'true') return 'Annulla codice';
          if (el.getAttribute('data-strike') === 'true') return 'Annulla barrato';
          return 'Annulla formattazione';
        };

        formatLongPressRef.current = {
          startX: cx,
          startY: cy,
          pointerId: e.pointerId,
          timer: window.setTimeout(() => {
            lastFormatBubbleShownAtRef.current = Date.now();
            if (styleSpanEl) {
              const sStart = Number(styleSpanEl.getAttribute('data-span-start') || '0');
              const sEnd = Number(styleSpanEl.getAttribute('data-span-end') || '0');
              const matched = pressedBlock.styleSpans?.find(
                (sp) => sp.start <= sStart && sp.end >= sEnd
              );
              const hasRaw = Boolean(matched?.rawWrap || styleSpanEl.getAttribute('data-raw-wrap'));
              setFormatUndoBubble({
                x: cx,
                y: cy,
                blockId,
                kind: 'span',
                label: getSpanLabel(styleSpanEl),
                canStripSymbols: hasRaw,
                spanRange: { start: sStart, end: sEnd },
                alsoBlockLabel:
                  pressedBlock.type !== 'paragraph' ? blockTypeLabelMap[pressedBlock.type] : undefined,
              });
            } else {
              setFormatUndoBubble({
                x: cx,
                y: cy,
                blockId,
                kind: 'block',
                label: blockTypeLabelMap[pressedBlock.type],
                canStripSymbols: Boolean(pressedBlock.autoFormatSymbol),
              });
            }
          }, 420),
        };
      }
    }

    if (
      !startedFormatLongPress &&
      (e.pointerType === 'pen' ||
        (e.pointerType === 'touch' && (!fingerPanOnly || activeTool === 'text')))
    ) {
      clearLongPress();
      const cx = e.clientX;
      const cy = e.clientY;
      const tgt = e.target;
      longPressRef.current = {
        startX: cx,
        startY: cy,
        pointerId: e.pointerId,
        timer: window.setTimeout(() => {
          const activeDraw = drawingRef.current;
          const totalMoved = activeDraw
            ? Math.hypot(
                (activeDraw.points[activeDraw.points.length - 1]?.x ?? pt.x) - activeDraw.points[0]?.x,
                (activeDraw.points[activeDraw.points.length - 1]?.y ?? pt.y) - activeDraw.points[0]?.y
              )
            : 0;
          if (!activeDraw || totalMoved < 8) {
            if (activeDraw) {
              if (activeDraw.snapTimer) window.clearTimeout(activeDraw.snapTimer);
              drawingRef.current = null;
              redrawAllCanvases();
            }
            triggerContextMenuAt(cx, cy, pt.x, pt.y, tgt);
          }
        }, 450),
      };
    }

    if (!shouldPointerDraw(e.pointerType)) {
      return;
    }

    // Stylus strictly executes the active tool (no auto-override from text to pen)
    const effectiveTool: ToolType = activeTool;

    if (effectiveTool === 'shape') {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      if (selectedStrokeIds.length > 0) onSelectStrokes([]);
      const initial = createShapeFromDrag(selectedInsertShape, pt, { x: pt.x + 2, y: pt.y + 2 });
      shapeDragRef.current = {
        active: true,
        pointerId: e.pointerId,
        kind: selectedInsertShape,
        startPt: pt,
        shapeMeta: initial.shapeMeta,
        points: initial.points,
      };
      redrawAllCanvases();
      return;
    }

    if (effectiveTool === 'pen' || effectiveTool === 'fountain' || effectiveTool === 'highlighter') {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      if (selectedStrokeIds.length > 0) onSelectStrokes([]);

      const initialPt: StrokePoint = {
        x: pt.x,
        y: pt.y,
        pressure: e.pressure > 0 ? e.pressure : 0.5,
        timestamp: Date.now(),
      };
      drawingRef.current = {
        active: true,
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        tool: effectiveTool === 'highlighter' ? 'highlighter' : 'pen',
        nibStyle: effectiveTool === 'fountain' ? 'fountain' : undefined,
        points: [initialPt],
        snappedMeta: null,
        quietAnchor: { x: pt.x, y: pt.y },
        snapTimer: null,
      };
      scheduleSnapCheck();
      redrawAllCanvases();
      return;
    }

    if (effectiveTool === 'eraser') {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      eraserDirtyRef.current = {
        active: true,
        pointerId: e.pointerId,
        workingStrokes: [...page.strokes],
      };
      onEraserScrubMove?.(e.clientX, e.clientY);
      performEraseAt(pt.x, pt.y);
      return;
    }

    if (effectiveTool === 'lasso') {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const selBox = getSelectionBoundingBox();
      if (
        selBox &&
        pt.x >= selBox.minX - 8 &&
        pt.x <= selBox.maxX + 8 &&
        pt.y >= selBox.minY - 8 &&
        pt.y <= selBox.maxY + 8
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
      redrawAllCanvases();
    }
  };

  const performEraseAt = (x: number, y: number) => {
    const working = eraserDirtyRef.current.workingStrokes;
    if (!working) return;
    const radius = eraserSize;
    if (eraserMode === 'stroke') {
      const remaining = working.filter((s) => !isPointNearStroke(x, y, s, radius, getStrokeYOffset(s)));
      if (remaining.length !== working.length) {
        eraserDirtyRef.current.workingStrokes = remaining;
        redrawAllCanvases(remaining);
      }
    } else {
      const { updated, changed } = applyPrecisionEraser(working, x, y, radius, getStrokeYOffset);
      if (changed) {
        eraserDirtyRef.current.workingStrokes = updated;
        redrawAllCanvases(updated);
      }
    }
  };

  const handleSheetPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'pen') {
      notifyStylusPointerEvent(e.nativeEvent);
      onStylusDetected?.();
    }
    if (e.pointerType === 'touch' && activeTouchesRef.current.size >= 2) {
      return;
    }

    if (longPressRef.current.timer && e.pointerId === longPressRef.current.pointerId) {
      if (Math.hypot(e.clientX - longPressRef.current.startX, e.clientY - longPressRef.current.startY) > 6) {
        clearLongPress();
      }
    }
    if (formatLongPressRef.current.timer && e.pointerId === formatLongPressRef.current.pointerId) {
      if (
        Math.hypot(
          e.clientX - formatLongPressRef.current.startX,
          e.clientY - formatLongPressRef.current.startY
        ) > 8
      ) {
        clearLongPress();
      }
    }

    const pt = toCanvasPoint(e);

    if (shapeDragRef.current?.active && shapeDragRef.current.pointerId === e.pointerId) {
      const sDrag = shapeDragRef.current;
      const res = createShapeFromDrag(sDrag.kind, sDrag.startPt, pt);
      sDrag.shapeMeta = res.shapeMeta;
      sDrag.points = res.points;
      redrawAllCanvases();
      return;
    }

    if (drawingRef.current?.active && drawingRef.current.pointerId === e.pointerId) {
      const session = drawingRef.current;
      if (session.snappedMeta) {
        const resized = resizeSnappedShapeLive(session.snappedMeta, pt);
        session.snappedMeta = resized.shapeMeta;
        session.points = resized.points;
        redrawAllCanvases();
        return;
      }

      const last = session.points[session.points.length - 1];
      if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) >= 1.5) {
        session.points.push({
          x: pt.x,
          y: pt.y,
          pressure: e.pressure > 0 ? e.pressure : 0.5,
          timestamp: Date.now(),
        });
      }

      if (Math.hypot(pt.x - session.quietAnchor.x, pt.y - session.quietAnchor.y) >= 6) {
        session.quietAnchor = { x: pt.x, y: pt.y };
        scheduleSnapCheck();
      }
      redrawAllCanvases();
      return;
    }

    if (eraserDirtyRef.current.active && eraserDirtyRef.current.pointerId === e.pointerId) {
      onEraserScrubMove?.(e.clientX, e.clientY);
      performEraseAt(pt.x, pt.y);
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
      redrawAllCanvases();
    }
  };

  const commitAnchoredStroke = (
    rawPts: StrokePoint[],
    tool: 'pen' | 'highlighter',
    width: number,
    shapeMeta?: RecognizedShapeMeta,
    nibStyle?: 'standard' | 'fountain'
  ) => {
    const minY = Math.min(...rawPts.map((p) => p.y));
    const { blockId, blockTop } = findNearestBlock(minY);
    const anchorDy = minY - blockTop;

    const relPoints = rawPts.map((p) => ({
      ...p,
      y: p.y - blockTop,
    }));
    const relMeta = shapeMeta
      ? {
          ...shapeMeta,
          y1: shapeMeta.y1 !== undefined ? shapeMeta.y1 - blockTop : undefined,
          y2: shapeMeta.y2 !== undefined ? shapeMeta.y2 - blockTop : undefined,
          cy: shapeMeta.cy !== undefined ? shapeMeta.cy - blockTop : undefined,
          vertices: shapeMeta.vertices?.map((v) => ({ x: v.x, y: v.y - blockTop })),
        }
      : undefined;

    const newStroke: Stroke = {
      id: `st_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      tool,
      ...(nibStyle ? { nibStyle } : {}),
      color: activeColor,
      width,
      points: relPoints,
      anchorBlockId: blockId,
      anchorDy,
      shapeMeta: relMeta,
    };

    onCommitStrokes([...page.strokes, newStroke]);
  };

  const handleSheetPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'pen') {
      notifyStylusPointerEvent(e.nativeEvent);
    }
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
      const pt = toCanvasPoint(e);
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
      commitAnchoredStroke(finalShape.points, 'pen', penWidth, finalShape.shapeMeta);
      return;
    }

    if (drawingRef.current?.active && drawingRef.current.pointerId === e.pointerId) {
      const session = drawingRef.current;
      if (session.snapTimer) window.clearTimeout(session.snapTimer);
      drawingRef.current = null;

      let finalPoints = session.points;
      if (session.tool === 'highlighter' && !session.snappedMeta) {
        finalPoints = maybeStraightenHighlighter(finalPoints);
      }

      commitAnchoredStroke(
        finalPoints,
        session.tool,
        session.tool === 'highlighter' ? highlighterWidth : penWidth,
        session.snappedMeta ?? undefined,
        session.nibStyle
      );
      return;
    }

    if (eraserDirtyRef.current.active && eraserDirtyRef.current.pointerId === e.pointerId) {
      const working = eraserDirtyRef.current.workingStrokes;
      eraserDirtyRef.current = { active: false, pointerId: -1, workingStrokes: null };
      onEraserScrubEnd?.();
      if (working && JSON.stringify(working) !== JSON.stringify(page.strokes)) {
        onCommitStrokes(working);
      }
      return;
    }

    if (lassoRef.current && lassoRef.current.pointerId === e.pointerId) {
      const lasso = lassoRef.current;
      lassoRef.current = null;

      if (lasso.mode === 'drag') {
        const { dx, dy } = lasso.dragDelta;
        if (Math.hypot(dx, dy) > 1) {
          const updatedStrokes = page.strokes.map((s) => {
            if (!selectedStrokeIds.includes(s.id)) return s;
            const currentBlockTop = getStrokeYOffset(s);
            const absShifted = translateStroke(s, dx, dy + currentBlockTop);
            const minAbsY = Math.min(...absShifted.points.map((p) => p.y));
            const { blockId, blockTop } = findNearestBlock(minAbsY);
            return {
              ...translateStroke(absShifted, 0, -blockTop),
              anchorBlockId: blockId,
              anchorDy: minAbsY - blockTop,
            };
          });
          onCommitStrokes(updatedStrokes);
        } else {
          redrawAllCanvases();
        }
      } else {
        const picked = page.strokes
          .filter((s) => isStrokeSelectedByLasso(s, lasso.polygon, getStrokeYOffset(s)))
          .map((s) => s.id);
        onSelectStrokes(picked);
        redrawAllCanvases();
      }
    }
  };

  const handleBlockChange = (
    block: TextBlock,
    value: string,
    nextSpans?: TextFontSpan[],
    nextColorSpans?: TextColorSpan[],
    nextStyleSpans?: TextStyleSpan[],
    cursorOffset?: number
  ) => {
    setFormatUndoBubble(null);
    const normalizedValue = value.replace(/\u00A0/g, ' ').replace(/\u200B/g, '');
    const prevContent = (block.content || '').replace(/\u00A0/g, ' ').replace(/\u200B/g, '');
    let nextType = block.type;
    let nextContent = normalizedValue;
    let nextChecked = block.checked;
    let nextAutoSymbol = block.autoFormatSymbol;
    let adjustedSpans = nextSpans;
    let adjustedColorSpans = nextColorSpans;
    let adjustedStyleSpans = nextStyleSpans;
    let nextCursor = cursorOffset;
    let blockRuleApplied = false;

    const shiftFontSpans = (trimLen: number) =>
      adjustedSpans
        ?.map((sp) => ({ ...sp, start: sp.start - trimLen, end: sp.end - trimLen }))
        .filter((sp) => sp.end > 0);

    const shiftColorSpans = (trimLen: number) =>
      adjustedColorSpans
        ?.map((sp) => ({ ...sp, start: sp.start - trimLen, end: sp.end - trimLen }))
        .filter((sp) => sp.end > 0);

    const shiftStyleSpans = (trimLen: number) =>
      adjustedStyleSpans
        ?.map((sp) => ({ ...sp, start: sp.start - trimLen, end: sp.end - trimLen }))
        .filter((sp) => sp.end > 0);

    if (block.type === 'paragraph') {
      const prefixRules: Array<{
        prefix: string;
        type: TextBlock['type'];
        checked?: boolean;
      }> = [
        { prefix: '- [ ] ', type: 'todo', checked: false },
        { prefix: '- [] ', type: 'todo', checked: false },
        { prefix: '-[ ] ', type: 'todo', checked: false },
        { prefix: '-[] ', type: 'todo', checked: false },
        { prefix: '- [x] ', type: 'todo', checked: true },
        { prefix: '- [X] ', type: 'todo', checked: true },
        { prefix: '[ ] ', type: 'todo', checked: false },
        { prefix: '[x] ', type: 'todo', checked: true },
        { prefix: '[X] ', type: 'todo', checked: true },
        { prefix: '[] ', type: 'todo', checked: false },
        { prefix: '### ', type: 'h2' },
        { prefix: '## ', type: 'h2' },
        { prefix: '# ', type: 'h1' },
        { prefix: '- ', type: 'bullet' },
        { prefix: '* ', type: 'bullet' },
        { prefix: '``` ', type: 'code' },
        { prefix: '```', type: 'code' },
      ];

      const matched = prefixRules.find(
        (r) => normalizedValue.startsWith(r.prefix) && !prevContent.startsWith(r.prefix)
      );
      if (matched) {
        const trimLen = matched.prefix.length;
        nextType = matched.type;
        nextChecked = matched.checked;
        nextAutoSymbol = matched.prefix;
        nextContent = normalizedValue.slice(trimLen);
        adjustedSpans = shiftFontSpans(trimLen);
        adjustedColorSpans = shiftColorSpans(trimLen);
        adjustedStyleSpans = shiftStyleSpans(trimLen);
        blockRuleApplied = true;
        nextCursor = nextCursor !== undefined ? Math.max(0, nextCursor - trimLen) : 0;
      }
    } else if (block.type === 'bullet') {
      // Allow typing "- [ ] " or "- [] " character-by-character ("- " -> bullet, then "[ ] " / "[] " -> todo checklist)
      const todoUpgrades: Array<{ prefix: string; symbol: string; checked: boolean }> = [
        { prefix: '[ ] ', symbol: `${block.autoFormatSymbol || '- '}[ ] `, checked: false },
        { prefix: '[x] ', symbol: `${block.autoFormatSymbol || '- '}[x] `, checked: true },
        { prefix: '[X] ', symbol: `${block.autoFormatSymbol || '- '}[X] `, checked: true },
        { prefix: '[] ', symbol: `${block.autoFormatSymbol || '- '}[] `, checked: false },
      ];
      const upgrade = todoUpgrades.find(
        (r) => normalizedValue.startsWith(r.prefix) && !prevContent.startsWith(r.prefix)
      );
      if (upgrade) {
        const trimLen = upgrade.prefix.length;
        nextType = 'todo';
        nextChecked = upgrade.checked;
        nextAutoSymbol = upgrade.symbol;
        nextContent = normalizedValue.slice(trimLen);
        adjustedSpans = shiftFontSpans(trimLen);
        adjustedColorSpans = shiftColorSpans(trimLen);
        adjustedStyleSpans = shiftStyleSpans(trimLen);
        blockRuleApplied = true;
        nextCursor = nextCursor !== undefined ? Math.max(0, nextCursor - trimLen) : 0;
      }
    } else if (block.type === 'h1') {
      // Allow typing "## " character-by-character ("# " -> h1, then "# " -> h2)
      if (normalizedValue.startsWith('# ') && !prevContent.startsWith('# ')) {
        nextType = 'h2';
        nextAutoSymbol = '## ';
        nextContent = normalizedValue.slice(2);
        adjustedSpans = shiftFontSpans(2);
        adjustedColorSpans = shiftColorSpans(2);
        adjustedStyleSpans = shiftStyleSpans(2);
        blockRuleApplied = true;
        nextCursor = nextCursor !== undefined ? Math.max(0, nextCursor - 2) : 0;
      }
    }

    // Inline symbol auto-formatting (**bold**, __bold__, *italic*, _italic_, `code`, ~~strike~~)
    let inlineConvertedOffset: number | null = null;
    if (!blockRuleApplied && nextType !== 'code' && nextContent.length >= 3) {
      const cur = Math.min(nextContent.length, nextCursor ?? nextContent.length);
      const beforeCursor = nextContent.slice(0, cur);
      const inlineRules: Array<{
        regex: RegExp;
        wrap: string;
        styleFlag: 'bold' | 'italic' | 'code' | 'strike';
        requireNonEmptyTrim?: boolean;
      }> = [
        { regex: /(^|[^*])\*\*([^\s*](?:[^*\n]*?[^\s*])?)\*\*$/, wrap: '**', styleFlag: 'bold' },
        { regex: /(^|[^_])__([^\s_](?:[^_\n]*?[^\s_])?)__$/, wrap: '__', styleFlag: 'bold' },
        { regex: /(^|[^~])~~([^\s~](?:[^~\n]*?[^\s~])?)~~$/, wrap: '~~', styleFlag: 'strike' },
        {
          regex: /(^|[^`])`([^`\n]+?)`$/,
          wrap: '`',
          styleFlag: 'code',
          requireNonEmptyTrim: true,
        },
        { regex: /(^|[^*\w])\*([^\s*](?:[^*\n]*?[^\s*])?)\*$/, wrap: '*', styleFlag: 'italic' },
        { regex: /(^|[^_\w])_([^\s_](?:[^_\n]*?[^\s_])?)_$/, wrap: '_', styleFlag: 'italic' },
      ];

      for (const rule of inlineRules) {
        const m = rule.regex.exec(beforeCursor);
        if (!m) continue;
        const prefixBoundary = m[1] || '';
        const inner = m[2];
        if (rule.requireNonEmptyTrim && inner.trim().length === 0) continue;

        const matchStart = m.index + prefixBoundary.length;
        const wrapLen = rule.wrap.length;
        const innerStart = matchStart + wrapLen;
        const innerEnd = cur - wrapLen;
        const innerLen = inner.length;

        const mapPos = (pos: number): number => {
          if (pos <= matchStart) return pos;
          if (pos <= innerStart) return matchStart;
          if (pos <= innerEnd) return pos - wrapLen;
          if (pos <= cur) return matchStart + innerLen;
          return pos - wrapLen * 2;
        };

        nextContent = nextContent.slice(0, matchStart) + inner + nextContent.slice(cur);
        adjustedSpans = adjustedSpans
          ?.map((sp) => ({ ...sp, start: mapPos(sp.start), end: mapPos(sp.end) }))
          .filter((sp) => sp.end > sp.start);
        adjustedColorSpans = adjustedColorSpans
          ?.map((sp) => ({ ...sp, start: mapPos(sp.start), end: mapPos(sp.end) }))
          .filter((sp) => sp.end > sp.start);
        const remappedStyles = (adjustedStyleSpans || [])
          .map((sp) => ({ ...sp, start: mapPos(sp.start), end: mapPos(sp.end) }))
          .filter((sp) => sp.end > sp.start);

        const newStyleSpan: TextStyleSpan = {
          start: matchStart,
          end: matchStart + innerLen,
          [rule.styleFlag]: true,
          rawWrap: rule.wrap,
        };
        const mergedStyles = normalizeStyleSpans(
          [...remappedStyles, newStyleSpan],
          nextContent.length
        );
        adjustedStyleSpans = mergedStyles.length > 0 ? mergedStyles : undefined;
        inlineConvertedOffset = matchStart + innerLen;
        break;
      }
    }

    onChangeBlocks(
      page.blocks.map((b) =>
        b.id === block.id
          ? {
              ...b,
              type: nextType,
              content: nextContent,
              checked: nextChecked,
              autoFormatSymbol: nextAutoSymbol,
              fontSpans: adjustedSpans && adjustedSpans.length > 0 ? adjustedSpans : undefined,
              colorSpans:
                adjustedColorSpans && adjustedColorSpans.length > 0 ? adjustedColorSpans : undefined,
              styleSpans:
                adjustedStyleSpans && adjustedStyleSpans.length > 0 ? adjustedStyleSpans : undefined,
            }
          : b
      )
    );

    if (inlineConvertedOffset !== null) {
      setFocusRequest({ blockId: block.id, offset: inlineConvertedOffset });
    } else if (blockRuleApplied) {
      setFocusRequest({ blockId: block.id, offset: nextCursor ?? 0 });
    }
  };

  const handleUndoBlockFormatting = (blockId: string, mode: 'restore-symbols' | 'plain') => {
    const target = page.blocks.find((b) => b.id === blockId);
    if (!target) return;
    const prefix = mode === 'restore-symbols' && target.autoFormatSymbol ? target.autoFormatSymbol : '';
    const pLen = prefix.length;
    const nextContent = prefix + target.content;
    const shiftedFont = target.fontSpans?.map((sp) => ({
      ...sp,
      start: sp.start + pLen,
      end: sp.end + pLen,
    }));
    const shiftedColor = target.colorSpans?.map((sp) => ({
      ...sp,
      start: sp.start + pLen,
      end: sp.end + pLen,
    }));
    const shiftedStyle = target.styleSpans?.map((sp) => ({
      ...sp,
      start: sp.start + pLen,
      end: sp.end + pLen,
    }));

    onChangeBlocks(
      page.blocks.map((b) =>
        b.id === blockId
          ? {
              ...b,
              type: 'paragraph',
              checked: undefined,
              autoFormatSymbol: undefined,
              content: nextContent,
              fontSpans: shiftedFont && shiftedFont.length > 0 ? shiftedFont : undefined,
              colorSpans: shiftedColor && shiftedColor.length > 0 ? shiftedColor : undefined,
              styleSpans: shiftedStyle && shiftedStyle.length > 0 ? shiftedStyle : undefined,
            }
          : b
      )
    );
    setFormatUndoBubble(null);
    setFocusRequest({ blockId, offset: nextContent.length });
  };

  const handleUndoSpanFormatting = (
    blockId: string,
    spanRange: { start: number; end: number },
    mode: 'restore-symbols' | 'plain'
  ) => {
    const target = page.blocks.find((b) => b.id === blockId);
    if (!target || !target.styleSpans?.length) return;
    const matched =
      target.styleSpans.find((sp) => sp.start === spanRange.start && sp.end === spanRange.end) ||
      target.styleSpans.find((sp) => sp.start <= spanRange.start && sp.end >= spanRange.end) ||
      target.styleSpans.find((sp) => sp.start < spanRange.end && sp.end > spanRange.start);
    if (!matched) return;

    const remainingStyles = target.styleSpans.filter((sp) => sp !== matched);
    const wrap = mode === 'restore-symbols' && matched.rawWrap ? matched.rawWrap : '';
    const wLen = wrap.length;

    if (wLen > 0) {
      const s = matched.start;
      const e = matched.end;
      const nextContent =
        target.content.slice(0, s) +
        wrap +
        target.content.slice(s, e) +
        wrap +
        target.content.slice(e);

      const shiftSpan = <T extends { start: number; end: number }>(sp: T): T => {
        const nextStart = sp.start < s ? sp.start : sp.start <= e ? sp.start + wLen : sp.start + wLen * 2;
        const nextEnd = sp.end <= s ? sp.end : sp.end <= e ? sp.end + wLen : sp.end + wLen * 2;
        return { ...sp, start: nextStart, end: nextEnd };
      };

      const nextFont = target.fontSpans?.map(shiftSpan);
      const nextColor = target.colorSpans?.map(shiftSpan);
      const nextStyles = normalizeStyleSpans(remainingStyles.map(shiftSpan), nextContent.length);

      onChangeBlocks(
        page.blocks.map((b) =>
          b.id === blockId
            ? {
                ...b,
                content: nextContent,
                fontSpans: nextFont && nextFont.length > 0 ? nextFont : undefined,
                colorSpans: nextColor && nextColor.length > 0 ? nextColor : undefined,
                styleSpans: nextStyles.length > 0 ? nextStyles : undefined,
              }
            : b
        )
      );
      setFormatUndoBubble(null);
      setFocusRequest({ blockId, offset: e + wLen * 2 });
    } else {
      const nextStyles = normalizeStyleSpans(remainingStyles, target.content.length);
      onChangeBlocks(
        page.blocks.map((b) =>
          b.id === blockId
            ? {
                ...b,
                styleSpans: nextStyles.length > 0 ? nextStyles : undefined,
              }
            : b
        )
      );
      setFormatUndoBubble(null);
      setFocusRequest({ blockId, offset: matched.end });
    }
  };

  const handleBlockKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    block: TextBlock,
    idx: number,
    cursorOffset: number
  ) => {
    setFormatUndoBubble(null);
    if (e.key === 'Enter' && !e.shiftKey && block.type !== 'code') {
      e.preventDefault();
      if ((block.type === 'bullet' || block.type === 'todo') && block.content.trim() === '') {
        onChangeBlocks(
          page.blocks.map((b) =>
            b.id === block.id
              ? { ...b, type: 'paragraph', checked: undefined, autoFormatSymbol: undefined }
              : b
          )
        );
        return;
      }

      const before = block.content.slice(0, cursorOffset);
      const after = block.content.slice(cursorOffset);
      const beforeSpans = block.fontSpans
        ?.filter((sp) => sp.start < cursorOffset)
        .map((sp) => ({ ...sp, end: Math.min(sp.end, cursorOffset) }));
      const afterSpans = block.fontSpans
        ?.filter((sp) => sp.end > cursorOffset)
        .map((sp) => ({
          ...sp,
          start: Math.max(0, sp.start - cursorOffset),
          end: sp.end - cursorOffset,
        }));
      const beforeColorSpans = block.colorSpans
        ?.filter((sp) => sp.start < cursorOffset)
        .map((sp) => ({ ...sp, end: Math.min(sp.end, cursorOffset) }));
      const afterColorSpans = block.colorSpans
        ?.filter((sp) => sp.end > cursorOffset)
        .map((sp) => ({
          ...sp,
          start: Math.max(0, sp.start - cursorOffset),
          end: sp.end - cursorOffset,
        }));
      const beforeStyleSpans = block.styleSpans
        ?.filter((sp) => sp.start < cursorOffset)
        .map((sp) => ({ ...sp, end: Math.min(sp.end, cursorOffset) }));
      const afterStyleSpans = block.styleSpans
        ?.filter((sp) => sp.end > cursorOffset)
        .map((sp) => ({
          ...sp,
          start: Math.max(0, sp.start - cursorOffset),
          end: sp.end - cursorOffset,
        }));

      const newId = `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const nextType: TextBlock['type'] =
        block.type === 'bullet' || block.type === 'todo' ? block.type : 'paragraph';
      const newBlock: TextBlock = {
        id: newId,
        type: nextType,
        content: after,
        checked: nextType === 'todo' ? false : undefined,
        fontFamily: block.fontFamily,
        fontSpans: afterSpans && afterSpans.length > 0 ? afterSpans : undefined,
        color: block.color,
        colorSpans: afterColorSpans && afterColorSpans.length > 0 ? afterColorSpans : undefined,
        styleSpans: afterStyleSpans && afterStyleSpans.length > 0 ? afterStyleSpans : undefined,
      };
      const updated = page.blocks.map((b) =>
        b.id === block.id
          ? {
              ...b,
              content: before,
              fontSpans: beforeSpans && beforeSpans.length > 0 ? beforeSpans : undefined,
              colorSpans: beforeColorSpans && beforeColorSpans.length > 0 ? beforeColorSpans : undefined,
              styleSpans: beforeStyleSpans && beforeStyleSpans.length > 0 ? beforeStyleSpans : undefined,
            }
          : b
      );
      updated.splice(idx + 1, 0, newBlock);
      onChangeBlocks(updated);
      setFocusRequest({ blockId: newId, offset: 0 });
      return;
    }

    if (e.key === 'Backspace' && cursorOffset === 0) {
      if (block.content === '' && block.type !== 'paragraph') {
        e.preventDefault();
        onChangeBlocks(
          page.blocks.map((b) =>
            b.id === block.id
              ? { ...b, type: 'paragraph', checked: undefined, autoFormatSymbol: undefined }
              : b
          )
        );
        return;
      }
      if (idx > 0) {
        e.preventDefault();
        const prev = page.blocks[idx - 1];
        const prevLen = prev.content.length;
        const mergedSpans: TextFontSpan[] = [
          ...(prev.fontSpans || []),
          ...(block.fontSpans || []).map((sp) => ({
            ...sp,
            start: sp.start + prevLen,
            end: sp.end + prevLen,
          })),
        ];
        const mergedColorSpans: TextColorSpan[] = [
          ...(prev.colorSpans || []),
          ...(block.colorSpans || []).map((sp) => ({
            ...sp,
            start: sp.start + prevLen,
            end: sp.end + prevLen,
          })),
        ];
        const mergedStyleSpans: TextStyleSpan[] = [
          ...(prev.styleSpans || []),
          ...(block.styleSpans || []).map((sp) => ({
            ...sp,
            start: sp.start + prevLen,
            end: sp.end + prevLen,
          })),
        ];
        const updated = page.blocks
          .filter((b) => b.id !== block.id)
          .map((b) =>
            b.id === prev.id
              ? {
                  ...b,
                  content: prev.content + block.content,
                  fontSpans: mergedSpans.length > 0 ? mergedSpans : undefined,
                  colorSpans: mergedColorSpans.length > 0 ? mergedColorSpans : undefined,
                  styleSpans: mergedStyleSpans.length > 0 ? mergedStyleSpans : undefined,
                }
              : b
          );
        onChangeBlocks(updated);
        setFocusRequest({ blockId: prev.id, offset: prevLen });
      }
    }
  };

  const addEmptyBlockAtEnd = () => {
    const newId = `b_${Date.now()}`;
    const lastBlock = page.blocks[page.blocks.length - 1];
    onChangeBlocks([
      ...page.blocks,
      {
        id: newId,
        type: 'paragraph',
        content: '',
        fontFamily: lastBlock?.fontFamily,
        color: lastBlock?.color,
      },
    ]);
    setFocusRequest({ blockId: newId, offset: 0 });
  };

  const paperClass =
    paperStyle === 'grid'
      ? 'paper-grid'
      : paperStyle === 'lined'
        ? 'paper-lined'
        : paperStyle === 'dotted'
          ? 'paper-dotted'
          : 'paper-blank';

  const bodySizeClass = isSmartphone
    ? textSizeScale === 'small'
      ? 'text-[16.5px] leading-[1.68]'
      : textSizeScale === 'large'
        ? 'text-[19px] leading-[1.72]'
        : 'text-[17.5px] leading-[1.7]'
    : textSizeScale === 'small'
      ? 'text-[14px] leading-relaxed'
      : textSizeScale === 'large'
        ? 'text-[17px] leading-relaxed'
        : 'text-[15px] leading-relaxed';

  const isTextInteractive = activeTool === 'text';
  const isCanvasInteractive = activeTool !== 'text' && activeTool !== 'pan';
  const useCustomToolCursor = isDynamicCursorTool(activeTool);
  const touchActionRule = activeTool === 'text' && !fingerPanOnly ? 'pan-y' : 'none';

  return (
    <div className="space-y-1.5">
      {totalPages > 1 && (
        <div
          style={{ width: sheetSize.width * zoom }}
          className="mx-auto flex items-center justify-between px-1 text-[11px] text-[#8E8E93] tabular-nums no-print"
        >
          <span>
            Pagina {pageIndex + 1} di {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <span>
              {page.strokes.length} {page.strokes.length === 1 ? 'tratto' : 'tratti'}
            </span>
            <button
              type="button"
              onClick={() => onDeletePage(page.id)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full ios-control-bg text-[11px] font-medium text-[#9A463D] dark:text-[#E07A6E] hover:bg-[#9A463D]/15"
              title={`Elimina Pagina ${pageIndex + 1}`}
              aria-label={`Elimina Pagina ${pageIndex + 1}`}
            >
              <Trash2 className="w-3 h-3" />
              <span>Elimina pagina</span>
            </button>
          </div>
        </div>
      )}

      {/* Zoom Layout Box */}
      <div
        style={{
          width: sheetSize.width * zoom,
          height: sheetSize.height * zoom,
        }}
        className="mx-auto relative print-container"
      >
        <div
          ref={sheetRef}
          data-hybrid-page-id={page.id}
          style={{
            width: sheetLogicalWidth,
            minHeight: sheetMinLogicalHeight,
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            touchAction: touchActionRule,
          }}
          onPointerDown={handleSheetPointerDown}
          onPointerMove={(e) => {
            onSheetCursorMove?.(e.clientX, e.clientY, e.pointerType);
            handleSheetPointerMove(e);
          }}
          onPointerLeave={() => {
            onSheetCursorLeave?.();
          }}
          onPointerUp={handleSheetPointerUp}
          onPointerCancel={handleSheetPointerUp}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (Date.now() - lastFormatBubbleShownAtRef.current < 480) {
              return;
            }
            const pt = toCanvasPoint(e.nativeEvent);
            triggerContextMenuAt(e.clientX, e.clientY, pt.x, pt.y, e.target);
          }}
          className={`relative rounded-2xl border border-[#3C3C43]/12 dark:border-white/10 shadow-xs overflow-hidden print-container ${paperClass} ${
            ivoryPaper ? 'paper-ivory' : ''
          } ${
            !isTextInteractive ? 'no-ios-select' : ''
          } ${useCustomToolCursor ? 'cursor-none' : ''}`}
        >
          {/* Layer 1: Smart Highlighter */}
          <canvas
            ref={highlighterCanvasRef}
            style={{ mixBlendMode: isDarkTheme ? 'screen' : 'multiply' }}
            className="absolute inset-0 w-full h-full pointer-events-none no-ios-select z-10"
          />

          {/* Layer 1.5: In-Document Search Match Highlights */}
          {searchHighlightRects.length > 0 && (
            <div className="absolute inset-0 z-[15] pointer-events-none no-print">
              {searchHighlightRects.map((rect, idx) => (
                <div
                  key={`${rect.matchId}_${idx}`}
                  ref={rect.isActive ? activeSearchHighlightRef : undefined}
                  data-active-search-highlight={rect.isActive ? 'true' : undefined}
                  style={{
                    left: rect.x,
                    top: rect.y,
                    width: rect.width,
                    height: rect.height,
                  }}
                  className={`absolute rounded-[4px] transition-colors ${
                    rect.isActive
                      ? 'bg-neutral-900/24 dark:bg-white/30 ring-[1.5px] ring-neutral-900/80 dark:ring-white/90'
                      : 'bg-neutral-900/12 dark:bg-white/18'
                  }`}
                />
              ))}
            </div>
          )}

          {/* Layer 2: Editable Text Blocks (per-line & per-selection fonts) */}
          <div
            className={`relative z-20 ${
              isSmartphone ? 'px-5 py-6 space-y-3' : 'px-6 sm:px-12 py-8 sm:py-10 space-y-2.5'
            } ${!isTextInteractive ? 'pointer-events-none no-ios-select' : ''}`}
          >
            {pageIndex === 0 && (
              <input
                ref={titleInputRef}
                type="text"
                data-note-title="true"
                readOnly={!isTextInteractive}
                tabIndex={!isTextInteractive ? -1 : undefined}
                value={noteTitle}
                onChange={(e) => onChangeTitle(e.target.value)}
                placeholder="Titolo del quaderno"
                className={`w-full bg-transparent ${
                  isSmartphone ? 'text-[25px] leading-snug' : 'text-2xl sm:text-3xl'
                } font-semibold tracking-tight text-[#1C1C1E] dark:text-[#F5F5F7] placeholder-[#8E8E93]/60 focus:outline-none pb-2 ${
                  isTextInteractive ? 'select-text' : 'no-ios-select'
                }`}
              />
            )}

            <div className={isSmartphone ? 'space-y-3' : 'space-y-2'}>
              {page.blocks.map((block, idx) => (
                <div
                  key={block.id}
                  data-hybrid-block-row={block.id}
                  ref={(el) => {
                    blockRefs.current[block.id] = el;
                  }}
                  className="flex items-start gap-2.5"
                >
                  {block.type === 'bullet' && (
                    <span
                      className={`${
                        isSmartphone ? 'mt-3 w-2 h-2' : 'mt-2.5 w-1.5 h-1.5'
                      } rounded-full bg-[#48484A] dark:bg-[#A1A1A6] shrink-0`}
                    />
                  )}

                  {block.type === 'todo' && (
                    <button
                      type="button"
                      onClick={() =>
                        onChangeBlocks(
                          page.blocks.map((b) => (b.id === block.id ? { ...b, checked: !b.checked } : b))
                        )
                      }
                      className={`${
                        isSmartphone ? 'mt-1.5 w-[21px] h-[21px]' : 'mt-1 w-[18px] h-[18px]'
                      } rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                        block.checked
                          ? 'bg-[#1C1C1E] dark:bg-[#F5F5F7] border-[#1C1C1E] dark:border-[#F5F5F7] text-[#FBFBFD] dark:text-[#1C1C1E]'
                          : 'border-[#8E8E93] bg-transparent hover:border-[#1C1C1E] dark:hover:border-[#F5F5F7]'
                      }`}
                      aria-label={block.checked ? 'Segna come da fare' : 'Segna come completato'}
                    >
                      {block.checked && <Check className="w-3 h-3" strokeWidth={2.5} />}
                    </button>
                  )}

                  <RichTextBlock
                    block={block}
                    defaultFont={defaultFont}
                    disabled={!isTextInteractive}
                    registerEl={(el) => {
                      editableRefs.current[block.id] = el;
                    }}
                    placeholder={
                      pageIndex === 0 && idx === 0
                        ? isSmartphone
                          ? 'Scrivi qui…'
                          : 'Scrivi qui (# Titolo, - Elenco, - [ ] Checklist, **grassetto**, ``` Codice)…'
                        : ''
                    }
                    onChange={(content, spans, colorSpans, styleSpans, cursorOffset) =>
                      handleBlockChange(block, content, spans, colorSpans, styleSpans, cursorOffset)
                    }
                    onKeyDown={(e, offset) => handleBlockKeyDown(e, block, idx, offset)}
                    onSelectionChange={(start, end, activeFont, activeTextColor) =>
                      onActiveTextSelectionChange({
                        pageId: page.id,
                        blockId: block.id,
                        start,
                        end,
                        fontFamily: activeFont,
                        color: activeTextColor,
                      })
                    }
                    className={
                      block.type === 'h1'
                        ? isSmartphone
                          ? 'text-[22px] font-semibold text-[#1C1C1E] dark:text-[#F5F5F7] leading-snug pt-2 min-h-[1.5em]'
                          : 'text-xl sm:text-2xl font-semibold text-[#1C1C1E] dark:text-[#F5F5F7] leading-snug pt-2 min-h-[1.4em]'
                        : block.type === 'h2'
                          ? isSmartphone
                            ? 'text-[19px] font-semibold text-[#1C1C1E] dark:text-[#F5F5F7] leading-snug pt-1.5 min-h-[1.5em]'
                            : 'text-lg font-semibold text-[#1C1C1E] dark:text-[#F5F5F7] leading-snug pt-1.5 min-h-[1.4em]'
                          : block.type === 'code'
                            ? isSmartphone
                              ? 'text-[15px] text-[#1C1C1E] dark:text-[#F5F5F7] bg-[#787880]/10 dark:bg-white/8 rounded-xl px-3.5 py-2.5 leading-relaxed min-h-[46px]'
                              : 'text-xs sm:text-[13px] text-[#1C1C1E] dark:text-[#F5F5F7] bg-[#787880]/10 dark:bg-white/8 rounded-xl px-3.5 py-2.5 leading-relaxed min-h-[42px]'
                            : block.type === 'todo' && block.checked
                              ? `${bodySizeClass} text-[#8E8E93] line-through min-h-[max(30px,1.7em)]`
                              : `${bodySizeClass} text-[#1C1C1E] dark:text-[#F5F5F7] min-h-[max(30px,1.7em)]`
                    }
                  />
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addEmptyBlockAtEnd}
              tabIndex={isTextInteractive ? 0 : -1}
              aria-hidden={!isTextInteractive}
              className={`mt-4 inline-flex items-center gap-1.5 rounded-full text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7] hover:bg-[#787880]/10 transition-colors no-print ${
                isSmartphone ? 'min-h-[42px] px-4 py-2 text-[15px] font-medium' : 'px-3 py-1.5 text-xs'
              } ${isTextInteractive ? '' : 'opacity-0 pointer-events-none'}`}
            >
              <Plus className={isSmartphone ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
              <span>Aggiungi riga</span>
            </button>
          </div>

          {/* Layer 3: HiDPI Pen Ink + Shapes + Lasso */}
          <canvas
            ref={penCanvasRef}
            className={`absolute inset-0 w-full h-full no-ios-select z-30 ${
              isCanvasInteractive
                ? useCustomToolCursor
                  ? 'cursor-none'
                  : 'cursor-crosshair'
                : 'pointer-events-none'
            }`}
          />

          {/* Hold-to-Snap Confirmation Ring */}
          {snapPulse && (
            <div
              key={snapPulse.id}
              style={{ left: snapPulse.x - 16, top: snapPulse.y - 16 }}
              className="absolute z-40 w-8 h-8 rounded-full border-2 border-[#1C1C1E]/45 dark:border-white/55 pointer-events-none animate-snap-confirm"
            />
          )}
        </div>
      </div>

      {/* Floating Long-Press Undo Formatting Pill */}
      <AnimatePresence>
        {formatUndoBubble && (
          <motion.div
            ref={formatBubbleRef}
            initial={{ opacity: 0, scale: 0.88, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 4 }}
            transition={{ type: 'spring', stiffness: 520, damping: 32, mass: 0.7 }}
            style={{
              left: Math.max(
                10,
                Math.min(
                  (typeof window !== 'undefined' ? window.innerWidth : 1024) - 290,
                  formatUndoBubble.x - 120
                )
              ),
              top: Math.max(
                54,
                Math.min(
                  (typeof window !== 'undefined' ? window.innerHeight : 768) - 70,
                  formatUndoBubble.y - 58
                )
              ),
            }}
            className="fixed z-50 ios-glass rounded-full px-2 py-1.5 flex flex-wrap items-center gap-1 select-none no-print"
            role="dialog"
            aria-label="Annulla formattazione"
          >
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (formatUndoBubble.kind === 'span' && formatUndoBubble.spanRange) {
                  handleUndoSpanFormatting(
                    formatUndoBubble.blockId,
                    formatUndoBubble.spanRange,
                    'restore-symbols'
                  );
                } else {
                  handleUndoBlockFormatting(formatUndoBubble.blockId, 'restore-symbols');
                }
              }}
              className="min-h-[32px] px-3 rounded-full bg-[#1C1C1E] dark:bg-[#F5F5F7] text-[#FBFBFD] dark:text-[#1C1C1E] text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5 whitespace-nowrap"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>{formatUndoBubble.label}</span>
            </button>

            {formatUndoBubble.canStripSymbols && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (formatUndoBubble.kind === 'span' && formatUndoBubble.spanRange) {
                    handleUndoSpanFormatting(
                      formatUndoBubble.blockId,
                      formatUndoBubble.spanRange,
                      'plain'
                    );
                  } else {
                    handleUndoBlockFormatting(formatUndoBubble.blockId, 'plain');
                  }
                }}
                className="min-h-[32px] px-2.5 rounded-full text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#1C1C1E]/10 dark:hover:bg-white/10 transition-colors whitespace-nowrap"
              >
                Solo testo
              </button>
            )}

            {formatUndoBubble.kind === 'span' && formatUndoBubble.alsoBlockLabel && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleUndoBlockFormatting(formatUndoBubble.blockId, 'restore-symbols')}
                className="min-h-[32px] px-2.5 rounded-full text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#1C1C1E]/10 dark:hover:bg-white/10 transition-colors whitespace-nowrap"
              >
                {formatUndoBubble.alsoBlockLabel}
              </button>
            )}

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setFormatUndoBubble(null)}
              aria-label="Chiudi"
              className="w-7 h-7 rounded-full flex items-center justify-center text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7] hover:bg-[#787880]/15 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const HybridEditor: React.FC<HybridEditorProps> = ({
  note,
  zoom,
  activeTool,
  selectedInsertShape,
  eraserMode,
  eraserSize,
  activeColor,
  penWidth,
  highlighterWidth,
  holdToSnap,
  fingerPanOnly = false,
  ivoryPaper = false,
  isSmartphone = false,
  viewportHeight = 800,
  keyboardInsetPx = 0,
  searchMatches = [],
  activeSearchMatchId = null,
  textSizeScale,
  selectedStrokeIds,
  selectedPageId,
  onSelectStrokes,
  onChangeTitle,
  onUpdatePage,
  onAddPage,
  onDeletePage,
  onActiveTextSelectionChange,
  onOpenContextMenu,
  onChangeZoom,
  onZoomWheel,
  onStylusDetected,
  onEraserScrubMove,
  onEraserScrubEnd,
  onSheetCursorMove,
  onSheetCursorLeave,
  onReportLayoutMetrics,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const metricsMapRef = useRef<Record<string, Record<string, { top: number; height: number }>>>({});

  const normalized = normalizeNotePages(note);
  const pages = normalized.pages || [];

  usePinchZoom(scrollContainerRef, zoom, onChangeZoom, onZoomWheel);
  const isHandPanning = useHandPan(scrollContainerRef, {
    panToolActive: activeTool === 'pan',
    fingerPanOnly,
    isTextTool: activeTool === 'text',
  });

  // Reliable document-wide selection tracking for mouse drags, multi-block selections, and keyboard selection
  useEffect(() => {
    const handleSelectionChange = () => {
      const ranges = collectSelectedBlockRangesFromDOM();
      if (ranges.length === 0) return;

      const primary = ranges[0];
      const targetPage = pages.find((p) => p.id === primary.pageId);
      const targetBlock = targetPage?.blocks.find((b) => b.id === primary.blockId);
      if (!targetBlock) return;

      const activeFont = resolveActiveFontAt(
        targetBlock,
        note.fontFamily || 'sans',
        primary.start,
        primary.end
      );
      const activeTextColor = resolveActiveColorAt(targetBlock, primary.start, primary.end);
      onActiveTextSelectionChange({
        pageId: primary.pageId,
        blockId: primary.blockId,
        start: primary.start,
        end: primary.end,
        fontFamily: activeFont,
        color: activeTextColor,
        ranges,
      });
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [pages, note.fontFamily, onActiveTextSelectionChange]);

  const handleReportPageMetrics = useCallback(
    (pageId: string, metrics: Record<string, { top: number; height: number }>, width: number) => {
      metricsMapRef.current[pageId] = metrics;
      onReportLayoutMetrics(metricsMapRef.current, width);
    },
    [onReportLayoutMetrics]
  );

  return (
    <div
      ref={scrollContainerRef}
      style={
        isSmartphone && keyboardInsetPx > 0
          ? { paddingBottom: `${keyboardInsetPx + 116}px` }
          : undefined
      }
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
          pageId: pages[pages.length - 1]?.id,
          totalPages: pages.length,
          targetStrokeIds: selectedStrokeIds,
        });
      }}
      className={`flex-1 overflow-auto overscroll-contain ${
        isSmartphone ? 'px-2 py-3 pb-28 space-y-5' : 'px-1.5 sm:px-6 lg:px-10 py-2.5 sm:py-6 pb-24 space-y-5 sm:space-y-6'
      } ${
        activeTool !== 'text' ? 'no-ios-select' : ''
      } ${
        activeTool === 'pan' || fingerPanOnly ? 'touch-none' : ''
      } ${
        activeTool === 'pan'
          ? isHandPanning
            ? 'cursor-grabbing'
            : 'cursor-grab'
          : ''
      }`}
    >
      {pages.map((page, idx) => (
        <HybridPageSheet
          key={page.id}
          page={page}
          pageIndex={idx}
          totalPages={pages.length}
          noteTitle={note.title}
          paperStyle={note.paperStyle}
          defaultFont={note.fontFamily || 'sans'}
          zoom={zoom}
          activeTool={activeTool}
          selectedInsertShape={selectedInsertShape}
          eraserMode={eraserMode}
          eraserSize={eraserSize}
          activeColor={activeColor}
          penWidth={penWidth}
          highlighterWidth={highlighterWidth}
          holdToSnap={holdToSnap}
          fingerPanOnly={fingerPanOnly}
          ivoryPaper={ivoryPaper}
          isSmartphone={isSmartphone}
          viewportHeight={viewportHeight}
          pageSearchMatches={searchMatches.filter((m) => m.pageId === page.id)}
          activeSearchMatchId={activeSearchMatchId}
          textSizeScale={textSizeScale}
          selectedStrokeIds={selectedPageId === undefined || selectedPageId === page.id ? selectedStrokeIds : []}
          onSelectStrokes={(ids) => onSelectStrokes(ids, page.id)}
          onChangeTitle={onChangeTitle}
          onChangeBlocks={(blocks) => onUpdatePage(page.id, (p) => ({ ...p, blocks }))}
          onCommitStrokes={(strokes) => onUpdatePage(page.id, (p) => ({ ...p, strokes }))}
          onDeletePage={onDeletePage}
          onActiveTextSelectionChange={onActiveTextSelectionChange}
          onOpenContextMenu={onOpenContextMenu}
          onStylusDetected={onStylusDetected}
          onEraserScrubMove={onEraserScrubMove}
          onEraserScrubEnd={onEraserScrubEnd}
          onSheetCursorMove={onSheetCursorMove}
          onSheetCursorLeave={onSheetCursorLeave}
          onReportPageMetrics={handleReportPageMetrics}
        />
      ))}

      {/* Discrete Centered "+ Aggiungi pagina" Button */}
      <div className="flex justify-center pt-2 pb-6 no-print">
        <button
          type="button"
          onClick={() => {
            onAddPage();
            window.setTimeout(() => {
              scrollContainerRef.current?.scrollTo({
                top: scrollContainerRef.current.scrollHeight,
                behavior: 'smooth',
              });
            }, 60);
          }}
          className={`ios-pill-glass rounded-full flex items-center gap-2 font-medium text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/20 transition-colors ${
            isSmartphone ? 'h-12 px-6 text-[14px]' : 'h-10 px-5 text-xs'
          }`}
        >
          <Plus className={isSmartphone ? 'w-4.5 h-4.5' : 'w-4 h-4'} />
          <span>Aggiungi pagina</span>
        </button>
      </div>
    </div>
  );
};
