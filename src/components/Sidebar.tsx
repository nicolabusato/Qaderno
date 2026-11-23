import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  FilePlus2,
  Folder as FolderIcon,
  FolderInput,
  FolderPlus,
  FolderUp,
  MoreHorizontal,
  Pencil,
  Pin,
  Search,
  Settings,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import { ContextMenuState, Folder, NoteDocument } from '../types/qaderno';
import { normalizeNotePages } from '../utils/storage';
import { QadernoLogo } from './QadernoLogo';

interface SidebarProps {
  open: boolean;
  folders: Folder[];
  notes: NoteDocument[];
  activeFolderId: string | 'all';
  activeNoteId: string | null;
  searchQuery: string;
  saveLabel: string;
  showInstallButton: boolean;
  onCloseMobile: () => void;
  onSelectFolder: (folderId: string | 'all') => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (folderId: string, newName: string) => void;
  onRequestDeleteFolder: (folder: Folder) => void;
  onMoveNoteToFolder: (noteId: string, folderId: string) => void;
  onSelectNote: (noteId: string) => void;
  onCreateNote: () => void;
  onTogglePinNote: (noteId: string) => void;
  onRequestDeleteNote: (note: NoteDocument) => void;
  onSearchChange: (q: string) => void;
  onOpenSettings: () => void;
  onOpenQadernoFiles: (files: FileList) => void;
  onTriggerInstall: () => void;
  onOpenContextMenu: (menu: ContextMenuState) => void;
  requestedRenameFolderId?: string | null;
  onClearRequestedRename?: () => void;
  requestedNewFolderTick?: number;
}

function getQuadernoPreview(note: NoteDocument): string {
  if (note.documentType === 'pdf') {
    const pagesCount = note.pdfPages?.length || 1;
    return `PDF · ${pagesCount} ${pagesCount === 1 ? 'pagina' : 'pagine'}`;
  }
  const normalized = normalizeNotePages(note);
  const allBlocks = normalized.pages?.flatMap((p) => p.blocks) || note.blocks;
  const firstText = allBlocks.find((b) => b.content.trim().length > 0)?.content.trim();
  return firstText || 'Quaderno vuoto';
}

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(ts));
}

function paperLabel(note: NoteDocument): string {
  if (note.documentType === 'pdf') return 'PDF';
  if (note.paperStyle === 'grid') return 'Quadretti';
  if (note.paperStyle === 'lined') return 'Righe';
  if (note.paperStyle === 'dotted') return 'Puntini';
  return 'Bianca';
}

