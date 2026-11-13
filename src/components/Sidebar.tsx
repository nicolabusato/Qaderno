import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  Download,
  FileArchive,
  FilePlus2,
  Folder as FolderIcon,
  FolderPlus,
  Pencil,
  Pin,
  Search,
  Settings,
  Smartphone,
  Trash2,
  Upload,
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
  onExportArchive: () => void;
  onImportArchive: (file: File) => void;
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
  onExportArchive,
  onImportArchive,
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

  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );

  const archiveInputRef = useRef<HTMLInputElement>(null);
  const qadernoInputRef = useRef<HTMLInputElement>(null);
  const touchHoldRef = useRef<{ timer: number | null; startX: number; startY: number }>({
    timer: null,
    startX: 0,
    startY: 0,
  });

  const clearTouchHold = () => {
    if (touchHoldRef.current.timer !== null) {
      window.clearTimeout(touchHoldRef.current.timer);
      touchHoldRef.current.timer = null;
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
    const isDragging = n.id === draggedNoteId;
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
        onTouchStart={(e) => {
          if (e.touches.length !== 1) return;
          const target = e.target as HTMLElement;
          if (target.closest('button')) return;
          const t = e.touches[0];
          touchHoldRef.current.startX = t.clientX;
          touchHoldRef.current.startY = t.clientY;
          clearTouchHold();
          touchHoldRef.current.timer = window.setTimeout(() => {
            onOpenContextMenu({
              visible: true,
              scope: 'note',
              x: t.clientX,
              y: t.clientY,
              canvasX: 0,
              canvasY: 0,
              targetStrokeIds: [],
              sidebarNoteId: n.id,
            });
          }, 480);
        }}
        onTouchMove={(e) => {
          if (touchHoldRef.current.timer === null || e.touches.length !== 1) return;
          const t = e.touches[0];
          if (Math.hypot(t.clientX - touchHoldRef.current.startX, t.clientY - touchHoldRef.current.startY) > 10) {
            clearTouchHold();
          }
        }}
        onTouchEnd={clearTouchHold}
        onTouchCancel={clearTouchHold}
        onClick={() => {
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
        className={`group rounded-2xl px-3 py-2.5 cursor-pointer transition-all ${
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
            className="fixed lg:static inset-y-0 left-0 z-[45] lg:z-auto w-[84vw] max-w-[296px] lg:w-[276px] shrink-0 overflow-hidden bg-[#F2F2F7] dark:bg-[#1C1C1E] border-r border-[#3C3C43]/12 dark:border-white/10 flex flex-col pt-safe pb-safe no-print"
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
              accept=".qaderno"
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
              title="Apri file .qaderno"
              aria-label="Apri file .qaderno"
            >
              <FileArchive className="w-4 h-4" />
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
        <div className="px-3 pt-3 pb-2 space-y-2">
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

          <button
            type="button"
            onClick={() => qadernoInputRef.current?.click()}
            className="w-full h-8 px-3 rounded-xl ios-control-bg flex items-center justify-center gap-1.5 text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] transition-colors"
          >
            <FileArchive className="w-3.5 h-3.5" />
            <span>Apri file .qaderno</span>
          </button>
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
          className={`flex-1 overflow-y-auto px-2.5 py-2 space-y-3 transition-colors ${
            dragOverTarget === 'general_list' ? 'bg-[#787880]/10' : ''
          }`}
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

            <div className="flex items-center gap-1 shrink-0">
              <input
                ref={archiveInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    onImportArchive(file);
                    e.target.value = '';
                  }
                }}
              />
              <button
                type="button"
                onClick={onExportArchive}
                className="min-w-[32px] min-h-[32px] rounded-full ios-control-bg flex items-center justify-center text-[#48484A] dark:text-[#C7C7CC] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7]"
                title="Esporta backup completo (.json)"
                aria-label="Esporta backup completo"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => archiveInputRef.current?.click()}
                className="min-w-[32px] min-h-[32px] rounded-full ios-control-bg flex items-center justify-center text-[#48484A] dark:text-[#C7C7CC] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7]"
                title="Importa backup (.json)"
                aria-label="Importa backup"
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onOpenSettings}
                className="min-w-[32px] min-h-[32px] rounded-full ios-control-bg flex items-center justify-center text-[#48484A] dark:text-[#C7C7CC] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7]"
                title="Impostazioni, Sincronizzazione, Scorciatoie e Crediti"
                aria-label="Apri impostazioni"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
};
