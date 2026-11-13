import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Clipboard,
  Copy,
  CopyPlus,
  Download,
  FilePlus2,
  FolderPlus,
  Maximize2,
  Pencil,
  PenLine,
  Pin,
  Plus,
  Redo2,
  RotateCcw,
  Scissors,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import { ContextMenuState, INK_COLORS, TEXT_COLORS } from '../types/qaderno';

interface ContextMenuPillProps {
  menu: ContextMenuState;
  hasStrokeClipboard: boolean;
  hasTextClipboard: boolean;
  activeDocumentType?: 'hybrid' | 'pdf';
  canUndo?: boolean;
  canRedo?: boolean;
  notePinned?: boolean;
  onClose: () => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRecolor: (hex: string) => void;
  onRecolorText?: (hex: string | undefined) => void;
  onUndoTextFormatting?: () => void;
  onBeautify: () => void;
  onAddTextItem?: () => void;
  onAddPage?: () => void;
  onDeletePage?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onFitWidth?: () => void;
  onNoteTogglePin?: (noteId: string) => void;
  onNoteDuplicate?: (noteId: string) => void;
  onNoteExportQaderno?: (noteId: string) => void;
  onNoteDelete?: (noteId: string) => void;
  onFolderCreateNote?: (folderId: string) => void;
  onFolderRename?: (folderId: string) => void;
  onFolderDelete?: (folderId: string) => void;
  onCreateNewNote?: () => void;
  onCreateNewFolder?: () => void;
}

