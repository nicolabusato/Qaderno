import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Moon, X } from 'lucide-react';
import { DockPosition } from '../types/qaderno';

interface NightStudyBannerProps {
  visible: boolean;
  ivoryPaper: boolean;
  dockPosition: DockPosition;
  onToggleIvoryPaper: () => void;
  onDismiss: () => void;
}

export const NightStudyBanner: React.FC<NightStudyBannerProps> = ({
  visible,
  ivoryPaper,
  dockPosition,
  onToggleIvoryPaper,
  onDismiss,
}) => {
  const bottomOffsetClass =
    dockPosition === 'bottom'
      ? 'bottom-[calc(70px+env(safe-area-inset-bottom,0px))] sm:bottom-[calc(78px+env(safe-area-inset-bottom,0px))]'
      : 'bottom-[calc(16px+env(safe-area-inset-bottom,0px))] sm:bottom-[calc(20px+env(safe-area-inset-bottom,0px))]';

  return (
    <AnimatePresence>
      {visible && (
        <div
          className={`fixed inset-x-0 ${bottomOffsetClass} z-[42] flex justify-center px-3 pointer-events-none no-print no-ios-select`}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 440, damping: 32 }}
            className="pointer-events-auto ios-pill-glass rounded-full pl-3.5 pr-1.5 py-1.5 flex items-center gap-2.5 max-w-full"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Moon className="w-3.5 h-3.5 text-[#48484A] dark:text-[#C7C7CC] shrink-0" />
              <span className="text-xs font-medium text-[#1C1C1E] dark:text-[#F5F5F7] truncate">
                Sessione notturna — Buon lavoro
              </span>
            </div>

            <button
              type="button"
              onClick={onToggleIvoryPaper}
              aria-pressed={ivoryPaper}
              className={`h-7 px-2.5 rounded-full text-[11px] font-medium flex items-center gap-1.5 shrink-0 transition-colors ${
                ivoryPaper
                  ? 'bg-[#1C1C1E] text-[#FAF6EE] dark:bg-[#F5F5F7] dark:text-[#1C1C1E]'
                  : 'ios-control-bg text-[#1C1C1E] dark:text-[#F5F5F7]'
              }`}
              title="Applica una tinta calda riposante al foglio su schermo"
            >
              {ivoryPaper ? (
                <Check className="w-3 h-3 shrink-0" />
              ) : (
                <span
                  className="w-2.5 h-2.5 rounded-full border border-[#3C3C43]/25 dark:border-white/30 shrink-0"
                  style={{ backgroundColor: '#FAF6EE' }}
                />
              )}
              <span>Carta avorio</span>
            </button>

            <button
              type="button"
              onClick={onDismiss}
              aria-label="Chiudi avviso sessione notturna"
              title="Chiudi"
              className="w-6 h-6 rounded-full flex items-center justify-center text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-[#F5F5F7] hover:bg-[#787880]/15 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
