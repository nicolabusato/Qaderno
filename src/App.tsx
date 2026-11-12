import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FileArchive } from 'lucide-react';
import { ConfirmDialog, ConfirmDialogAction } from './components/ConfirmDialog';
import { ContextMenuPill } from './components/ContextMenuPill';
import { FloatingToolDock } from './components/FloatingToolDock';
import { HybridEditor } from './components/HybridEditor';
import { InstallGuideModal } from './components/InstallGuideModal';
import { PdfAnnotator, ActivePdfTextTarget } from './components/PdfAnnotator';
import { QadernoLogo } from './components/QadernoLogo';
import {
  collectSelectedBlockRangesFromDOM,
  normalizeColorSpans,
  normalizeFontSpans,
} from './components/RichTextBlock';
import { SettingsModal } from './components/SettingsModal';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { ZoomPill } from './components/ZoomPill';
import { usePWAInstall } from './hooks/usePWAInstall';
import {
  ActiveTextSelection,
  AppPreferences,
  ContextMenuState,
  DockPosition,
  EraserMode,
  FloatingTextBox,
  Folder,
  HybridPage,
  INK_COLORS,
  NoteDocument,
  NoteFontFamily,
  PaperStyle,
  PdfPageAnnotations,
  PdfTextSpan,
  RecognizedShapeKind,
  ShortcutActionId,
  ShortcutMap,
  Stroke,
  TextBlock,
  TextColorSpan,
  TextFontSpan,
  ToolType,
} from './types/qaderno';
import { beautifyHandwritingStrokes } from './utils/handwritingBeautifier';
import { getStrokeBounds, translateStroke } from './utils/inkRenderer';
import {
  clearSavedDirectoryHandle,
  getSavedDirectoryHandle,
  pickAndConnectDirectory,
  syncAllNotesToDirectory,
  writeNoteToDirectory,
} from './utils/localFolderSync';
import {
  calibratePdfSpanMetrics,
  exportAnnotatedPdf,
  exportHybridNoteToPdf,
  extractSpansForExistingPdf,
  loadPdfMetadata,
} from './utils/pdfEngine';
import { applyThemeToDocument, loadPreferences, savePreferences } from './utils/preferences';
import { exportQadernoArchive, parseQadernoArchive, sanitizeFilename } from './utils/qadernoArchive';
import {
  autoPersistSessionJSON,
  clearSavedSessionFileHandle,
  downloadAndLinkSessionJSON,
  getLastSessionJsonSavedAt,
  getSavedSessionFileHandle,
  importSessionJSON,
  SessionUIState,
} from './utils/sessionJsonSync';
import { loadShortcuts, matchesCombo, resetShortcuts, saveShortcuts } from './utils/shortcuts';
import {
  deleteFolder,
  deleteNote,
  getPdfBlob,
  initializeDefaultWorkspace,
  normalizeNotePages,
  noteToMarkdown,
  saveFolder,
  saveNote,
  savePdfBlob,
} from './utils/storage';

interface NoteSnapshot {
  title: string;
  blocks: TextBlock[];
  strokes: Stroke[];
  pages?: HybridPage[];
  pdfPages?: PdfPageAnnotations[];
}

