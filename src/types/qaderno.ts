export type PaperStyle = 'grid' | 'lined' | 'dotted' | 'blank';

export type NoteFontFamily = 'sans' | 'serif' | 'hand' | 'mono';

export type ThemeMode = 'light' | 'dark' | 'system';

export type ToolType = 'pan' | 'text' | 'pen' | 'highlighter' | 'eraser' | 'lasso' | 'shape';

export type DockPosition = 'top' | 'bottom' | 'left' | 'right';

export type EraserMode = 'stroke' | 'precision';

export type InkColorId = 'graphite' | 'slate' | 'midnight' | 'sage' | 'terracotta';

export interface InkColorOption {
  id: InkColorId;
  label: string;
  hex: string;
}

export const INK_COLORS: InkColorOption[] = [
  { id: 'graphite', label: 'Grafite', hex: '#1C1C1E' },
  { id: 'slate', label: 'Ardesia', hex: '#48484A' },
  { id: 'midnight', label: 'Blu Notte', hex: '#2B4162' },
  { id: 'sage', label: 'Verde Salvia', hex: '#3D5A45' },
  { id: 'terracotta', label: 'Terracotta', hex: '#9A463D' },
];

export const HIGHLIGHTER_COLORS: Array<{ id: string; label: string; hex: string }> = [
  { id: 'orange', label: 'Arancio', hex: '#FF9500' },
  { id: 'yellow', label: 'Giallo', hex: '#FFD60A' },
  { id: 'green', label: 'Verde', hex: '#34C759' },
  { id: 'pink', label: 'Rosa', hex: '#FF5C8A' },
];

export const TEXT_COLORS: Array<{ id: string; label: string; hex: string }> = [
  { id: 'graphite', label: 'Grafite', hex: '#1C1C1E' },
  { id: 'slate', label: 'Ardesia', hex: '#48484A' },
  { id: 'midnight', label: 'Blu Notte', hex: '#2B4162' },
  { id: 'sage', label: 'Verde Salvia', hex: '#3D5A45' },
  { id: 'terracotta', label: 'Terracotta', hex: '#9A463D' },
  { id: 'plum', label: 'Prugna', hex: '#6B4C7A' },
  { id: 'ochre', label: 'Ocra', hex: '#9C6B21' },
];

export const PEN_WIDTHS = [
  { id: 'thin', label: 'Sottile', value: 2.0 },
  { id: 'medium', label: 'Medio', value: 3.6 },
  { id: 'thick', label: 'Spesso', value: 6.0 },
] as const;

export const HIGHLIGHTER_WIDTHS = [
  { id: 'thin', label: 'Sottile', value: 14 },
  { id: 'medium', label: 'Medio', value: 22 },
  { id: 'thick', label: 'Spesso', value: 32 },
] as const;

export const NOTE_FONTS: Array<{ id: NoteFontFamily; label: string; description: string; sample: string }> = [
  { id: 'sans', label: 'Sans-Serif pulito', description: 'Moderno e leggibile', sample: 'Aa' },
  { id: 'serif', label: 'Serif editoriale', description: 'Classico da lettura', sample: 'Aa' },
  { id: 'mono', label: 'Monospazio', description: 'Tecnico e allineato', sample: 'Aa' },
  { id: 'hand', label: 'Calligrafico', description: 'Scrittura a mano', sample: 'Aa' },
];

export type TextBlockType = 'paragraph' | 'h1' | 'h2' | 'bullet' | 'todo' | 'code';

export interface TextFontSpan {
  start: number;
  end: number;
  fontFamily: NoteFontFamily;
}

export interface TextColorSpan {
  start: number;
  end: number;
  color: string;
}

export interface TextStyleSpan {
  start: number;
  end: number;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strike?: boolean;
  rawWrap?: string;
}

export interface TextBlock {
  id: string;
  type: TextBlockType;
  content: string;
  checked?: boolean;
  fontFamily?: NoteFontFamily;
  fontSpans?: TextFontSpan[];
  color?: string;
  colorSpans?: TextColorSpan[];
  styleSpans?: TextStyleSpan[];
  autoFormatSymbol?: string;
}

export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
  timestamp: number;
}

export type RecognizedShapeKind =
  | 'line'
  | 'arrow'
  | 'doubleArrow'
  | 'circle'
  | 'ellipse'
  | 'rectangle'
  | 'square'
  | 'triangle'
  | 'diamond'
  | 'hexagon'
  | 'star';

