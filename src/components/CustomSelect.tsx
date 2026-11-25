import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown } from 'lucide-react';

export interface CustomSelectOption<T extends string | number> {
  value: T;
  label: string;
  description?: string;
  sample?: string;
  optionClassName?: string;
}

interface CustomSelectProps<T extends string | number> {
  value: T;
  options: Array<CustomSelectOption<T>>;
  onChange: (value: T) => void;
  ariaLabel?: string;
  title?: string;
  triggerClassName?: string;
  menuWidth?: number;
  maxMenuHeight?: number;
  align?: 'left' | 'right';
  preserveFocus?: boolean;
  portalDataAttr?: string;
}

export function CustomSelect<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  title,
  triggerClassName,
  menuWidth = 216,
  maxMenuHeight = 260,
  align = 'right',
  preserveFocus = false,
  portalDataAttr,
}: CustomSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number; width: number; flipped: boolean }>({
    left: 12,
    top: 60,
    width: menuWidth,
    flipped: false,
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedOpt = options.find((o) => o.value === value) || options[0];

  const computeInitialPosition = () => {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(Math.max(menuWidth, rect.width), vw - 16);
    const rawLeft = align === 'right' ? rect.right - width : rect.left;
    const left = Math.max(8, Math.min(vw - width - 8, rawLeft));
    const spaceBelow = vh - rect.bottom - 12;
    const flipped = spaceBelow < Math.min(maxMenuHeight, options.length * 38 + 16) && rect.top > spaceBelow;
    const top = flipped ? Math.max(8, rect.top - 8) : Math.min(vh - 60, rect.bottom + 6);
    setCoords({ left, top, width, flipped });
  };

  useLayoutEffect(() => {
    if (!open || !menuRef.current || !triggerRef.current) return;
    const menuRect = menuRef.current.getBoundingClientRect();
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let nextLeft = align === 'right' ? triggerRect.right - menuRect.width : triggerRect.left;
    if (nextLeft + menuRect.width > vw - 8) nextLeft = vw - menuRect.width - 8;
    if (nextLeft < 8) nextLeft = 8;

    let nextTop = triggerRect.bottom + 6;
    let nextFlipped = false;
    if (nextTop + menuRect.height > vh - 10) {
      const aboveTop = triggerRect.top - menuRect.height - 6;
      if (aboveTop >= 8) {
        nextTop = aboveTop;
        nextFlipped = true;
      } else {
        nextTop = Math.max(8, vh - menuRect.height - 10);
      }
    }

    setCoords((prev) =>
      Math.abs(prev.left - nextLeft) < 0.5 &&
      Math.abs(prev.top - nextTop) < 0.5 &&
      prev.flipped === nextFlipped
        ? prev
        : { ...prev, left: nextLeft, top: nextTop, flipped: nextFlipped }
    );
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (
        (menuRef.current && target && menuRef.current.contains(target)) ||
        (triggerRef.current && target && triggerRef.current.contains(target))
      ) {
        return;
      }
      setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    const handleViewportChange = () => setOpen(false);

    window.addEventListener('pointerdown', handleOutside, true);
    window.addEventListener('keydown', handleKey, true);
    window.addEventListener('resize', handleViewportChange);
    return () => {
      window.removeEventListener('pointerdown', handleOutside, true);
      window.removeEventListener('keydown', handleKey, true);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [open]);

  const portalProps = portalDataAttr ? { [portalDataAttr]: 'true' } : {};

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={title}
        onMouseDown={(e) => {
          if (preserveFocus) e.preventDefault();
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (open) {
            setOpen(false);
          } else {
            computeInitialPosition();
            setOpen(true);
          }
        }}
        className={
          triggerClassName ||
          'h-8 px-3 rounded-full ios-control-bg text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] flex items-center justify-between gap-1.5 max-w-[60%] shrink-0'
        }
      >
        <span className={`truncate ${selectedOpt?.optionClassName || ''}`}>
          {selectedOpt?.label ?? String(value)}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 opacity-60 shrink-0 transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={menuRef}
                role="listbox"
                aria-label={ariaLabel}
                {...portalProps}
                initial={{ opacity: 0, scale: 0.96, y: coords.flipped ? 4 : -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: coords.flipped ? 4 : -4 }}
                transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  left: coords.left,
                  top: coords.top,
                  width: coords.width,
                  maxHeight: maxMenuHeight,
                  transformOrigin: coords.flipped ? 'bottom center' : 'top center',
                }}
                onMouseDown={(e) => {
                  if (preserveFocus) e.preventDefault();
                }}
                onClick={(e) => e.stopPropagation()}
                className="fixed z-[90] overflow-y-auto bg-white/95 dark:bg-[#2C2C2E]/95 backdrop-blur-xl rounded-2xl border border-black/10 dark:border-white/10 shadow-xl p-1.5 space-y-0.5 no-ios-select no-print"
              >
                {options.map((opt) => {
                  const isActive = opt.value === value;
                  return (
                    <button
                      key={String(opt.value)}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseDown={(e) => {
                        if (preserveFocus) e.preventDefault();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onChange(opt.value);
                        setOpen(false);
                      }}
                      className={`w-full text-left rounded-xl px-3 py-2 text-[13px] transition-colors flex items-center justify-between gap-2 ${
                        isActive
                          ? 'bg-black/6 dark:bg-white/12 text-[#1C1C1E] dark:text-[#F5F5F7] font-semibold'
                          : 'text-[#1C1C1E] dark:text-[#F5F5F7] font-medium hover:bg-black/5 dark:hover:bg-white/10'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className={`truncate leading-snug ${opt.optionClassName || ''}`}>
                          {opt.label}
                        </div>
                        {opt.description && (
                          <div className="text-[11px] font-normal text-[#8E8E93] truncate">
                            {opt.description}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {opt.sample && (
                          <span className={`text-xs opacity-65 ${opt.optionClassName || ''}`}>
                            {opt.sample}
                          </span>
                        )}
                        {isActive && (
                          <Check className="w-3.5 h-3.5 text-[#1C1C1E] dark:text-[#F5F5F7] shrink-0" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