export const ContextMenuPill: React.FC<ContextMenuPillProps> = ({
  menu,
  hasStrokeClipboard,
  hasTextClipboard,
  activeDocumentType,
  canUndo = false,
  canRedo = false,
  notePinned = false,
  onClose,
  onCut,
  onCopy,
  onPaste,
  onDuplicate,
  onDelete,
  onRecolor,
  onRecolorText,
  onUndoTextFormatting,
  onBeautify,
  onAddTextItem,
  onAddPage,
  onDeletePage,
  onUndo,
  onRedo,
  onFitWidth,
  onNoteTogglePin,
  onNoteDuplicate,
  onNoteExportQaderno,
  onNoteDelete,
  onFolderCreateNote,
  onFolderRename,
  onFolderDelete,
  onCreateNewNote,
  onCreateNewFolder,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu.visible) return;
    const handleOutside = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('pointerdown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [menu.visible, onClose]);

  const scope = menu.scope || 'canvas';
  const isTextContext = !!menu.textTarget;
  const hasStrokeSelection = menu.targetStrokeIds.length > 0;
  const hasSelection = isTextContext
    ? menu.textTarget!.selectedText.length > 0 ||
      menu.textTarget!.kind === 'block' ||
      menu.textTarget!.kind === 'title'
    : hasStrokeSelection;
  const canPaste = isTextContext ? hasTextClipboard : hasStrokeClipboard || hasTextClipboard;
  const canDeleteCurrentPage = (menu.totalPages || 1) > 1 && !!onDeletePage;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const estWidth = Math.min(360, vw - 20);
  const initialLeft = Math.max(10, Math.min(vw - estWidth - 10, menu.x - estWidth / 2));
  const initialTop = Math.max(54, Math.min(vh - 150, menu.y - 56));
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: initialLeft, top: initialTop });

  useLayoutEffect(() => {
    if (!menu.visible) return;
    const curVw = window.innerWidth;
    const curVh = window.innerHeight;
    const curEstW = Math.min(360, curVw - 20);
    let nextLeft = Math.max(10, Math.min(curVw - curEstW - 10, menu.x - curEstW / 2));
    let nextTop = Math.max(54, Math.min(curVh - 150, menu.y - 56));

    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      nextLeft = Math.max(10, Math.min(curVw - rect.width - 10, menu.x - rect.width / 2));
      nextTop = Math.max(54, Math.min(curVh - rect.height - 12, menu.y - rect.height - 12));
      if (nextTop < 54) {
        nextTop = Math.max(54, Math.min(curVh - rect.height - 12, menu.y + 12));
      }
    }
    setPos({ left: nextLeft, top: nextTop });
  }, [menu.visible, menu.x, menu.y, menu.scope, menu.targetStrokeIds.length, menu.textTarget]);

  const btnCls =
    'min-h-[32px] px-2.5 rounded-full text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-[#1C1C1E]/10 dark:hover:bg-white/10 transition-colors flex items-center gap-1.5 whitespace-nowrap';
  const dangerBtnCls =
    'min-h-[32px] px-2.5 rounded-full text-xs font-medium text-[#9A463D] dark:text-[#E07A6E] hover:bg-[#9A463D]/12 transition-colors flex items-center gap-1.5 whitespace-nowrap';

  return (
    <AnimatePresence>
      {menu.visible && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, scale: 0.9, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 4 }}
          transition={{ type: 'spring', stiffness: 500, damping: 32, mass: 0.7 }}
          style={{ left: pos.left, top: pos.top, transformOrigin: 'top center' }}
          className="fixed z-50 ios-glass rounded-2xl sm:rounded-full px-2 py-1.5 flex flex-wrap items-center gap-1 max-w-[calc(100vw-20px)] max-h-[55dvh] overflow-y-auto select-none no-print"
          role="menu"
          aria-label="Menu contestuale"
        >
          {/* 1. Sidebar Quaderno Context Menu */}
          {scope === 'note' && menu.sidebarNoteId && (
            <>
              {onNoteTogglePin && (
                <button
                  type="button"
                  onClick={() => {
                    onNoteTogglePin(menu.sidebarNoteId!);
                    onClose();
                  }}
                  className={btnCls}
                >
                  <Pin className="w-3.5 h-3.5" />
                  <span>{notePinned ? 'Rimuovi fissaggio' : 'Fissa in alto'}</span>
                </button>
              )}
              {onNoteDuplicate && (
                <button
                  type="button"
                  onClick={() => {
                    onNoteDuplicate(menu.sidebarNoteId!);
                    onClose();
                  }}
                  className={btnCls}
                >
                  <CopyPlus className="w-3.5 h-3.5" />
                  <span>Duplica</span>
                </button>
              )}
              {onNoteExportQaderno && (
                <button
                  type="button"
                  onClick={() => {
                    onNoteExportQaderno(menu.sidebarNoteId!);
                    onClose();
                  }}
                  className={btnCls}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Esporta .qaderno</span>
                </button>
              )}
              {onNoteDelete && (
                <button
                  type="button"
                  onClick={() => {
                    onNoteDelete(menu.sidebarNoteId!);
                    onClose();
                  }}
                  className={dangerBtnCls}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Elimina</span>
                </button>
              )}
            </>
          )}

          {/* 2. Sidebar Folder (Taccuino) Context Menu */}
          {scope === 'folder' && menu.sidebarFolderId && (
            <>
              {onFolderCreateNote && (
                <button
                  type="button"
                  onClick={() => {
                    onFolderCreateNote(menu.sidebarFolderId!);
                    onClose();
                  }}
                  className={btnCls}
                >
                  <FilePlus2 className="w-3.5 h-3.5" />
                  <span>Nuovo quaderno qui</span>
                </button>
              )}
              {onFolderRename && (
                <button
                  type="button"
                  onClick={() => {
                    onFolderRename(menu.sidebarFolderId!);
                    onClose();
                  }}
                  className={btnCls}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Rinomina</span>
                </button>
              )}
              {onFolderDelete && (
                <button
                  type="button"
                  onClick={() => {
                    onFolderDelete(menu.sidebarFolderId!);
                    onClose();
                  }}
                  className={dangerBtnCls}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Elimina taccuino</span>
                </button>
              )}
            </>
          )}

          {/* 3. Sidebar Empty / App Shell Context Menu */}
          {(scope === 'sidebar' || scope === 'app') && (
            <>
              {onCreateNewNote && (
                <button
                  type="button"
                  onClick={() => {
                    onCreateNewNote();
                    onClose();
                  }}
                  className={btnCls}
                >
                  <FilePlus2 className="w-3.5 h-3.5" />
                  <span>Nuovo quaderno</span>
                </button>
              )}
              {onCreateNewFolder && (
                <button
                  type="button"
                  onClick={() => {
                    onCreateNewFolder();
                    onClose();
                  }}
                  className={btnCls}
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>Nuovo taccuino</span>
                </button>
              )}
              {scope === 'app' && onFitWidth && (
                <button
                  type="button"
                  onClick={() => {
                    onFitWidth();
                    onClose();
                  }}
                  className={btnCls}
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Adatta larghezza</span>
                </button>
              )}
            </>
          )}

          {/* 4. Canvas / Page / Text / Stroke Context Menu */}
          {scope === 'canvas' && (
            <>
              {hasSelection && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onCut();
                      onClose();
                    }}
                    className={btnCls}
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    <span>Taglia</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onCopy();
                      onClose();
                    }}
                    className={btnCls}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copia</span>
                  </button>
                </>
              )}

              {(canPaste || isTextContext) && (
                <button
                  type="button"
                  onClick={() => {
                    onPaste();
                    onClose();
                  }}
                  className={btnCls}
                >
                  <Clipboard className="w-3.5 h-3.5" />
                  <span>Incolla</span>
                </button>
              )}

              {hasSelection && (
                <>
                  {menu.textTarget?.kind !== 'title' && menu.textTarget?.kind !== 'pdfspan' && (
                    <button
                      type="button"
                      onClick={() => {
                        onDuplicate();
                        onClose();
                      }}
                      className={btnCls}
                    >
                      <CopyPlus className="w-3.5 h-3.5" />
                      <span>Duplica</span>
                    </button>
                  )}

                  {!isTextContext && hasStrokeSelection && (
                    <button
                      type="button"
                      onClick={() => {
                        onBeautify();
                        onClose();
                      }}
                      title="Raddrizza righe e rifinisci scrittura a mano"
                      className="min-h-[32px] px-2.5 rounded-full text-xs font-medium text-[#2B4162] dark:text-[#93B4E5] hover:bg-[#2B4162]/10 transition-colors flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <PenLine className="w-3.5 h-3.5" />
                      <span>Migliora grafia</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      onDelete();
                      onClose();
                    }}
                    className={dangerBtnCls}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Elimina</span>
                  </button>

                  {!isTextContext && hasStrokeSelection && (
                    <>
                      <div className="w-px h-5 bg-[#3C3C43]/15 dark:bg-white/15 mx-0.5" aria-hidden="true" />
                      <div className="flex items-center gap-1.5 pr-1">
                        {INK_COLORS.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              onRecolor(c.hex);
                              onClose();
                            }}
                            title={`Cambia colore in ${c.label}`}
                            aria-label={`Cambia colore in ${c.label}`}
                            className="w-5 h-5 rounded-full border border-white/80 dark:border-white/25 shadow-xs hover:scale-110 transition-transform"
                            style={{ backgroundColor: c.hex }}
                          />
                        ))}
                      </div>
                    </>
                  )}

                  {isTextContext &&
                    menu.textTarget?.kind === 'block' &&
                    menu.textTarget?.hasFormatting &&
                    onUndoTextFormatting && (
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          onUndoTextFormatting();
                          onClose();
                        }}
                        className={btnCls}
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                        <span>Annulla formattazione</span>
                      </button>
                    )}

                  {isTextContext && menu.textTarget?.kind !== 'title' && onRecolorText && (
                    <>
                      <div className="w-px h-5 bg-[#3C3C43]/15 dark:bg-white/15 mx-0.5" aria-hidden="true" />
                      <div className="flex items-center gap-1 pr-1">
                        {TEXT_COLORS.slice(0, 5).map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              onRecolorText(c.hex);
                              onClose();
                            }}
                            title={`Colore testo: ${c.label}`}
                            aria-label={`Colore testo ${c.label}`}
                            className="w-5 h-5 rounded-full border border-white/80 dark:border-white/25 shadow-xs hover:scale-110 transition-transform"
                            style={{ backgroundColor: c.hex }}
                          />
                        ))}
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            onRecolorText(undefined);
                            onClose();
                          }}
                          title="Ripristina colore predefinito"
                          aria-label="Ripristina colore predefinito"
                          className="w-5 h-5 rounded-full ios-control-bg flex items-center justify-center text-[#48484A] dark:text-[#C7C7CC] hover:scale-110 transition-transform"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Quick Canvas / Page Actions when right-clicking empty sheet or margins (or appending to text menu) */}
              {!hasSelection && (
                <>
                  {onAddTextItem && (
                    <button
                      type="button"
                      onClick={() => {
                        onAddTextItem();
                        onClose();
                      }}
                      className={btnCls}
                    >
                      <Type className="w-3.5 h-3.5" />
                      <span>{activeDocumentType === 'pdf' ? 'Nuova casella' : 'Nuova riga'}</span>
                    </button>
                  )}

                  {activeDocumentType === 'hybrid' && onAddPage && (
                    <button
                      type="button"
                      onClick={() => {
                        onAddPage();
                        onClose();
                      }}
                      className={btnCls}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Nuova pagina</span>
                    </button>
                  )}

                  {canDeleteCurrentPage && (
                    <button
                      type="button"
                      onClick={() => {
                        onDeletePage!();
                        onClose();
                      }}
                      className={dangerBtnCls}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Elimina pagina</span>
                    </button>
                  )}

                  {canUndo && onUndo && (
                    <button
                      type="button"
                      onClick={() => {
                        onUndo();
                        onClose();
                      }}
                      className={btnCls}
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>Annulla</span>
                    </button>
                  )}

                  {canRedo && onRedo && (
                    <button
                      type="button"
                      onClick={() => {
                        onRedo();
                        onClose();
                      }}
                      className={btnCls}
                    >
                      <Redo2 className="w-3.5 h-3.5" />
                      <span>Ripristina</span>
                    </button>
                  )}

                  {onFitWidth && (
                    <button
                      type="button"
                      onClick={() => {
                        onFitWidth();
                        onClose();
                      }}
                      className={btnCls}
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>Adatta</span>
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
