import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { motion } from 'motion/react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';

export interface DocumentSearchBarHandle {
  focus: () => void;
}

interface DocumentSearchBarProps {
  query: string;
  totalMatches: number;
  activeMatchIndex: number;
  isSearching?: boolean;
  isSmartphone?: boolean;
  onChangeQuery: (q: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

export const DocumentSearchBar = forwardRef<DocumentSearchBarHandle, DocumentSearchBarProps>(
  (
    {
      query,
      totalMatches,
      activeMatchIndex,
      isSearching = false,
      isSmartphone = false,
      onChangeQuery,
      onNext,
      onPrev,
      onClose,
    },
    ref
  ) => {
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      focus() {
        inputRef.current?.focus();
        inputRef.current?.select();
      },
    }));

    useEffect(() => {
      const id = window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 20);
      return () => window.clearTimeout(id);
    }, []);

    const trimmed = query.trim();
    const counterLabel = !trimmed
      ? ''
      : isSearching
        ? '…'
        : totalMatches === 0
          ? '0 risultati'
          : `${activeMatchIndex + 1} di ${totalMatches}`;

    return (
      <motion.div
        data-search-bar
        initial={{ opacity: 0, y: -10, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.96 }}
        transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        className={`fixed z-40 no-print ${
          isSmartphone
            ? 'top-[calc(72px+env(safe-area-inset-top,0px))] inset-x-3'
            : 'top-[calc(62px+env(safe-area-inset-top,0px))] right-4 w-[min(360px,calc(100vw-24px))]'
        }`}
      >
        <div className="bg-white/95 dark:bg-[#2C2C2E]/95 backdrop-blur-xl rounded-2xl border border-black/10 dark:border-white/10 shadow-xl px-3 py-2 flex items-center gap-2">
          <Search className="w-4 h-4 text-[#8E8E93] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onChangeQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) {
                  onPrev();
                } else {
                  onNext();
                }
              }
            }}
            placeholder="Cerca nel testo..."
            aria-label="Cerca nel testo"
            className={`flex-1 min-w-0 bg-transparent text-[#1C1C1E] dark:text-[#F5F5F7] placeholder-[#8E8E93] focus:outline-none ${
              isSmartphone ? 'text-[16px]' : 'text-[13.5px]'
            }`}
          />

          {counterLabel && (
            <span className="text-[11.5px] font-medium text-[#636366] dark:text-[#AEAEB2] tabular-nums whitespace-nowrap shrink-0 px-1">
              {counterLabel}
            </span>
          )}

          <div className="h-4 w-px bg-black/10 dark:bg-white/12 shrink-0" aria-hidden="true" />

          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={onPrev}
              disabled={totalMatches === 0}
              title="Risultato precedente (Shift+Invio)"
              aria-label="Risultato precedente"
              className="w-7 h-7 rounded-xl flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-black/6 dark:hover:bg-white/10 disabled:opacity-30 transition-colors"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={totalMatches === 0}
              title="Risultato successivo (Invio)"
              aria-label="Risultato successivo"
              className="w-7 h-7 rounded-xl flex items-center justify-center text-[#1C1C1E] dark:text-[#F5F5F7] hover:bg-black/6 dark:hover:bg-white/10 disabled:opacity-30 transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Chiudi ricerca (Esc)"
              aria-label="Chiudi ricerca"
              className="w-7 h-7 rounded-xl flex items-center justify-center text-[#636366] dark:text-[#AEAEB2] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7] hover:bg-black/6 dark:hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    );
  }
);

DocumentSearchBar.displayName = 'DocumentSearchBar';
