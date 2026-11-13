import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle } from 'lucide-react';

export interface ConfirmDialogAction {
  label: string;
  variant?: 'default' | 'danger' | 'primary';
  onClick: () => void;
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  actions: ConfirmDialogAction[];
  onClose: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  actions,
  onClose,
}) => {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[#1C1C1E]/30 dark:bg-black/55 backdrop-blur-xs p-3 sm:p-4 no-print"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 1.06 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 460, damping: 32, mass: 0.75 }}
            className="w-full max-w-sm max-h-[90dvh] overflow-y-auto bg-[#F2F2F7]/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl rounded-2xl border border-white/60 dark:border-white/12 shadow-lg"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-desc"
          >
        <div className="px-5 pt-5 pb-4 text-center space-y-2">
          <div className="w-10 h-10 mx-auto rounded-full bg-[#9A463D]/12 dark:bg-[#9A463D]/20 flex items-center justify-center text-[#9A463D] dark:text-[#E07A6E]">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h2 id="confirm-dialog-title" className="text-base font-semibold text-[#1C1C1E] dark:text-[#F5F5F7]">
            {title}
          </h2>
          <p id="confirm-dialog-desc" className="text-xs text-[#48484A] dark:text-[#A1A1A6] leading-relaxed">
            {message}
          </p>
        </div>

        <div className="border-t border-[#3C3C43]/12 dark:border-white/10 divide-y divide-[#3C3C43]/10 dark:divide-white/10">
          {actions.map((action, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                action.onClick();
                onClose();
              }}
              className={`w-full min-h-[44px] px-4 text-sm font-medium transition-colors hover:bg-[#787880]/10 ${
                action.variant === 'danger'
                  ? 'text-[#C93B32] dark:text-[#FF6B63] font-semibold'
                  : action.variant === 'primary'
                    ? 'text-[#1C1C1E] dark:text-[#F5F5F7] font-semibold'
                    : 'text-[#48484A] dark:text-[#A1A1A6]'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