export interface RecognizedShapeMeta {
  kind: RecognizedShapeKind;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  vertices?: Array<{ x: number; y: number }>;
}

export interface Stroke {
  id: string;
  tool: 'pen' | 'highlighter';
  color: string;
  width: number;
  points: StrokePoint[];
  anchorBlockId?: string;
  anchorDy?: number;
  pageIndex?: number;
  shapeMeta?: RecognizedShapeMeta;
}

export interface HybridPage {
  id: string;
  blocks: TextBlock[];
  strokes: Stroke[];
}

export interface FloatingTextBox {
  id: string;
  x: number;
  y: number;
  width: number;
  content: string;
  color: string;
  fontSize: number;
  fontFamily?: NoteFontFamily;
}

export interface PdfTextEdit {
  spanId: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontFamily: string;
  mappedFallbackFont?: string;
  fontCategory?: 'sans' | 'serif' | 'mono';
  fontSize: number;
  fontWeight: '400' | '700' | 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  letterSpacing: number;
  scaleX?: number;
  color: string;
  backgroundColor: string;
}

export interface PdfTextSpan {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  pdfFontName?: string;
  mappedFallbackFont?: string;
  fontCategory?: 'sans' | 'serif' | 'mono';
  fontFamily: string;
  fontWeight: '400' | '700' | 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  letterSpacing?: number;
  scaleX?: number;
  backgroundColor: string;
  originalText: string;
  editedText: string;
  text?: string;
  color: string;
  isEdited: boolean;
  pixelChecked?: boolean;
}

export interface PdfPageAnnotations {
  pageIndex: number;
  width: number;
  height: number;
  strokes: Stroke[];
  textBoxes: FloatingTextBox[];
  textSpans?: PdfTextSpan[];
  textEdits?: PdfTextEdit[];
}

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
  order: number;
}

export interface NoteDocument {
  id: string;
  folderId: string;
  title: string;
  pinned: boolean;
  paperStyle: PaperStyle;
  fontFamily?: NoteFontFamily;
  documentType: 'hybrid' | 'pdf';
  blocks: TextBlock[];
  strokes: Stroke[];
  pages?: HybridPage[];
  pdfDataId?: string;
  pdfFileName?: string;
  pdfPages?: PdfPageAnnotations[];
  createdAt: number;
  updatedAt: number;
}

export interface AppPreferences {
  theme: ThemeMode;
  defaultPaperStyle: PaperStyle;
  defaultFontFamily: NoteFontFamily;
  textSizeScale: 'small' | 'normal' | 'large';
  autoBeautifySnap: boolean;
  defaultHoldToSnap: boolean;
  autoSaveSessionJson: boolean;
  sessionJsonManualDownloaded: boolean;
}

export type ShortcutActionId =
  | 'undo'
  | 'redo'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'delete'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'
  | 'toolPen'
  | 'toolHighlighter'
  | 'toolEraser'
  | 'toolLasso'
  | 'toolPan'
  | 'toolText'
  | 'color1'
  | 'color2'
  | 'color3'
  | 'color4'
  | 'color5'
  | 'toggleSnap';

export type ShortcutMap = Record<ShortcutActionId, string>;

export interface TextContextTarget {
  kind: 'block' | 'textbox' | 'pdfspan' | 'title';
  pageId?: string;
  targetId: string;
  selectedText: string;
  selectionStart: number;
  selectionEnd: number;
  hasFormatting?: boolean;
}

export type ContextMenuScope = 'canvas' | 'note' | 'folder' | 'sidebar' | 'app';

export interface ContextMenuState {
  visible: boolean;
  scope?: ContextMenuScope;
  x: number;
  y: number;
  canvasX: number;
  canvasY: number;
  pageId?: string;
  pageIndex?: number;
  totalPages?: number;
  targetStrokeIds: string[];
  textTarget?: TextContextTarget;
  sidebarNoteId?: string;
  sidebarFolderId?: string;
}

export interface ActiveTextSelectionRange {
  pageId: string;
  blockId: string;
  start: number;
  end: number;
}

export interface ActiveTextSelection {
  pageId: string;
  blockId: string;
  start: number;
  end: number;
  fontFamily: NoteFontFamily;
  color?: string;
  ranges?: ActiveTextSelectionRange[];
}