export const Sidebar: React.FC<SidebarProps> = ({
  open,
  folders,
  notes,
  activeFolderId,
  activeNoteId,
  searchQuery,
  saveLabel,
  showInstallButton,
  onCloseMobile,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onRequestDeleteFolder,
  onMoveNoteToFolder,
  onSelectNote,
  onCreateNote,
  onTogglePinNote,
  onRequestDeleteNote,
  onSearchChange,
  onOpenSettings,
  onOpenQadernoFiles,
  onTriggerInstall,
  onOpenContextMenu,
  requestedRenameFolderId,
  onClearRequestedRename,
  requestedNewFolderTick,
}) => {
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const [moveMenuState, setMoveMenuState] = useState<{ noteId: string; x: number; y: number } | null>(null);
  const [touchDragState, setTouchDragState] = useState<{
    noteId: string;
    title: string;
    x: number;
    y: number;
  } | null>(null);

  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );

  const qadernoInputRef = useRef<HTMLInputElement>(null);
  const moveMenuRef = useRef<HTMLDivElement>(null);
  const suppressNextClickRef = useRef(false);
  const touchDragMetaRef = useRef<{
    timer: number | null;
    pointerId: number;
    noteId: string;
    title: string;
    startX: number;
    startY: number;
    active: boolean;
  }>({
    timer: null,
    pointerId: -1,
    noteId: '',
    title: '',
    startX: 0,
    startY: 0,
    active: false,
  });

  const clearTouchDragTimer = () => {
    if (touchDragMetaRef.current.timer !== null) {
      window.clearTimeout(touchDragMetaRef.current.timer);
      touchDragMetaRef.current.timer = null;
    }
  };

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (requestedRenameFolderId) {
      const target = folders.find((f) => f.id === requestedRenameFolderId);
      if (target) {
        setRenameDraft(target.name);
        setRenamingFolderId(target.id);
      }
      onClearRequestedRename?.();
    }
  }, [requestedRenameFolderId, folders, onClearRequestedRename]);

  useEffect(() => {
    if (requestedNewFolderTick && requestedNewFolderTick > 0) {
      setAddingFolder(true);
    }
  }, [requestedNewFolderTick]);

  useEffect(() => {
    if (!moveMenuState) return;
    const handleOutside = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (moveMenuRef.current?.contains(target) || target?.closest('[data-move-trigger]')) {
        return;
      }
      setMoveMenuState(null);
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoveMenuState(null);
    };
    window.addEventListener('pointerdown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('pointerdown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [moveMenuState]);

  useLayoutEffect(() => {
    if (!moveMenuState || !moveMenuRef.current) return;
    const rect = moveMenuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let nextX = moveMenuState.x;
    let nextY = moveMenuState.y;

    if (rect.right > vw - 10) {
      nextX = Math.max(10, vw - 10 - rect.width);
    }
    if (rect.left < 10) {
      nextX = 10;
    }
    if (rect.bottom > vh - 12) {
      nextY = Math.max(10, vh - 12 - rect.height);
    }
    if (rect.top < 10) {
      nextY = 10;
    }

    if (Math.abs(nextX - moveMenuState.x) >= 1 || Math.abs(nextY - moveMenuState.y) >= 1) {
      setMoveMenuState((prev) => (prev ? { ...prev, x: nextX, y: nextY } : null));
    }
  }, [moveMenuState]);

  useEffect(() => {
    const resolveDropTargetAtPoint = (clientX: number, clientY: number): string | null => {
      const els = document.elementsFromPoint(clientX, clientY);
      for (const el of els) {
        if (el instanceof HTMLElement) {
          const folderAttr = el.getAttribute('data-drop-folder-id');
          if (folderAttr) return folderAttr;
        }
      }
      return null;
    };

    const handleWindowPointerMove = (e: PointerEvent) => {
      const meta = touchDragMetaRef.current;
      if (meta.pointerId !== e.pointerId) return;

      if (!meta.active) {
        if (Math.hypot(e.clientX - meta.startX, e.clientY - meta.startY) > 8) {
          clearTouchDragTimer();
          meta.pointerId = -1;
        }
        return;
      }

      e.preventDefault();
      setTouchDragState({
        noteId: meta.noteId,
        title: meta.title,
        x: e.clientX,
        y: e.clientY,
      });
      setDragOverTarget(resolveDropTargetAtPoint(e.clientX, e.clientY));
    };

    const handleWindowPointerEnd = (e: PointerEvent) => {
      const meta = touchDragMetaRef.current;
      if (meta.pointerId !== e.pointerId) return;

      clearTouchDragTimer();
      const wasActive = meta.active;
      const movedNoteId = meta.noteId;
      meta.pointerId = -1;
      meta.active = false;
      meta.noteId = '';

      if (wasActive) {
        const dropTarget =
          e.type === 'pointerup' ? resolveDropTargetAtPoint(e.clientX, e.clientY) : null;
        setTouchDragState(null);
        setDraggedNoteId(null);
        setDragOverTarget(null);
        if (dropTarget) {
          const nextFolderId = dropTarget === 'all' || dropTarget === 'general_list' ? '' : dropTarget;
          onMoveNoteToFolder(movedNoteId, nextFolderId);
        }
      }
    };

    window.addEventListener('pointermove', handleWindowPointerMove, { passive: false });
    window.addEventListener('pointerup', handleWindowPointerEnd);
    window.addEventListener('pointercancel', handleWindowPointerEnd);
    return () => {
      clearTouchDragTimer();
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerEnd);
      window.removeEventListener('pointercancel', handleWindowPointerEnd);
    };
  }, [onMoveNoteToFolder]);

  const filteredNotes = notes.filter((n) => {
    const matchesFolder = activeFolderId === 'all' || n.folderId === activeFolderId;
    if (!matchesFolder) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const titleMatch = (n.title || '').toLowerCase().includes(q);
    const allBlocks = normalizeNotePages(n).pages?.flatMap((p) => p.blocks) || n.blocks;
    const bodyMatch = allBlocks.some((b) => b.content.toLowerCase().includes(q));
    const pdfMatch = (n.pdfFileName || '').toLowerCase().includes(q);
    return titleMatch || bodyMatch || pdfMatch;
  });

  const pinnedNotes = filteredNotes.filter((n) => n.pinned);
  const regularNotes = filteredNotes.filter((n) => !n.pinned);

  const handleAddFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (trimmed) {
      onCreateFolder(trimmed);
      setNewFolderName('');
      setAddingFolder(false);
    }
  };

  const commitRename = (folderId: string) => {
    const trimmed = renameDraft.trim();
    if (trimmed) {
      onRenameFolder(folderId, trimmed);
    }
    setRenamingFolderId(null);
  };

  const handleDropOnFolder = (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const noteId = e.dataTransfer.getData('text/qaderno-note-id') || draggedNoteId;
    setDragOverTarget(null);
    setDraggedNoteId(null);
    if (noteId) {
      onMoveNoteToFolder(noteId, targetFolderId);
    }
  };

  const renderQuadernoItem = (n: NoteDocument) => {
    const isActive = n.id === activeNoteId;
    const isDragging = n.id === draggedNoteId || touchDragState?.noteId === n.id;
    const pageCount =
      n.documentType === 'pdf'
        ? n.pdfPages?.length || 1
        : normalizeNotePages(n).pages?.length || 1;

    return (
      <div
        key={n.id}
        draggable={isDesktop}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/qaderno-note-id', n.id);
          e.dataTransfer.effectAllowed = 'move';
          setDraggedNoteId(n.id);
        }}
        onDragEnd={() => {
          setDraggedNoteId(null);
          setDragOverTarget(null);
        }}
        onPointerDown={(e) => {
          if (e.pointerType !== 'touch' || e.button !== 0) return;
          const target = e.target as HTMLElement;
          if (target.closest('button')) return;

          clearTouchDragTimer();
          suppressNextClickRef.current = false;
          const cx = e.clientX;
          const cy = e.clientY;
          const noteTitle = n.title || 'Senza titolo';
          touchDragMetaRef.current = {
            timer: window.setTimeout(() => {
              touchDragMetaRef.current.active = true;
              suppressNextClickRef.current = true;
              setMoveMenuState(null);
              setDraggedNoteId(n.id);
              setTouchDragState({ noteId: n.id, title: noteTitle, x: cx, y: cy });
            }, 300),
            pointerId: e.pointerId,
            noteId: n.id,
            title: noteTitle,
            startX: cx,
            startY: cy,
            active: false,
          };
        }}
        onClick={() => {
          if (suppressNextClickRef.current) {
            suppressNextClickRef.current = false;
            return;
          }
          onSelectNote(n.id);
          if (window.innerWidth < 1024) onCloseMobile();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenContextMenu({
            visible: true,
            scope: 'note',
            x: e.clientX,
            y: e.clientY,
            canvasX: 0,
            canvasY: 0,
            targetStrokeIds: [],
            sidebarNoteId: n.id,
          });
        }}
        className={`group rounded-2xl px-3 py-2.5 cursor-pointer transition-all no-ios-select ${
          isDragging ? 'opacity-45 scale-[0.98]' : ''
        } ${
          isActive
            ? 'bg-[#FBFBFD] dark:bg-[#2C2C30] shadow-xs border border-[#3C3C43]/10 dark:border-white/10'
            : 'hover:bg-[#787880]/10 dark:hover:bg-white/6'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-[#1C1C1E] dark:text-[#F5F5F7] truncate">
            {n.title || 'Senza titolo'}
          </span>
          <div className="flex items-center gap-0.5 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
            <button
              type="button"
              data-move-trigger="true"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                setMoveMenuState((prev) =>
                  prev?.noteId === n.id
                    ? null
                    : {
                        noteId: n.id,
                        x: Math.max(10, Math.min(window.innerWidth - 234, rect.left - 120)),
                        y: Math.max(10, Math.min(window.innerHeight - 230, rect.bottom + 6)),
                      }
                );
              }}
              className={`p-1.5 rounded-full hover:bg-[#787880]/15 active:bg-[#787880]/20 ${
                moveMenuState?.noteId === n.id
                  ? 'text-[#1C1C1E] dark:text-[#F5F5F7] bg-[#787880]/15'
                  : 'text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7]'
              }`}
              title="Sposta in taccuino"
              aria-label="Sposta in taccuino"
            >
              <FolderInput className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePinNote(n.id);
              }}
              className={`p-1.5 rounded-full hover:bg-[#787880]/15 active:bg-[#787880]/20 ${
                n.pinned
                  ? 'text-[#1C1C1E] dark:text-[#F5F5F7]'
                  : 'text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7]'
              }`}
              title={n.pinned ? 'Rimuovi fissaggio' : 'Fissa in alto'}
              aria-label={n.pinned ? 'Rimuovi fissaggio' : 'Fissa in alto'}
            >
              <Pin className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onRequestDeleteNote(n);
              }}
              className="p-1.5 rounded-full hover:bg-[#9A463D]/15 active:bg-[#9A463D]/25 text-[#8E8E93] hover:text-[#9A463D] active:text-[#9A463D]"
              title="Elimina quaderno"
              aria-label="Elimina quaderno"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                onOpenContextMenu({
                  visible: true,
                  scope: 'note',
                  x: rect.right,
                  y: rect.bottom + 8,
                  canvasX: 0,
                  canvasY: 0,
                  targetStrokeIds: [],
                  sidebarNoteId: n.id,
                });
              }}
              className="p-1.5 rounded-full hover:bg-[#787880]/15 active:bg-[#787880]/20 text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7]"
              title="Altre opzioni e Qaderno Snapshot"
              aria-label="Altre opzioni quaderno"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <p className="text-xs text-[#8E8E93] truncate mt-0.5">{getQuadernoPreview(n)}</p>
        <div className="flex items-center gap-1.5 text-[11px] text-[#8E8E93] mt-1 tabular-nums">
          <span>{formatDate(n.updatedAt)}</span>
          <span aria-hidden="true">·</span>
          <span>{paperLabel(n)}</span>
          {pageCount > 1 && (
            <>
              <span aria-hidden="true">·</span>
              <span>{pageCount} pag.</span>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <AnimatePresence>
        {open && !isDesktop && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[44] bg-[#1C1C1E]/20 dark:bg-black/45 backdrop-blur-[1px] lg:hidden no-print"
            onClick={onCloseMobile}
          />
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {open && (
          <motion.aside
            initial={isDesktop ? { width: 0, opacity: 0 } : { x: -280, opacity: 0.9 }}
            animate={isDesktop ? { width: 276, opacity: 1 } : { x: 0, opacity: 1 }}
            exit={isDesktop ? { width: 0, opacity: 0 } : { x: -280, opacity: 0.9 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34, mass: 0.85 }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenContextMenu({
                visible: true,
                scope: 'sidebar',
                x: e.clientX,
                y: e.clientY,
                canvasX: 0,
                canvasY: 0,
                targetStrokeIds: [],
              });
            }}
            className={`fixed lg:static inset-y-0 left-0 z-[45] lg:z-auto w-[84vw] max-w-[296px] lg:w-[276px] shrink-0 overflow-hidden bg-[#F2F2F7] dark:bg-[#1C1C1E] border-r border-[#3C3C43]/12 dark:border-white/10 flex flex-col pt-safe pb-safe pl-safe no-print ${
              touchDragState ? 'touch-none no-ios-select' : ''
            }`}
          >
        {/* Brand Header */}
        <div className="px-4 h-[54px] flex items-center justify-between border-b border-[#3C3C43]/10 dark:border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <QadernoLogo size={28} zoomedTail />
            <span className="text-base font-semibold tracking-tight text-[#1C1C1E] dark:text-[#F5F5F7]">
              Qaderno
            </span>
          </div>
          <div className="flex items-center gap-1">
            <input
              ref={qadernoInputRef}
              type="file"
              accept=".qaderno,.pdf,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  onOpenQadernoFiles(e.target.files);
                  e.target.value = '';
                }
              }}
            />
            <button
              type="button"
              onClick={() => qadernoInputRef.current?.click()}
              className="min-w-[34px] min-h-[34px] rounded-full ios-control-bg flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7] transition-colors"
              title="Apri .qaderno o importa PDF"
              aria-label="Apri .qaderno o importa PDF"
            >
              <FolderUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onCreateNote}
              className="min-w-[34px] min-h-[34px] rounded-full ios-control-bg flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7] transition-colors"
              title="Nuovo quaderno"
              aria-label="Nuovo quaderno"
            >
              <FilePlus2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onCloseMobile}
              className="lg:hidden min-w-[34px] min-h-[34px] rounded-full ios-control-bg flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7]"
              aria-label="Chiudi barra laterale"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Instant Search */}
        <div className="px-3 pt-3 pb-2">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-[#8E8E93] absolute left-3 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Cerca quaderni…"
              className="w-full h-9 pl-8 pr-3 rounded-full bg-[#787880]/12 dark:bg-white/8 text-xs text-[#1C1C1E] dark:text-[#F5F5F7] placeholder-[#8E8E93] focus:outline-none focus:bg-[#FBFBFD] dark:focus:bg-[#2C2C30] focus:ring-1 focus:ring-[#3C3C43]/20 transition-colors"
            />
          </div>
        </div>

        {/* Notebooks (Taccuini) with Rename, Delete Confirmation, and Drag & Drop */}
        <div className="px-3 py-1.5 border-b border-[#3C3C43]/10 dark:border-white/10">
          <div className="flex items-center justify-between px-1 mb-1">
            <span className="text-[11px] font-medium text-[#8E8E93]">Taccuini</span>
            <button
              type="button"
              onClick={() => setAddingFolder((v) => !v)}
              className="p-1 rounded-full hover:bg-[#787880]/15 text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7] transition-colors"
              title="Nuovo taccuino"
              aria-label="Nuovo taccuino"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          </div>

          <AnimatePresence initial={false}>
            {addingFolder && (
              <motion.form
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                onSubmit={handleAddFolderSubmit}
                className="mb-1.5 flex gap-1 overflow-hidden"
              >
                <input
                  type="text"
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Nome taccuino…"
                  className="flex-1 h-8 px-2.5 rounded-xl bg-[#FBFBFD] dark:bg-[#2C2C30] border border-[#3C3C43]/15 dark:border-white/15 text-xs text-[#1C1C1E] dark:text-[#F5F5F7] focus:outline-none"
                />
                <button
                  type="submit"
                  className="px-2.5 h-8 rounded-xl bg-[#1C1C1E] dark:bg-[#F5F5F7] text-[#FBFBFD] dark:text-[#1C1C1E] text-xs font-medium"
                >
                  Crea
                </button>
              </motion.form>
            )}
          </AnimatePresence>

          <div className="space-y-0.5 max-h-32 sm:max-h-40 overflow-y-auto">
            <button
              type="button"
              data-drop-folder-id="all"
              onClick={() => onSelectFolder('all')}
              onDragOver={(e) => {
                if (draggedNoteId) {
                  e.preventDefault();
                  setDragOverTarget('all');
                }
              }}
              onDragLeave={() => setDragOverTarget((cur) => (cur === 'all' ? null : cur))}
              onDrop={(e) => handleDropOnFolder(e, '')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                dragOverTarget === 'all'
                  ? 'ring-2 ring-[#1C1C1E]/35 dark:ring-white/40 bg-[#787880]/20'
                  : activeFolderId === 'all'
                    ? 'bg-[#1C1C1E] text-[#FBFBFD] dark:bg-[#F5F5F7] dark:text-[#1C1C1E]'
                    : 'text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/12'
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <FolderIcon className="w-3.5 h-3.5 shrink-0" />
                <span>Tutti i quaderni</span>
              </span>
              <span className="tabular-nums opacity-70">{notes.length}</span>
            </button>

            {folders.map((f) => {
              const count = notes.filter((n) => n.folderId === f.id).length;
              const isSelected = activeFolderId === f.id;
              const isRenaming = renamingFolderId === f.id;
              const isDropHover = dragOverTarget === f.id;

              return (
                <div
                  key={f.id}
                  data-drop-folder-id={f.id}
                  onClick={() => !isRenaming && onSelectFolder(f.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenContextMenu({
                      visible: true,
                      scope: 'folder',
                      x: e.clientX,
                      y: e.clientY,
                      canvasX: 0,
                      canvasY: 0,
                      targetStrokeIds: [],
                      sidebarFolderId: f.id,
                    });
                  }}
                  onDragOver={(e) => {
                    if (draggedNoteId) {
                      e.preventDefault();
                      setDragOverTarget(f.id);
                    }
                  }}
                  onDragLeave={() => setDragOverTarget((cur) => (cur === f.id ? null : cur))}
                  onDrop={(e) => handleDropOnFolder(e, f.id)}
                  className={`group flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all ${
                    isDropHover
                      ? 'ring-2 ring-[#1C1C1E]/40 dark:ring-white/45 bg-[#787880]/22'
                      : isSelected
                        ? 'bg-[#1C1C1E] text-[#FBFBFD] dark:bg-[#F5F5F7] dark:text-[#1C1C1E]'
                        : 'text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/12'
                  }`}
                >
                  {isRenaming ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        commitRename(f.id);
                      }}
                      className="flex-1 flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={() => commitRename(f.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setRenamingFolderId(null);
                        }}
                        className="w-full h-6 px-1.5 rounded-lg bg-[#FBFBFD] dark:bg-[#2C2C30] text-[#1C1C1E] dark:text-[#F5F5F7] text-xs focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="p-0.5 rounded-full hover:bg-white/20"
                        aria-label="Salva nome taccuino"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className="flex items-center gap-2 truncate">
                        <FolderIcon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{f.name}</span>
                      </span>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenameDraft(f.name);
                            setRenamingFolderId(f.id);
                          }}
                          className={`opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-within:opacity-100 p-1 rounded-full ${
                            isSelected ? 'hover:bg-white/20' : 'hover:bg-[#787880]/15 text-[#8E8E93]'
                          }`}
                          title="Rinomina taccuino"
                          aria-label="Rinomina taccuino"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRequestDeleteFolder(f);
                          }}
                          className={`opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-within:opacity-100 p-1 rounded-full ${
                            isSelected ? 'hover:bg-white/20' : 'hover:bg-[#9A463D]/15 text-[#8E8E93] hover:text-[#9A463D]'
                          }`}
                          title="Elimina taccuino"
                          aria-label="Elimina taccuino"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                        <span className="tabular-nums opacity-70 pl-0.5">{count}</span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Quaderni List (also drop zone to move out of a taccuino into general list) */}
        <div
          data-drop-folder-id="general_list"
          className={`flex-1 px-2.5 py-2 space-y-3 transition-colors ${
            touchDragState ? 'overflow-hidden touch-none' : 'overflow-y-auto'
          } ${dragOverTarget === 'general_list' ? 'bg-[#787880]/10' : ''}`}
          onDragOver={(e) => {
            if (draggedNoteId) {
              e.preventDefault();
              setDragOverTarget('general_list');
            }
          }}
          onDragLeave={() => setDragOverTarget((cur) => (cur === 'general_list' ? null : cur))}
          onDrop={(e) => handleDropOnFolder(e, '')}
        >
          {pinnedNotes.length > 0 && (
            <div>
              <div className="px-2 mb-1 text-[11px] font-medium text-[#8E8E93]">Fissati</div>
              <div className="space-y-1">{pinnedNotes.map(renderQuadernoItem)}</div>
            </div>
          )}

          <div>
            {pinnedNotes.length > 0 && regularNotes.length > 0 && (
              <div className="px-2 mb-1 text-[11px] font-medium text-[#8E8E93]">Quaderni</div>
            )}
            <div className="space-y-1">
              {regularNotes.map(renderQuadernoItem)}
              {filteredNotes.length === 0 && (
                <div className="px-3 py-8 text-center">
                  <p className="text-xs text-[#8E8E93]">Nessun quaderno trovato</p>
                  <button
                    type="button"
                    onClick={onCreateNote}
                    className="mt-2 px-3 py-1.5 rounded-full ios-control-bg text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7]"
                  >
                    Crea nuovo quaderno
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-3 py-2.5 border-t border-[#3C3C43]/10 dark:border-white/10 space-y-2 shrink-0">
          {showInstallButton && (
            <button
              type="button"
              onClick={onTriggerInstall}
              className="w-full min-h-[36px] px-3 rounded-full ios-control-bg flex items-center justify-center gap-2 text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] transition-colors"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Aggiungi a Schermata Home</span>
            </button>
          )}

          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] text-[#8E8E93] truncate pl-1">{saveLabel}</span>

            <button
              type="button"
              onClick={onOpenSettings}
              className="min-w-[32px] min-h-[32px] rounded-full ios-control-bg flex items-center justify-center text-[#48484A] dark:text-[#C7C7CC] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7] shrink-0"
              title="Impostazioni, Sincronizzazione, Scorciatoie e Crediti"
              aria-label="Apri impostazioni"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Quick Move to Taccuino Translucent Dropdown */}
      <AnimatePresence>
        {moveMenuState && (() => {
          const targetNote = notes.find((n) => n.id === moveMenuState.noteId);
          if (!targetNote) return null;
          return (
            <motion.div
              ref={moveMenuRef}
              initial={{ opacity: 0, scale: 0.94, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: -4 }}
              transition={{ type: 'spring', stiffness: 460, damping: 32 }}
              style={{ left: moveMenuState.x, top: moveMenuState.y }}
              className="fixed z-50 w-56 max-w-[calc(100vw-20px)] max-h-[65dvh] overflow-y-auto ios-glass rounded-2xl p-1.5 shadow-lg no-print"
            >
              <div className="px-2.5 py-1 text-[11px] font-medium text-[#8E8E93] truncate">
                Sposta «{targetNote.title || 'Senza titolo'}»
              </div>
              <div className="max-h-52 overflow-y-auto space-y-0.5 mt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    onMoveNoteToFolder(targetNote.id, '');
                    setMoveMenuState(null);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium text-left transition-colors ${
                    !targetNote.folderId
                      ? 'bg-[#1C1C1E] text-[#FBFBFD] dark:bg-[#F5F5F7] dark:text-[#1C1C1E]'
                      : 'text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15'
                  }`}
                >
                  <span className="truncate">Nessun taccuino (Elenco generale)</span>
                  {!targetNote.folderId && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
                {folders.map((f) => {
                  const isCurrent = targetNote.folderId === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        onMoveNoteToFolder(targetNote.id, f.id);
                        setMoveMenuState(null);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium text-left transition-colors ${
                        isCurrent
                          ? 'bg-[#1C1C1E] text-[#FBFBFD] dark:bg-[#F5F5F7] dark:text-[#1C1C1E]'
                          : 'text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#787880]/15'
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <FolderIcon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{f.name}</span>
                      </span>
                      {isCurrent && <Check className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Pointer-Event Touch Drag Floating Ghost Pill */}
      {touchDragState && (
        <div
          style={{
            left: touchDragState.x,
            top: Math.max(24, touchDragState.y - 34),
            transform: 'translate(-50%, -100%)',
          }}
          className="fixed z-[60] pointer-events-none ios-glass rounded-full px-3.5 py-1.5 shadow-lg flex items-center gap-2 max-w-[220px] no-print"
        >
          <FolderInput className="w-3.5 h-3.5 text-[#1C1C1E] dark:text-[#F5F5F7] shrink-0" />
          <span className="text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] truncate">
            {touchDragState.title}
          </span>
        </div>
      )}
    </>
  );
};