interface ConfirmPromptState {
  open: boolean;
  title: string;
  message: string;
  actions: ConfirmDialogAction[];
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notes, setNotes] = useState<NoteDocument[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | 'all'>('all');
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );

  // Preferences & Theme
  const [preferences, setPreferences] = useState<AppPreferences>(() => loadPreferences());

  // Zoom (40% - 300%)
  const [zoom, setZoom] = useState<number>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 860) {
      return Math.max(0.4, Math.min(1, Math.round(((window.innerWidth - 16) / 820) * 100) / 100));
    }
    return 1;
  });

  // Active Tool State & Draggable Floating Dock Position
  const [activeTool, setActiveTool] = useState<ToolType>('text');
  const [dockPosition, setDockPosition] = useState<DockPosition>(() => {
    try {
      const saved = localStorage.getItem('qaderno_dock_position_v1');
      if (saved === 'top' || saved === 'bottom' || saved === 'left' || saved === 'right') {
        return saved;
      }
      return 'bottom';
    } catch {
      return 'bottom';
    }
  });
  const [selectedInsertShape, setSelectedInsertShape] = useState<RecognizedShapeKind>('rectangle');
  const [eraserMode, setEraserMode] = useState<EraserMode>('stroke');
  const [eraserSize, setEraserSize] = useState<number>(12);
  const [activeColor, setActiveColor] = useState<string>(INK_COLORS[0].hex);
  const [penWidth, setPenWidth] = useState<number>(3.6);
  const [highlighterWidth, setHighlighterWidth] = useState<number>(22);
  const [holdToSnap, setHoldToSnap] = useState<boolean>(() => loadPreferences().defaultHoldToSnap);

  // Active Text Block / Selection (for per-line & per-selection Word-style font picker)
  const [activeTextSelection, setActiveTextSelection] = useState<ActiveTextSelection | null>(null);

  // Selection, Clipboard, Undo/Redo, Context Menu
  const [selectedStrokeIds, setSelectedStrokeIds] = useState<string[]>([]);
  const [selectedHybridPageId, setSelectedHybridPageId] = useState<string | undefined>(undefined);
  const [selectedPdfPageIndex, setSelectedPdfPageIndex] = useState<number | undefined>(undefined);
  const [clipboardStrokes, setClipboardStrokes] = useState<Stroke[]>([]);
  const [textClipboard, setTextClipboard] = useState<string>('');
  const [undoMap, setUndoMap] = useState<Record<string, NoteSnapshot[]>>({});
  const [redoMap, setRedoMap] = useState<Record<string, NoteSnapshot[]>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    canvasX: 0,
    canvasY: 0,
    targetStrokeIds: [],
  });

  // PDF Buffer Cache
  const [activePdfBuffer, setActivePdfBuffer] = useState<ArrayBuffer | null>(null);

  // Modals, Confirmations, File Drop & Local Folder Sync
  const [shortcuts, setShortcuts] = useState<ShortcutMap>(() => loadShortcuts());
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [installGuideOpen, setInstallGuideOpen] = useState(false);
  const [requestedRenameFolderId, setRequestedRenameFolderId] = useState<string | null>(null);
  const [requestedNewFolderTick, setRequestedNewFolderTick] = useState(0);
  const [confirmPrompt, setConfirmPrompt] = useState<ConfirmPromptState>({
    open: false,
    title: '',
    message: '',
    actions: [],
  });
  const [fileDropActive, setFileDropActive] = useState(false);
  const fileDropDepthRef = useRef(0);

  const [connectedDirHandle, setConnectedDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [connectedSessionFileHandle, setConnectedSessionFileHandle] = useState<FileSystemFileHandle | null>(
    null
  );
  const [lastSessionJsonSavedAt, setLastSessionJsonSavedAt] = useState<number | null>(() =>
    getLastSessionJsonSavedAt()
  );
  const [activePdfTextTarget, setActivePdfTextTarget] = useState<ActivePdfTextTarget | null>(null);
  const syncTimerRef = useRef<number | null>(null);
  const sessionJsonTimerRef = useRef<number | null>(null);

  const [saveLabel, setSaveLabel] = useState('Salvato localmente');
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  const workspaceRef = useRef<HTMLDivElement>(null);
  const layoutMetricsRef = useRef<{
    blockOffsetsByPage: Record<string, Record<string, { top: number; height: number }>>;
    canvasWidth: number;
  }>({ blockOffsetsByPage: {}, canvasWidth: 820 });

  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  const showToast = useCallback((msg: string) => {
    setBannerMessage(msg);
    window.setTimeout(() => {
      setBannerMessage((prev) => (prev === msg ? null : prev));
    }, 2600);
  }, []);

  // Theme sync
  useEffect(() => {
    applyThemeToDocument(preferences.theme);
    if (preferences.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyThemeToDocument('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preferences.theme]);

  // Load IndexedDB workspace & saved directory handle
  useEffect(() => {
    initializeDefaultWorkspace().then(({ folders: f, notes: n }) => {
      setFolders(f);
      setNotes(n);
      if (n.length > 0) {
        setActiveNoteId(n[0].id);
      }
      setReady(true);
    });
    getSavedDirectoryHandle().then((h) => {
      if (h) setConnectedDirHandle(h);
    });
    getSavedSessionFileHandle().then((fh) => {
      if (fh) setConnectedSessionFileHandle(fh);
    });
  }, []);

  const activeNote = useMemo(
    () => notes.find((n) => n.id === activeNoteId) || null,
    [notes, activeNoteId]
  );

  // Load PDF binary + extract text spans if missing
  useEffect(() => {
    let cancelled = false;
    if (activeNote?.documentType === 'pdf' && activeNote.pdfDataId) {
      getPdfBlob(activeNote.pdfDataId).then(async (buf) => {
        if (cancelled) return;
        setActivePdfBuffer(buf);
        if (buf && activeNote.pdfPages?.some((p) => !p.textSpans || p.textSpans.length === 0)) {
          const hydrated = await extractSpansForExistingPdf(buf, activeNote.pdfPages);
          if (!cancelled) {
            setNotes((prev) =>
              prev.map((n) => (n.id === activeNote.id ? { ...n, pdfPages: hydrated } : n))
            );
          }
        }
      });
    } else {
      setActivePdfBuffer(null);
    }
    setSelectedStrokeIds([]);
    setSelectedHybridPageId(undefined);
    setSelectedPdfPageIndex(undefined);
    setActiveTextSelection(null);
    setActivePdfTextTarget(null);
    return () => {
      cancelled = true;
    };
  }, [activeNote?.id, activeNote?.documentType, activeNote?.pdfDataId]);

  const scheduleLocalFolderSync = useCallback(
    (noteToSync: NoteDocument, currentFolders: Folder[]) => {
      if (!connectedDirHandle) return;
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = window.setTimeout(() => {
        writeNoteToDirectory(connectedDirHandle, noteToSync, currentFolders, false);
      }, 900);
    },
    [connectedDirHandle]
  );

  const pushHistorySnapshot = useCallback((note: NoteDocument) => {
    const snap: NoteSnapshot = {
      title: note.title,
      blocks: note.blocks,
      strokes: note.strokes,
      pages: note.pages,
      pdfPages: note.pdfPages,
    };
    setUndoMap((prev) => ({
      ...prev,
      [note.id]: [...(prev[note.id] || []).slice(-39), snap],
    }));
    setRedoMap((prev) => ({ ...prev, [note.id]: [] }));
  }, []);

  const updateActiveNote = useCallback(
    (updater: (note: NoteDocument) => NoteDocument, recordHistory = true) => {
      if (!activeNoteId) return;
      setSaveLabel('Salvataggio…');
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id !== activeNoteId) return n;
          if (recordHistory) pushHistorySnapshot(n);
          const updated = normalizeNotePages({ ...updater(n), updatedAt: Date.now() });
          saveNote(updated).then(() => {
            setSaveLabel('Salvato localmente');
            scheduleLocalFolderSync(updated, folders);
          });
          return updated;
        })
      );
    },
    [activeNoteId, pushHistorySnapshot, scheduleLocalFolderSync, folders]
  );

  // Undo / Redo
  const handleUndo = useCallback(() => {
    if (!activeNote) return;
    const stack = undoMap[activeNote.id] || [];
    if (stack.length === 0) return;

    const prevSnap = stack[stack.length - 1];
    const currentSnap: NoteSnapshot = {
      title: activeNote.title,
      blocks: activeNote.blocks,
      strokes: activeNote.strokes,
      pages: activeNote.pages,
      pdfPages: activeNote.pdfPages,
    };

    setUndoMap((m) => ({ ...m, [activeNote.id]: stack.slice(0, -1) }));
    setRedoMap((m) => ({ ...m, [activeNote.id]: [...(m[activeNote.id] || []), currentSnap] }));

    const restored = normalizeNotePages({
      ...activeNote,
      ...prevSnap,
      updatedAt: Date.now(),
    });
    setNotes((ns) => ns.map((n) => (n.id === activeNote.id ? restored : n)));
    saveNote(restored);
    setSelectedStrokeIds([]);
  }, [activeNote, undoMap]);

  const handleRedo = useCallback(() => {
    if (!activeNote) return;
    const stack = redoMap[activeNote.id] || [];
    if (stack.length === 0) return;

    const nextSnap = stack[stack.length - 1];
    const currentSnap: NoteSnapshot = {
      title: activeNote.title,
      blocks: activeNote.blocks,
      strokes: activeNote.strokes,
      pages: activeNote.pages,
      pdfPages: activeNote.pdfPages,
    };

    setRedoMap((m) => ({ ...m, [activeNote.id]: stack.slice(0, -1) }));
    setUndoMap((m) => ({ ...m, [activeNote.id]: [...(m[activeNote.id] || []), currentSnap] }));

    const restored = normalizeNotePages({
      ...activeNote,
      ...nextSnap,
      updatedAt: Date.now(),
    });
    setNotes((ns) => ns.map((n) => (n.id === activeNote.id ? restored : n)));
    saveNote(restored);
    setSelectedStrokeIds([]);
  }, [activeNote, redoMap]);

  // Zoom Helpers (40% - 300%)
  const clampZoom = (z: number) => Math.max(0.4, Math.min(3, Math.round(z * 100) / 100));

  const handleZoomWheel = useCallback((deltaY: number) => {
    setZoom((prev) => clampZoom(prev * (1 - deltaY * 0.0022)));
  }, []);

  const handleFitWidth = useCallback(() => {
    const pad = typeof window !== 'undefined' && window.innerWidth < 640 ? 16 : 48;
    const availW = (workspaceRef.current?.clientWidth || window.innerWidth) - pad;
    const baseW =
      activeNote?.documentType === 'pdf'
        ? activeNote.pdfPages?.[0]?.width || 820
        : 820;
    setZoom(clampZoom(availW / Math.max(baseW, 320)));
  }, [activeNote]);

  // Taccuini (Folders): Create, Rename, Delete with Confirmation, Drag & Drop
  const handleCreateFolder = async (name: string) => {
    const newFolder: Folder = {
      id: `folder_${Date.now()}`,
      name,
      createdAt: Date.now(),
      order: folders.length,
    };
    await saveFolder(newFolder);
    setFolders((prev) => [...prev, newFolder]);
    setActiveFolderId(newFolder.id);
  };

  const handleRenameFolder = async (folderId: string, newName: string) => {
    const target = folders.find((f) => f.id === folderId);
    if (!target || target.name === newName) return;
    const updated = { ...target, name: newName };
    await saveFolder(updated);
    setFolders((prev) => prev.map((f) => (f.id === folderId ? updated : f)));
  };

  const executeDeleteFolder = async (folderId: string) => {
    const affected = notes.filter((n) => n.folderId === folderId);
    for (const n of affected) {
      await saveNote({ ...n, folderId: '' });
    }
    await deleteFolder(folderId);
    setNotes((prev) => prev.map((n) => (n.folderId === folderId ? { ...n, folderId: '' } : n)));
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
    if (activeFolderId === folderId) setActiveFolderId('all');
    showToast('Taccuino eliminato');
  };

  const handleRequestDeleteFolder = (folder: Folder) => {
    const count = notes.filter((n) => n.folderId === folder.id).length;
    setConfirmPrompt({
      open: true,
      title: `Eliminare "${folder.name}"?`,
      message:
        count > 0
          ? `Questo taccuino contiene ${count} ${count === 1 ? 'quaderno' : 'quaderni'}, che verranno spostati nell'elenco principale. L'operazione non può essere annullata.`
          : "Sei sicuro di voler eliminare questo taccuino? L'operazione non può essere annullata.",
      actions: [
        {
          label: 'Elimina taccuino',
          variant: 'danger',
          onClick: () => {
            executeDeleteFolder(folder.id);
          },
        },
        { label: 'Annulla', variant: 'default', onClick: () => {} },
      ],
    });
  };

  const handleMoveNoteToFolder = async (noteId: string, targetFolderId: string) => {
    const target = notes.find((n) => n.id === noteId);
    if (!target || target.folderId === targetFolderId) return;
    const updated = { ...target, folderId: targetFolderId, updatedAt: Date.now() };
    await saveNote(updated);
    setNotes((prev) => prev.map((n) => (n.id === noteId ? updated : n)));
    const destName = folders.find((f) => f.id === targetFolderId)?.name;
    showToast(destName ? `Spostato in "${destName}"` : 'Spostato nell’elenco principale');
  };

  // Quaderno CRUD + Delete Confirmation
  const handleCreateNote = async () => {
    const targetFolder = activeFolderId === 'all' ? folders[0]?.id || '' : activeFolderId;
    const now = Date.now();
    const firstBlock: TextBlock = {
      id: `b_${now}`,
      type: 'paragraph',
      content: '',
      fontFamily: preferences.defaultFontFamily,
    };
    const firstPage: HybridPage = {
      id: `page_${now}_1`,
      blocks: [firstBlock],
      strokes: [],
    };
    const newNote: NoteDocument = {
      id: `note_${now}`,
      folderId: targetFolder,
      title: 'Nuovo quaderno',
      pinned: false,
      paperStyle: preferences.defaultPaperStyle,
      fontFamily: preferences.defaultFontFamily,
      documentType: 'hybrid',
      blocks: [firstBlock],
      strokes: [],
      pages: [firstPage],
      createdAt: now,
      updatedAt: now,
    };
    await saveNote(newNote);
    setNotes((prev) => [newNote, ...prev]);
    setActiveNoteId(newNote.id);
    setActiveTool('text');
  };

  const executeDeleteNote = async (noteId: string) => {
    await deleteNote(noteId);
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== noteId);
      if (activeNoteId === noteId) {
        setActiveNoteId(next[0]?.id || null);
      }
      return next;
    });
    showToast('Quaderno eliminato');
  };

  const handleRequestDeleteNote = (note: NoteDocument) => {
    setConfirmPrompt({
      open: true,
      title: `Eliminare "${note.title || 'Senza titolo'}"?`,
      message: "Sei sicuro di voler eliminare questo quaderno? L'operazione non può essere annullata.",
      actions: [
        {
          label: 'Elimina quaderno',
          variant: 'danger',
          onClick: () => {
            executeDeleteNote(note.id);
          },
        },
        { label: 'Annulla', variant: 'default', onClick: () => {} },
      ],
    });
  };

  const handleTogglePinNote = async (noteId: string) => {
    const target = notes.find((n) => n.id === noteId);
    if (!target) return;
    const updated = { ...target, pinned: !target.pinned, updatedAt: Date.now() };
    await saveNote(updated);
    setNotes((prev) => prev.map((n) => (n.id === noteId ? updated : n)));
  };

  const handleCreateNoteInFolder = async (folderId: string) => {
    const now = Date.now();
    const firstBlock: TextBlock = {
      id: `b_${now}`,
      type: 'paragraph',
      content: '',
      fontFamily: preferences.defaultFontFamily,
    };
    const firstPage: HybridPage = {
      id: `page_${now}_1`,
      blocks: [firstBlock],
      strokes: [],
    };
    const newNote: NoteDocument = {
      id: `note_${now}`,
      folderId,
      title: 'Nuovo quaderno',
      pinned: false,
      paperStyle: preferences.defaultPaperStyle,
      fontFamily: preferences.defaultFontFamily,
      documentType: 'hybrid',
      blocks: [firstBlock],
      strokes: [],
      pages: [firstPage],
      createdAt: now,
      updatedAt: now,
    };
    await saveNote(newNote);
    setNotes((prev) => [newNote, ...prev]);
    setActiveFolderId(folderId);
    setActiveNoteId(newNote.id);
    setActiveTool('text');
    if (window.innerWidth < 1024) setSidebarOpen(false);
  };

  const handleDuplicateNote = async (noteId: string) => {
    const target = notes.find((n) => n.id === noteId);
    if (!target) return;
    const now = Date.now();
    let clonedPdfDataId = target.pdfDataId;
    if (target.documentType === 'pdf' && target.pdfDataId) {
      const buf = await getPdfBlob(target.pdfDataId);
      if (buf) {
        clonedPdfDataId = `pdf_${now}_${Math.random().toString(36).slice(2, 6)}`;
        await savePdfBlob(clonedPdfDataId, buf.slice(0));
      }
    }
    const duplicated = normalizeNotePages({
      ...JSON.parse(JSON.stringify(target)),
      id: `note_${now}_${Math.random().toString(36).slice(2, 5)}`,
      title: `${target.title || 'Quaderno'} (Copia)`,
      pinned: false,
      pdfDataId: clonedPdfDataId,
      createdAt: now,
      updatedAt: now,
    });
    await saveNote(duplicated);
    setNotes((prev) => [duplicated, ...prev]);
    setActiveNoteId(duplicated.id);
    showToast('Quaderno duplicato');
  };

  const handleExportQadernoById = async (noteId: string) => {
    const target = notes.find((n) => n.id === noteId);
    if (!target) return;
    try {
      const { blob, filename } = await exportQadernoArchive(target, folders);
      downloadBlob(blob, filename);
      showToast(`Esportato ${filename}`);
    } catch {
      showToast('Errore durante la creazione del file .qaderno');
    }
  };

  // Multi-Page Hybrid Handlers
  const handleUpdateHybridPage = useCallback(
    (pageId: string, updater: (page: HybridPage) => HybridPage, recordHistory = true) => {
      updateActiveNote((n) => {
        const currentPages = normalizeNotePages(n).pages || [];
        const updatedPages = currentPages.map((p) => {
          if (p.id !== pageId) return p;
          const nextPage = updater(p);
          const isNewStroke = nextPage.strokes.length > p.strokes.length;
          const lastStroke = nextPage.strokes[nextPage.strokes.length - 1];
          const blockOffsets = layoutMetricsRef.current.blockOffsetsByPage[pageId] || {};
          const finalStrokes =
            preferences.autoBeautifySnap && isNewStroke && lastStroke && !lastStroke.shapeMeta
              ? beautifyHandwritingStrokes(nextPage.strokes, [lastStroke.id], (s) =>
                  s.anchorBlockId && blockOffsets[s.anchorBlockId] ? blockOffsets[s.anchorBlockId].top : 0
                )
              : nextPage.strokes;
          return { ...nextPage, strokes: finalStrokes };
        });

        return {
          ...n,
          pages: updatedPages,
          blocks: updatedPages[0]?.blocks || n.blocks,
          strokes: updatedPages[0]?.strokes || n.strokes,
        };
      }, recordHistory);
    },
    [updateActiveNote, preferences.autoBeautifySnap]
  );

  const handleAddHybridPage = useCallback(() => {
    if (!activeNote || activeNote.documentType !== 'hybrid') return;
    const now = Date.now();
    const newPage: HybridPage = {
      id: `page_${now}`,
      blocks: [
        {
          id: `b_${now}`,
          type: 'paragraph',
          content: '',
          fontFamily: preferences.defaultFontFamily,
        },
      ],
      strokes: [],
    };
    updateActiveNote((n) => {
      const currentPages = normalizeNotePages(n).pages || [];
      return {
        ...n,
        pages: [...currentPages, newPage],
      };
    });
    showToast('Nuova pagina aggiunta');
  }, [activeNote, preferences.defaultFontFamily, updateActiveNote, showToast]);

  const handleDeleteHybridPage = useCallback(
    (pageId: string) => {
      if (!activeNote || activeNote.documentType !== 'hybrid') return;
      const pages = normalizeNotePages(activeNote).pages || [];
      if (pages.length <= 1) {
        showToast('Il quaderno deve avere almeno una pagina');
        return;
      }
      const idx = pages.findIndex((p) => p.id === pageId);
      if (idx === -1) return;
      const targetPage = pages[idx];
      const hasContent =
        targetPage.strokes.length > 0 ||
        targetPage.blocks.some((b) => b.content.trim().length > 0);

      const executeRemove = () => {
        updateActiveNote((n) => {
          const cur = normalizeNotePages(n).pages || [];
          if (cur.length <= 1) return n;
          const nextPages = cur.filter((p) => p.id !== pageId);
          return {
            ...n,
            pages: nextPages,
            blocks: nextPages[0]?.blocks || n.blocks,
            strokes: nextPages[0]?.strokes || n.strokes,
          };
        });
        if (selectedHybridPageId === pageId) {
          setSelectedStrokeIds([]);
          setSelectedHybridPageId(undefined);
        }
        showToast('Pagina eliminata');
      };

      if (!hasContent) {
        executeRemove();
        return;
      }

      setConfirmPrompt({
        open: true,
        title: `Eliminare Pagina ${idx + 1}?`,
        message:
          'La pagina contiene testo o appunti a mano. Potrai comunque ripristinarla con Annulla.',
        actions: [
          {
            label: 'Elimina pagina',
            variant: 'danger',
            onClick: executeRemove,
          },
          { label: 'Annulla', variant: 'default', onClick: () => {} },
        ],
      });
    },
    [activeNote, selectedHybridPageId, updateActiveNote, showToast]
  );

  const handleDeletePdfPage = useCallback(
    (pageIndex: number) => {
      if (!activeNote || activeNote.documentType !== 'pdf') return;
      const pages = activeNote.pdfPages || [];
      if (pages.length <= 1) {
        showToast('Il documento PDF deve avere almeno una pagina');
        return;
      }
      const idx = pages.findIndex((p) => p.pageIndex === pageIndex);
      if (idx === -1) return;
      const targetPage = pages[idx];
      const hasAnnotations =
        targetPage.strokes.length > 0 ||
        targetPage.textBoxes.length > 0 ||
        (targetPage.textEdits?.length || 0) > 0;

      const executeRemove = () => {
        updateActiveNote((n) => {
          const cur = n.pdfPages || [];
          if (cur.length <= 1) return n;
          return {
            ...n,
            pdfPages: cur.filter((p) => p.pageIndex !== pageIndex),
          };
        });
        if (selectedPdfPageIndex === pageIndex) {
          setSelectedStrokeIds([]);
          setSelectedPdfPageIndex(undefined);
        }
        showToast('Pagina PDF eliminata');
      };

      setConfirmPrompt({
        open: true,
        title: `Eliminare Pagina ${idx + 1} del PDF?`,
        message: hasAnnotations
          ? 'Questa pagina PDF e le sue annotazioni verranno rimosse dal quaderno. Potrai ripristinarla con Annulla.'
          : 'Questa pagina verrà rimossa dal quaderno (e dal PDF esportato). Potrai ripristinarla con Annulla.',
        actions: [
          {
            label: 'Elimina pagina',
            variant: 'danger',
            onClick: executeRemove,
          },
          { label: 'Annulla', variant: 'default', onClick: () => {} },
        ],
      });
    },
    [activeNote, selectedPdfPageIndex, updateActiveNote, showToast]
  );

  // Word-style Per-Line or Per-Selection Font Formatting (strictly scoped to selected text or active caret line)
  const handleApplyFontToSelectionOrBlock = useCallback(
    (font: NoteFontFamily) => {
      if (!activeNote || activeNote.documentType !== 'hybrid') return;

      const liveRanges = collectSelectedBlockRangesFromDOM();
      const nonEmptyLive = liveRanges.filter((r) => r.end > r.start);
      const nonEmptySaved = (activeTextSelection?.ranges || []).filter((r) => r.end > r.start);

      const selectedRanges =
        nonEmptyLive.length > 0
          ? nonEmptyLive
          : nonEmptySaved.length > 0
            ? nonEmptySaved
            : activeTextSelection && activeTextSelection.end > activeTextSelection.start
              ? [
                  {
                    pageId: activeTextSelection.pageId,
                    blockId: activeTextSelection.blockId,
                    start: activeTextSelection.start,
                    end: activeTextSelection.end,
                  },
                ]
              : [];

      if (selectedRanges.length > 0) {
        updateActiveNote((n) => {
          const currentPages = normalizeNotePages(n).pages || [];
          const nextPages = currentPages.map((p) => {
            const pageRanges = selectedRanges.filter((r) => r.pageId === p.id);
            if (pageRanges.length === 0) return p;

            return {
              ...p,
              blocks: p.blocks.map((b) => {
                const blockRanges = pageRanges.filter((r) => r.blockId === b.id);
                if (blockRanges.length === 0) return b;
                const baseFont = b.fontFamily || (b.type === 'code' ? 'mono' : n.fontFamily || 'sans');
                const added: TextFontSpan[] = blockRanges.map((r) => ({
                  start: r.start,
                  end: r.end,
                  fontFamily: font,
                }));
                const nextSpans = normalizeFontSpans(
                  [...(b.fontSpans || []), ...added],
                  b.content.length,
                  baseFont
                );
                return {
                  ...b,
                  fontSpans: nextSpans.length > 0 ? nextSpans : undefined,
                };
              }),
            };
          });
          return {
            ...n,
            pages: nextPages,
            blocks: nextPages[0]?.blocks || n.blocks,
            strokes: nextPages[0]?.strokes || n.strokes,
          };
        });

        if (activeTextSelection) {
          setActiveTextSelection({ ...activeTextSelection, fontFamily: font });
        }
        return;
      }

      // No range selected -> apply only to the single block containing the caret
      const caretTarget =
        liveRanges[0] ||
        (activeTextSelection
          ? {
              pageId: activeTextSelection.pageId,
              blockId: activeTextSelection.blockId,
            }
          : null);

      if (!caretTarget) {
        showToast('Seleziona del testo o posiziona il cursore su una riga');
        return;
      }

      handleUpdateHybridPage(caretTarget.pageId, (page) => ({
        ...page,
        blocks: page.blocks.map((b) =>
          b.id === caretTarget.blockId
            ? {
                ...b,
                fontFamily: font,
                fontSpans: undefined,
              }
            : b
        ),
      }));

      if (activeTextSelection) {
        setActiveTextSelection({ ...activeTextSelection, fontFamily: font });
      }
    },
    [activeNote, activeTextSelection, updateActiveNote, handleUpdateHybridPage, showToast]
  );

  // Word-style Text Color Formatting (Hybrid selection/block + PDF floating textbox/span)
  const handleApplyTextColor = useCallback(
    (
      color: string | undefined,
      explicitPdfTarget?: { kind: 'textbox' | 'pdfspan'; pageIndex: number; id: string } | null
    ) => {
      if (!activeNote) return;

      if (activeNote.documentType === 'pdf') {
        const pdfTgt = explicitPdfTarget || activePdfTextTarget;
        if (!pdfTgt) {
          showToast('Seleziona prima un testo o una casella del PDF');
          return;
        }
        const nextHex = color || '#1C1C1E';
        updateActiveNote((n) => ({
          ...n,
          pdfPages: (n.pdfPages || []).map((p) => {
            if (p.pageIndex !== pdfTgt.pageIndex) return p;
            if (pdfTgt.kind === 'textbox') {
              return {
                ...p,
                textBoxes: p.textBoxes.map((tb) =>
                  tb.id === pdfTgt.id ? { ...tb, color: nextHex } : tb
                ),
              };
            }
            const nextSpans: PdfTextSpan[] = (p.textSpans || []).map((sp) =>
              sp.id === pdfTgt.id
                ? {
                    ...sp,
                    editedText: sp.editedText || sp.originalText,
                    text: sp.editedText || sp.originalText,
                    color: nextHex,
                    isEdited: true,
                  }
                : sp
            );
            return {
              ...p,
              textSpans: nextSpans,
              textEdits: nextSpans
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
                  fontWeight: sp.fontWeight,
                  fontStyle: sp.fontStyle,
                  letterSpacing: sp.letterSpacing ?? 0,
                  scaleX: sp.scaleX ?? 1,
                  color: sp.color,
                  backgroundColor: sp.backgroundColor,
                })),
            };
          }),
        }));
        setActivePdfTextTarget((prev) => (prev ? { ...prev, color: nextHex } : prev));
        return;
      }

      const liveRanges = collectSelectedBlockRangesFromDOM();
      const nonEmptyLive = liveRanges.filter((r) => r.end > r.start);
      const nonEmptySaved = (activeTextSelection?.ranges || []).filter((r) => r.end > r.start);

      const selectedRanges =
        nonEmptyLive.length > 0
          ? nonEmptyLive
          : nonEmptySaved.length > 0
            ? nonEmptySaved
            : activeTextSelection && activeTextSelection.end > activeTextSelection.start
              ? [
                  {
                    pageId: activeTextSelection.pageId,
                    blockId: activeTextSelection.blockId,
                    start: activeTextSelection.start,
                    end: activeTextSelection.end,
                  },
                ]
              : [];

      if (selectedRanges.length > 0) {
        updateActiveNote((n) => {
          const currentPages = normalizeNotePages(n).pages || [];
          const nextPages = currentPages.map((p) => {
            const pageRanges = selectedRanges.filter((r) => r.pageId === p.id);
            if (pageRanges.length === 0) return p;

            return {
              ...p,
              blocks: p.blocks.map((b) => {
                const blockRanges = pageRanges.filter((r) => r.blockId === b.id);
                if (blockRanges.length === 0) return b;
                const appliedColor = color || '';
                const added: TextColorSpan[] = blockRanges.map((r) => ({
                  start: r.start,
                  end: r.end,
                  color: appliedColor,
                }));
                const nextSpans = normalizeColorSpans(
                  [...(b.colorSpans || []), ...added],
                  b.content.length,
                  b.color
                );
                return {
                  ...b,
                  colorSpans: nextSpans.length > 0 ? nextSpans : undefined,
                };
              }),
            };
          });
          return {
            ...n,
            pages: nextPages,
            blocks: nextPages[0]?.blocks || n.blocks,
            strokes: nextPages[0]?.strokes || n.strokes,
          };
        });

        if (activeTextSelection) {
          setActiveTextSelection({ ...activeTextSelection, color });
        }
        return;
      }

      const caretTarget =
        liveRanges[0] ||
        (activeTextSelection
          ? {
              pageId: activeTextSelection.pageId,
              blockId: activeTextSelection.blockId,
            }
          : null);

      if (!caretTarget) {
        showToast('Seleziona del testo o posiziona il cursore su una riga');
        return;
      }

      handleUpdateHybridPage(caretTarget.pageId, (page) => ({
        ...page,
        blocks: page.blocks.map((b) =>
          b.id === caretTarget.blockId
            ? {
                ...b,
                color,
                colorSpans: undefined,
              }
            : b
        ),
      }));

      if (activeTextSelection) {
        setActiveTextSelection({ ...activeTextSelection, color });
      }
    },
    [activeNote, activePdfTextTarget, activeTextSelection, updateActiveNote, handleUpdateHybridPage, showToast]
  );

  // Import Local PDF
  const handleImportPdf = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const { pages } = await loadPdfMetadata(buffer);
      const pdfDataId = `pdf_${Date.now()}`;
      await savePdfBlob(pdfDataId, buffer);

      const targetFolder = activeFolderId === 'all' ? folders[0]?.id || '' : activeFolderId;
      const now = Date.now();
      const pdfNote: NoteDocument = {
        id: `note_pdf_${now}`,
        folderId: targetFolder,
        title: file.name.replace(/\.pdf$/i, ''),
        pinned: false,
        paperStyle: 'blank',
        documentType: 'pdf',
        blocks: [],
        strokes: [],
        pdfDataId,
        pdfFileName: file.name,
        pdfPages: pages,
        createdAt: now,
        updatedAt: now,
      };
      await saveNote(pdfNote);
      setNotes((prev) => [pdfNote, ...prev]);
      setActiveNoteId(pdfNote.id);
      setActivePdfBuffer(buffer);
      if (typeof window !== 'undefined' && window.innerWidth < 860 && pages[0]?.width > window.innerWidth - 20) {
        setZoom(clampZoom((window.innerWidth - 16) / pages[0].width));
      }
      setActiveTool('pen');
      showToast(`PDF importato (${pages.length} ${pages.length === 1 ? 'pagina' : 'pagine'})`);
    } catch {
      showToast('Impossibile leggere il file PDF selezionato');
    }
  };

  // Export & Import .qaderno Archives
  const handleExportQaderno = async () => {
    if (!activeNote) return;
    try {
      const { blob, filename } = await exportQadernoArchive(activeNote, folders);
      downloadBlob(blob, filename);
      showToast(`Esportato ${filename}`);
    } catch {
      showToast('Errore durante la creazione del file .qaderno');
    }
  };

  const commitImportedQaderno = useCallback(
    async (
      importedNote: NoteDocument,
      pdfBuffer: ArrayBuffer | null,
      folderNameHint?: string,
      asCopy = false
    ) => {
      const now = Date.now();
      let finalNote = normalizeNotePages({ ...importedNote });

      if (asCopy) {
        const suffix = `_${now}_${Math.random().toString(36).slice(2, 5)}`;
        finalNote = {
          ...finalNote,
          id: `${finalNote.id}${suffix}`,
          title: `${finalNote.title || 'Quaderno'} (Copia)`,
          createdAt: now,
          updatedAt: now,
        };
      }

      // Ensure target folder exists or map cleanly
      let nextFolders = folders;
      if (finalNote.folderId && !folders.some((f) => f.id === finalNote.folderId)) {
        if (folderNameHint) {
          const createdFolder: Folder = {
            id: finalNote.folderId,
            name: folderNameHint,
            createdAt: now,
            order: folders.length,
          };
          await saveFolder(createdFolder);
          nextFolders = [...folders, createdFolder];
          setFolders(nextFolders);
        } else {
          finalNote = { ...finalNote, folderId: '' };
        }
      }

      if (pdfBuffer) {
        const pdfId =
          asCopy || !finalNote.pdfDataId ? `pdf_${now}_${Math.random().toString(36).slice(2, 6)}` : finalNote.pdfDataId;
        await savePdfBlob(pdfId, pdfBuffer);
        finalNote = { ...finalNote, pdfDataId: pdfId };
      }

      await saveNote(finalNote);
      setNotes((prev) => {
        const without = prev.filter((n) => n.id !== finalNote.id);
        return [finalNote, ...without];
      });
      setActiveNoteId(finalNote.id);
      if (pdfBuffer) setActivePdfBuffer(pdfBuffer);
      showToast(`Quaderno "${finalNote.title}" aperto`);
    },
    [folders, showToast]
  );

  const handleOpenQadernoFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      for (const file of arr) {
        if (file.name.toLowerCase().endsWith('.pdf')) {
          await handleImportPdf(file);
          continue;
        }
        if (!file.name.toLowerCase().endsWith('.qaderno')) {
          showToast(`Formato non supportato: ${file.name}`);
          continue;
        }
        try {
          const parsed = await parseQadernoArchive(file);
          const duplicate = notes.find((n) => n.id === parsed.note.id);
          if (duplicate) {
            setConfirmPrompt({
              open: true,
              title: `Quaderno "${parsed.note.title}" già presente`,
              message:
                'Questo file .qaderno esiste già nella tua raccolta. Vuoi sovrascrivere quello esistente o importarlo come nuova copia?',
              actions: [
                {
                  label: 'Sovrascrivi esistente',
                  variant: 'primary',
                  onClick: () => {
                    commitImportedQaderno(parsed.note, parsed.pdfBuffer, parsed.manifest.folderName, false);
                  },
                },
                {
                  label: 'Crea una copia',
                  variant: 'default',
                  onClick: () => {
                    commitImportedQaderno(parsed.note, parsed.pdfBuffer, parsed.manifest.folderName, true);
                  },
                },
                { label: 'Annulla', variant: 'default', onClick: () => {} },
              ],
            });
          } else {
            await commitImportedQaderno(parsed.note, parsed.pdfBuffer, parsed.manifest.folderName, false);
          }
        } catch {
          showToast(`Impossibile aprire "${file.name}"`);
        }
      }
    },
    [notes, commitImportedQaderno, showToast]
  );

  // Global External File Drag & Drop Overlay (".qaderno" and ".pdf")
  useEffect(() => {
    const isExternalFileDrag = (e: DragEvent) =>
      e.dataTransfer?.types?.includes('Files') && !e.dataTransfer?.types?.includes('text/qaderno-note-id');

    const onDragEnter = (e: DragEvent) => {
      if (!isExternalFileDrag(e)) return;
      e.preventDefault();
      fileDropDepthRef.current += 1;
      setFileDropActive(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!isExternalFileDrag(e)) return;
      e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      if (!isExternalFileDrag(e)) return;
      fileDropDepthRef.current = Math.max(0, fileDropDepthRef.current - 1);
      if (fileDropDepthRef.current === 0) setFileDropActive(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!isExternalFileDrag(e)) return;
      e.preventDefault();
      fileDropDepthRef.current = 0;
      setFileDropActive(false);
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        handleOpenQadernoFiles(e.dataTransfer.files);
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [handleOpenQadernoFiles]);

  // Export PDF / Markdown / JSON
  const handleExportPdf = async () => {
    if (!activeNote) return;
    try {
      let bytes: Uint8Array;
      if (activeNote.documentType === 'pdf' && activePdfBuffer) {
        bytes = await exportAnnotatedPdf(activePdfBuffer, activeNote);
      } else {
        bytes = await exportHybridNoteToPdf(
          activeNote,
          layoutMetricsRef.current.blockOffsetsByPage,
          layoutMetricsRef.current.canvasWidth
        );
      }
      const safeBytes = new Uint8Array(bytes);
      const blob = new Blob([safeBytes], { type: 'application/pdf' });
      const filename = `${sanitizeFilename(activeNote.title)}.pdf`;
      downloadBlob(blob, filename);
      showToast('PDF vettoriale esportato');
    } catch {
      showToast('Errore durante l’esportazione PDF');
    }
  };

  const handleExportMarkdown = () => {
    if (!activeNote) return;
    const md = noteToMarkdown(activeNote);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const filename = `${sanitizeFilename(activeNote.title)}.md`;
    downloadBlob(blob, filename);
    showToast('Quaderno esportato in Markdown');
  };

  const buildSessionUIState = useCallback(
    (): SessionUIState => ({
      activeFolderId,
      activeNoteId,
      preferences,
      shortcuts,
      dockPosition,
      zoom,
      activeTool,
    }),
    [activeFolderId, activeNoteId, preferences, shortcuts, dockPosition, zoom, activeTool]
  );

  // Automatic local full-session JSON saving (runs when setting is ON & manual JSON has been downloaded)
  useEffect(() => {
    if (!ready || !preferences.autoSaveSessionJson || !preferences.sessionJsonManualDownloaded) {
      return;
    }
    if (sessionJsonTimerRef.current) {
      window.clearTimeout(sessionJsonTimerRef.current);
    }
    sessionJsonTimerRef.current = window.setTimeout(() => {
      autoPersistSessionJSON(buildSessionUIState(), connectedSessionFileHandle).then((res) => {
        setLastSessionJsonSavedAt(res.savedAt);
      });
    }, 1100);

    return () => {
      if (sessionJsonTimerRef.current) {
        window.clearTimeout(sessionJsonTimerRef.current);
      }
    };
  }, [
    ready,
    notes,
    folders,
    activeFolderId,
    activeNoteId,
    preferences,
    shortcuts,
    dockPosition,
    zoom,
    activeTool,
    connectedSessionFileHandle,
    buildSessionUIState,
  ]);

  const handleExportArchive = async () => {
    try {
      const uiState = buildSessionUIState();
      const nextPrefs: AppPreferences = {
        ...preferences,
        sessionJsonManualDownloaded: true,
      };
      const res = await downloadAndLinkSessionJSON(
        { ...uiState, preferences: nextPrefs },
        downloadBlob
      );
      if (res.cancelled) return;

      if (res.fileHandle) {
        setConnectedSessionFileHandle(res.fileHandle);
      }
      setLastSessionJsonSavedAt(res.savedAt);
      if (!preferences.sessionJsonManualDownloaded) {
        setPreferences(nextPrefs);
        savePreferences(nextPrefs);
      }
      showToast(
        res.usedPicker
          ? 'Sessione .json salvata e collegata per aggiornamenti automatici'
          : 'Sessione completa .json scaricata'
      );
    } catch {
      showToast('Impossibile salvare il file sessione .json');
    }
  };

  const handleImportArchive = async (file: File) => {
    try {
      const text = await file.text();
      const { folders: f, notes: n, sessionState } = await importSessionJSON(text);
      setFolders(f);
      setNotes(n);
      if (sessionState) {
        setActiveFolderId(sessionState.activeFolderId ?? 'all');
        setActiveNoteId(sessionState.activeNoteId ?? n[0]?.id ?? null);
        if (sessionState.preferences) {
          const mergedPrefs = { ...preferences, ...sessionState.preferences };
          setPreferences(mergedPrefs);
          savePreferences(mergedPrefs);
          setHoldToSnap(mergedPrefs.defaultHoldToSnap);
        }
        if (sessionState.shortcuts) {
          setShortcuts(sessionState.shortcuts);
          saveShortcuts(sessionState.shortcuts);
        }
        if (sessionState.dockPosition) {
          setDockPosition(sessionState.dockPosition);
          try {
            localStorage.setItem('qaderno_dock_position_v1', sessionState.dockPosition);
          } catch {
            // ignore storage errors
          }
        }
        if (typeof sessionState.zoom === 'number') {
          setZoom(clampZoom(sessionState.zoom));
        }
        if (sessionState.activeTool) {
          setActiveTool(sessionState.activeTool);
        }
      } else if (n.length > 0 && !activeNoteId) {
        setActiveNoteId(n[0].id);
      }
      showToast('Sessione ripristinata dal file .json');
    } catch {
      showToast('File di backup .json non valido');
    }
  };

  // Stroke Clipboard & Operations
  const getTargetStrokes = useCallback(
    (ids: string[], pageId = selectedHybridPageId, pdfPageIdx = selectedPdfPageIndex): Stroke[] => {
      if (!activeNote || ids.length === 0) return [];
      if (activeNote.documentType === 'pdf') {
        const page = (activeNote.pdfPages || []).find((p) => p.pageIndex === pdfPageIdx);
        return (page?.strokes || []).filter((s) => ids.includes(s.id));
      }
      const pages = normalizeNotePages(activeNote).pages || [];
      const hPage = pageId ? pages.find((p) => p.id === pageId) : pages[0];
      return (hPage?.strokes || []).filter((s) => ids.includes(s.id));
    },
    [activeNote, selectedHybridPageId, selectedPdfPageIndex]
  );

  // Text Context Operations (for RichTextBlocks across pages, PDF floating boxes, & edited PDF spans)
  const performTextCopy = useCallback(
    async (cut: boolean) => {
      const tgt = contextMenu.textTarget;
      if (!activeNote || !tgt) return;

      let copied = tgt.selectedText;
      if (!copied && tgt.kind === 'title') {
        copied = activeNote.title || '';
      } else if (!copied && tgt.kind === 'block') {
        const pages = normalizeNotePages(activeNote).pages || [];
        const hPage = tgt.pageId ? pages.find((p) => p.id === tgt.pageId) : pages[0];
        const blk = hPage?.blocks.find((b) => b.id === tgt.targetId);
        copied = blk?.content || '';
      }
      if (!copied) return;

      setTextClipboard(copied);
      try {
        await navigator.clipboard.writeText(copied);
      } catch {
        // internal clipboard fallback
      }

      if (cut) {
        if (tgt.kind === 'title') {
          updateActiveNote((n) => ({
            ...n,
            title: tgt.selectedText
              ? n.title.slice(0, tgt.selectionStart) + n.title.slice(tgt.selectionEnd)
              : '',
          }));
        } else if (tgt.kind === 'block') {
          const pages = normalizeNotePages(activeNote).pages || [];
          const targetPageId =
            tgt.pageId || pages.find((p) => p.blocks.some((b) => b.id === tgt.targetId))?.id || pages[0]?.id;
          if (!targetPageId) return;
          handleUpdateHybridPage(targetPageId, (p) => ({
            ...p,
            blocks: p.blocks.map((b) => {
              if (b.id !== tgt.targetId) return b;
              if (tgt.selectedText) {
                return {
                  ...b,
                  content: b.content.slice(0, tgt.selectionStart) + b.content.slice(tgt.selectionEnd),
                };
              }
              return { ...b, content: '' };
            }),
          }));
        } else if (tgt.kind === 'textbox' && contextMenu.pageIndex !== undefined) {
          updateActiveNote((n) => ({
            ...n,
            pdfPages: (n.pdfPages || []).map((p) =>
              p.pageIndex === contextMenu.pageIndex
                ? {
                    ...p,
                    textBoxes: p.textBoxes.map((tb) =>
                      tb.id === tgt.targetId
                        ? {
                            ...tb,
                            content:
                              tb.content.slice(0, tgt.selectionStart) + tb.content.slice(tgt.selectionEnd),
                          }
                        : tb
                    ),
                  }
                : p
            ),
          }));
        } else if (tgt.kind === 'pdfspan' && contextMenu.pageIndex !== undefined) {
          updateActiveNote((n) => ({
            ...n,
            pdfPages: (n.pdfPages || []).map((p) => {
              if (p.pageIndex !== contextMenu.pageIndex) return p;
              const nextSpans: PdfTextSpan[] = (p.textSpans || []).map((sp) => {
                if (sp.id !== tgt.targetId) return sp;
                const nextText =
                  sp.editedText.slice(0, tgt.selectionStart) + sp.editedText.slice(tgt.selectionEnd);
                const cal = calibratePdfSpanMetrics(
                  nextText,
                  sp.width,
                  sp.fontSize,
                  sp.fontFamily,
                  sp.fontWeight,
                  sp.fontStyle
                );
                return {
                  ...sp,
                  editedText: nextText,
                  text: nextText,
                  letterSpacing: cal.letterSpacing,
                  scaleX: cal.scaleX,
                  isEdited: nextText !== sp.originalText,
                };
              });
              return {
                ...p,
                textSpans: nextSpans,
                textEdits: nextSpans
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
                    fontWeight: sp.fontWeight,
                    fontStyle: sp.fontStyle,
                    letterSpacing: sp.letterSpacing ?? 0,
                    scaleX: sp.scaleX ?? 1,
                    color: sp.color,
                    backgroundColor: sp.backgroundColor,
                  })),
              };
            }),
          }));
        }
      } else {
        showToast('Testo copiato');
      }
    },
    [activeNote, contextMenu.textTarget, contextMenu.pageIndex, showToast, updateActiveNote, handleUpdateHybridPage]
  );

  const performTextPaste = useCallback(async () => {
    const tgt = contextMenu.textTarget;
    if (!activeNote || !tgt) return;

    let clip = textClipboard;
    try {
      const sysText = await navigator.clipboard.readText();
      if (sysText) clip = sysText;
    } catch {
      // use internal textClipboard
    }
    if (!clip) return;

    if (tgt.kind === 'title') {
      updateActiveNote((n) => ({
        ...n,
        title: n.title.slice(0, tgt.selectionStart) + clip + n.title.slice(tgt.selectionEnd),
      }));
    } else if (tgt.kind === 'block') {
      const pages = normalizeNotePages(activeNote).pages || [];
      const targetPageId =
        tgt.pageId || pages.find((p) => p.blocks.some((b) => b.id === tgt.targetId))?.id || pages[0]?.id;
      if (!targetPageId) return;
      handleUpdateHybridPage(targetPageId, (p) => ({
        ...p,
        blocks: p.blocks.map((b) =>
          b.id === tgt.targetId
            ? {
                ...b,
                content:
                  b.content.slice(0, tgt.selectionStart) + clip + b.content.slice(tgt.selectionEnd),
              }
            : b
        ),
      }));
    } else if (tgt.kind === 'textbox' && contextMenu.pageIndex !== undefined) {
      updateActiveNote((n) => ({
        ...n,
        pdfPages: (n.pdfPages || []).map((p) =>
          p.pageIndex === contextMenu.pageIndex
            ? {
                ...p,
                textBoxes: p.textBoxes.map((tb) =>
                  tb.id === tgt.targetId
                    ? {
                        ...tb,
                        content:
                          tb.content.slice(0, tgt.selectionStart) + clip + tb.content.slice(tgt.selectionEnd),
                      }
                    : tb
                ),
              }
            : p
        ),
      }));
    } else if (tgt.kind === 'pdfspan' && contextMenu.pageIndex !== undefined) {
      updateActiveNote((n) => ({
        ...n,
        pdfPages: (n.pdfPages || []).map((p) => {
          if (p.pageIndex !== contextMenu.pageIndex) return p;
          const nextSpans: PdfTextSpan[] = (p.textSpans || []).map((sp) => {
            if (sp.id !== tgt.targetId) return sp;
            const nextText =
              sp.editedText.slice(0, tgt.selectionStart) + clip + sp.editedText.slice(tgt.selectionEnd);
            const cal = calibratePdfSpanMetrics(
              nextText,
              sp.width,
              sp.fontSize,
              sp.fontFamily,
              sp.fontWeight,
              sp.fontStyle
            );
            return {
              ...sp,
              editedText: nextText,
              text: nextText,
              letterSpacing: cal.letterSpacing,
              scaleX: cal.scaleX,
              isEdited: nextText !== sp.originalText,
            };
          });
          return {
            ...p,
            textSpans: nextSpans,
            textEdits: nextSpans
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
                fontWeight: sp.fontWeight,
                fontStyle: sp.fontStyle,
                letterSpacing: sp.letterSpacing ?? 0,
                scaleX: sp.scaleX ?? 1,
                color: sp.color,
                backgroundColor: sp.backgroundColor,
              })),
          };
        }),
      }));
    }
  }, [activeNote, contextMenu.textTarget, contextMenu.pageIndex, textClipboard, updateActiveNote, handleUpdateHybridPage]);

  const performTextDuplicate = useCallback(() => {
    const tgt = contextMenu.textTarget;
    if (!activeNote || !tgt) return;

    if (tgt.kind === 'block') {
      const pages = normalizeNotePages(activeNote).pages || [];
      const targetPage =
        (tgt.pageId && pages.find((p) => p.id === tgt.pageId)) ||
        pages.find((p) => p.blocks.some((b) => b.id === tgt.targetId));
      if (!targetPage) return;
      const idx = targetPage.blocks.findIndex((b) => b.id === tgt.targetId);
      if (idx === -1) return;
      const source = targetPage.blocks[idx];
      const clone: TextBlock = {
        ...source,
        id: `b_dup_${Date.now()}`,
        content: tgt.selectedText || source.content,
      };
      const updated = [...targetPage.blocks];
      updated.splice(idx + 1, 0, clone);
      handleUpdateHybridPage(targetPage.id, (p) => ({ ...p, blocks: updated }));
    } else if (tgt.kind === 'textbox' && contextMenu.pageIndex !== undefined) {
      updateActiveNote((n) => ({
        ...n,
        pdfPages: (n.pdfPages || []).map((p) => {
          if (p.pageIndex !== contextMenu.pageIndex) return p;
          const src = p.textBoxes.find((tb) => tb.id === tgt.targetId);
          if (!src) return p;
          return {
            ...p,
            textBoxes: [...p.textBoxes, { ...src, id: `tb_dup_${Date.now()}`, x: src.x + 18, y: src.y + 18 }],
          };
        }),
      }));
    }
  }, [activeNote, contextMenu.textTarget, contextMenu.pageIndex, updateActiveNote, handleUpdateHybridPage]);

  const performTextDelete = useCallback(() => {
    const tgt = contextMenu.textTarget;
    if (!activeNote || !tgt) return;

    if (tgt.kind === 'title') {
      updateActiveNote((n) => ({
        ...n,
        title: tgt.selectedText
          ? n.title.slice(0, tgt.selectionStart) + n.title.slice(tgt.selectionEnd)
          : '',
      }));
    } else if (tgt.kind === 'block') {
      const pages = normalizeNotePages(activeNote).pages || [];
      const targetPage =
        (tgt.pageId && pages.find((p) => p.id === tgt.pageId)) ||
        pages.find((p) => p.blocks.some((b) => b.id === tgt.targetId));
      if (!targetPage) return;
      if (tgt.selectedText) {
        handleUpdateHybridPage(targetPage.id, (p) => ({
          ...p,
          blocks: p.blocks.map((b) =>
            b.id === tgt.targetId
              ? { ...b, content: b.content.slice(0, tgt.selectionStart) + b.content.slice(tgt.selectionEnd) }
              : b
          ),
        }));
      } else if (targetPage.blocks.length > 1) {
        handleUpdateHybridPage(targetPage.id, (p) => ({
          ...p,
          blocks: p.blocks.filter((b) => b.id !== tgt.targetId),
        }));
      }
    } else if (tgt.kind === 'textbox' && contextMenu.pageIndex !== undefined) {
      updateActiveNote((n) => ({
        ...n,
        pdfPages: (n.pdfPages || []).map((p) =>
          p.pageIndex === contextMenu.pageIndex
            ? { ...p, textBoxes: p.textBoxes.filter((tb) => tb.id !== tgt.targetId) }
            : p
        ),
      }));
    } else if (tgt.kind === 'pdfspan' && contextMenu.pageIndex !== undefined) {
      updateActiveNote((n) => ({
        ...n,
        pdfPages: (n.pdfPages || []).map((p) => {
          if (p.pageIndex !== contextMenu.pageIndex) return p;
          const nextSpans: PdfTextSpan[] = (p.textSpans || []).map((sp) =>
            sp.id === tgt.targetId
              ? { ...sp, editedText: '', text: '', letterSpacing: 0, scaleX: 1, isEdited: true }
              : sp
          );
          return {
            ...p,
            textSpans: nextSpans,
            textEdits: nextSpans
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
                fontWeight: sp.fontWeight,
                fontStyle: sp.fontStyle,
                letterSpacing: sp.letterSpacing ?? 0,
                scaleX: sp.scaleX ?? 1,
                color: sp.color,
                backgroundColor: sp.backgroundColor,
              })),
          };
        }),
      }));
    }
  }, [activeNote, contextMenu.textTarget, contextMenu.pageIndex, updateActiveNote, handleUpdateHybridPage]);

  const performTextUndoFormatting = useCallback(() => {
    const tgt = contextMenu.textTarget;
    if (!activeNote || !tgt || tgt.kind !== 'block') return;
    const pages = normalizeNotePages(activeNote).pages || [];
    const targetPage =
      (tgt.pageId && pages.find((p) => p.id === tgt.pageId)) ||
      pages.find((p) => p.blocks.some((b) => b.id === tgt.targetId));
    if (!targetPage) return;

    handleUpdateHybridPage(targetPage.id, (p) => ({
      ...p,
      blocks: p.blocks.map((b) => {
        if (b.id !== tgt.targetId) return b;
        // Check if selection/caret hits an inline styleSpan first
        const probeStart = tgt.selectionStart;
        const probeEnd = tgt.selectionEnd;
        const hitSpan = b.styleSpans?.find((sp) =>
          probeStart === probeEnd
            ? probeStart >= sp.start && probeStart <= sp.end
            : sp.start < probeEnd && sp.end > probeStart
        );
        if (hitSpan) {
          const remaining = (b.styleSpans || []).filter((sp) => sp !== hitSpan);
          if (hitSpan.rawWrap) {
            const wrap = hitSpan.rawWrap;
            const wLen = wrap.length;
            const s = hitSpan.start;
            const e = hitSpan.end;
            const nextContent =
              b.content.slice(0, s) + wrap + b.content.slice(s, e) + wrap + b.content.slice(e);
            const shift = <T extends { start: number; end: number }>(sp: T): T => ({
              ...sp,
              start: sp.start < s ? sp.start : sp.start <= e ? sp.start + wLen : sp.start + wLen * 2,
              end: sp.end <= s ? sp.end : sp.end <= e ? sp.end + wLen : sp.end + wLen * 2,
            });
            return {
              ...b,
              content: nextContent,
              fontSpans: b.fontSpans?.map(shift),
              colorSpans: b.colorSpans?.map(shift),
              styleSpans: remaining.length > 0 ? remaining.map(shift) : undefined,
            };
          }
          return {
            ...b,
            styleSpans: remaining.length > 0 ? remaining : undefined,
          };
        }

        // Otherwise revert block-level formatting
        const prefix = b.autoFormatSymbol || '';
        const pLen = prefix.length;
        return {
          ...b,
          type: 'paragraph',
          checked: undefined,
          autoFormatSymbol: undefined,
          content: prefix + b.content,
          fontSpans: b.fontSpans?.map((sp) => ({ ...sp, start: sp.start + pLen, end: sp.end + pLen })),
          colorSpans: b.colorSpans?.map((sp) => ({ ...sp, start: sp.start + pLen, end: sp.end + pLen })),
          styleSpans: b.styleSpans?.map((sp) => ({ ...sp, start: sp.start + pLen, end: sp.end + pLen })),
        };
      }),
    }));
  }, [activeNote, contextMenu.textTarget, handleUpdateHybridPage]);

  const handleCopySelection = useCallback(
    (ids = selectedStrokeIds, pageId = selectedHybridPageId, pageIdx = selectedPdfPageIndex) => {
      const picked = getTargetStrokes(ids, pageId, pageIdx);
      if (picked.length > 0) {
        setClipboardStrokes(picked.map((s) => ({ ...s, points: s.points.map((p) => ({ ...p })) })));
        showToast(`${picked.length} ${picked.length === 1 ? 'tratto copiato' : 'tratti copiati'}`);
      }
    },
    [getTargetStrokes, selectedStrokeIds, selectedHybridPageId, selectedPdfPageIndex, showToast]
  );

  const handleDeleteSelection = useCallback(
    (ids = selectedStrokeIds, pageId = selectedHybridPageId, pageIdx = selectedPdfPageIndex) => {
      if (!activeNote || ids.length === 0) return;
      if (activeNote.documentType === 'pdf') {
        updateActiveNote((n) => ({
          ...n,
          pdfPages: (n.pdfPages || []).map((p) =>
            pageIdx === undefined || p.pageIndex === pageIdx
              ? { ...p, strokes: p.strokes.filter((s) => !ids.includes(s.id)) }
              : p
          ),
        }));
      } else {
        const targetId = pageId || normalizeNotePages(activeNote).pages?.[0]?.id;
        if (targetId) {
          handleUpdateHybridPage(targetId, (p) => ({
            ...p,
            strokes: p.strokes.filter((s) => !ids.includes(s.id)),
          }));
        }
      }
      setSelectedStrokeIds([]);
    },
    [activeNote, selectedStrokeIds, selectedHybridPageId, selectedPdfPageIndex, updateActiveNote, handleUpdateHybridPage]
  );

  const handleCutSelection = useCallback(
    (ids = selectedStrokeIds, pageId = selectedHybridPageId, pageIdx = selectedPdfPageIndex) => {
      handleCopySelection(ids, pageId, pageIdx);
      handleDeleteSelection(ids, pageId, pageIdx);
    },
    [handleCopySelection, handleDeleteSelection, selectedStrokeIds, selectedHybridPageId, selectedPdfPageIndex]
  );

  const handlePasteAt = useCallback(
    (targetX?: number, targetY?: number, pageId?: string, pageIdx?: number) => {
      if (!activeNote || clipboardStrokes.length === 0) return;

      let minX = Infinity,
        minY = Infinity;
      for (const s of clipboardStrokes) {
        const b = getStrokeBounds(s);
        minX = Math.min(minX, b.minX);
        minY = Math.min(minY, b.minY);
      }

      const dx = targetX !== undefined ? targetX - minX : 20;
      const dy = targetY !== undefined ? targetY - minY : 20;

      const pasted = clipboardStrokes.map((s, idx) => ({
        ...translateStroke(s, dx, dy),
        id: `st_paste_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        anchorBlockId: targetY !== undefined ? undefined : s.anchorBlockId,
      }));

      if (activeNote.documentType === 'pdf') {
        const destPage = pageIdx ?? selectedPdfPageIndex ?? 0;
        updateActiveNote((n) => ({
          ...n,
          pdfPages: (n.pdfPages || []).map((p) =>
            p.pageIndex === destPage ? { ...p, strokes: [...p.strokes, ...pasted] } : p
          ),
        }));
        setSelectedPdfPageIndex(destPage);
      } else {
        const destPageId = pageId || selectedHybridPageId || normalizeNotePages(activeNote).pages?.[0]?.id;
        if (destPageId) {
          handleUpdateHybridPage(destPageId, (p) => ({
            ...p,
            strokes: [...p.strokes, ...pasted],
          }));
          setSelectedHybridPageId(destPageId);
        }
      }
      setSelectedStrokeIds(pasted.map((s) => s.id));
    },
    [activeNote, clipboardStrokes, selectedPdfPageIndex, selectedHybridPageId, updateActiveNote, handleUpdateHybridPage]
  );

  const handleDuplicateSelection = useCallback(
    (ids = selectedStrokeIds, pageId = selectedHybridPageId, pageIdx = selectedPdfPageIndex) => {
      const picked = getTargetStrokes(ids, pageId, pageIdx);
      if (!activeNote || picked.length === 0) return;
      const dupes = picked.map((s, idx) => ({
        ...translateStroke(s, 18, 18),
        id: `st_dup_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      }));
      if (activeNote.documentType === 'pdf') {
        updateActiveNote((n) => ({
          ...n,
          pdfPages: (n.pdfPages || []).map((p) =>
            pageIdx === undefined || p.pageIndex === pageIdx
              ? { ...p, strokes: [...p.strokes, ...dupes] }
              : p
          ),
        }));
      } else {
        const destPageId = pageId || normalizeNotePages(activeNote).pages?.[0]?.id;
        if (destPageId) {
          handleUpdateHybridPage(destPageId, (p) => ({ ...p, strokes: [...p.strokes, ...dupes] }));
        }
      }
      setSelectedStrokeIds(dupes.map((d) => d.id));
    },
    [activeNote, getTargetStrokes, selectedStrokeIds, selectedHybridPageId, selectedPdfPageIndex, updateActiveNote, handleUpdateHybridPage]
  );

  const handleRecolorSelection = useCallback(
    (hex: string, ids = selectedStrokeIds, pageId = selectedHybridPageId, pageIdx = selectedPdfPageIndex) => {
      if (!activeNote || ids.length === 0) return;
      if (activeNote.documentType === 'pdf') {
        updateActiveNote((n) => ({
          ...n,
          pdfPages: (n.pdfPages || []).map((p) =>
            pageIdx === undefined || p.pageIndex === pageIdx
              ? {
                  ...p,
                  strokes: p.strokes.map((s) => (ids.includes(s.id) ? { ...s, color: hex } : s)),
                }
              : p
          ),
        }));
      } else {
        const destPageId = pageId || normalizeNotePages(activeNote).pages?.[0]?.id;
        if (destPageId) {
          handleUpdateHybridPage(destPageId, (p) => ({
            ...p,
            strokes: p.strokes.map((s) => (ids.includes(s.id) ? { ...s, color: hex } : s)),
          }));
        }
      }
    },
    [activeNote, selectedStrokeIds, selectedHybridPageId, selectedPdfPageIndex, updateActiveNote, handleUpdateHybridPage]
  );

  const handleBeautifyHandwriting = useCallback(
    (ids?: string[], pageId?: string, pageIdx?: number) => {
      if (!activeNote) return;
      const targetIds = ids && ids.length > 0 ? ids : selectedStrokeIds.length > 0 ? selectedStrokeIds : undefined;

      if (activeNote.documentType === 'pdf') {
        const targetPageIdx = pageIdx ?? selectedPdfPageIndex;
        updateActiveNote((n) => ({
          ...n,
          pdfPages: (n.pdfPages || []).map((p) =>
            targetPageIdx === undefined || p.pageIndex === targetPageIdx
              ? { ...p, strokes: beautifyHandwritingStrokes(p.strokes, targetIds) }
              : p
          ),
        }));
      } else {
        const targetPageId = pageId || selectedHybridPageId;
        updateActiveNote((n) => {
          const pages = normalizeNotePages(n).pages || [];
          const updatedPages = pages.map((p) => {
            if (targetPageId && p.id !== targetPageId) return p;
            const blockOffsets = layoutMetricsRef.current.blockOffsetsByPage[p.id] || {};
            return {
              ...p,
              strokes: beautifyHandwritingStrokes(p.strokes, targetIds, (s) =>
                s.anchorBlockId && blockOffsets[s.anchorBlockId] ? blockOffsets[s.anchorBlockId].top : 0
              ),
            };
          });
          return {
            ...n,
            pages: updatedPages,
            strokes: updatedPages[0]?.strokes || n.strokes,
          };
        });
      }
      showToast('Scrittura a mano rifinita e raddrizzata');
    },
    [activeNote, selectedStrokeIds, selectedHybridPageId, selectedPdfPageIndex, updateActiveNote, showToast]
  );

  const handleSelectTool = useCallback((tool: ToolType) => {
    setActiveTool(tool);
    if (tool === 'text') {
      setSelectedStrokeIds([]);
    }
  }, []);

  const handleAddTextItemAtContext = useCallback(() => {
    if (!activeNote) return;
    if (activeNote.documentType === 'pdf') {
      const pages = activeNote.pdfPages || [];
      const targetIdx = contextMenu.pageIndex ?? pages[0]?.pageIndex ?? 0;
      const newBox: FloatingTextBox = {
        id: `tb_${Date.now()}`,
        x: Math.max(20, Math.round(contextMenu.canvasX || 80)),
        y: Math.max(20, Math.round(contextMenu.canvasY || 80)),
        width: 240,
        content: 'Nuova nota…',
        fontSize: 14,
        color: activeColor,
      };
      updateActiveNote((n) => ({
        ...n,
        pdfPages: (n.pdfPages || []).map((p) =>
          p.pageIndex === targetIdx ? { ...p, textBoxes: [...p.textBoxes, newBox] } : p
        ),
      }));
      setActiveTool('text');
      showToast('Casella di testo aggiunta');
      return;
    }

    const pages = normalizeNotePages(activeNote).pages || [];
    const targetPageId = contextMenu.pageId || pages[0]?.id;
    if (!targetPageId) return;
    const newBlock: TextBlock = {
      id: `b_${Date.now()}`,
      type: 'paragraph',
      content: '',
      fontFamily: preferences.defaultFontFamily,
    };
    handleUpdateHybridPage(targetPageId, (p) => ({
      ...p,
      blocks: [...p.blocks, newBlock],
    }));
    setActiveTool('text');
  }, [
    activeNote,
    contextMenu.pageIndex,
    contextMenu.pageId,
    contextMenu.canvasX,
    contextMenu.canvasY,
    activeColor,
    preferences.defaultFontFamily,
    updateActiveNote,
    handleUpdateHybridPage,
    showToast,
  ]);

  // Global Customizable Keyboard Shortcuts (including Zoom In / Zoom Out / Reset 100%)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (settingsModalOpen || installGuideOpen || confirmPrompt.open) return;

      const el = document.activeElement as HTMLElement | null;
      const isTextFocused =
        el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable);

      const check = (id: ShortcutActionId) => matchesCombo(e, shortcuts[id]);

      if (check('zoomIn')) {
        e.preventDefault();
        setZoom((z) => clampZoom(z + 0.1));
        return;
      }
      if (check('zoomOut')) {
        e.preventDefault();
        setZoom((z) => clampZoom(z - 0.1));
        return;
      }
      if (check('zoomReset')) {
        e.preventDefault();
        setZoom(1);
        return;
      }

      if (check('undo') && !isTextFocused) {
        e.preventDefault();
        handleUndo();
        return;
      }
      if (check('redo') && !isTextFocused) {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (selectedStrokeIds.length > 0) {
        if (check('copy')) {
          e.preventDefault();
          handleCopySelection();
          return;
        }
        if (check('cut')) {
          e.preventDefault();
          handleCutSelection();
          return;
        }
        if (check('delete')) {
          e.preventDefault();
          handleDeleteSelection();
          return;
        }
      }

      if (isTextFocused && !e.metaKey && !e.ctrlKey && !e.altKey) {
        return;
      }

      if (check('undo')) {
        e.preventDefault();
        handleUndo();
        return;
      }
      if (check('redo')) {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (check('paste') && clipboardStrokes.length > 0 && !isTextFocused) {
        e.preventDefault();
        handlePasteAt();
        return;
      }

      if (check('toolPen')) {
        e.preventDefault();
        handleSelectTool('pen');
      } else if (check('toolHighlighter')) {
        e.preventDefault();
        handleSelectTool('highlighter');
      } else if (check('toolEraser')) {
        e.preventDefault();
        handleSelectTool('eraser');
      } else if (check('toolLasso')) {
        e.preventDefault();
        handleSelectTool('lasso');
      } else if (check('toolText')) {
        e.preventDefault();
        handleSelectTool('text');
      } else if (check('toggleSnap')) {
        e.preventDefault();
        setHoldToSnap((v) => !v);
      } else if (check('color1')) {
        e.preventDefault();
        setActiveColor(INK_COLORS[0].hex);
      } else if (check('color2')) {
        e.preventDefault();
        setActiveColor(INK_COLORS[1].hex);
      } else if (check('color3')) {
        e.preventDefault();
        setActiveColor(INK_COLORS[2].hex);
      } else if (check('color4')) {
        e.preventDefault();
        setActiveColor(INK_COLORS[3].hex);
      } else if (check('color5')) {
        e.preventDefault();
        setActiveColor(INK_COLORS[4].hex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    shortcuts,
    settingsModalOpen,
    installGuideOpen,
    confirmPrompt.open,
    selectedStrokeIds.length,
    clipboardStrokes.length,
    handleUndo,
    handleRedo,
    handleCopySelection,
    handleCutSelection,
    handleDeleteSelection,
    handlePasteAt,
    handleSelectTool,
  ]);

  const canUndo = activeNote ? (undoMap[activeNote.id]?.length || 0) > 0 : false;
  const canRedo = activeNote ? (redoMap[activeNote.id]?.length || 0) > 0 : false;

  if (!ready) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[#F2F2F7] dark:bg-[#0E0E10]">
        <div className="flex items-center gap-3 text-sm text-[#48484A] dark:text-[#A1A1A6]">
          <QadernoLogo size={28} zoomedTail />
          <span>Caricamento Qaderno…</span>
        </div>
      </div>
    );
  }

  return (
    <div
      onContextMenu={(e) => {
        if (settingsModalOpen || installGuideOpen || confirmPrompt.open) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        setContextMenu({
          visible: true,
          scope: activeNote ? 'canvas' : 'app',
          x: e.clientX,
          y: e.clientY,
          canvasX: 60,
          canvasY: 60,
          pageId:
            selectedHybridPageId ||
            (activeNote?.documentType === 'hybrid'
              ? normalizeNotePages(activeNote).pages?.[0]?.id
              : undefined),
          pageIndex:
            selectedPdfPageIndex ??
            (activeNote?.documentType === 'pdf' ? activeNote.pdfPages?.[0]?.pageIndex : undefined),
          totalPages:
            activeNote?.documentType === 'pdf'
              ? activeNote.pdfPages?.length || 1
              : activeNote
                ? normalizeNotePages(activeNote).pages?.length || 1
                : 1,
          targetStrokeIds: selectedStrokeIds,
        });
      }}
      className="h-screen w-screen overflow-hidden flex bg-[#F2F2F7] dark:bg-[#0E0E10] text-[#1C1C1E] dark:text-[#F5F5F7]"
    >
      <Sidebar
        open={sidebarOpen}
        folders={folders}
        notes={notes}
        activeFolderId={activeFolderId}
        activeNoteId={activeNoteId}
        searchQuery={searchQuery}
        saveLabel={saveLabel}
        showInstallButton={!isInstalled && (isInstallable || isIOS)}
        onCloseMobile={() => setSidebarOpen(false)}
        onSelectFolder={setActiveFolderId}
        onCreateFolder={handleCreateFolder}
        onRenameFolder={handleRenameFolder}
        onRequestDeleteFolder={handleRequestDeleteFolder}
        onMoveNoteToFolder={handleMoveNoteToFolder}
        onSelectNote={setActiveNoteId}
        onCreateNote={handleCreateNote}
        onTogglePinNote={handleTogglePinNote}
        onRequestDeleteNote={handleRequestDeleteNote}
        onSearchChange={setSearchQuery}
        onOpenSettings={() => setSettingsModalOpen(true)}
        onOpenQadernoFiles={handleOpenQadernoFiles}
        onExportArchive={handleExportArchive}
        onImportArchive={handleImportArchive}
        onTriggerInstall={() => {
          if (isInstallable) {
            install();
          } else {
            setInstallGuideOpen(true);
          }
        }}
        onOpenContextMenu={setContextMenu}
        requestedRenameFolderId={requestedRenameFolderId}
        onClearRequestedRename={() => setRequestedRenameFolderId(null)}
        requestedNewFolderTick={requestedNewFolderTick}
      />

      <main
        ref={workspaceRef}
        className="flex-1 min-w-0 flex flex-col h-full overflow-hidden bg-[#F2F2F7] dark:bg-[#0E0E10] relative"
      >
        <TopBar
          note={activeNote}
          sidebarOpen={sidebarOpen}
          activeTextSelection={activeTextSelection}
          activeTextColor={
            activeNote?.documentType === 'pdf'
              ? activePdfTextTarget?.color
              : activeTextSelection?.color
          }
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          onApplyFontToSelectionOrBlock={handleApplyFontToSelectionOrBlock}
          onApplyTextColor={(col) => handleApplyTextColor(col)}
          onChangePaperStyle={(style: PaperStyle) =>
            updateActiveNote((n) => ({ ...n, paperStyle: style }), false)
          }
          onTogglePin={() => activeNote && handleTogglePinNote(activeNote.id)}
          onImportPdf={handleImportPdf}
          onAddPage={handleAddHybridPage}
          onExportQaderno={handleExportQaderno}
          onExportPdf={handleExportPdf}
          onExportMarkdown={handleExportMarkdown}
          onPrint={() => window.print()}
          onOpenContextMenu={(x, y) => {
            setContextMenu({
              visible: true,
              scope: activeNote ? 'canvas' : 'app',
              x,
              y,
              canvasX: 60,
              canvasY: 60,
              pageId:
                selectedHybridPageId ||
                (activeNote?.documentType === 'hybrid'
                  ? normalizeNotePages(activeNote).pages?.[0]?.id
                  : undefined),
              pageIndex:
                selectedPdfPageIndex ??
                (activeNote?.documentType === 'pdf' ? activeNote.pdfPages?.[0]?.pageIndex : undefined),
              totalPages:
                activeNote?.documentType === 'pdf'
                  ? activeNote.pdfPages?.length || 1
                  : activeNote
                    ? normalizeNotePages(activeNote).pages?.length || 1
                    : 1,
              targetStrokeIds: selectedStrokeIds,
            });
          }}
        />

        {activeNote ? (
          activeNote.documentType === 'pdf' ? (
            <PdfAnnotator
              note={activeNote}
              pdfBuffer={activePdfBuffer}
              zoom={zoom}
              activeTool={activeTool}
              selectedInsertShape={selectedInsertShape}
              eraserMode={eraserMode}
              eraserSize={eraserSize}
              activeColor={activeColor}
              penWidth={penWidth}
              highlighterWidth={highlighterWidth}
              holdToSnap={holdToSnap}
              selectedStrokeIds={selectedStrokeIds}
              onSelectStrokes={(ids, pageIdx) => {
                setSelectedStrokeIds(ids);
                setSelectedPdfPageIndex(pageIdx);
              }}
              onUpdatePages={(pages, recordHistory = true) =>
                updateActiveNote((n) => ({ ...n, pdfPages: pages }), recordHistory)
              }
              onDeletePage={handleDeletePdfPage}
              onOpenContextMenu={(menu) => {
                setSelectedPdfPageIndex(menu.pageIndex);
                setContextMenu(menu);
              }}
              onActivePdfTextTargetChange={setActivePdfTextTarget}
              onChangeZoom={(nextZ) => setZoom(clampZoom(nextZ))}
              onZoomWheel={handleZoomWheel}
            />
          ) : (
            <HybridEditor
              note={activeNote}
              zoom={zoom}
              activeTool={activeTool}
              selectedInsertShape={selectedInsertShape}
              eraserMode={eraserMode}
              eraserSize={eraserSize}
              activeColor={activeColor}
              penWidth={penWidth}
              highlighterWidth={highlighterWidth}
              holdToSnap={holdToSnap}
              textSizeScale={preferences.textSizeScale}
              selectedStrokeIds={selectedStrokeIds}
              selectedPageId={selectedHybridPageId}
              onSelectStrokes={(ids, pageId) => {
                setSelectedStrokeIds(ids);
                setSelectedHybridPageId(pageId);
              }}
              onChangeTitle={(title) => updateActiveNote((n) => ({ ...n, title }))}
              onUpdatePage={handleUpdateHybridPage}
              onAddPage={handleAddHybridPage}
              onDeletePage={handleDeleteHybridPage}
              onActiveTextSelectionChange={setActiveTextSelection}
              onOpenContextMenu={(menu) => {
                setSelectedHybridPageId(menu.pageId);
                setContextMenu(menu);
              }}
              onChangeZoom={(nextZ) => setZoom(clampZoom(nextZ))}
              onZoomWheel={handleZoomWheel}
              onReportLayoutMetrics={(blockOffsetsByPage, canvasWidth) => {
                layoutMetricsRef.current = { blockOffsetsByPage, canvasWidth };
              }}
            />
          )
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3">
            <QadernoLogo size={48} zoomedTail />
            <h1 className="text-lg font-semibold text-[#1C1C1E] dark:text-[#F5F5F7]">
              Nessun quaderno selezionato
            </h1>
            <p className="text-xs text-[#8E8E93] max-w-xs">
              Crea un nuovo quaderno a quadretti, apri un file .qaderno o importa un PDF locale.
            </p>
            <button
              type="button"
              onClick={handleCreateNote}
              className="mt-2 px-5 py-2.5 rounded-full bg-[#1C1C1E] dark:bg-[#F5F5F7] text-[#FBFBFD] dark:text-[#1C1C1E] text-xs font-medium"
            >
              Nuovo quaderno a quadretti
            </button>
          </div>
        )}

        {/* Draggable Apple Notes-Style Translucent Floating Tool Bubble */}
        {activeNote && (
          <FloatingToolDock
            dockPosition={dockPosition}
            activeTool={activeTool}
            selectedInsertShape={selectedInsertShape}
            eraserMode={eraserMode}
            eraserSize={eraserSize}
            activeColor={activeColor}
            penWidth={penWidth}
            highlighterWidth={highlighterWidth}
            holdToSnap={holdToSnap}
            canUndo={canUndo}
            canRedo={canRedo}
            containerRef={workspaceRef}
            onChangeDockPosition={(pos) => {
              setDockPosition(pos);
              try {
                localStorage.setItem('qaderno_dock_position_v1', pos);
              } catch {
                // ignore storage errors
              }
            }}
            onSelectTool={handleSelectTool}
            onSelectInsertShape={setSelectedInsertShape}
            onChangeEraserMode={setEraserMode}
            onChangeEraserSize={setEraserSize}
            onChangeColor={setActiveColor}
            onChangePenWidth={setPenWidth}
            onChangeHighlighterWidth={setHighlighterWidth}
            onToggleHoldToSnap={() => setHoldToSnap((v) => !v)}
            onBeautifyHandwriting={() => handleBeautifyHandwriting()}
            onUndo={handleUndo}
            onRedo={handleRedo}
          />
        )}

        {/* Bottom-Right Translucent Zoom Pill (40% - 300%) */}
        {activeNote && (
          <ZoomPill
            zoom={zoom}
            dockPosition={dockPosition}
            onChangeZoom={(nextZ) => setZoom(clampZoom(nextZ))}
            onFitWidth={handleFitWidth}
          />
        )}
      </main>

      {/* Transparent Drag-and-Drop Overlay for .qaderno and .pdf files */}
      <AnimatePresence>
        {fileDropActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 bg-[#F2F2F7]/75 dark:bg-[#0E0E10]/75 backdrop-blur-md flex items-center justify-center p-6 pointer-events-none no-print"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              className="ios-glass rounded-3xl px-8 py-7 flex flex-col items-center text-center space-y-2.5 border border-[#1C1C1E]/20 dark:border-white/20"
            >
              <div className="w-12 h-12 rounded-2xl ios-control-bg flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7]">
                <FileArchive className="w-6 h-6" />
              </div>
              <p className="text-base font-semibold text-[#1C1C1E] dark:text-[#F5F5F7]">
                Rilascia per aprire in Qaderno
              </p>
              <p className="text-xs text-[#8E8E93]">Supporta file .qaderno completi e documenti .pdf</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Long-Press & Right-Click Context Menu */}
      <ContextMenuPill
        menu={contextMenu}
        hasStrokeClipboard={clipboardStrokes.length > 0}
        hasTextClipboard={textClipboard.length > 0}
        activeDocumentType={activeNote?.documentType}
        canUndo={canUndo}
        canRedo={canRedo}
        notePinned={
          contextMenu.sidebarNoteId
            ? notes.find((n) => n.id === contextMenu.sidebarNoteId)?.pinned ?? false
            : false
        }
        onClose={() => setContextMenu((m) => ({ ...m, visible: false }))}
        onCut={() =>
          contextMenu.textTarget
            ? performTextCopy(true)
            : handleCutSelection(contextMenu.targetStrokeIds, contextMenu.pageId, contextMenu.pageIndex)
        }
        onCopy={() =>
          contextMenu.textTarget
            ? performTextCopy(false)
            : handleCopySelection(contextMenu.targetStrokeIds, contextMenu.pageId, contextMenu.pageIndex)
        }
        onPaste={() =>
          contextMenu.textTarget
            ? performTextPaste()
            : handlePasteAt(contextMenu.canvasX, contextMenu.canvasY, contextMenu.pageId, contextMenu.pageIndex)
        }
        onDuplicate={() =>
          contextMenu.textTarget
            ? performTextDuplicate()
            : handleDuplicateSelection(contextMenu.targetStrokeIds, contextMenu.pageId, contextMenu.pageIndex)
        }
        onDelete={() =>
          contextMenu.textTarget
            ? performTextDelete()
            : handleDeleteSelection(contextMenu.targetStrokeIds, contextMenu.pageId, contextMenu.pageIndex)
        }
        onRecolor={(hex) =>
          handleRecolorSelection(hex, contextMenu.targetStrokeIds, contextMenu.pageId, contextMenu.pageIndex)
        }
        onRecolorText={(hex) => {
          const tgt = contextMenu.textTarget;
          if (!tgt) return;
          if (
            (tgt.kind === 'textbox' || tgt.kind === 'pdfspan') &&
            contextMenu.pageIndex !== undefined
          ) {
            handleApplyTextColor(hex, {
              kind: tgt.kind,
              pageIndex: contextMenu.pageIndex,
              id: tgt.targetId,
            });
            return;
          }
          handleApplyTextColor(hex);
        }}
        onUndoTextFormatting={performTextUndoFormatting}
        onBeautify={() =>
          handleBeautifyHandwriting(contextMenu.targetStrokeIds, contextMenu.pageId, contextMenu.pageIndex)
        }
        onAddTextItem={activeNote ? handleAddTextItemAtContext : undefined}
        onAddPage={activeNote?.documentType === 'hybrid' ? handleAddHybridPage : undefined}
        onDeletePage={
          activeNote
            ? () => {
                if (activeNote.documentType === 'pdf') {
                  handleDeletePdfPage(
                    contextMenu.pageIndex ?? activeNote.pdfPages?.[0]?.pageIndex ?? 0
                  );
                } else {
                  const firstId = normalizeNotePages(activeNote).pages?.[0]?.id;
                  const targetPageId = contextMenu.pageId || firstId;
                  if (targetPageId) handleDeleteHybridPage(targetPageId);
                }
              }
            : undefined
        }
        onUndo={handleUndo}
        onRedo={handleRedo}
        onFitWidth={activeNote ? handleFitWidth : undefined}
        onNoteTogglePin={handleTogglePinNote}
        onNoteDuplicate={handleDuplicateNote}
        onNoteExportQaderno={handleExportQadernoById}
        onNoteDelete={(noteId) => {
          const target = notes.find((n) => n.id === noteId);
          if (target) handleRequestDeleteNote(target);
        }}
        onFolderCreateNote={handleCreateNoteInFolder}
        onFolderRename={(folderId) => {
          setSidebarOpen(true);
          setRequestedRenameFolderId(folderId);
        }}
        onFolderDelete={(folderId) => {
          const target = folders.find((f) => f.id === folderId);
          if (target) handleRequestDeleteFolder(target);
        }}
        onCreateNewNote={handleCreateNote}
        onCreateNewFolder={() => {
          setSidebarOpen(true);
          setRequestedNewFolderTick((t) => t + 1);
        }}
      />

      {/* iOS Confirmation / Duplicate Resolution Dialog */}
      <ConfirmDialog
        open={confirmPrompt.open}
        title={confirmPrompt.title}
        message={confirmPrompt.message}
        actions={confirmPrompt.actions}
        onClose={() => setConfirmPrompt((c) => ({ ...c, open: false }))}
      />

      {/* Multi-Section Settings Modal */}
      <SettingsModal
        open={settingsModalOpen}
        preferences={preferences}
        shortcuts={shortcuts}
        connectedDirName={connectedDirHandle?.name || null}
        connectedSessionFileName={connectedSessionFileHandle?.name || null}
        lastSessionJsonSavedAt={lastSessionJsonSavedAt}
        onClose={() => setSettingsModalOpen(false)}
        onUpdatePreferences={(next) => {
          setPreferences(next);
          savePreferences(next);
          setHoldToSnap(next.defaultHoldToSnap);
        }}
        onUpdateShortcut={(actionId, combo) => {
          const next = { ...shortcuts, [actionId]: combo };
          setShortcuts(next);
          saveShortcuts(next);
        }}
        onResetShortcuts={() => setShortcuts(resetShortcuts())}
        onConnectLocalFolder={async () => {
          try {
            const handle = await pickAndConnectDirectory();
            if (handle) {
              setConnectedDirHandle(handle);
              const count = await syncAllNotesToDirectory(handle, notes, folders);
              showToast(`Cartella "${handle.name}" collegata (${count} file sincronizzati)`);
            }
          } catch {
            // user cancelled picker
          }
        }}
        onSyncLocalFolderNow={async () => {
          if (!connectedDirHandle) return;
          const count = await syncAllNotesToDirectory(connectedDirHandle, notes, folders);
          showToast(`${count} ${count === 1 ? 'quaderno sincronizzato' : 'quaderni sincronizzati'}`);
        }}
        onDisconnectLocalFolder={async () => {
          await clearSavedDirectoryHandle();
          setConnectedDirHandle(null);
          showToast('Cartella locale scollegata');
        }}
        onDownloadSessionJson={handleExportArchive}
        onImportSessionJson={handleImportArchive}
        onDisconnectSessionFile={async () => {
          await clearSavedSessionFileHandle();
          setConnectedSessionFileHandle(null);
          showToast('File sessione .json scollegato');
        }}
      />

      {/* iOS / iPadOS Add to Home Screen Guide */}
      <InstallGuideModal open={installGuideOpen} onClose={() => setInstallGuideOpen(false)} />

      {/* Quiet Animated Toast Feedback */}
      <AnimatePresence>
        {bannerMessage && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 pointer-events-none no-print">
            <motion.div
              key={bannerMessage}
              initial={{ opacity: 0, y: -10, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 460, damping: 32 }}
              className="ios-glass px-4 py-2 rounded-full text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7]"
            >
              {bannerMessage}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
